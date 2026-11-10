---
id: quickstart
title: Quickstart
sidebar_label: Quickstart
description: "Write a synthetic HL7 v2 message, then parse, inspect, and validate it, and read the exit code that says how each run ended."
---

# Quickstart

In this quickstart you write a small synthetic HL7 v2 message to a file, parse it to JSON, look at
its structure, validate it and a FHIR resource, and see what `cosyte` does with a file it does not
recognize. It takes a few minutes and needs only the installed command and a shell.

## Before you start

Install the command (see [Installation](./installation.md)) and check that it runs:

```bash no-run it prints the installed release, which changes with each release
cosyte --version
```

The commands below run in an empty directory. They use `jq` in one step; any JSON tool works.

## Write a message and parse it

This writes a synthetic ADT^A01 admit message to `message.hl7`, then parses it and prints its
summary:

```bash
# A synthetic ADT^A01 admit. HL7 v2 ends every segment with a carriage return (\r).
printf 'MSH|^~\\&|SENDINGAPP|SENDINGFAC|RECEIVINGAPP|RECEIVINGFAC|20240101120000||ADT^A01|MSG00001|P|2.5\rEVN|A01|20240101120000\rPID|1||MRN-000123^^^HOSP^MR||ZZSENTINELLAST^ZZSENTINELFIRST^M||19800101|M\rPV1|1|I|WARD^101^A\r' > message.hl7

cosyte parse message.hl7            # format autodetected → HL7 v2, typed JSON on stdout
cosyte inspect message.hl7          # a value-free summary: type, version, segment counts
```

`cosyte parse` found the format from the content, not the file name, and printed one JSON object
with three properties: `format`, `model` (the parsed message, as `@cosyte/hl7` builds it), and
`warnings` (anything the parser recovered from, as a code and a position).

## Look at the structure

`inspect` prints the message type, the version, and how many of each segment there are. It never
prints a field value, so its output is safe to paste into an issue:

```bash
cosyte inspect message.hl7
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

## Pick out part of the JSON

`--json` prints the same object on one line, which suits a pipe. This lists the segment names:

```bash
cosyte parse message.hl7 --json | jq -r '.model.segments[].name'
```

```text
MSH
EVN
PID
PV1
```

## Validate it

`validate` runs the parser's own checks and puts the verdict in the exit code: `0` valid, `1`
invalid, `65` when the input could not be parsed at all. An HL7 v2 message that parses is valid;
anything the parser recovered from is reported as a warning and does not fail it.

```bash
cosyte validate message.hl7; echo "exit $?"
```

```text
cosyte: validate: hl7 is valid (0 finding(s))
exit 0
```

A FHIR resource is checked against the FHIR R4 rules by `@cosyte/fhir`. This Patient has a gender
code that is not in its value set:

```bash
echo '{"resourceType":"Patient","id":"example","gender":"m"}' > patient.json
cosyte validate patient.json; echo "exit $?"
```

```text
cosyte: validate: error CODE_INVALID at Patient.gender
cosyte: validate: fhir is INVALID (1 error(s), 0 other finding(s))
exit 1
```

The finding names the code and where it is, `Patient.gender`, and not the value.

## Give it something it does not recognize

`cosyte` never guesses a format. A file that matches no format is refused with a code on stderr and
the data-error exit, `65`:

```bash
echo "hello" > note.txt
cosyte parse note.txt; echo "exit $?"
```

```text
cosyte: CLI_FORMAT_UNDETECTED: could not detect the input format; re-run with --format (detectable: hl7, mllp, fhir, x12, astm, ccda, ncpdp, dicom)
exit 65
```

## What you did

You parsed a message to JSON, read its structure without its values, validated two formats, and
saw a refusal. In each case the exit code told you how the run ended, which is what a script or a
CI job reads.

## Next

- [Check a folder of messages in CI](./check-messages-in-ci.md): the tutorial that turns these
  commands into a CI gate.
- [Parse messages in a pipeline](./guides-overview.md), [convert HL7 v2 to FHIR](./convert-hl7-to-fhir.md),
  [translate a code](./translate-codes.md), and [de-identify a message](./de-identify-a-message.md).
- [Command reference](./reference-commands.md): every command, option, and exit code.
