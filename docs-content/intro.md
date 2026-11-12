---
id: intro
title: "@cosyte/cli"
sidebar_label: Overview
description: "The cosyte command and the cosyte-mcp server: read a healthcare message from a file or a pipe, get typed JSON back, and branch on the exit code."
---

# @cosyte/cli

`@cosyte/cli` is the `cosyte` command and the `cosyte-mcp` server. Point `cosyte` at a healthcare
message, in a file or on a pipe, and it detects the format from the content, parses it with the
Cosyte library for that format, and prints typed JSON on stdout. Diagnostics on stderr carry a
stable code and a position, never a value from the message, and the exit code says how the run
ended, so a script or a CI job can branch on it.

```bash no-run it reads a file you supply
cosyte parse message.hl7
```

## Who it is for

Developers who work with HL7 v2, FHIR R4, X12, ASTM, NCPDP SCRIPT or Telecom, C-CDA, DICOM, or MLLP and want
to look inside a message, check it in CI, or hand it to an agent without writing code first.

## What it does

| Command | What it does |
| --- | --- |
| `parse` | Parse a message to typed JSON on stdout; an MLLP stream or an `--ndjson` input becomes one JSON line per record. |
| `validate` | Run the library's own validation; the exit code carries the verdict. |
| `inspect` | Print a structural summary: the message or resource type and its counts, never a field value. |
| `fmt` | Write the message back out through the library's serializer. |
| `convert` | Convert an HL7 v2 message to a FHIR R4 `Bundle` with `@cosyte/transform`. |
| `map-codes` | Translate one code through a FHIR `ConceptMap` you supply, with `@cosyte/terminology`. |
| `redact` (alias `deid`) | De-identify a message with `@cosyte/deid`, or refuse and print nothing. |
| `completion` | Print a completion script for bash, zsh, or fish. |
| `mcp` | Start the MCP server, the same as the `cosyte-mcp` command. |

Not every command supports every format; [Format support](./format-support.md) has the table.

## What it is not

- **Not a parser of its own.** Each wire format is parsed by its Cosyte library. A wrong value in
  the output is that library's to fix; a wrong exit code, a wrong route, or a value on stderr is
  this package's.
- **Not an integration engine.** It runs one command over one input and exits. It has no
  listeners, channels, schedules, or stored state.
- **Not a place to keep data.** It writes no file of its own and makes no network call: it reads
  the input you name and writes to stdout and stderr.

## Status

The 0.1 line is published to npm. Below 1.0, a breaking change ships in a minor version and is
called out in the changelog. Two early versions cannot be installed at all: see
[If you are on 0.0.1 or 0.0.2](./installation.md#if-you-are-on-001-or-002).

## Where to go next

- [Installation](./installation.md): install the command, and what a default install includes.
- [Quickstart](./quickstart.md): parse, inspect, and validate a synthetic message in a few minutes.
- [Check a folder of messages in CI](./check-messages-in-ci.md): a tutorial that builds a CI gate.
- [How the CLI works](./how-the-cli-works.md): detection, the exit-code contract, and what reaches
  stderr.
- [Command reference](./reference-commands.md) and [diagnostic codes](./diagnostic-codes.md).
