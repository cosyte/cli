---
id: mcp
title: Connect an agent with the MCP server
sidebar_label: Connect an agent (MCP)
description: "Register the cosyte-mcp server with an MCP client so an agent can parse, validate, inspect, and convert healthcare messages, and read its results."
---

# Connect an agent with the MCP server

`cosyte-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server that gives an
agent four tools: `parse`, `validate`, `inspect`, and `convert`. Each tool runs the same code as the
`cosyte` command of the same name, so the `parse` tool returns what `cosyte parse --json` prints. The
server runs on your machine as a subprocess of the client, over stdio; it is not a network service,
and it keeps nothing between calls.

## Register the server

Add the server to your MCP client's configuration. Most clients read a JSON file in this shape:

```json
{
  "mcpServers": {
    "cosyte": { "command": "npx", "args": ["-y", "--package", "@cosyte/cli", "cosyte-mcp"] }
  }
}
```

`--package` is required: `["-y", "@cosyte/cli"]` fails with `could not determine executable to run`,
because the package has no command named `cli` (see [Installation](./installation.md#install-it)).

If you installed the package globally, point the client at the command instead:

```json
{
  "mcpServers": {
    "cosyte": { "command": "cosyte-mcp" }
  }
}
```

`cosyte mcp` starts the same server, if your client runs one command with arguments.

## Check that it starts

Run the command in a terminal. It waits for a client on stdin; stop it with Ctrl+C:

```bash no-run it starts a server that waits for a client
cosyte-mcp
```

If the MCP SDK is missing, it prints `CLI_PARSER_UNAVAILABLE`, naming `@modelcontextprotocol/sdk`,
and exits `69` instead. The SDK is an optional dependency, so a default install has it; an install
with `--omit=optional` does not.

## Read a tool's result

Each tool takes the message as text in `content`, and the read tools take an optional `format`.
Each result carries three properties to branch on, `ok`, `status`, and `exit`, and the tool's
payload in `data`. A client that reads only the text of a result sees the same object, serialized.

`status` separates the two kinds of bad news:

- `verdict`: the tool ran and found something wrong with the message, such as an invalid resource.
  `ok` is `true` and the payload is there.
- `failed`: the call produced nothing, such as input in no format it can detect. `ok` is `false`,
  `code` names the diagnostic, and the result is marked as an error.

A failed result carries no value from the message. There is no `--unsafe-show-values` for the
server. [MCP tools](./mcp-tools.md) lists each tool's input and payload.

## What the server does not offer

`redact` and `map-codes` are not tools: use the `cosyte` command for them. The server also does not
read files; an agent passes the message text.

## Reference

- [MCP tools](./mcp-tools.md): each tool's input, payload, and result properties.
- [`createMcpServer`](./api/src/mcp.md#createmcpserver),
  [`startStdioServer`](./api/src/mcp.md#startstdioserver), and
  [`dispatchTool`](./api/src/mcp.md#dispatchtool) in the API reference.
- [Exit codes](./reference-commands.md#exit-codes) and [diagnostic codes](./diagnostic-codes.md).
