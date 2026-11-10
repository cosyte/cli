---
id: diagnostic-codes
title: Diagnostic codes
sidebar_label: Diagnostic codes
description: "Every CLI_* diagnostic code cosyte prints on stderr: the exit code it comes with and when it is raised."
---

# Diagnostic codes

When `cosyte` fails on its own account, it prints one line on stderr:

```text
cosyte: <CODE>: <message>
```

The code is stable: renaming or removing one is a breaking change. The message after it is for
people and may change. Neither carries a value from the input; a message may name a format, a code,
a position, a count, or the file path you passed. The codes are exported as
[`CLI_CODES`](./api/src.md#cli_codes).

| Code | Exit |
| --- | --- |
| [`CLI_USAGE`](#cli_usage) | `2` |
| [`CLI_NO_INPUT`](#cli_no_input) | `66` |
| [`CLI_EMPTY_INPUT`](#cli_empty_input) | `65` |
| [`CLI_FORMAT_UNDETECTED`](#cli_format_undetected) | `65` |
| [`CLI_FORMAT_AMBIGUOUS`](#cli_format_ambiguous) | `65` |
| [`CLI_FORMAT_UNSUPPORTED`](#cli_format_unsupported) | `65` |
| [`CLI_PARSER_UNAVAILABLE`](#cli_parser_unavailable) | `69` |
| [`CLI_PARSE_FAILED`](#cli_parse_failed) | `65` |
| [`CLI_INPUT_TOO_LARGE`](#cli_input_too_large) | `65` |
| [`CLI_OUTPUT_WRITE_FAILED`](#cli_output_write_failed) | `74` |
| [`CLI_MAP_INVALID`](#cli_map_invalid) | `65` |
| [`CLI_NOT_IMPLEMENTED`](#cli_not_implemented) | `69` |
| [`CLI_DEID_INCOMPLETE`](#cli_deid_incomplete) | `1` |
| [`CLI_INTERNAL`](#cli_internal) | `70` |

## `CLI_USAGE`

Exit `2`. An unknown command, an unknown or malformed option, a missing file argument, an unknown
`--format` value, `convert` without `--to fhir`, `map-codes` without `--code`, or an unknown shell
for `completion`.

## `CLI_NO_INPUT`

Exit `66`. The named file does not exist or cannot be read. The message names the path you passed.

## `CLI_EMPTY_INPUT`

Exit `65`. The input has no bytes.

## `CLI_FORMAT_UNDETECTED`

Exit `65`. The content matches no format's signature, and `cosyte` does not guess. The message lists
the formats it can detect. Pass `--format` if you know the format; see
[Format support](./format-support.md#detection).

## `CLI_FORMAT_AMBIGUOUS`

Exit `65`. The content matches more than one format's signature, such as an MLLP frame around a
C-CDA document, or a text file with `DICM` at byte 128. The message names the candidates. Pass
`--format`.

## `CLI_FORMAT_UNSUPPORTED`

Exit `65`. The format was recognized, but the command does not support it: `parse` on C-CDA or
DICOM, `fmt` on DICOM or MLLP, `validate` on MLLP, `convert` on anything but HL7 v2, or `redact` on
DICOM. The message names the formats that do support the operation. See
[Format support](./format-support.md).

## `CLI_PARSER_UNAVAILABLE`

Exit `69`. An optional package the command needs is not installed: a format's parser,
`@cosyte/fhir`, `@cosyte/transform`, `@cosyte/deid`, or, for `cosyte-mcp` and `cosyte mcp`,
`@modelcontextprotocol/sdk`. The message names the package to install. A default install has all of
them; an install with `--omit=optional` does not.

## `CLI_PARSE_FAILED`

Exit `65`. The format's parser rejected the input. The message names the format and, when the
parser gave one, its own code in parentheses. With `--unsafe-show-values`, the line also carries the
first 200 bytes of the input; see [Debug a rejected message](./debug-a-rejected-message.md). An
MLLP stream that ends in the middle of a frame is reported with this code too.

## `CLI_INPUT_TOO_LARGE`

Exit `65`. The input is larger than the 64 MiB one invocation reads. The input is refused as it
arrives, so output already written for earlier records stays written; the exit code says the run
did not finish.

## `CLI_OUTPUT_WRITE_FAILED`

Exit `74`. The reader of stdout went away before the output was delivered, for example `head` or a
pager you quit. The output is incomplete.

## `CLI_MAP_INVALID`

Exit `65`. The `ConceptMap` given to `map-codes` is not JSON, or `@cosyte/terminology` could not
load it as a `ConceptMap`; its own code follows in parentheses when it gave one.

## `CLI_NOT_IMPLEMENTED`

Exit `69`. The command cannot serve this input: `redact` on `astm`, `mllp`, or `ncpdp`, for which
`@cosyte/deid` has no adapter, or `validate --profile`, since no profiles can be loaded yet.

## `CLI_DEID_INCOMPLETE`

Exit `1`. `redact` ran and `@cosyte/deid` reported at least one place it could not handle. Nothing
is written to stdout; the manifest on stderr names each blocked place and its code. See
[De-identify a message](./de-identify-a-message.md#handle-a-run-that-refuses).

## `CLI_INTERNAL`

Exit `70`. An unexpected error: a defect in `cosyte` or a library it wraps. The message is fixed
and carries nothing from the error or the input. Please report it with the command you ran and a
synthetic input that reproduces it.

## Codes from the wrapped libraries

Some lines on stderr carry another library's codes, unchanged:

- `validate` and `convert` findings, as `cosyte: validate: <severity> <code> at <location>` and
  `cosyte: convert: <severity> <code> at <location>`, with codes from `@cosyte/fhir`, the format's
  parser, or `@cosyte/transform`.
- The `redact` manifest, with `@cosyte/deid`'s codes such as `DEID_CATEGORY_REMOVED` and
  `DEID_LOCUS_BLOCKED`.
- An unmapped code from `map-codes`, `TERM_TRANSLATE_UNMAPPED`, from `@cosyte/terminology`.

Each library documents its own codes on [docs.cosyte.com](https://docs.cosyte.com).
