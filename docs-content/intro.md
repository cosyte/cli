---
id: intro
title: Getting started
sidebar_position: 1
---

# @cosyte/cli

`cosyte` is a **PHI-safe developer CLI** over the `@cosyte/*` healthcare parsers. Pipe a raw message
from a hospital feed into the terminal and get typed, structured JSON back in one line — without
writing code, without reading the spec, and **without ever being handed a confident wrong value or a
silent success on a malformed message**.

```bash
cat adt.hl7 | cosyte parse -
```

`@cosyte/cli` is a **`bin` package**, not a library: its primary artifact is the `cosyte` command on
your `PATH`. It is a thin, honest skin over libraries that already own correctness — it routes, reads,
shapes output, and owns two disciplines of its own: a documented **exit-code contract** and a
**value-free diagnostic** posture (never a field value on stderr).

> **Status:** pre-alpha (`0.0.x`), not yet published to npm. `parse`, `validate`, `inspect`, and `fmt`
> are wired for **HL7 v2** and **FHIR R4**; `convert` and `map-codes` wrap the higher-layer libraries.
> A **`cosyte-mcp` MCP server** exposes the same core to an LLM/agent. More formats land in later phases.

## Parse a message

`parse` reads a file (or stdin via `-`), **autodetects the format by content**, and prints the parsed
model as typed JSON on stdout:

```bash
cosyte parse message.hl7            # autodetected → HL7 v2
cosyte parse patient.json           # autodetected → FHIR
cat message.hl7 | cosyte parse -    # from a pipeline
cosyte parse --format hl7 msg.txt   # override autodetection
```

The exit code carries the outcome — `0` success, `65` unparseable/undetected, `66` missing file — so
`cosyte parse` is safe to branch on in CI. See [Quickstart](./quickstart).

## Next

- [Installation](./installation) — `npx`, global install, prerequisites.
- [Quickstart](./quickstart) — the one-line parse, stdin, and the programmatic API.
- [MCP server](./mcp) — expose the same parse/validate/convert core to an LLM/agent.
- **API Reference** — every programmatic export, generated from source.
