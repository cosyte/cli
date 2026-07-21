---
id: installation
title: Installation
sidebar_position: 1
---

# Installation

`@cosyte/cli` ships the `cosyte` command as a Node.js executable. The lowest-friction path is `npx` —
no global install required.

> **Status:** pre-alpha (`0.0.x`), not yet published to npm. The commands below are the shape they will
> take at first publish; until then, consume the CLI from source.

## Prerequisites

- **Node.js >= 22** (the whole `@cosyte/*` suite targets ES2023 / Node 22+).
- A package manager — `pnpm`, `npm`, or `yarn`.

## Run it

```bash
npx @cosyte/cli parse message.hl7    # no install — npx caches the package
```

Or install globally to put `cosyte` on your `PATH`:

```bash
npm install -g @cosyte/cli
cosyte --help
```

## Programmatic API

The same `core` the CLI uses is available as a small library (the `.` subpath) — the format
autodetector, the exit-code contract, and the value-free diagnostic types:

```ts runnable
import { VERSION } from "@cosyte/cli";

typeof VERSION; // => "string"
```

If that resolves, the install is good — head to the [Quickstart](./quickstart).
