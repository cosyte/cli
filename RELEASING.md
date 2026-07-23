# Releasing `@cosyte/cli`

How the `cosyte` CLI (and its twin `cosyte-mcp` server — one package, two bins) gets to npm, and the
gotchas worth not rediscovering. The suite-wide mechanics live in the umbrella
`config/RELEASING.md`; this file is the CLI-specific overlay.

## The two founder stops (nothing crosses them unattended)

1. **Flipping the repo public** (`PUB-FLIP`).
2. **The real `npm publish`.**

Both are standing human gates. Everything up to them — the changeset, the version PR, the publish
**dry-run**, provenance/OIDC config, this doc — is agent-shippable. The publish itself is not.

## Before the first publish is even possible — the vendor → npm dep swap

`@cosyte/cli` is the only package in the suite that **hard-depends on its siblings**: an `npx`-invoked
`bin` cannot peer-depend on something the user pre-installed. Until `PUB-FLIP`, those deps are
**vendored `pnpm pack` tarballs** (`file:vendor/*.tgz`, ADR 0021/0023):

- **Hard `dependencies`** (capped at 4): `@cosyte/hl7`, `@cosyte/fhir`, `@cosyte/transform`,
  `@cosyte/terminology`.
- **`optionalDependencies`** (lazy, outside the cap): the six breadth parsers
  (`dicom`/`x12`/`ccda`/`ncpdp`/`astm`/`mllp`, ADR 0025) and `@modelcontextprotocol/sdk` (ADR 0024).

Refresh them with `pnpm vendor:refresh`. **At `PUB-FLIP` these `file:` specifiers must become real
`@cosyte/*` npm ranges** — a published package cannot ship a `file:vendor/…tgz` dependency. This swap
is a deliberate release step, not an automated one.

## The pipeline

Releases run on [Changesets](https://github.com/changesets/changesets):

1. A change lands with a changeset (`pnpm changeset`) — a `patch` on the **`0.0.x`-until-first-alpha**
   ladder (a published version is never moved back). The parsers publish at `0.0.1`; the CLI begins its
   public history at `0.0.1`.
2. On push to `main` with pending changesets, `.github/workflows/release.yml` (a thin caller of the
   shared `cosyte/.github` release pipeline) opens/updates a **"Version Packages"** PR that consumes
   the changesets and bumps `version` + `CHANGELOG.md`.
3. Merging that PR runs the workflow again; with no pending changesets it runs `pnpm run release`
   (`changeset publish`) inside the **protected `release` environment** — the approval gate. Nothing
   reaches npm without a deliberate human ack.

`NPM_TOKEN` **must be an npm _Automation_ token** (a classic _Publish_ token demands a 2FA OTP CI
cannot supply, and the publish dies at the very last step with `EOTP`).

## Provenance & OIDC

- `package.json#publishConfig` sets `"provenance": true`, and `release.yml` grants
  `id-token: write` — so **provenance auto-attaches once the repo is public** (the shared pipeline
  wires `NPM_CONFIG_PROVENANCE` to public visibility; no workflow edit needed at flip time).
- **OIDC trusted publishing** (token-free) is the later step: configure the Trusted Publisher on npm
  for `@cosyte/cli` (org `cosyte`, repo `cli`, workflow `release.yml`, environment `release`), then
  drop `NPM_TOKEN`. Keep `id-token: write`.

## Proving the pipe without burning a version

The publish path is exercised **without uploading anything**:

```bash
pnpm build            # dist/ must exist first
pnpm attw             # per-condition types resolve (node16 import + require, bundler)
pnpm smoke            # built dual ESM/CJS `.` + `./mcp`, and BOTH bins run under node
npm publish --dry-run # assembles the tarball (dist + README/LICENSE/CHANGELOG), no upload
```

`scripts/verify.sh cli` runs `test:coverage` (per-dir ≥ 90 on `core` + `commands`), `build`, `attw`,
and `smoke` as its gate. The nightly **Fuzz** workflow (`.github/workflows/fuzz.yml`, `pnpm test:fuzz`)
scales the argv+stdin+MCP fuzz far past the per-PR count. A red in any of these means a real release
would fail.

> **`bin` name availability.** Confirm `@cosyte/cli` is publishable and that `cosyte` **and**
> `cosyte-mcp` are free as global bin names on npm **before** `PUB-FLIP`. A collision surfaces only at
> publish time.

## The publish checklist (for the human at the gate)

1. `PUB-FLIP` the repo public (founder stop 1).
2. Swap the vendored `file:` deps for real `@cosyte/*` npm ranges; `pnpm install`; re-run
   `scripts/verify.sh cli`.
3. Confirm the `cosyte` / `cosyte-mcp` bin names are free on npm.
4. Land the release changeset; approve the **"Version Packages"** PR.
5. Approve the protected `release` environment to publish (founder stop 2). Provenance attaches
   automatically.
