---
id: concepts-archetype
title: How the CLI works
sidebar_position: 1
---

# Core Concepts

`@cosyte/cli` is a **thin, honest skin** over the `@cosyte/*` parsers. Understanding its three
load-bearing disciplines — the wrapper boundary, the exit-code contract, and the PHI posture — tells
you exactly what to trust it for.

## The wrapper boundary

The CLI's correctness surface is **narrow by design**, because most correctness lives one layer down.

**The CLI owns:** format autodetection routing, the exit-code contract, the value-free PHI posture,
argument/stdin handling, output shaping, and faithful pass-through of the wrapped library's warnings.

**The CLI does _not_ re-do:** any wire-format parsing, tolerance, or warning semantics — that is the
wrapped parser's job, graded by its own conformance gate. `cosyte parse` equals the library's
programmatic parse; a bug in a value is the library's, while a mis-route, a wrong exit code, or a
leaked value is the CLI's.

## Fail-safe autodetection

Detection sniffs content, never the file extension, and is **conservative**: a single confident
signature match parses; zero or more than one match is a typed data error asking for `--format`,
**never a guess**. A wrong sniff would route bytes to the wrong parser and yield confident garbage —
so the CLI refuses to guess, mirroring the parsers' "never a confident wrong value" rule at the
routing layer.

## The exit-code contract

Exit codes are a **designed surface** CI depends on, grounded in the Unix `sysexits.h` conventions:
`0` success, `2` usage error, `65` data error (unparseable / undetected), `66` no input, `70` internal
error. The load-bearing rule: the CLI **never prints a reassuring line and exits `0`** on input it
could not handle.

## The PHI posture

A CLI operates on real files a developer points at — the moment cosyte code touches un-synthetic PHI.
So the channels are split:

- **stdout is the data channel.** `parse` emits the parsed model there because that is your explicit
  request, going to the sink you chose (a pipe, a redirect, your screen).
- **Every other surface is value-free.** stderr, errors, and diagnostics carry **only** positional
  context — a segment/field index, a byte offset, a file path, a stable code — **never** a name, DOB,
  MRN, or result value. An error never echoes the offending bytes.

Diagnostic codes are stable (`CLI_CODES`): scripts branch on them, so renaming one is a breaking
change.

> The `--unsafe-show-values` escape hatch and the `redact` command are a later phase; Phase 1 is
> value-free everywhere except the stdout data channel.
