---
id: reference-commands
held_by: test/docs-content.test.ts
title: Command reference
sidebar_label: Commands
description: "Every cosyte command, its options, what it writes to stdout and stderr, and every exit code."
---

# Command reference

Every `cosyte` command, its options, and what it writes. `cosyte --help` prints the same summary.
The programmatic entry point is in the [API reference](./api/src.md).

## Synopsis

```text
cosyte <command> [<file> | -] [options]
cosyte-mcp
```

Every command that reads input takes one file name, or `-` to read stdin. Except for `map-codes`,
the format is detected from the content unless `--format` names it; see
[Format support](./format-support.md).

## Global options

| Option | Effect |
| --- | --- |
| `-h`, `--help` | Print the help and exit `0`. Read anywhere on the command line. |
| `-V`, `--version` | Print the version and exit `0`. Read in place of a command. |
| `--unsafe-show-values` | Add the start of the input to a `CLI_PARSE_FAILED` line from `parse` on a single message, `validate`, `inspect`, `fmt`, or `convert`. Read anywhere on the command line. Off by default; the output can carry patient data. |

`cosyte` with no command prints the help and exits `0`.

## Options by command

| Option | `parse` | `validate` | `inspect` | `fmt` | `convert` | `map-codes` | `redact` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `--format <format>` | yes | yes | yes | yes | yes | no | yes |
| `--json` | yes | yes | yes | no | yes | yes | no |
| `--quiet` | yes | yes | yes | yes | yes | yes | no |
| `--no-color` | yes | yes | yes | yes | yes | yes | no |
| other | `--ndjson` | `--profile <name>` | | | `--to fhir` | `--code`, `--system`, `--version`, `--display` | |

An option a command does not take is `CLI_USAGE`, exit `2`. `--format` takes `hl7`, `fhir`, `dicom`,
`x12`, `ccda`, `ncpdp`, `astm`, or `mllp`; any other value is `CLI_USAGE`. `--quiet` drops the
findings, counts, and summary lines a command writes to stderr; it never drops a
`cosyte: <CODE>: <message>` diagnostic. `--no-color` is
accepted, and changes nothing: `cosyte` writes no color.

## Commands

### `parse`

```text
cosyte parse <file | -> [--format <format>] [--ndjson] [--json] [--quiet] [--no-color]
```

Parses the input and writes `{ format, model, warnings }` to stdout, indented, or on one line with
`--json`. `model` is the parsing library's own model; each warning is a code and a position. When
there are warnings, a count goes to stderr.

An MLLP stream, and any input under `--ndjson`, is read one record at a time: each frame, or each
non-empty line. Each record is written as one line of JSON as soon as it is parsed:
`{ record, format, model, warnings }`, or `{ record, format, error }` when that record failed, with
a stable code in `error`. The stream goes on after a failed record. A summary line with the counts
goes to stderr.

Exit: `0`; `65` when the input, or any record of a stream, could not be parsed.

### `validate`

```text
cosyte validate <file | -> [--format <format>] [--json] [--quiet] [--no-color] [--profile <name>]
```

