# Releasing `@cosyte/cli`

How the `cosyte` CLI (and its twin `cosyte-mcp` server, one package, two bins) gets to npm, and the
gotchas worth not rediscovering. The suite-wide mechanics live in the umbrella
`config/RELEASING.md`; this file is the CLI-specific overlay.

## The two founder stops (nothing crosses them unattended)

1. **Flipping the repo public** (`PUB-FLIP`).
2. **The real `npm publish`.**

Both are standing human gates. Everything up to them (the changeset, the version PR, the publish
**dry-run**, provenance/OIDC config, this doc) is agent-shippable. The publish itself is not.

## The vendor → npm dep swap (done, with one dep that could not follow)

`@cosyte/cli` is the only package in the suite that **hard-depends on its siblings**: an `npx`-invoked
`bin` cannot peer-depend on something the user pre-installed. Those deps used to be **vendored
`pnpm pack` tarballs** (`file:vendor/*.tgz`, ADR 0021/0023). **A published package cannot ship a
`file:vendor/…tgz` dependency**, and two releases went out doing exactly that.

They are now real npm ranges, with the single exception of `@cosyte/fhir`, which is not on the
registry and therefore is not declared at all. `vendor/` survives only to supply `@cosyte/fhir` to
this repo's own test run, as a `devDependency`; `pnpm vendor:refresh` still refreshes the tarballs,
and the other nine are no longer wired to anything.

### ▶ THIS STEP WAS SKIPPED TWICE, AND `0.0.1` + `0.0.2` ARE BROKEN ON npm BECAUSE OF IT

**Both published with all ten `file:vendor/*.tgz` specifiers intact.** `vendor/` is not in `files`,
and there is no `bundledDependencies`, so those tarballs ship none of them. Every install route
(`npm i`, `npm i -g`, `npx`) dies on the first one:

```
npm error code ENOENT
npm error path node_modules/@cosyte/cli/vendor/cosyte-fhir-0.0.0.tgz
```

A published version is immutable (ADR 0001), so neither can be repaired; the fix ships as a later
version. **The lesson, and it is now a checklist step:**

**`npm publish --dry-run` cannot catch this, and the checklist implied it could.** A dry-run packs a
tarball; it never resolves that tarball's dependencies from a registry. The gate that catches it is
`npm install` of the packed tarball **from a directory outside this repo**. That is step 6 below, and
a green dry-run is not install-proof.

### The dependency swap, as actually done

Verified against the live registry on 2026-08-03, and by installing the packed tarball in a clean
directory, not assumed:

| dep                         | shipped as                          | resolves? |
| --------------------------- | ----------------------------------- | --------- |
| `@cosyte/hl7`               | `dependencies`, `^0.0.7`            | yes       |
| `@cosyte/terminology`       | `dependencies`, `^0.0.9`            | yes       |
| six breadth parsers         | `optionalDependencies`, real ranges | yes       |
| `@modelcontextprotocol/sdk` | `optionalDependencies`, `1.29.0`    | yes       |
| `@cosyte/transform`         | `optionalDependencies`, `^0.0.4`    | **no**    |
| `@cosyte/fhir`              | **not declared at all**             | **no**    |

**On the `0.0.x` ladder `^0.0.7` is an exact pin** (caret on a `0.0.z` version allows no other
version), which is what we want pre-alpha: the CLI is tested against exactly those sibling releases,
and Dependabot now proposes each bump as its own reviewable PR.

**Why `@cosyte/fhir` is not declared, rather than declared optional.** It is not on the registry
(`FHIR-NPM-NAME`, a persistent npm `E403`; the earlier "name similarity" reading was retracted
ecosystem-wide on 2026-08-03, so treat the cause as **unexplained** and do not assert one). Declaring
it at all breaks the install, which was measured here rather than reasoned about:

| root manifest declares                                    | `npm install`            |
| --------------------------------------------------------- | ------------------------ |
| optional `@cosyte/fhir` alone                             | exit `0`                 |
| optional `@cosyte/transform` alone                        | exit `0`                 |
| **both**                                                  | **`ERESOLVE`, exit `1`** |
| optional `@cosyte/fhir` as an _optional peer_ + transform | **`ERESOLVE`, exit `1`** |

So the two cannot both be named. `@cosyte/transform` is declared (it is real, and it starts
installing by itself the day `@cosyte/fhir` publishes, with no release needed here) and `@cosyte/fhir`
is not. **Do not attribute this to a missing `peerDependenciesMeta.optional` flag**: measured across
the suite, that flag does not decide the outcome (`synth` marks all seven peers optional and still
fails `ERESOLVE`; `deid` declares the same optional `@cosyte/fhir` peer and installs cleanly). The
mechanism is not yet explained. Record measurements, not theories.

