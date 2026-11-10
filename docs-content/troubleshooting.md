---
id: troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
description: "Fixes for common problems with cosyte: npx errors, formats it will not detect, missing libraries, refused de-identification, and output that stops early."
---

# Troubleshooting

Each failure prints one line on stderr, `cosyte: <CODE>: <message>`, and ends with a fixed exit
code. The code is the place to start; [Diagnostic codes](./diagnostic-codes.md) lists every one.

## `npx @cosyte/cli` says "could not determine executable to run"

The package has two commands, `cosyte` and `cosyte-mcp`, and none named `cli`. Name the command:

```bash no-run it downloads the package from npm
npx --package @cosyte/cli cosyte --help
```

## `npm install` fails with `ENOENT` on a `vendor/` path

You asked for 0.0.1 or 0.0.2, which cannot be installed. Install any later version; see
[If you are on 0.0.1 or 0.0.2](./installation.md#if-you-are-on-001-or-002).

## The format is not detected

[`CLI_FORMAT_UNDETECTED`](./diagnostic-codes.md#cli_format_undetected), exit `65`. The start of the
file matches no format's signature. Check what the file starts with: an HL7 v2 message must start
with `MSH` and its field separator, a FHIR resource must be a JSON object with `resourceType`, and
so on ([Format support](./format-support.md#detection)). If the file is right and only its start is
unusual, name the format:

```bash
cosyte inspect --format hl7 message.hl7
```

```text
format:       hl7
message type: ADT^A01
version:      2.5
segments:     4
  EVN: 1
  MSH: 1
  PID: 1
  PV1: 1
warnings:     0
```

## More than one format matches

[`CLI_FORMAT_AMBIGUOUS`](./diagnostic-codes.md#cli_format_ambiguous), exit `65`. The message names
the candidates; pass `--format` with the one you mean.

## The command does not support the format

[`CLI_FORMAT_UNSUPPORTED`](./diagnostic-codes.md#cli_format_unsupported), exit `65`. The message
names the formats the command does support. For a C-CDA document, use `inspect`, `fmt`, or
`validate` in place of `parse`; for DICOM, use `inspect` or `validate`. `convert` reads only HL7 v2.
[Format support](./format-support.md) has the full table.

## A library is unavailable

[`CLI_PARSER_UNAVAILABLE`](./diagnostic-codes.md#cli_parser_unavailable), exit `69`. The package the
message names is not installed, usually because the install used `--omit=optional` or the package
was removed. Install it next to `@cosyte/cli`. With `npx`, add it as a second `--package`. Every
other command keeps working in the meantime.

## The parser rejected the message

[`CLI_PARSE_FAILED`](./diagnostic-codes.md#cli_parse_failed), exit `65`. The code in parentheses is
the parser's. Follow [Debug a rejected message](./debug-a-rejected-message.md).

## `validate` passes a message I expected to fail

For every format `validate` supports other than FHIR, a message that parses is valid: the parsers accept what they can and
report the rest as warnings, which do not fail `validate`. Look at the warnings with
`cosyte validate` without `--quiet`, or at `.warnings` in `cosyte parse` output. For FHIR, only an
`error` or `fatal` finding fails it.

## `redact` prints nothing and exits `1`

[`CLI_DEID_INCOMPLETE`](./diagnostic-codes.md#cli_deid_incomplete). `@cosyte/deid` could not handle
some place in the message, and the manifest on stderr names it with `DEID_LOCUS_BLOCKED`. Under the
default policy, an HL7 v2 visit number (PV1-19) or a placer or filler order number does this. The
command has no setting to change it; see
[De-identify a message](./de-identify-a-message.md#handle-a-run-that-refuses).

## `redact` refuses the format

[`CLI_NOT_IMPLEMENTED`](./diagnostic-codes.md#cli_not_implemented), exit `69`, for `astm`, `mllp`,
and `ncpdp`; [`CLI_FORMAT_UNSUPPORTED`](./diagnostic-codes.md#cli_format_unsupported), exit `65`,
for `dicom`. `redact` covers `ccda`, `fhir`, `hl7`, `x12`.

## The output stops and the exit code is `74`

[`CLI_OUTPUT_WRITE_FAILED`](./diagnostic-codes.md#cli_output_write_failed). The program reading
`cosyte`'s output exited first, as `head` or a pager does. The output is incomplete. If you meant to
read only part of it, ignore the code for that step; otherwise let the reader consume all of it.

## The input is too large

[`CLI_INPUT_TOO_LARGE`](./diagnostic-codes.md#cli_input_too_large), exit `65`. One run reads at most
64 MiB. Split the input into smaller files.

## `--quiet` still prints a line

`--quiet` drops findings, counts, and summaries. It never drops a `cosyte: <CODE>:` diagnostic,
because that line is the reason for a non-zero exit.

## Is the output safe to share?

stderr is, by default: it carries codes, positions, formats, counts, and the path you passed, never
a value from the message. With `--unsafe-show-values` it is not. stdout carries the message itself,
or a form of it, for `parse`, `fmt`, `convert`, and `redact`; treat it as you would the input.

## An internal error

[`CLI_INTERNAL`](./diagnostic-codes.md#cli_internal), exit `70`. That is a defect. Please open an
issue at [github.com/cosyte/cli](https://github.com/cosyte/cli/issues) with the command and a
synthetic input that reproduces it.
