---
id: mcp
title: MCP server (agent front door)
sidebar_position: 5
---

# The cosyte MCP server

`@cosyte/cli` ships a second front door over the **same** core as the `cosyte` command: a
[Model Context Protocol](https://modelcontextprotocol.io) server that lets an LLM/agent parse, validate,
inspect, and convert healthcare messages as **callable tools**. The terminal and the agent share one
codebase, one PHI posture, and one set of results — the MCP `parse` tool returns exactly what
`cosyte parse` returns.

> The server is a **local stdio subprocess**, implicitly trusted by whoever launches it — not a hosted
> network endpoint. It is stateless per call.

## Register it

Add the server to your MCP client's configuration (Claude Desktop, an IDE agent, etc.):

```json
{
  "mcpServers": {
    "cosyte": { "command": "npx", "args": ["-y", "@cosyte/cli", "mcp"] }
  }
}
```

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

## PHI posture on the agent surface

The value-free discipline is **hardened** for agents: there is **no `--unsafe-show-values` door** over
MCP. A tool _result_ carries the requested data (the parsed model, the converted Bundle — the explicit
request). A tool _error_ carries only a value-free diagnostic — a stable code and a position, never a
name, DOB, MRN, or field value. A parsed-but-invalid `validate` is a **successful** call reporting the
verdict (not a tool error); only a hard failure (unparseable input, a usage mistake) is flagged as an
error.

## Isolation

The MCP SDK (`@modelcontextprotocol/sdk`) is the CLI's only third-party runtime dependency. It is
declared **optional** and loaded **only** on the MCP path, so a plain `cosyte parse` never pulls it and
the core works with the SDK absent (install with `--omit=optional` for a minimal footprint). The server
surface is also importable programmatically via the `@cosyte/cli/mcp` subpath.
