---
id: reference-commands
title: Command reference
sidebar_position: 3
---

# `cosyte` command reference

A man-page-style reference for every `cosyte` command, its arguments, and its flags. This mirrors
`cosyte --help`; the **API Reference** documents the programmatic (`.` subpath) surface. Every command
reads a `<file>` argument or `-` for stdin, autodetects the format by content unless `--format`
overrides it, and resolves to a code in the [exit-code contract](#exit-codes).

## Synopsis

```
cosyte <command> [options]
cosyte-mcp                      # the stdio MCP server (also: cosyte mcp)
```

## Global options

| Flag                   | Effect                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `-h`, `--help`         | Print help and exit `0`.                                                                                                                               |
| `-V`, `--version`      | Print the CLI version and exit `0`.                                                                                                                    |
| `--unsafe-show-values` | Permit a bounded input excerpt in a **failure** diagnostic on stderr. PHI-exposing; off by default; the single door to a value on a secondary surface. |

## Common options (parse / validate / inspect / fmt)

| Flag             | Effect                                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--format <fmt>` | Override autodetection: `hl7 \| fhir \| dicom \| x12 \| ccda \| ncpdp \| astm \| mllp`. Support is per (format, operation): see [Limitations](./limitations). |
| `--json`         | Machine-readable JSON output.                                                                                                                                  |
| `--quiet`        | Suppress value-free notes on stderr (the exit code becomes the whole signal).                                                                                  |
| `--no-color`     | Disable ANSI colour.                                                                                                                                           |

## Commands

### `cosyte parse <file\|->`

Parse a healthcare message to typed JSON on stdout (the data channel). Autodetects the format.
`--ndjson` treats each non-empty input line as a record and emits NDJSON; an MLLP stream is parsed one
record per frame with per-record isolation (a failed record becomes a value-free `{ record, error }`
line and the stream continues; any failure → exit `65`).

Multi-record output is **written record by record, as each record is parsed**, so the first line
reaches stdout long before the last byte of input has been read and a large batch can be piped
straight into another process.

```bash
cosyte parse adt.hl7
cat adt.hl7 | cosyte parse -
cosyte parse --ndjson bulk.ndjson | jq .
```

#### Input size limit

`parse` reads at most **67108864 bytes (64 MiB)** of input per invocation. A larger input is refused
with a value-free `CLI_INPUT_TOO_LARGE` diagnostic naming that limit and the **data-error** exit code
(`65`), never the internal-error code (`70`): a large input is not a bug in the tool. Split the input
and re-run. The same number is printed by `cosyte --help`.

Because records are emitted as they are parsed, a refusal can arrive **after** some records have
already been written to stdout. The exit code, not the output, is the signal that the run did not
complete: a partial record stream always carries a non-zero exit, never `0`.

### `cosyte validate <file\|-> [--profile <name>]`

Validate a message; **the exit code carries the verdict**: `0` valid, `1` invalid (parseable but
non-conformant), `65` unparseable. Findings are value-free (a code + a positional location). `--profile`
is reserved but gated to `CLI_NOT_IMPLEMENTED` (exit `69`), no profiles are bundled.

```bash
cosyte validate patient.json && echo "valid"   # branches on exit 0/1
```

### `cosyte inspect <file\|->`

Print a **value-free** structural summary: the message/resource type, segment/entry counts, and a
warning/issue count. Never emits a field value on either channel.

### `cosyte fmt <file\|->`

Canonically re-serialize via the wrapped library's spec-clean serializer. stdout is the data channel;
an unparseable input is a data error (`65`) with **no partial emit**.

### `cosyte convert <file\|-> --to fhir`

Convert an HL7 v2 message to a FHIR R4 `Bundle` via `@cosyte/transform`. `--to fhir` is required (the
only target today). An error-severity conversion issue drives exit `1`; a non-HL7 source is
`CLI_FORMAT_UNSUPPORTED` (`65`).

### `cosyte map-codes <conceptmap\|-> --code <code> [--system <uri>] [--version <v>] [--display <d>]`

Translate a code through a **bring-your-own** FHIR ConceptMap via `@cosyte/terminology` (`$translate`).
A match prints the target coding(s) and exits `0`; an unmapped code is `TERM_TRANSLATE_UNMAPPED`
(exit `1`); an unloadable map is `CLI_MAP_INVALID` (`65`). The positional is reference data, and a code
is not PHI.

### `cosyte redact <file\|->` (alias: `deid`)

De-identify a message. **The whole de-identification policy is `@cosyte/deid`'s**; the CLI adds no
locus map, no transform and no fallback scrub, so it either delegates or refuses. The covered formats
are `ccda`, `fhir`, `hl7`, `x12`.

stdout is the de-identified document, serialized exactly as `cosyte fmt` serializes that format.
stderr carries the library's own **value-free manifest**, one line per locus it acted on (category,
transform, the structural path, the count, the disposition and its stable code), plus the library's
own published output label and version. The CLI claims **no de-identification standard of its own**.

Anything short of a clean, fully-handled pass emits **nothing** on stdout:

| Outcome                                                          | Diagnostic               | Exit |
| ---------------------------------------------------------------- | ------------------------ | ---- |
| Every locus handled                                              | the manifest             | `0`  |
| The library reports a locus it could not handle                  | `CLI_DEID_INCOMPLETE`    | `1`  |
| `astm`, `mllp`, `ncpdp`: the library ships no adapter for them   | `CLI_NOT_IMPLEMENTED`    | `69` |
| `dicom`: covered by the library, but its de-identified form is a binary stream this text stdout cannot carry | `CLI_FORMAT_UNSUPPORTED` | `65` |
| `@cosyte/deid` is not installed (it is an optional dependency)   | `CLI_PARSER_UNAVAILABLE` | `69` |

An absent library is decided **before the input is read**. Identifier surrogates (MRN, account and
member numbers) are keyed with a **per-invocation ephemeral key**: consistent within one output, and
deliberately not stable across runs, so two runs cannot be linked by their surrogates.

```bash
cosyte redact adt.hl7 > clean.hl7        # stdout is the document, stderr is the manifest
cosyte redact adt.hl7 2>/dev/null        # the manifest suppressed; the exit code still carries the verdict
```

### `cosyte completion <bash\|zsh\|fish>`

Print a static, value-free shell-completion script generated from the command tree.

### `cosyte mcp` / `cosyte-mcp`

Start the stdio MCP server: the agent front door, exposing `parse`/`validate`/`inspect`/`convert` as
tools over the same core. See [MCP server](./mcp).

## Exit codes

| Code | Meaning                                                                                 |
| ---- | --------------------------------------------------------------------------------------- |
| `0`  | success / `validate` found the input **valid**                                          |
| `1`  | operation-level failure: `validate` found the input **invalid**, or `redact` could not de-identify every locus (a real CI signal) |
| `2`  | usage error: unknown command, bad flag, missing argument                               |
| `65` | data error: input could not be parsed / format not detected / (format, op) unsupported / input larger than the size limit |
| `66` | no input: the file does not exist or is unreadable                                     |
| `69` | unavailable: a capability is not wired here (e.g. `redact` on a format `@cosyte/deid` has no adapter for, `--profile`) |
| `70` | internal error: an unexpected exception (a bug)                                        |

The contract is a **stability surface**: renaming a code or a stable `CLI_*` diagnostic is a breaking
change, and it is locked by an exit-code golden matrix in the test suite.
