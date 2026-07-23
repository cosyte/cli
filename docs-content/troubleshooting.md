---
id: troubleshooting
title: Troubleshooting
sidebar_position: 1
---

# Troubleshooting

Common symptoms with `cosyte parse`, and how to read what the CLI is telling you. Every diagnostic is
a value-free line on stderr: `cosyte: <CODE>: <message>` — a stable code plus positional context,
never a field value.

## `CLI_FORMAT_UNDETECTED` (exit 65)

No format signature matched the content, and the CLI **will not guess**. Re-run with an explicit
format:

```bash
cosyte parse --format hl7 message.txt
```

Detection sniffs the leading bytes: HL7 needs an `MSH|…` start, FHIR needs a JSON object with a
`resourceType`. A file with a misleading extension is fine — content is what matters.

## `CLI_FORMAT_AMBIGUOUS` (exit 65)

More than one signature matched. Disambiguate with `--format`. (With only HL7 and FHIR wired this
cannot yet occur — the branch exists so a future overlapping signature is a *detected* ambiguity, not
a silent mis-route.)

## `CLI_FORMAT_UNSUPPORTED` (exit 65)

The format was recognised, but its parser does not support the operation you asked for. Support is
**per (format, operation)**: `x12`/`astm`/`ncpdp` support parse/inspect/fmt/validate; `ccda` supports
inspect/fmt/validate (parse is deferred — XML is the canonical `fmt` form); `dicom` supports
inspect/validate (parse/fmt deferred — the model is binary); `mllp` supports parse/inspect. The message
names which formats *do* support the operation. The command is never faked to a success it cannot deliver.

## `CLI_PARSER_UNAVAILABLE` (exit 69)

The optional parser package for a recognised format is not installed. The six breadth parsers
(`dicom`/`x12`/`ccda`/`ncpdp`/`astm`/`mllp`) are `optionalDependencies` — installed by default, but if
one is absent (e.g. you installed with `--omit=optional`) the CLI degrades to this value-free signal
rather than crashing. Install the named `@cosyte/<format>` package to use that format.

## `CLI_NO_INPUT` (exit 66)

The file does not exist or is unreadable. Check the path; use `-` to read stdin instead of a file.

## `CLI_PARSE_FAILED` (exit 65)

The wrapped parser rejected the input as unrecoverable. The stderr line carries the format and a
stable code token only — **not** the offending bytes. To see a bounded excerpt of the input while
debugging locally, add the loud, opt-in `--unsafe-show-values` (below); by default the CLI will not
echo it for you.

## `CLI_NOT_IMPLEMENTED` (exit 69)

The command's ground-layer library is not yet built, so the command is **unavailable** — never a fake
success. Today this is `redact`/`deid`: de-identification belongs to `@cosyte/deid` (unpublished), and
the CLI will not ship a partial scrub that looks de-identified while leaving PHI behind. The command
never reads your input. It becomes available once `@cosyte/deid` ships and is vetted.

## `CLI_USAGE` (exit 2)

An unknown flag or command, or a missing `<file>` argument. Run `cosyte --help`.

## Is the output safe to share?

**stdout is the data channel** — the parsed `model` it prints is your real data and may contain PHI;
treat it as you would the source message. **stderr is value-free** — safe to paste into a bug report,
**unless** you ran with `--unsafe-show-values` (below), which deliberately puts a bounded input excerpt
into a failure diagnostic. The CLI never writes a temp file and never logs to a file.

## `--unsafe-show-values` (the one exception to value-free stderr)

By default every diagnostic is value-free. When you need to see the bytes a parser rejected, add the
loud, opt-in `--unsafe-show-values` — it appends a bounded excerpt of the offending input to a
`CLI_PARSE_FAILED` line. It is **PHI-exposing**; do not use it on stderr you intend to share. It is the
only setting under which a value reaches a secondary surface, and it affects failure diagnostics only —
a successful parse still keeps values on stdout alone.

## Known limitations (Phase 6)

- All eight formats are wired, but **per (format, operation)**: `x12`/`astm`/`ncpdp` support
  parse/inspect/fmt/validate; `ccda` supports inspect/fmt/validate (no `parse` — XML is the canonical
  `fmt` form); `dicom` supports inspect/validate (no `parse`/`fmt` — binary model); `mllp` supports
  parse/inspect. A deferred cell is a value-free `CLI_FORMAT_UNSUPPORTED`, never a fake.
- Streaming is **multi-record NDJSON**: MLLP de-frames to one record per frame, and `--ndjson` treats
  each non-empty line as a record (FHIR bulk data). A failed record is isolated as a value-free
  `{ record, error }` line; any failure makes the overall exit `65`.
- `convert` reads **HL7 v2** and writes **FHIR R4** only (`--to fhir`); its coverage is bounded by
  `@cosyte/transform` (the IG-mapped ADT/ORU/order/… message families). A non-HL7 source is a data
  error (`65`), never a fake conversion.
- `map-codes` translates a **single** source coding through a **bring-your-own** ConceptMap — the CLI
  ships no terminology content and does not scan a message for codes (that would re-implement the
  parser/transform layer). An unmapped code is a value-free signal + exit `1`, never a fabricated
  target.
- `validate --profile` is reserved but gated — the CLI bundles no profiles yet, so it reports an honest
  `CLI_NOT_IMPLEMENTED` (exit `69`) rather than fake a profile verdict.
- `redact`/`deid` exists but is an honest `CLI_NOT_IMPLEMENTED` (exit `69`) gated on `@cosyte/deid`.

The **API Reference** always reflects exactly what this release ships.
