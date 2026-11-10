---
id: format-support
title: Format support
sidebar_label: Format support
description: "Which command supports which format, how cosyte detects each format from its content, and which Cosyte library each one needs."
---

# Format support

A command that does not support a format refuses it with `CLI_FORMAT_UNSUPPORTED` and exit `65`,
naming the formats that it does support. It never returns a partial or substitute result. The same
table is exported as [`OP_SUPPORT`](./api/src.md#op_support).

## Operations

| Format | `parse` | `inspect` | `fmt` | `validate` |
| --- | --- | --- | --- | --- |
| `hl7` | yes | yes | yes | yes |
| `fhir` | yes | yes | yes | yes |
| `x12` | yes | yes | yes | yes |
| `astm` | yes | yes | yes | yes |
| `ncpdp` | yes | yes | yes | yes |
| `ccda` | no | yes | yes | yes |
| `dicom` | no | yes | no | yes |
| `mllp` | yes | yes | no | no |

- `ccda` has no `parse`: `fmt` writes the document back as XML instead.
- `dicom` has no `parse` or `fmt`: its model and its serialized form are binary, and stdout is text.
- `ncpdp` covers both standards `@cosyte/ncpdp` reads: SCRIPT, the XML ePrescribing message, and
  Telecom vD.0, the pharmacy claim. An input whose first character past spaces and line breaks is
  `<` is read as SCRIPT, anything else as Telecom, with or without `--format ncpdp`. Detection
  recognizes a Telecom request; a Telecom response needs `--format ncpdp`.
- `mllp` is a transport, not a document format. `parse` takes each frame's HL7 v2 message and
  parses it as `hl7`, one JSON line per frame; `inspect` counts the frames.
- For `hl7`, `x12`, `astm`, `ccda`, `dicom`, and `ncpdp`, `validate` passes a message that parses;
  what the parser recovered from is reported as a warning and does not fail it. For `fhir`,
  `@cosyte/fhir` also validates the resource, and an `error` or `fatal` finding makes it invalid.

## Other commands

| Command | Formats |
| --- | --- |
| `convert` | `hl7` in, FHIR R4 out. Any other detected format is `CLI_FORMAT_UNSUPPORTED`. |
| `map-codes` | A FHIR R4 `ConceptMap` in JSON; no detection runs. |
| `redact` | `ccda`, `fhir`, `hl7`, `x12`. `astm`, `mllp`, and `ncpdp` are `CLI_NOT_IMPLEMENTED` (exit `69`): `@cosyte/deid` has no adapter for them as this CLI reads them (this CLI does not hand NCPDP to its Telecom adapter). `dicom` is `CLI_FORMAT_UNSUPPORTED` (exit `65`): its de-identified form is binary. |

The `redact` coverage is exported as [`DEID_COVERAGE`](./api/src.md#deid_coverage).

## Detection

Detection reads the first 512 bytes of the input and checks every format's signature against them.
It parses only when exactly one matches. A signature that says "starts with" skips a byte order mark
and leading spaces, tabs, and line breaks first. The formats are listed in the order the
`CLI_FORMAT_UNDETECTED` message names them:

| Format | Signature |
| --- | --- |
| `hl7` | Starts with `MSH` followed by a punctuation character, the field separator. |
| `mllp` | The first byte is `0x0B`, the MLLP frame start. |
| `fhir` | Starts with `{` and has a `"resourceType"` member with a string value. |
| `x12` | Starts with `ISA` followed by a punctuation character, the element separator. |
| `astm` | Starts with `H` followed by four punctuation characters, the delimiters. |
| `ccda` | Has a `<ClinicalDocument` element. |
| `ncpdp` | SCRIPT: has a `<Message` element and the text `ncpdp`, in any case. Telecom: starts with six digits and `D0` (a vD.0 request header), and a field, group, or segment separator (`0x1C`, `0x1D`, `0x1E`) follows the 56-byte header. Nothing is skipped before a Telecom header. |
| `dicom` | Has `DICM` at byte 128. |

No match is `CLI_FORMAT_UNDETECTED`; more than one is `CLI_FORMAT_AMBIGUOUS`. Either way, exit `65`,
and `--format` decides. The file name and its extension are never read. With `--format`, no
detection runs, and `map-codes` never runs it.

## Libraries

| Format | Parsed with | Dependency |
| --- | --- | --- |
| `hl7` | `@cosyte/hl7` | required |
| `fhir` | `@cosyte/fhir` | optional |
| `x12` | `@cosyte/x12` | optional |
| `astm` | `@cosyte/astm` | optional |
| `ncpdp` | `@cosyte/ncpdp` | optional |
| `ccda` | `@cosyte/ccda` | optional |
| `dicom` | `@cosyte/dicom` | optional |
| `mllp` | `@cosyte/mllp`, then `@cosyte/hl7` | optional |

A default install has every optional dependency. Without one, a command that needs it prints
`CLI_PARSER_UNAVAILABLE` and exits `69`. `convert` also needs `@cosyte/transform` and
`@cosyte/fhir`, and `redact` needs `@cosyte/deid`.

## What `inspect` prints

`inspect` prints counts and type codes, never a field value. With `--json`, the same summary is a
JSON object with a `format` property.

| Format | Summary |
| --- | --- |
| `hl7` | message type, version, segment count, count of each segment, warnings |
| `fhir` | resource type; for a `Bundle`, its type, entry count, and count of each entry's resource type; issues |
| `x12` | functional groups, transactions, count of each transaction set, segments, warnings |
| `astm` | message kind, records, count of each record type, warnings |
| `ccda` | document type, sections, section codes, warnings |
| `dicom` | SOP class UID, transfer syntax UID, elements, warnings |
| `ncpdp` | SCRIPT: standard, message type, version, warnings. Telecom: standard, request or response, transaction code, version, transactions, segments, count of each segment ID, warnings |
| `mllp` | frames, warnings |
