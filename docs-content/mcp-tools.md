---
id: mcp-tools
title: MCP tools
sidebar_label: MCP tools
description: "Every tool the cosyte-mcp server offers: its input, its payload, and the result properties every reply carries."
---

# MCP tools

The tools `cosyte-mcp` lists on `tools/list`. Each tool declares an input schema and an output
schema, and every reply conforms to its tool's output schema. To register the server, see
[Connect an agent with the MCP server](./mcp.md).

## Tools

| Tool | Title | Input | Runs |
| --- | --- | --- | --- |
| `parse` | Parse a healthcare message | `content` (required), `format` | `cosyte parse - --json` |
| `validate` | Validate a healthcare message | `content` (required), `format` | `cosyte validate - --json` |
| `inspect` | Inspect a healthcare message's structure | `content` (required), `format` | `cosyte inspect - --json` |
| `convert` | Convert HL7 v2 to a FHIR R4 Bundle | `content` (required), `to` | `cosyte convert - --to fhir --json` |

- `content` is the message as text, fed to the command as if it were piped on stdin.
- `format` is one of `hl7`, `fhir`, `dicom`, `x12`, `ccda`, `ncpdp`, `astm`, `mllp`; leave it out
  to detect the format from the content. A format whose parser does not support the tool's
  operation answers `CLI_FORMAT_UNSUPPORTED` (see [Format support](./format-support.md)).
- `to` is `fhir`, the only target, and the default.
- The input schema declares no other property (`additionalProperties: false`); the server ignores
  any other property it is sent.

## Result properties

Every reply's structured content has these properties:

| Property | Type | Present | Meaning |
| --- | --- | --- | --- |
| `ok` | boolean | always | `true` when the call produced data, a negative verdict included. |
| `status` | string | always | `success`, `verdict`, or `failed`. |
| `exit` | integer | always | The exit code the command ended with; see [Exit codes](./reference-commands.md#exit-codes). |
| `code` | string | on `failed` | The diagnostic code; see [Diagnostic codes](./diagnostic-codes.md). |
| `data` | object | unless `failed` | The tool's payload, below. |

| `status` | `ok` | Marked as an error | When |
| --- | --- | --- | --- |
| `success` | `true` | no | The command exited `0`. |
| `verdict` | `true` | no | The command produced output and exited non-zero: an invalid message from `validate`, an error-severity finding from `convert`, or a failed record in a `parse` stream. |
| `failed` | `false` | yes | The command produced no output: a usage error, input it could not read or parse, a missing library, or an internal error. |

The reply's text content is the same structured object, serialized as JSON. An unknown tool name,
or a call without a string `content`, is `failed` with `CLI_USAGE` and exit `2`, and echoes neither.

## Payloads

| Tool | `data` |
| --- | --- |
| `parse` | `{ format, model, warnings }` for one message; `{ records }` for a multi-record input such as an MLLP stream, one entry per record. |
| `validate` | `{ format, valid, findings }`. Each finding is `{ code, severity, location }`. |
| `inspect` | `{ format, ... }`: the format's counts and type codes, as `cosyte inspect --json` prints them. |
| `convert` | `{ format, bundle, findings }`: `format` is `fhir`, `bundle` the FHIR R4 `Bundle`. |

## Example

A `validate` call on a Patient whose `gender` is not in its value set:

```json
{
  "ok": true,
  "status": "verdict",
  "exit": 1,
  "data": {
    "format": "fhir",
    "valid": false,
    "findings": [{ "code": "CODE_INVALID", "severity": "error", "location": "Patient.gender" }]
  }
}
```

## Not offered

`redact`, `map-codes`, `fmt`, and `completion` are not tools, and there is no tool option for
`--unsafe-show-values`.

## In the API reference

[`TOOL_DEFS`](./api/src/mcp.md#tool_defs), [`McpStructuredResult`](./api/src/mcp.md#mcpstructuredresult),
[`McpToolStatus`](./api/src/mcp.md#mcptoolstatus), and [`dispatchTool`](./api/src/mcp.md#dispatchtool).