`@cosyte/fhir` is kept as a **`devDependency`** on the vendored tarball, so this repo's own FHIR and
`convert` tests still run, and so it satisfies `@cosyte/transform`'s peer in the dev tree.

**Say this precisely, because the obvious shorter sentence is false.** `devDependencies` **are**
published: they stay in the published `package.json` (`npm view @cosyte/hl7@0.0.7 devDependencies`
returns a full list), and so the fix release's manifest still carries one `file:vendor/*.tgz`
specifier. What makes that harmless is that **a consumer never installs a dependency's
`devDependencies`**, so npm never resolves the path. That was verified, not assumed: installing the
packed tarball in a clean directory exits `0` with the `file:` devDependency present in the manifest.
The runtime closure is what had to be clean, and it is.

### What an installed copy cannot do, and why that is not a crash

With `@cosyte/fhir` and `@cosyte/transform` both absent, every code path that reaches for them
degrades to a value-free `CLI_PARSER_UNAVAILABLE` (exit `69`). That required a code change, and
shipping the manifest swap without it would have been worse than the install break: both were
imported with a bare `await import()`, so an install without them raised a raw resolver error and a
stack frame, which the CLI's value-free posture forbids.

`loadOptional()` could not be reused as-is: its signature is `loadOptional<T>(format: CosyteFormat, …)`
and `"transform"` is not a `CosyteFormat`, and its diagnostic hardcodes the word "parser", which is
wrong for a conversion library. So `src/core/parsers.ts` now has `loadOptionalPackage(detail, load)`
underneath it, plus a `loadFhir()` whose diagnostic says the package is not on the registry (rather
than `loadOptional`'s "install it", which would be false). `@cosyte/hl7` and `@cosyte/terminology`
stay hard deps and keep their bare imports, correctly. `test/absent-sibling.test.ts` holds this shut,
including a static guard over `src/`.

**What that guard does and does not catch, because "any new call site" would overstate it.** It flags
a single-line `await import("@cosyte/fhir")` or `import("@cosyte/transform")` that is not wrapped by
one of the loaders, which is the shape the defect actually took, and it carries negative controls so
it cannot pass by matching nothing. It does **not** catch a thunk assigned to a variable and awaited
elsewhere, an import split across lines, or a **static** `import … from "@cosyte/fhir"`. That last one
matters: this repo now has its first static reference to that package (`src/core/parsers.ts`, as
`import type`, which is erased at build time and emits no runtime load, verified in `dist/`). Dropping
the word `type` would load it eagerly and break every command in an installed copy, and the guard
would not see it.

### The `npx @cosyte/cli` short form does not work, and the swap does not fix it

Separate, pre-existing, and measured on both the published `0.0.2` and the fixed tarball:

```
$ npx @cosyte/cli --help
npm error could not determine executable to run
```

`npx` runs the executable whose name matches the package name's last segment, which would be `cli`;
this package ships `cosyte` and `cosyte-mcp`. `npx --package @cosyte/cli cosyte --help` works and is
what the docs tell people to run. **A `cli` bin alias would fix the short form and is deliberately not
added**, because `npm install -g` would then put a command named `cli` on every user's `PATH`. If that
trade is ever revisited, it is a founder call, not a packaging tidy-up.

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

Steps 1, 2 and 3 are **already done**. Step 2 is the one that was skipped twice, and it is why this
checklist has a step 6.

1. ~~`PUB-FLIP` the repo public (founder stop 1).~~ Done; the repo is public.
2. ~~Swap the vendored `file:` deps for real `@cosyte/*` npm ranges.~~ Done; see "The dependency swap,
   as actually done" above for what could and could not be swapped, and for the measurements behind
   it. `@cosyte/fhir` stays undeclared until it is on the registry; when it publishes, declare it and
   `@cosyte/transform` starts resolving too.
3. ~~Confirm the `cosyte` / `cosyte-mcp` bin names are free on npm.~~ Done; `0.0.1` owns both.
4. Land the release changeset; approve the **"Version Packages"** PR.
5. Approve the protected `release` environment to publish (founder stop 2). Provenance attaches
   automatically.
6. **Install the published version from outside this repo before calling it shipped**, in a clean
   temp directory. A green `--dry-run` does not prove this, and `0.0.1` and `0.0.2` are the proof that
   it does not. Run the binary too, because installing is not the same as working:

   ```bash
   cd "$(mktemp -d)" && npm init -y >/dev/null
   npm install @cosyte/cli@<version>          # must exit 0
   node_modules/.bin/cosyte --version         # must print <version>, NOT 0.0.0
   node_modules/.bin/cosyte parse some.hl7    # must exit 0
   node -e 'import("@cosyte/cli").then(m=>console.log(m.VERSION))'
   ```

   `cosyte --version` is the check that catches a skipped `scripts/sync-version.mjs`: `0.0.1` and
   `0.0.2` both printed `0.0.0`.
