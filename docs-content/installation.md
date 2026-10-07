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
> fix arrives with the next release. Until then, run the CLI from a source checkout.

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

## What a default install includes

The siblings the CLI wraps are real npm ranges. HL7 v2 (`@cosyte/hl7`) and `map-codes`
(`@cosyte/terminology`) run on the two hard dependencies. The six breadth formats X12, C-CDA, DICOM,
NCPDP, ASTM and MLLP, and `@cosyte/transform`, are optional dependencies, and `@cosyte/fhir` arrives
as the peer dependency of `@cosyte/transform`, so a default install has every one of them. If one is
still missing, for example a peer your package manager did not install, the commands that need it
report `CLI_PARSER_UNAVAILABLE` and exit `69`. They do not guess, and they do not fail as though your
input were bad.

> **Do not install with `--omit=optional`.** It succeeds, but the `cosyte` command then fails to start
> at all on a missing `@modelcontextprotocol/sdk`, before it reaches any command. Known defect,
> tracked separately.

## Prerequisites

- **Node.js >= 22 and < 26** (the whole `@cosyte/*` suite targets ES2023 / Node 22+). The upper
  bound is deliberate: this package declares support only for the release lines its own test suite
  runs on, so a line nobody has exercised is stated as unsupported rather than implied to work.
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

VERSION; // => "0.1.0"
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
