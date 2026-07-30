# Releasing `@cosyte/cli`

How the `cosyte` CLI (and its twin `cosyte-mcp` server, one package, two bins) gets to npm, and the
gotchas worth not rediscovering. The suite-wide mechanics live in the umbrella
`config/RELEASING.md`; this file is the CLI-specific overlay.

## The two founder stops (nothing crosses them unattended)

1. **Flipping the repo public** (`PUB-FLIP`).
2. **The real `npm publish`.**

Both are standing human gates. Everything up to them (the changeset, the version PR, the publish
**dry-run**, provenance/OIDC config, this doc) is agent-shippable. The publish itself is not.

## Before the first publish is even possible: the vendor → npm dep swap

`@cosyte/cli` is the only package in the suite that **hard-depends on its siblings**: an `npx`-invoked
`bin` cannot peer-depend on something the user pre-installed. Until `PUB-FLIP`, those deps are
**vendored `pnpm pack` tarballs** (`file:vendor/*.tgz`, ADR 0021/0023):

- **Hard `dependencies`** (capped at 4): `@cosyte/hl7`, `@cosyte/fhir`, `@cosyte/transform`,
  `@cosyte/terminology`.
- **`optionalDependencies`** (lazy, outside the cap): the six breadth parsers
  (`dicom`/`x12`/`ccda`/`ncpdp`/`astm`/`mllp`, ADR 0025) and `@modelcontextprotocol/sdk` (ADR 0024).

Refresh them with `pnpm vendor:refresh`. **At `PUB-FLIP` these `file:` specifiers must become real
`@cosyte/*` npm ranges**: a published package cannot ship a `file:vendor/…tgz` dependency. This swap
is a deliberate release step, not an automated one.

### ▶ THIS STEP WAS SKIPPED, AND `0.0.1` IS BROKEN ON npm BECAUSE OF IT

**`@cosyte/cli@0.0.1` published on 2026-07-29 with all ten `file:vendor/*.tgz` specifiers intact.**
`vendor/` is not in `files`, and there is no `bundledDependencies`, so the tarball ships none of
them. Every install route (`npm i`, `npm i -g`, `npx`) dies on the first one:

```
npm error code ENOENT
npm error path node_modules/@cosyte/cli/vendor/cosyte-fhir-0.0.0.tgz
```

A published version is immutable (ADR 0001), so `0.0.1` cannot be repaired; the fix must be a later
version. **Two lessons, both cheap to act on:**

1. **`npm publish --dry-run` cannot catch this, and the checklist implied it could.** A dry-run packs
   a tarball; it never resolves that tarball's dependencies from a registry. The gate that would have
   caught it is `npm install` of the packed tarball **from a directory outside this repo**. Add that
   before the next publish, and do not treat a green dry-run as install-proof.
2. **The swap is now blocked, not merely pending.** `@cosyte/fhir` is unpublished (`E403`, an npm
   name-similarity rejection, tracked as `FHIR-NPM-NAME`), and `@cosyte/transform@0.0.2` is published
   but fails `E404` on its `@cosyte/fhir` peer, so neither can become a real range today.
   `@cosyte/hl7` (`0.0.3`) and `@cosyte/terminology` (`0.0.4`) would swap over now, as would all six
   breadth parsers. See "The route to an installable release" below.

### The route to an installable release

Verified against the live registry on 2026-07-30, not assumed:

| dep                   | real range today?               | note                           |
| --------------------- | ------------------------------- | ------------------------------ |
| `@cosyte/hl7`         | yes (`0.0.3`)                   | hard dep                       |
| `@cosyte/terminology` | yes (`0.0.4`)                   | hard dep                       |
| six breadth parsers   | yes (all published)             | already `optionalDependencies` |
| `@cosyte/fhir`        | **no** (`404`, `FHIR-NPM-NAME`) | hard dep                       |
| `@cosyte/transform`   | **no** (`E404` on the peer)     | hard dep                       |

An installable release **is reachable before `FHIR-NPM-NAME` is resolved**, because npm tolerates an
`optionalDependency` that fails to resolve (measured: a `404` optional dep installs clean, exit `0`).
Moving `@cosyte/fhir` and `@cosyte/transform` to `optionalDependencies` with real ranges lets the
install succeed with those two simply absent.

**It needs one code change first, and shipping without it would be worse than the current break.**
`@cosyte/hl7` and `@cosyte/fhir` are imported with a raw `await import()` in `src/core/parsers.ts`
and `src/commands/convert.ts`; only the six breadth parsers go through `loadOptional()`, which is what
turns an absent package into the value-free `CLI_PARSER_UNAVAILABLE` (exit `69`). Route the
`@cosyte/fhir` and `@cosyte/transform` imports through `loadOptional()` too, or an absent one crashes
instead of degrading honestly. `@cosyte/hl7` stays a hard dep and needs no such treatment.

## The pipeline

Releases run on [Changesets](https://github.com/changesets/changesets):

1. A change lands with a changeset (`pnpm changeset`): a `patch` on the **`0.0.x`-until-first-alpha**
   ladder (a published version is never moved back). The parsers publish at `0.0.1`; the CLI begins its
   public history at `0.0.1`.
2. On push to `main` with pending changesets, `.github/workflows/release.yml` (a thin caller of the
   shared `cosyte/.github` release pipeline) opens/updates a **"Version Packages"** PR that consumes
   the changesets and bumps `version` + `CHANGELOG.md`.
3. Merging that PR runs the workflow again; with no pending changesets it runs `pnpm run release`
   (`changeset publish`) inside the **protected `release` environment**: the approval gate. Nothing
   reaches npm without a deliberate human ack.

`NPM_TOKEN` **must be an npm _Automation_ token** (a classic _Publish_ token demands a 2FA OTP CI
cannot supply, and the publish dies at the very last step with `EOTP`).

## Provenance & OIDC

- `package.json#publishConfig` sets `"provenance": true`, and `release.yml` grants
  `id-token: write`, so **provenance auto-attaches once the repo is public** (the shared pipeline
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

Steps 1 and 3 are **already done**: the repo is public, and both bin names were taken by `0.0.1`.
Step 2 is the one that was skipped, and it is why this checklist now has a step 6.

1. ~~`PUB-FLIP` the repo public (founder stop 1).~~ Done; the repo is public.
2. Swap the vendored `file:` deps for real `@cosyte/*` npm ranges; `pnpm install`; re-run
   `scripts/verify.sh cli`. **Blocked today** on two of the four hard deps: see "The route to an
   installable release" above for what is reachable without waiting.
3. ~~Confirm the `cosyte` / `cosyte-mcp` bin names are free on npm.~~ Done; `0.0.1` owns both.
4. Land the release changeset; approve the **"Version Packages"** PR.
5. Approve the protected `release` environment to publish (founder stop 2). Provenance attaches
   automatically.
6. **Install the published version from outside this repo before calling it shipped**, in a clean
   temp directory: `npm install @cosyte/cli@<version>`. A green `--dry-run` does not prove this, and
   `0.0.1` is the proof that it does not.
