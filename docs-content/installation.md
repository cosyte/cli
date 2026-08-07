---
id: installation
title: Installation
sidebar_position: 1
---

# Installation

`@cosyte/cli` ships the `cosyte` command as a Node.js executable, alongside `cosyte-mcp`. A global
install is the simplest route; `npx` works too, with one flag noted under [Run it](#run-it).

> **Status:** pre-alpha (`0.0.x`), and **there is no installable release yet.** The newest version on
> npm is `0.0.2`, and `0.0.1` and `0.0.2` are both uninstallable: see
> [If you are on 0.0.1 or 0.0.2](#if-you-are-on-001-or-002). The packaging defect is fixed in the
> repository and proven by installing the packed tarball, but a published version is immutable, so the
> fix arrives with the next release. Until then, run the CLI from a source checkout. FHIR support is
> unavailable in an installed copy for a separate reason, described under
> [What is not available from npm](#what-is-not-available-from-npm).

## If you are on 0.0.1 or 0.0.2

Both are on npm, and `npm install @cosyte/cli` fails on either with an `ENOENT`:

```
npm error code ENOENT
npm error path node_modules/@cosyte/cli/vendor/cosyte-fhir-0.0.0.tgz
npm error enoent ENOENT: no such file or directory
```

`npx` and `npm install -g` fail identically. There is no consumer-side workaround, and nothing is
wrong with your environment.

Those manifests declared the ten `@cosyte/*` sibling packages as local file paths
(`file:vendor/*.tgz`) instead of npm version ranges. The tarballs are not part of the published
package, so npm resolved the paths against a directory that is not there. A published version is
immutable, so both stay broken. **The fix ships as a later version, which does not exist yet**; run
the CLI from a source checkout in the meantime.

## What is not available from npm

The siblings the CLI wraps are now real npm ranges, with one exception that is worth stating plainly
rather than discovering at runtime.

**`@cosyte/fhir` is not on the npm registry.** It cannot be a dependency of this package, so an
installed `@cosyte/cli` has no FHIR library and:

- `parse`, `inspect`, `fmt` and `validate` on FHIR input report `CLI_PARSER_UNAVAILABLE` and exit
  `69`. They do not guess, and they do not fail as though your input were bad.
- `convert` reports the same, because it needs both `@cosyte/fhir` and `@cosyte/transform`, and
  `@cosyte/transform` in turn requires `@cosyte/fhir`, so npm skips it as an unresolvable optional
  dependency.

Everything else works from a plain install: HL7 v2 (`@cosyte/hl7`), `map-codes`
(`@cosyte/terminology`), and the six breadth formats X12, C-CDA, DICOM, NCPDP, ASTM and MLLP, which
are optional dependencies that do resolve, so a default install has all six.

> **Do not install with `--omit=optional`.** It succeeds, but the `cosyte` command then fails to start
> at all on a missing `@modelcontextprotocol/sdk`, before it reaches any command. Known defect,
> tracked separately.

**To use the FHIR commands today, run the CLI from source**, where the FHIR library is supplied
locally:

```bash
git clone https://github.com/cosyte/cli && cd cli
pnpm install && pnpm build
node dist/bin/cosyte.mjs --help
```

## Prerequisites

- **Node.js >= 22** (the whole `@cosyte/*` suite targets ES2023 / Node 22+).
- A package manager: `pnpm`, `npm`, or `yarn`.

## Run it

Install globally to put `cosyte` on your `PATH`:

```bash
npm install -g @cosyte/cli
cosyte --help
```

Or run it without installing, naming the executable explicitly:

```bash
npx --package @cosyte/cli cosyte parse message.hl7
```

> **The short form `npx @cosyte/cli …` does not work**, and it is a separate matter from the
> packaging defect above: it fails with `could not determine executable to run`. When a package ships
> more than one executable, `npx` runs the one whose name matches the package name's last segment,
> which would be `cli`; this package ships `cosyte` and `cosyte-mcp`. Use `--package` as above. A
> `cli` alias is deliberately not added, because `npm install -g` would then claim a command called
> `cli` on your `PATH`.

## Programmatic API

The same `core` the CLI uses is available as a small library (the `.` subpath): the format
autodetector, the exit-code contract, and the value-free diagnostic types:

```ts runnable
import { VERSION } from "@cosyte/cli";

VERSION; // => "0.0.5"
```

If that resolves and prints the release you installed, the install is good: head to the
[Quickstart](./quickstart).

> **`VERSION` was wrong in `0.0.1` and `0.0.2`.** Both shipped exporting `0.0.0`, and `cosyte
> --version` printed that too. This page asserted only `typeof VERSION` back then, which is true of
> every wrong value, so it stayed green across both. The constant is now kept in lockstep with the
> manifest by the release tooling and compared against it in the test suite, and the literal above is
> rewritten by that same step. A published version is never re-published, so those two copies stay
> wrong on the registry; if you have one, read the manifest instead, which was always correct:
> `node -p "require('@cosyte/cli/package.json').version"`.
