---
id: branch-on-exit-codes
title: Branch on the exit code in a script
sidebar_label: Branch on the exit code
description: "Use cosyte's exit codes and stable diagnostic codes in a shell script or CI job, and keep the stderr log free of message values."
---

# Branch on the exit code in a script

Every `cosyte` command ends with an exit code from a fixed set, so a script can decide what to do
without reading the output. The examples use `message.hl7`; use your own files.

## Test for success

`0` means the command did what was asked: the message parsed, validated, converted, or mapped.
Anything else is a failure of some kind, so the plain shell test works:

```bash
if cosyte validate message.hl7 --quiet; then
  echo "valid"
fi
```

```text
valid
```

## Tell the failures apart

The non-zero codes say what kind of failure it was. A script usually treats `1` as a finding about
the message and the rest as a problem with the run:

```bash
cosyte validate message.hl7 --quiet
case $? in
  0)  echo "valid" ;;
  1)  echo "invalid: fix the message" ;;
  65) echo "could not be parsed, or the format was not detected" ;;
  66) echo "file missing or unreadable" ;;
  69) echo "a library or capability is not available in this install" ;;
  *)  echo "usage error, output error, or a bug: see stderr" ;;
esac
```

```text
valid
```

`1` comes from `validate` on an invalid message, from `convert` on an error-severity finding, from
`map-codes` on a code with no mapping, and from `redact` when the library could not handle the whole
message. The [exit-code table](./reference-commands.md#exit-codes) has every code.

## Branch on the diagnostic code

Each failure prints one line on stderr in the form `cosyte: <CODE>: <message>`. The code is
stable, so a script can match it; the message after it is for people and may change.

```bash
cosyte parse missing.hl7 2> err.log
code=$(sed -n 's/^cosyte: \(CLI_[A-Z_]*\):.*/\1/p' err.log)
echo "$code"
```

```text
CLI_NO_INPUT
```

## Keep stderr safe to log

By default nothing on stderr carries a value from the message: diagnostics name codes, positions,
formats, and the file path you passed. Do not pass `--unsafe-show-values` in a script or CI job,
because it adds the start of the input to a parse failure.

## Notice when the reader stops early

When the command writing to a pipe finds the reader gone (`head`, a pager you quit), it exits `74`
with `CLI_OUTPUT_WRITE_FAILED`. With `set -o pipefail`, or by reading `PIPESTATUS`, a script sees
that the output did not all arrive:

```bash no-run its exit code depends on when the reader closes the pipe
cosyte parse bulk.ndjson --ndjson --quiet | head -1 > /dev/null
echo "exit ${PIPESTATUS[0]}"
```

It reads `74` when a write found the pipe closed. A small output can reach the pipe before `head`
closes it, and the run then ends with its own code.

## Reference

- [Exit codes](./reference-commands.md#exit-codes) and [diagnostic codes](./diagnostic-codes.md).
- [`EXIT`](./api/src.md#exit) and [`CLI_CODES`](./api/src.md#cli_codes) in the API reference, for
  code that branches on the same values.
- [Why the exit code is the contract](./concepts-archetype.md#the-exit-code-contract).
