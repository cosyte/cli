---
id: installation
title: Installation
sidebar_label: Installation
description: "Install the cosyte command globally, run it with npx, or add it as a dependency, and see what a default install includes and which Node.js versions it supports."
---

# Installation

`@cosyte/cli` installs two commands, `cosyte` and `cosyte-mcp`.

## Prerequisites

- **Node.js 22 or later, tested on 22, 24, and 26.** We claim only the release lines our CI runs:
  those three are tested on every change, and a later line is one nobody has run here yet.
- A package manager: npm, pnpm, or Yarn.

## Install it

Install it globally to put `cosyte` on your `PATH`:

```bash no-run it installs the package from npm
npm install -g @cosyte/cli
cosyte --version
```

Or run it without installing, naming the command:

```bash no-run it downloads the package from npm
npx --package @cosyte/cli cosyte --version
```

The shorter `npx @cosyte/cli` does not work. It fails with `could not determine executable to run`:
when a package has more than one command, `npx` looks for the one named after the last part of the
package name, `cli`, and this package has `cosyte` and `cosyte-mcp`. We do not add a `cli` alias,
because a global install would then put a command called `cli` on your `PATH`.

To use it from a project's scripts, add it as a development dependency:

```bash no-run it installs the package from npm
npm install --save-dev @cosyte/cli
npx cosyte --version
```

## What a default install includes

`@cosyte/hl7` and `@cosyte/terminology` are dependencies, so HL7 v2 and `map-codes` always work.
Everything else is an optional dependency: the X12, C-CDA, DICOM, NCPDP, ASTM, and MLLP parsers,
`@cosyte/fhir`, `@cosyte/transform`, `@cosyte/deid`, and the MCP SDK
(`@modelcontextprotocol/sdk`). A default install has every one of them, whether it is
`npm install`, `pnpm add`, or `npm install --legacy-peer-deps`.

An install with `--omit=optional` leaves them all out. HL7 v2 and `map-codes` still work. A command
that needs a missing library prints `CLI_PARSER_UNAVAILABLE`, naming the package to install, and
exits `69`; `cosyte-mcp` and `cosyte mcp` do the same without the MCP SDK. See
[`CLI_PARSER_UNAVAILABLE`](./diagnostic-codes.md#cli_parser_unavailable).

With `npx`, name a missing library as a second package:

```bash no-run it downloads packages from npm
npx --package @cosyte/cli --package @cosyte/fhir cosyte validate patient.json
```

## Turn on shell completion

`cosyte completion` prints a completion script for bash, zsh, or fish. Load it in the current bash
session:

```bash
source <(cosyte completion bash)
```

To keep it, add that line to your `~/.bashrc`. For zsh, use `source <(cosyte completion zsh)` in
`~/.zshrc`; for fish, save the output of `cosyte completion fish` to
`~/.config/fish/completions/cosyte.fish`.

## Check the programmatic entry point

The package also exports the code the command runs on (see
[Use the programmatic API](./use-the-programmatic-api.md)). If this resolves and shows the release
you installed, the install is good:

```ts runnable
import { VERSION } from "@cosyte/cli";

VERSION; // => "0.1.10"
```

The release tooling rewrites that value at each release, and the test suite compares it with the
package manifest.

## If you are on 0.0.1 or 0.0.2

Both versions are on npm and neither installs. `npm install @cosyte/cli@0.0.2` fails with:

```text
npm error code ENOENT
npm error path node_modules/@cosyte/cli/vendor/cosyte-fhir-0.0.0.tgz
npm error enoent ENOENT: no such file or directory
```

`npx` and `npm install -g` fail the same way, and nothing is wrong with your environment. Those
manifests named the sibling `@cosyte/*` packages as local files (`file:vendor/*.tgz`) instead of
npm version ranges, and the files were not in the published package. A published version cannot
be changed, so both stay broken. Every later version installs. Both also reported their version as
`0.0.0`; to read the real one, run `node -p "require('@cosyte/cli/package.json').version"`.

## Next

[Quickstart](./quickstart.md): parse, inspect, and validate a synthetic message.
