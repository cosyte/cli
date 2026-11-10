---
id: convert-hl7-to-fhir
title: Convert HL7 v2 to FHIR R4
sidebar_label: Convert HL7 v2 to FHIR
description: "Turn an HL7 v2 message into a FHIR R4 Bundle with cosyte convert, read the conversion's findings, and fail a script on an error-severity one."
---

# Convert HL7 v2 to FHIR R4

`cosyte convert` parses an HL7 v2 message with `@cosyte/hl7`, converts it with
`@cosyte/transform`, and writes the FHIR R4 `Bundle` with `@cosyte/fhir`. The mapping is
`@cosyte/transform`'s; the command adds none of its own. The examples use `message.hl7`; use your
own file.

## Convert a message

`--to fhir` is required. The `Bundle` goes to stdout and the conversion's findings go to stderr, so
you can keep them apart:

```bash
cosyte convert message.hl7 --to fhir > bundle.json 2> findings.txt; echo "exit $?"
cat findings.txt
```

```text
exit 0
cosyte: convert: warning TRANSFORM_IDENTIFIER_SYSTEM_UNRESOLVED at CX.4 → Identifier.system
cosyte: convert: information TRANSFORM_ELEMENT_DROPPED at PV1.3 → Encounter.location
cosyte: convert: information TRANSFORM_REQUIRED_ELEMENT_UNKNOWN at MSH.3 → MessageHeader.source.endpoint
cosyte: convert: warning TRANSFORM_TIMESTAMP_NO_TIMEZONE at TS.1 → dateTime
cosyte: convert: information TRANSFORM_ELEMENT_DROPPED at MSH.7 → Bundle.timestamp
cosyte: convert: information TRANSFORM_SEGMENT_NOT_EMITTED at EVN[1]
cosyte: convert: hl7 → fhir OK (6 finding(s))
```

Each finding is a severity, a code from `@cosyte/transform`, and where it applies: the HL7 v2
location and, when there is one, the FHIR path it maps to. No finding carries a value from the
message.

## Read the Bundle

The `Bundle` is a FHIR message bundle. `--quiet` drops the findings, and the output pipes into any
JSON tool:

```bash
cosyte convert message.hl7 --to fhir --quiet | jq -r '.entry[].resource.resourceType'
```

```text
MessageHeader
Patient
Encounter
```

## Get the Bundle and the findings as one JSON object

`--json` writes `{ format, bundle, findings }` to stdout, with nothing on stderr:

```bash
cosyte convert message.hl7 --to fhir --json | jq -c '.findings[] | select(.severity == "warning")'
```

```text
{"code":"TRANSFORM_IDENTIFIER_SYSTEM_UNRESOLVED","severity":"warning","location":"CX.4 → Identifier.system"}
{"code":"TRANSFORM_TIMESTAMP_NO_TIMEZONE","severity":"warning","location":"TS.1 → dateTime"}
```

## Fail a script on a conversion error

A finding of severity `error` makes the run exit `1`, with the `Bundle` still on stdout; warnings
and information do not. Branch on the exit code:

```bash
if cosyte convert message.hl7 --to fhir --quiet > bundle.json; then
  echo "converted"
else
  echo "conversion failed with exit $?"
fi
```

```text
converted
```

An input that is not HL7 v2 is refused with `CLI_FORMAT_UNSUPPORTED` and exit `65`:

```bash
cosyte convert patient.json --to fhir; echo "exit $?"
```

```text
cosyte: CLI_FORMAT_UNSUPPORTED: convert reads HL7 v2 and writes FHIR R4; the input is 'fhir', not an HL7 v2 source
exit 65
```

## When the libraries are missing

`@cosyte/transform` and `@cosyte/fhir` are optional dependencies. A default install has both; an
install without either one makes `convert` print `CLI_PARSER_UNAVAILABLE` and exit `69`. Install
both next to `@cosyte/cli`.

## Reference

- [`convert`](./reference-commands.md#convert) and its options.
- [`CLI_FORMAT_UNSUPPORTED`](./diagnostic-codes.md#cli_format_unsupported) and
  [`CLI_PARSER_UNAVAILABLE`](./diagnostic-codes.md#cli_parser_unavailable).
- [`convertOutcome`](./api/src.md#convertoutcome), the function that decides the exit code from the
  findings, and [`convertCommand`](./api/src.md#convertcommand).
- The mapping itself is documented with `@cosyte/transform`, at
  [docs.cosyte.com/transform](https://docs.cosyte.com/transform).
