---
id: mcp
title: MCP server (agent front door)
sidebar_position: 5
---

# The cosyte MCP server

`@cosyte/cli` ships a second front door over the **same** core as the `cosyte` command: a
[Model Context Protocol](https://modelcontextprotocol.io) server that lets an LLM/agent parse, validate,
inspect, and convert healthcare messages as **callable tools**. The terminal and the agent share one
codebase, one PHI posture, and one set of results: the MCP `parse` tool returns exactly what
`cosyte parse` returns.

> The server is a **local stdio subprocess**, implicitly trusted by whoever launches it, not a hosted
> network endpoint. It is stateless per call.

## Register it

Add the server to your MCP client's configuration (Claude Desktop, an IDE agent, etc.):

```json
{
  "mcpServers": {
    "cosyte": { "command": "npx", "args": ["-y", "--package", "@cosyte/cli", "cosyte-mcp"] }
  }
}
```

> **`--package` is required here, and the shorter `["-y", "@cosyte/cli", "mcp"]` does not work.** It
> fails with `could not determine executable to run`, because `npx` picks the executable whose name
> matches the package name's last segment (`cli`) and this package ships `cosyte` and `cosyte-mcp`.
> Naming `cosyte-mcp` explicitly is the supported form.
>
> This registration also requires a version that can be installed at all: `0.0.1` and `0.0.2` cannot
> be. See [If you are on 0.0.1 or 0.0.2](./installation#if-you-are-on-001-or-002). FHIR tools are
> unavailable from an npm install for a further reason described alongside it.

`cosyte mcp` starts the stdio server; the standalone `cosyte-mcp` bin is equivalent.

```bash
cosyte mcp        # start the server on stdio (also: cosyte-mcp)
```

## The tools

| Tool       | What it does                                                                  |
| ---------- | ----------------------------------------------------------------------------- |
| `parse`    | Parse an HL7 v2 / FHIR R4 message to typed JSON (format autodetected).         |
| `validate` | Validate a message; the result carries the verdict (valid / invalid findings).|
| `inspect`  | Return a value-free structural summary (type + segment/entry counts).         |
| `convert`  | Convert an HL7 v2 message to a FHIR R4 `Bundle` via `@cosyte/transform`.       |

Every tool takes a `content` string (the raw message); `parse`/`validate`/`inspect` accept an optional
`format` override.

## The result contract

**Every tool publishes an `outputSchema`**, so a client validates a result against a declared contract
instead of pattern-matching a text blob to work out what it is holding. `tools/list` carries that
schema next to each tool's input schema and title; every reply from that tool conforms to it.

The structured result has the same three outcome properties for every tool, plus that tool's own
payload:

| Property | Type      | What it says                                                                      |
| -------- | --------- | --------------------------------------------------------------------------------- |
| `ok`     | boolean   | Whether the call produced data. A negative verdict about the message is still `true`. |
| `status` | string    | `success`, `verdict`, or `failed`: the one property to branch on.                  |
| `exit`   | integer   | The exit code from the documented [exit-code contract](./reference-commands#exit-codes). |
| `code`   | string    | On a failed call, the stable diagnostic code. Absent when data was produced.       |
| `data`   | object    | The tool's own payload. Absent on a failed call, which produced none.              |

`status` is the distinction a text blob could never make reliably:

- **`success`** the operation completed cleanly.
- **`verdict`** the tool ran and reports a negative finding _about the message_: a resource that
  parsed but is not conformant, or a conversion with an error-severity issue. The payload is present
  and the call is not an error.
- **`failed`** the call produced no data: a usage mistake, unparseable input, an unavailable parser,
  or an internal error. `code` says which, `data` is absent.

`data` is the payload the terminal command puts on stdout: `parse` gives `format` + `model` +
`warnings` (or `records`, one entry per record, for a multi-record input), `validate` gives `format` +
`valid` + `findings`, `inspect` gives the value-free structural summary, and `convert` gives `format` +
`bundle` + `findings`.

```json
{
  "ok": true,
  "status": "verdict",
  "exit": 1,
  "data": { "format": "fhir", "valid": false, "findings": [{ "code": "value-not-in-set", "severity": "error", "location": "Patient.gender" }] }
}
```

**The text content block carries the serialized JSON of that same structured result**, so a client that
reads only text sees exactly the value a schema-aware client validates. There is one value, serialized
once: the two channels cannot disagree.

## PHI posture on the agent surface

The value-free discipline is **hardened** for agents: there is **no `--unsafe-show-values` door** over
MCP. A tool _result_ carries the requested data (the parsed model, the converted Bundle: the explicit
request). A tool _error_ carries only a value-free diagnostic: a stable code and a position, never a
name, DOB, MRN, or field value. A parsed-but-invalid `validate` is a **successful** call reporting the
verdict (not a tool error); only a hard failure (unparseable input, a usage mistake) is flagged as an
error.

## Isolation

The MCP SDK (`@modelcontextprotocol/sdk`) is the CLI's only third-party runtime dependency. It is
declared **optional** and loaded **only** on the MCP path, so a plain `cosyte parse` never pulls it and
the core works with the SDK absent (install with `--omit=optional` for a minimal footprint). The server
surface is also importable programmatically via the `@cosyte/cli/mcp` subpath.
