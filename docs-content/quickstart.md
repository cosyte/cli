---
id: quickstart
title: Quickstart
sidebar_position: 1
---

# Quickstart

Turn an opaque healthcare message into typed JSON in one line. `cosyte parse` reads a file (or stdin
via `-`), **autodetects the format by content**, and prints the parsed model to stdout.

## Parse a file or a pipeline

```bash
cosyte parse message.hl7            # → { "format": "hl7", "model": …, "warnings": [] }
cat patient.json | cosyte parse -   # from stdin
cosyte parse --json message.hl7 | jq '.model'   # compact output for a pipeline
```

The output is a stable envelope: the detected `format`, the parsed `model`, and any value-free
`warnings` the wrapped parser recovered (each a stable code plus a position — never a field value).

## Autodetection is conservative — it never guesses

Detection sniffs the leading bytes' content, not the file extension: an `MSH|…` message is HL7, a JSON
object with a `resourceType` is FHIR. If nothing matches, `parse` does **not** guess — it exits with a
data error (`65`) and asks for `--format`:

```ts runnable
import { detectFormat } from "@cosyte/cli";

const enc = new TextEncoder();
detectFormat(enc.encode("MSH|^~\\&|Sender|Facility\r")).format; // => "hl7"
detectFormat(enc.encode('{"resourceType":"Patient","id":"example"}')).format; // => "fhir"
detectFormat(enc.encode("not a healthcare message")).confidence; // => "none"
```

## The exit-code contract

`cosyte parse` is safe to branch on in CI — the exit code carries the outcome:

| Code | Meaning                                              |
|------|------------------------------------------------------|
| `0`  | success                                              |
| `2`  | usage error (unknown flag, missing argument)         |
| `65` | data error (unparseable input, or format undetected) |
| `66` | no input (missing/unreadable file)                   |
| `70` | internal error (a bug)                               |

```ts runnable
import { EXIT } from "@cosyte/cli";

EXIT.OK; // => 0
EXIT.DATAERR; // => 65
EXIT.NOINPUT; // => 66
```

## Next

- [Core Concepts](./concepts-archetype) — the wrapper boundary, the exit-code contract, the PHI posture.
- **API Reference** — every programmatic export, generated from source.
