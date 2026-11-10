# src/mcp

The `@cosyte/cli/mcp` subpath export: the **agent front door**. Importing this module (or running
the `cosyte-mcp` bin) is the boundary at which the `@modelcontextprotocol/sdk` dependency is loaded;
the CLI's `.` entry point and `cosyte parse` path never reach it.

## Interfaces

### McpStructuredResult

The **structured result** of one tool call: the value-free outcome fields every tool carries, plus
that tool's own payload on a call that produced data. This is the object an MCP `tools/call` reply
carries as `structuredContent`, and the value whose serialization is the reply's text block.

#### Properties

##### code?

> `readonly` `optional` **code?**: [`CliCode`](../src.md#clicode)

The stable, value-free diagnostic code on a failed call; absent when data was produced.

##### data?

> `readonly` `optional` **data?**: `unknown`

The tool's own payload (the parsed model, the verdict, the summary, the Bundle); absent on a
failed call, which produced none.

##### exit

> `readonly` **exit**: `number`

The CLI exit code the underlying command resolved to (the documented exit-code contract).

##### ok

> `readonly` **ok**: `boolean`

`true` iff the tool *call* succeeded (data was produced): distinct from a negative verdict.

##### status

> `readonly` **status**: [`McpToolStatus`](#mcptoolstatus)

The three-way outcome a client branches on: see [McpToolStatus](#mcptoolstatus).

***

### McpTextContent

A single text content block in an MCP tool result.

#### Properties

##### text

> `readonly` **text**: `string`

##### type

> `readonly` **type**: `"text"`

***

### McpToolDef

A tool advertised by the server: an agent-callable name, a human-readable title, a description, and
the schemas of its input and of its structured result.

#### Properties

##### description

> `readonly` **description**: `string`

##### inputSchema

> `readonly` **inputSchema**: [`McpToolInputSchema`](#mcptoolinputschema)

##### name

> `readonly` **name**: `string`

##### outputSchema

> `readonly` **outputSchema**: [`McpToolOutputSchema`](#mcptooloutputschema)

##### title

> `readonly` **title**: `string`

A human-readable title, so these four generic names stay distinguishable in an aggregating client.

***

### McpToolInputSchema

A JSON-Schema description of a tool's input (the wire schema advertised to `tools/list`).

#### Properties

##### additionalProperties?

> `readonly` `optional` **additionalProperties?**: `boolean`

##### properties

> `readonly` **properties**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

##### required?

> `readonly` `optional` **required?**: readonly `string`[]

##### type

> `readonly` **type**: `"object"`

***

### McpToolOutputSchema

A JSON-Schema description of a tool's **structured result**: the schema advertised alongside the
tool on `tools/list` and the one every reply from that tool conforms to. The protocol fixes the
root type as `object`; `required` and `additionalProperties` are declared (never omitted) so the
published contract states exactly which properties a client may rely on and forbids the rest.

#### Properties

##### additionalProperties

> `readonly` **additionalProperties**: `boolean`

##### properties

> `readonly` **properties**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

##### required

> `readonly` **required**: readonly `string`[]

##### type

> `readonly` **type**: `"object"`

***

### McpToolResult

The value-free result of dispatching one MCP tool call. Structurally an MCP `CallToolResult`: a text
content channel carrying the serialized structured result, an `isError` flag, and the
[McpStructuredResult](#mcpstructuredresult) itself.

#### Properties

##### content

> `readonly` **content**: readonly [`McpTextContent`](#mcptextcontent)[]

##### isError

> `readonly` **isError**: `boolean`

##### structuredContent

> `readonly` **structuredContent**: [`McpStructuredResult`](#mcpstructuredresult)

## Type Aliases

### McpToolMeta

> **McpToolMeta** = [`McpStructuredResult`](#mcpstructuredresult)

The historical name for a tool result's structured content, kept as the published alias of
[McpStructuredResult](#mcpstructuredresult).

***

### McpToolStatus

> **McpToolStatus** = `"success"` \| `"verdict"` \| `"failed"`

The outcome of a tool call, as the single property a client branches on with **no text parsing**:
`success` the operation completed cleanly, `verdict` the tool ran and reports a negative finding
*about the message* (an invalid resource, an error-severity conversion issue), `failed` the call
itself produced no data (a usage mistake, unparseable input, an unavailable parser, an internal
error). `verdict` and `failed` are the two a text blob could never reliably separate.

## Variables

### SERVER\_INFO

> `const` **SERVER\_INFO**: `object`

The MCP server identity advertised to a client on connect.

#### Type Declaration

##### name

> `readonly` **name**: `"cosyte"` = `"cosyte"`

##### version

> `readonly` **version**: `string` = `VERSION`

***

### TOOL\_DEFS

> `const` **TOOL\_DEFS**: readonly [`McpToolDef`](#mcptooldef)[]

The tools this server exposes: the read/convert operations that share the `core` cleanly and whose
results are safe to hand an agent. `redact`/`deid` (gated on `@cosyte/deid`)
and `map-codes` are deliberately **not** exposed yet; they land when the terminal command's ground
layer and the tool's PHI shape are settled.

## Functions

### createMcpServer()

> **createMcpServer**(): `Server`

Build the cosyte MCP Server with its two request handlers wired to the shared tool surface:
`tools/list` advertises the tool definitions, and `tools/call` routes to the same command handlers
the terminal uses. The returned server is **not yet connected** to a transport: the caller connects
it to stdio (in production) or to an in-memory transport (in tests), so the handler wiring is
drivable without a subprocess.

Both handlers are **explicit about what reaches the wire**: `tools/list` copies each tool's title,
description, input schema and **output schema**, and `tools/call` passes the whole structured result
through, so what a client validates is exactly what the tool declared and produced.

#### Returns

`Server`

A configured, unconnected Server.

#### Example

```ts
import { createMcpServer } from "@cosyte/cli/mcp";

const server = createMcpServer();
typeof server.connect; // => "function"
```

***

### dispatchTool()

> **dispatchTool**(`name`, `args`, `deps?`): `Promise`\<[`McpToolResult`](#mcptoolresult)\>

Dispatch one MCP tool call to the shared command layer and return a value-free [McpToolResult](#mcptoolresult).
This is the agent-surface analogue of run: it validates the arguments, feeds the inline
`content` through the same command handlers the terminal uses (under the always-on [VALUE\_FREE](../src.md#value_free)
posture), and maps the [RunResult](../src.md#runresult) onto an MCP result. An unknown tool name or a missing
`content` argument is a value-free usage error, never a thrown stack trace carrying input.

Every path returns an [McpStructuredResult](#mcpstructuredresult) conforming to the called tool's declared
[McpToolDef.outputSchema](#outputschema), with the same value serialized into the text content block. An
unknown tool name has no schema of its own, so it answers with the shared outcome fields alone,
which every tool's schema declares.

#### Parameters

##### name

`string`

The tool name (one of [TOOL\_DEFS](#tool_defs)).

##### args

`Readonly`\<`Record`\<`string`, `unknown`\>\>

The tool-call arguments object.

##### deps?

[`RunDeps`](../src.md#rundeps)

Optional [RunDeps](../src.md#rundeps) override (tests inject fakes); defaults to feeding `content` as
  stdin. Its `writeStdout` sink, if any, is not used: the tool result is the only data channel, so a
  record stream comes back in it. An unexpected throw from a command is mapped to a value-free
  `CLI_INTERNAL` result, never propagated to the SDK (which would surface the raw message).

#### Returns

`Promise`\<[`McpToolResult`](#mcptoolresult)\>

A value-free [McpToolResult](#mcptoolresult); this function never throws.

#### Example

```ts
import { dispatchTool } from "@cosyte/cli/mcp";

const r = await dispatchTool("parse", { content: '{"resourceType":"Patient"}' });
r.isError; // => false
r.structuredContent.status; // => "success"
```

***

### startStdioServer()

> **startStdioServer**(): `Promise`\<`void`\>

Start the cosyte MCP server on **stdio** and resolve once the transport is connected. The process
then stays alive serving requests until its stdin closes. This is the entry both the `cosyte-mcp`
bin and the `cosyte mcp` subcommand call.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the stdio transport is connected.

#### Example

```ts
import { startStdioServer } from "@cosyte/cli/mcp";

typeof startStdioServer; // => "function"
```
