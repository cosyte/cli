---
id: how-the-cli-works
redirect_from:
  - /concepts-archetype
title: How the CLI works
sidebar_label: How the CLI works
description: "Why cosyte wraps the libraries instead of parsing, never guesses a format, treats the exit code as a contract, and keeps message values off stderr."
---

# How the CLI works

`@cosyte/cli` sits on top of the Cosyte libraries and adds as little as it can. This page explains
the few things it does own, and why each one works the way it does.

## The wrapper boundary

Each wire format is parsed, validated, and serialized by its own library: `@cosyte/hl7`,
`@cosyte/fhir`, and the rest. `cosyte parse` returns what the library's parse returns, and
`cosyte convert` returns what `@cosyte/transform` returns. The CLI does not parse, repair, or
reinterpret a message.

What it owns is the layer around them: reading the input, choosing the library, shaping the output,
the exit code, and what reaches stderr. So a wrong value in a parsed model is the library's defect,
and a wrong route, a wrong exit code, or a message value on stderr is the CLI's.

The same layer serves two front doors. The `cosyte` command and the `cosyte-mcp` server call the same
command functions, so the MCP `parse` tool and `cosyte parse --json` return the same thing.

## Detection never guesses

The CLI chooses a library from the content, never from the file name. Each format has a signature
in its first bytes: `MSH` and a separator for HL7 v2, a `resourceType` in a JSON object for FHIR, and
so on ([Format support](./format-support.md#detection) lists them). Exactly one match parses. No
match, or more than one, is a data error that asks for `--format`.

The reason is the cost of a wrong guess. Bytes sent to the wrong parser can come back as a
confident, wrong model, and nothing downstream would notice. A refusal costs one extra option.

The signatures do not overlap on real messages of any one format, but they can on odd input: an
MLLP frame around a C-CDA document matches both `mllp` and `ccda`. That case is reported as
ambiguous, not resolved by order.

## The exit-code contract

Scripts and CI jobs read the exit code, not the text, so the codes are a fixed set and changing one
is a breaking change:

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | The command ran and the answer is no: an invalid message, an error-severity conversion finding, a code with no mapping, or a de-identification the library could not complete. This CLI's own value. |
| `2` | A usage error. This CLI's own value. |
| `65` | The input could not be parsed, or its format could not be detected or is not supported. |
| `66` | The input file is missing or unreadable. |
| `69` | A library or capability the command needs is not available. |
| `70` | An internal error: a defect. |
| `74` | The output stream closed before the output was delivered. |

`0` is the usual success status. The codes from `65` up are the values the Unix `sysexits.h` header
gives the conditions they name. `1` and `2` are this CLI's own, because that header defines no
constant for either.

The rule behind the table: the CLI never exits `0` on input it could not handle, or on output that
did not reach its reader. An invalid message is `1`, not `0`, and a message that could not be parsed
is `65`, not `1`, so a script can tell "the message is wrong" from "the check could not run".

## Data on stdout, codes on stderr

The CLI reads real files on a developer's machine, and those files can hold patient data. So the
two output streams have different jobs.

- **stdout is the data channel.** `parse`, `fmt`, `convert`, and `redact` write the message, or a
  form of it, to stdout, because that is what you asked for and you chose where it goes.
- **stderr carries no values.** Diagnostics, findings, warnings, and summaries name a code, a
  position, a format, a count, or the path you passed, never a value from the message. An error from
  a library is reduced to its code; its message, which could quote the input, is dropped.

So stderr is safe to paste into an issue or keep in a CI log, and stdout is as sensitive as the
input.

### `--unsafe-show-values`

Debugging a rejected message sometimes needs the bytes. `--unsafe-show-values` adds the start of the
input to a `CLI_PARSE_FAILED` line, and nothing else. The name says what it does, it is off unless
you pass it, and every place that could echo a value checks this one flag, which makes the rule
"a value reaches stderr only with this flag" a property of one function. `redact` and the MCP server
ignore it.

## De-identification is delegated

`redact` is the command whose job is to remove identifiers, and it owns no policy. A built-in pass
over the obvious fields (PID, `Patient.name`) would leave identifiers in the many places it did not
look, such as next-of-kin segments, notes, and extensions, while its output looked clean. That
false sense of safety is worse than no command.

So `redact` hands the message to `@cosyte/deid`, and either prints the library's result or refuses.
If the library reports any place it could not handle, the run prints nothing and exits `1`, because
a partly de-identified copy offered as a de-identified one is the outcome the command exists to
prevent. It reports the library's own label and version and claims no standard of its own.

## Missing libraries degrade, they do not crash

Most libraries are optional dependencies, so an install made with `--omit=optional` lacks them. Each
is loaded only when a command needs it, so `cosyte parse message.hl7` never loads the DICOM parser,
and a missing one turns into `CLI_PARSER_UNAVAILABLE` and exit `69`, naming the package, rather than
a stack trace or a data error that blames your input. The MCP SDK is loaded the same way, so every
other command runs without it.

## Records stream as they are parsed

An MLLP stream or an `--ndjson` file can be large. Each record is written as soon as it is parsed,
so the first line reaches the next process before the last byte is read. The size limit is checked
on the running count, so a refusal can come after some records were written; that is why the exit
code, not the output, says whether the run finished.

## Guides that apply this

- [Branch on the exit code in a script](./branch-on-exit-codes.md)
- [Debug a rejected message](./debug-a-rejected-message.md)
- [De-identify a message](./de-identify-a-message.md)
- [Parse messages in a pipeline](./parse-messages-in-a-pipeline.md)
- [Check a folder of messages in CI](./check-messages-in-ci.md)
