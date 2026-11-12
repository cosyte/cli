---
id: de-identify-a-message
title: De-identify a message
sidebar_label: De-identify a message
description: "Run cosyte redact over an HL7 v2, FHIR, C-CDA, or X12 message, read its manifest, and handle the run that refuses and prints nothing."
---

# De-identify a message

`cosyte redact`, or its alias `cosyte deid`, hands the message to `@cosyte/deid` with that library's
default policy and prints the result. The command adds no policy, no rule, and no fallback of its
own: it delegates, or it refuses and prints nothing. It covers `ccda`, `fhir`, `hl7`, `x12`. The
examples use `message.hl7` and `visit.hl7`; use your own files, and review the output before you
rely on it.

## De-identify a message

The de-identified message goes to stdout. stderr carries `@cosyte/deid`'s manifest: one line for
each place it acted on, giving the category, the transform, the location, the count, what happened,
and the library's code, never the value. HL7 v2 ends segments with a carriage return, so `tr` makes
the output readable in a terminal:

```bash
cosyte redact message.hl7 2> manifest.txt | tr '\r' '\n'
```

```text
MSH|^~\&|SENDINGAPP|SENDINGFAC|RECEIVINGAPP|RECEIVINGFAC|2024||ADT^A01|MSG00001|P|2.5
EVN|A01|2024
PID|1||^^^HOSP^MR||||1980|M
PV1|1|I|WARD^101^A
```

List the manifest entries:

```bash
grep DEID_ manifest.txt
```

```text
cosyte: redact: DATES generalize MSH-7[0] x1 transformed DEID_RESIDUAL_RETAINED
cosyte: redact: DATES generalize EVN-2[0] x1 transformed DEID_RESIDUAL_RETAINED
cosyte: redact: MRN redact PID-3[0] x1 removed DEID_CATEGORY_REMOVED
cosyte: redact: NAMES redact PID-5 x1 removed DEID_CATEGORY_REMOVED
cosyte: redact: DATES generalize PID-7 x1 transformed DEID_RESIDUAL_RETAINED
```

The rest of `manifest.txt` names the library's version and the label it publishes for its output,
a count of the places it acted on, and a note that any surrogate identifiers are keyed with a key
made for this run alone. The CLI reports the library's label as it is and claims no
de-identification standard of its own.

Under the default policy, medical record, account, and member numbers are removed, not replaced
with a surrogate.

## Handle a run that refuses

If `@cosyte/deid` reports any place it could not handle, the run prints nothing on stdout and exits
`1` with `CLI_DEID_INCOMPLETE`. Under the default policy that happens for an HL7 v2 visit number
(PV1-19) and for a placer or filler order number (ORC-2, ORC-3, OBR-2, OBR-3): the library blocks
them as a catch-all identifier.

```bash
cosyte redact visit.hl7 > clean.hl7 2> manifest.txt; echo "exit $?"
grep -E 'blocked|CLI_DEID' manifest.txt
wc -c < clean.hl7
```

```text
exit 1
cosyte: redact: OTHER_UNIQUE_ID block PV1-19[0] x1 blocked DEID_LOCUS_BLOCKED
cosyte: redact: hl7: 6 loci acted on (3 transformed, 2 removed, 1 blocked)
cosyte: CLI_DEID_INCOMPLETE: @cosyte/deid blocked 1 of 6 loci in this hl7 input; no output was emitted
0
```

`clean.hl7` is empty. The command has no option that turns a block into a removal; to de-identify
such a message, use `@cosyte/deid` from code with a policy of your own. In a script, branch on the
exit code before you use the output:

```bash
if cosyte redact message.hl7 > clean.hl7 2> /dev/null; then
  echo "de-identified"
else
  echo "refused with exit $?; clean.hl7 is empty"
fi
```

```text
de-identified
```

## Formats it refuses

`astm`, `mllp`, and `ncpdp` have no adapter in `@cosyte/deid` for the form this CLI reads, so they
are refused with `CLI_NOT_IMPLEMENTED` and exit `69`:

```bash
cosyte redact stream.mllp; echo "exit $?"
```

```text
cosyte: CLI_NOT_IMPLEMENTED: @cosyte/deid does not de-identify the mllp standard this CLI resolves, and the CLI ships no redactor of its own, so nothing is emitted
exit 69
```

`dicom` is covered by `@cosyte/deid`, but its result is binary and this command's output is text, so
it is refused with `CLI_FORMAT_UNSUPPORTED` and exit `65`.

## Things to know

- `--unsafe-show-values` has no effect on `redact`: its diagnostics never carry a value from the
  input.
- `@cosyte/deid` is an optional dependency. Without it, `redact` prints `CLI_PARSER_UNAVAILABLE` and
  exits `69` before it reads the input.
- `--format` overrides detection, as for the other commands. `redact` takes no other option.

## Reference

- [`redact`](./reference-commands.md#redact) and its exit codes.
- [`CLI_DEID_INCOMPLETE`](./diagnostic-codes.md#cli_deid_incomplete),
  [`CLI_NOT_IMPLEMENTED`](./diagnostic-codes.md#cli_not_implemented), and
  [`CLI_FORMAT_UNSUPPORTED`](./diagnostic-codes.md#cli_format_unsupported).
- [`DEID_COVERAGE`](./api/src.md#deid_coverage) and [`redactCommand`](./api/src.md#redactcommand) in the
  API reference.
- [Why redact delegates](./how-the-cli-works.md#de-identification-is-delegated).
- The policy, its categories, and its codes are documented with `@cosyte/deid`, at
  [docs.cosyte.com/deid](https://docs.cosyte.com/deid).
