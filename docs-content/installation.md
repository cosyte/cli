---
id: installation
title: Installation
sidebar_position: 1
---

# Installation

`@cosyte/cli` ships the `cosyte` command as a Node.js executable. The lowest-friction path is `npx`,
no global install required.

> **Status:** pre-alpha (`0.0.x`), published to npm at `0.0.1`. **That release cannot be installed**,
> so none of the commands below work yet: see [Installing fails today](#installing-fails-today). They
> are the shape install will take once a fixed version can ship; until then, consume the CLI from
> source.

## Installing fails today

`@cosyte/cli@0.0.1` is on npm, and `npm install @cosyte/cli` fails with an `ENOENT`:

```
npm error code ENOENT
npm error path node_modules/@cosyte/cli/vendor/cosyte-fhir-0.0.0.tgz
npm error enoent ENOENT: no such file or directory
```

`npx` and `npm install -g` fail identically. There is no consumer-side workaround, and nothing is
wrong with your environment.

The published manifest declares its ten `@cosyte/*` sibling packages as local file paths
(`file:vendor/*.tgz`) instead of npm version ranges. Those tarballs are not part of the published
package, so npm resolves the paths against a directory that is not there. It is a packaging defect in
that release; the commands themselves are unaffected.

A published version is immutable, so `0.0.1` stays broken and the fix must ship as a later version.
That is currently blocked outside this package: `@cosyte/fhir` is not on npm (the registry rejected
the name as too similar to an existing package), and `@cosyte/transform` peer-depends on it, so it
fails to install for the same reason. `@cosyte/hl7` and `@cosyte/terminology` are published and would
swap over today.

**Run it from source in the meantime:**

```bash
git clone https://github.com/cosyte/cli && cd cli
pnpm install && pnpm build
node dist/bin/cosyte.mjs --help
```

## Prerequisites

- **Node.js >= 22** (the whole `@cosyte/*` suite targets ES2023 / Node 22+).
- A package manager: `pnpm`, `npm`, or `yarn`.

## Run it

```bash
npx @cosyte/cli parse message.hl7    # no install: npx caches the package
```

Or install globally to put `cosyte` on your `PATH`:

```bash
npm install -g @cosyte/cli
cosyte --help
```

## Programmatic API

The same `core` the CLI uses is available as a small library (the `.` subpath): the format
autodetector, the exit-code contract, and the value-free diagnostic types:

```ts runnable
import { VERSION } from "@cosyte/cli";

typeof VERSION; // => "string"
```

If that resolves, the install is good: head to the [Quickstart](./quickstart).
