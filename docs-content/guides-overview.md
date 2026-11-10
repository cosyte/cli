---
id: guides-overview
title: Parse messages in a pipeline
sidebar_label: Parse in a pipeline
description: "Read a message from stdin, pick a field out of the JSON, force a format, and stream an MLLP capture or an NDJSON file one record at a time."
---

# Parse messages in a pipeline

`cosyte parse` reads one input, from a file or from stdin, and writes JSON to stdout. These steps
cover the shapes it takes in a pipeline. The examples use the file names `message.hl7`,
`stream.mllp`, and `bulk.ndjson`; use your own.

## Read from stdin

Pass `-` in place of a file name:

```bash
cat message.hl7 | cosyte parse -
```

## Pick a field out of the JSON

`--json` prints the result on one line. The `model` is the parsed message as the format's library
builds it; for HL7 v2, `@cosyte/hl7` keeps each segment's fields in order, with `fields[3]` holding
PID-3:

```bash
cat message.hl7 | cosyte parse - --json \
  | jq -r '.model.segments[] | select(.name == "PID") | .fields[3].repetitions[0].components[0].subcomponents[0]'
```

```text
MRN-000123
```

The output is the message's own data, so send it only where you would send the message.

## Force a format

Detection reads the content, not the file name, so a `.txt` that holds an HL7 v2 message parses as
HL7 v2. When detection cannot decide, name the format with `--format`:

```bash
cosyte parse --format hl7 message.hl7 --json > /dev/null; echo "exit $?"
```

```text
exit 0
```

A format that does not match the content is refused, not guessed around:

```bash
cosyte parse --format fhir message.hl7; echo "exit $?"
```

```text
cosyte: CLI_PARSE_FAILED: the fhir parser rejected the input (MALFORMED_JSON)
exit 65
```

## Stream an MLLP capture

A file of MLLP frames is parsed one frame at a time. Each frame's HL7 v2 message becomes one line of
JSON, written as soon as it is parsed. `--quiet` drops the summary line on stderr:

```bash
cosyte parse stream.mllp --quiet | jq -c '{record, format, segments: (.model.segments | length)}'
```

```text
{"record":0,"format":"hl7","segments":2}
{"record":1,"format":"hl7","segments":2}
```

## Stream an NDJSON file

`--ndjson` treats each non-empty line as one record, the shape of a FHIR bulk data export. A record
that fails becomes a line with a stable code in `error`, and the stream goes on; the run then exits
`65`:

```bash
cosyte parse bulk.ndjson --ndjson --quiet | jq -c '{record, error, resourceType: .model.resourceType}'
echo "exit ${PIPESTATUS[0]}"
```

```text
{"record":0,"error":null,"resourceType":"Patient"}
{"record":1,"error":"MALFORMED_JSON","resourceType":null}
{"record":2,"error":null,"resourceType":"Observation"}
exit 65
```

If the reader on the other end of the pipe stops early (`head`, a pager you quit), the run ends with
`CLI_OUTPUT_WRITE_FAILED` and exit `74`, never `0`.

## Mind the size limit

One invocation reads at most 64 MiB of input. Split a larger capture into files and parse each one.

## Reference

- [`parse`](./reference-commands.md#parse) and its options.
- [Format support](./format-support.md): which formats `parse` takes, and how each is detected.
- [`CLI_PARSE_FAILED`](./diagnostic-codes.md#cli_parse_failed),
  [`CLI_INPUT_TOO_LARGE`](./diagnostic-codes.md#cli_input_too_large), and
  [`CLI_OUTPUT_WRITE_FAILED`](./diagnostic-codes.md#cli_output_write_failed).