Parses the input and runs the library's validation. Without `--json`, writes one line per finding to
stderr, as `cosyte: validate: <severity> <code> at <location>`, and a verdict line; stdout is empty.
With `--json`, writes `{ format, valid, findings }` to stdout. With `--quiet`, writes nothing unless
there is a diagnostic. How each format decides validity is in
[Format support](./format-support.md#operations).

`--profile` is not available yet: it exits `69` with `CLI_NOT_IMPLEMENTED` before reading the input.

Exit: `0` valid; `1` invalid; `65` could not be parsed.

### `inspect`

```text
cosyte inspect <file | -> [--format <format>] [--json] [--quiet] [--no-color]
```

Writes a structural summary to stdout: the type and the counts, never a field value. With `--json`,
the summary is one JSON object. The fields for each format are in
[Format support](./format-support.md#what-inspect-prints).

Exit: `0`; `65` could not be parsed.

### `fmt`

```text
cosyte fmt <file | -> [--format <format>] [--quiet] [--no-color]
```

Parses the input and writes it back out through the library's serializer, so the output is the
serializer's form of the message. On a parse failure it writes nothing to stdout. When the parser
reported warnings, a count goes to stderr.

Exit: `0`; `65` could not be parsed.

### `convert`

```text
cosyte convert <file | -> --to fhir [--format <format>] [--json] [--quiet] [--no-color]
```

Converts an HL7 v2 message to a FHIR R4 `Bundle` with `@cosyte/transform`, and writes the `Bundle`
to stdout. Writes one line per finding to stderr, as `cosyte: convert: <severity> <code> at <location>`,
and a summary line. With `--json`, writes `{ format, bundle, findings }` to stdout instead. `--to fhir`
is required. See [Convert HL7 v2 to FHIR R4](./convert-hl7-to-fhir.md).

Exit: `0`; `1` a finding of severity `error`, with the `Bundle` still written; `65` the input is not
HL7 v2 or could not be parsed.

### `map-codes`

```text
cosyte map-codes <conceptmap | -> --code <code> [--system <uri>] [--version <version>] [--display <text>] [--json] [--quiet] [--no-color]
```

Loads the FHIR R4 `ConceptMap` and translates one code through it with `@cosyte/terminology`. Writes
`{ source, result }` to stdout, indented, or on one line with `--json`; without `--json`, a note goes
to stderr: the number of matches, or `TERM_TRANSLATE_UNMAPPED`. See
[Translate a code through a ConceptMap](./translate-codes.md).

Exit: `0` at least one match; `1` no match; `65` the map is not JSON or not a loadable `ConceptMap`.

### `redact`

```text
cosyte redact <file | -> [--format <format>]
cosyte deid <file | -> [--format <format>]
```

Hands the message to `@cosyte/deid` with its default policy. On success, writes the de-identified
message to stdout in the form `fmt` writes, and to stderr the library's version and published
label, one manifest line per place it acted on, a count, and a note that any surrogate identifiers
are keyed for this run alone. Covers `ccda`, `fhir`, `hl7`, `x12`. See
[De-identify a message](./de-identify-a-message.md).

| Outcome | Code | Exit |
| --- | --- | --- |
| Every place handled | | `0` |
| The library could not handle some place | `CLI_DEID_INCOMPLETE` | `1` |
| `astm`, `mllp`, `ncpdp` | `CLI_NOT_IMPLEMENTED` | `69` |
| `dicom` | `CLI_FORMAT_UNSUPPORTED` | `65` |
| `@cosyte/deid` is not installed (checked before the input is read) | `CLI_PARSER_UNAVAILABLE` | `69` |

On any outcome but the first, stdout is empty.

### `completion`

```text
cosyte completion <bash | zsh | fish>
```

Writes a completion script for the shell to stdout. Any other shell is `CLI_USAGE`, exit `2`.

### `mcp`

```text
cosyte mcp
cosyte-mcp
```

Starts the MCP server on stdio. See [Connect an agent with the MCP server](./mcp.md) and
[MCP tools](./mcp-tools.md). Without `@modelcontextprotocol/sdk`, exits `69` with
`CLI_PARSER_UNAVAILABLE`.

## Input size limit

One invocation reads at most 67108864 bytes (64 MiB) of input, the number `cosyte --help` prints.
`parse`, `validate`, `inspect`, `fmt`, `convert`, `map-codes`, and `redact` refuse a larger input with
`CLI_INPUT_TOO_LARGE` and exit `65`, never the internal-error code. `parse` reads its input as a
stream, so it detects the format from the first bytes before the count reaches the limit, and an
input it cannot detect is refused as that first. The count is checked as the input arrives, so a
stream refused part way through keeps the records it already wrote; the exit code, not the output,
says the run did not finish. Split the input and run again.

## Exit codes

| Code | Name in `EXIT` | Meaning |
| --- | --- | --- |
| `0` | `OK` | Success; `validate` found the input valid. |
| `1` | `INVALID` | The command ran and the answer is no: `validate` found the input invalid, `convert` had an error-severity finding, `map-codes` found no mapping, or `redact` could not handle every place. |
| `2` | `USAGE` | Unknown command, unknown or malformed option, or missing argument. |
| `65` | `DATAERR` | The input could not be parsed, its format was not detected or is not supported by the command, it was empty, or it was over the size limit. |
| `66` | `NOINPUT` | The file does not exist or cannot be read. |
| `69` | `UNAVAILABLE` | The command cannot serve this input: an optional library is not installed, or a capability is not available (`redact` on a format `@cosyte/deid` has no adapter for, `validate --profile`). |
| `70` | `SOFTWARE` | An unexpected internal error: a defect. |
| `74` | `IOERR` | The output stream closed before the output was delivered, as when piping into `head`. |

The values are exported as [`EXIT`](./api/src.md#exit). Changing one is a breaking change. Each
diagnostic code and its exit code is in [Diagnostic codes](./diagnostic-codes.md).
