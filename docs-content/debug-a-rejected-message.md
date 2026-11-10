---
id: debug-a-rejected-message
title: Debug a rejected message
sidebar_label: Debug a rejected message
description: "Find out why a parser rejected a message: read the code, check the format, and, on your own machine only, show the input with --unsafe-show-values."
---

# Debug a rejected message

When the parser for a format rejects a message, `cosyte` prints `CLI_PARSE_FAILED` with the format
and the parser's own code, and exits `65`. It does not print the input. These steps narrow down the
cause. The example is a FHIR resource with a syntax error, in `broken.json`:

```bash
echo '{"resourceType":"Patient","id":"example","birthDate":}' > broken.json
cosyte parse broken.json; echo "exit $?"
```

```text
cosyte: CLI_PARSE_FAILED: the fhir parser rejected the input (MALFORMED_JSON)
exit 65
```

## 1. Read the code

The code in parentheses is the parser library's own, here `@cosyte/fhir`'s `MALFORMED_JSON`. The
library's documentation on [docs.cosyte.com](https://docs.cosyte.com) lists its codes and what each
means. The diagnostic carries no value from the message, so it is safe to paste into an issue.

## 2. Check the format

`cosyte` chose the parser from the content. If it chose the wrong one, or could not choose, name
the format with `--format`; [Format support](./format-support.md#detection) lists what each format
is detected by. A message forced into the wrong parser is rejected the same way, so try the format
you expect.

## 3. Show the start of the input, on your own machine

`--unsafe-show-values` adds the first 200 bytes of the input to the `CLI_PARSE_FAILED` line, with
line breaks and tabs turned into spaces:

```bash
cosyte parse broken.json --unsafe-show-values; echo "exit $?"
```

```text
cosyte: CLI_PARSE_FAILED: the fhir parser rejected the input (MALFORMED_JSON) [unsafe-show-values] offending input (first 200 bytes): {"resourceType":"Patient","id":"example","birthDate":}
exit 65
```

That line can carry patient data. Use the flag only in a terminal on your own machine, with a
message you are allowed to see, and never in CI or anywhere stderr is kept.

The flag can go anywhere on the command line. It adds the excerpt only to a `CLI_PARSE_FAILED`
from `parse` on a single message, `validate`, `inspect`, `fmt`, and `convert`. It changes nothing
for `redact`, `map-codes`, a multi-record `parse`, or the MCP server, and a successful run never
puts a value on stderr with or without it.

## 4. Look at the bytes

If the excerpt does not show the problem, look at the raw bytes, where a control character or a
separator that is not the one you expect shows up:

```bash
head -c 64 broken.json | od -c
```

## Reference

- [`CLI_PARSE_FAILED`](./diagnostic-codes.md#cli_parse_failed) and
  [`CLI_FORMAT_UNDETECTED`](./diagnostic-codes.md#cli_format_undetected).
- [The global options](./reference-commands.md#global-options), `--unsafe-show-values` among them.
- [`unsafeInputSuffix`](./api/src.md#unsafeinputsuffix) and
  [`UNSAFE_EXCERPT_MAX`](./api/src.md#unsafe_excerpt_max) in the API reference.
- [What reaches stderr, and why](./concepts-archetype.md#data-on-stdout-codes-on-stderr).
