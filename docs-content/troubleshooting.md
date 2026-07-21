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

The format was recognised but this CLI build does not yet wire it. Phase 1 wires **hl7** and **fhir**;
the other formats arrive in later phases. The command is never faked to a success it cannot deliver.

## `CLI_NO_INPUT` (exit 66)

The file does not exist or is unreadable. Check the path; use `-` to read stdin instead of a file.

## `CLI_PARSE_FAILED` (exit 65)

The wrapped parser rejected the input as unrecoverable. The stderr line carries the format and a
stable code token only — **not** the offending bytes. Inspect the input yourself; the CLI will not
echo it for you.

## `CLI_USAGE` (exit 2)

An unknown flag or command, or a missing `<file>` argument. Run `cosyte --help`.

## Is the output safe to share?

**stdout is the data channel** — the parsed `model` it prints is your real data and may contain PHI;
treat it as you would the source message. **stderr is value-free** — safe to paste into a bug report.
The CLI never writes a temp file and never logs to a file.

## Known limitations (Phase 1)

- Only `parse` is implemented, and only **hl7** and **fhir** are wired.
- No `validate`/`convert`/`redact`/`inspect`, no `--unsafe-show-values`, no MCP server yet — those are
  later phases.

The **API Reference** always reflects exactly what this release ships.
