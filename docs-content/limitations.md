---
id: limitations
title: Limitations of the CLI
sidebar_label: Limitations
description: "What the cosyte command promises, what it leaves to the libraries it wraps, and what it does not do at all."
---

# Limitations of the CLI

`cosyte` runs on files a developer points it at, which can hold real patient data. This page states
what it promises, what it leaves to others, and what it does not do, so nobody trusts it for more
than it does. For what the current release ships, `cosyte --help` and the
[API reference](./api/src.md) are exact.

## What it promises

- **The libraries' results, unchanged.** Every parsed model, finding, conversion, and translation is
  the wrapped library's. A wrong value is a defect in that library; see
  [How the CLI works](./concepts-archetype.md#the-wrapper-boundary).
- **No guessed format.** A format is detected from the content or named with `--format`; anything
  else is refused.
- **An exit code that tells the truth.** No run that failed to handle its input, or failed to deliver
  its output, exits `0`.
- **No message values on stderr** unless you pass `--unsafe-show-values`, and then only the start of
  the input on a parse failure.

## What it leaves to the libraries

- **What a format means.** Parsing rules, tolerance of malformed input, warnings, and validation are
  each library's, as documented on [docs.cosyte.com](https://docs.cosyte.com).
- **Conversion.** `convert` covers HL7 v2 to FHIR R4 only, as far as `@cosyte/transform` maps it.
- **Terminology.** `map-codes` translates one code through a `ConceptMap` you supply. No code system
  or map ships with the package, and it does not look for codes inside a message.
- **De-identification.** `redact` applies `@cosyte/deid`'s default policy and offers no setting of
  its own; it covers `ccda`, `fhir`, `hl7`, `x12`. Under that policy, an HL7 v2 message with a visit
  number (PV1-19) or an order number is refused, and record, account, and member numbers are removed
  rather than replaced. An X12 document is refused when it carries a value the library cannot place:
  an unrecognised code at a code position such as NM1-01 or REF-01, a value of the wrong shape at a
  code, date or amount position, a value at a position no rule names (REF-03, NM1-10 and later), free
  text such as an 834 HD-04 plan description, or a segment it has no shape for. See
  [De-identify a message](./de-identify-a-message.md).

## What it does not do

- **Integration.** No listeners, channels, routing, schedules, or stored state. Each run reads one
  input and exits. The MCP server stays running, but keeps nothing between calls.
- **Storage.** It writes no file of its own, keeps no cache, and sends nothing over the network: no
  telemetry, no crash reports. Its output goes where you send stdout and stderr.
- **A hosted service.** The MCP server talks over stdio to the client that started it. There is no
  web interface and no network endpoint.
- **Profiles.** `validate --profile` is reserved and answers `CLI_NOT_IMPLEMENTED` (exit `69`): no
  profile ships, and none can be loaded yet.
- **Every format for every command.** Some commands do not support some formats, and say so with
  `CLI_FORMAT_UNSUPPORTED`; [Format support](./format-support.md) has the table.
- **Clinical judgment.** It does not decide what a result means, convert units, or ship clinical
  code systems.
- **The MCP tools `redact` and `map-codes`.** The server offers `parse`, `validate`, `inspect`, and
  `convert` only.

## What depends on your install

The format parsers other than HL7 v2, `@cosyte/fhir`, `@cosyte/transform`, `@cosyte/deid`, and the MCP
SDK are optional dependencies. A default install has them all. Without one, the commands that need
it answer `CLI_PARSER_UNAVAILABLE` (exit `69`) and the rest still run. See
[Installation](./installation.md#what-a-default-install-includes).

## Handling patient data

Run it on synthetic data where you can. On real data, treat stdout as you would the input: `parse`,
`fmt`, `convert`, and `redact` write the message, or a form of it, there. stderr carries no values
by default, so it is safe to keep in a log, unless `--unsafe-show-values` was passed.

## Guides that apply this

- [Debug a rejected message](./debug-a-rejected-message.md)
- [De-identify a message](./de-identify-a-message.md)
- [Branch on the exit code in a script](./branch-on-exit-codes.md)
