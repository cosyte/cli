/**
 * The MCP server's **request wiring**, written against SDK constructors passed in rather than
 * imported. This module imports `@modelcontextprotocol/sdk` for types only, which the build erases,
 * so it loads with the SDK absent. That is what lets the two bins reach the server through
 * `./launch.ts`, which loads the SDK lazily and turns an absent one into a value-free
 * `CLI_PARSER_UNAVAILABLE` (exit `69`), while `./server.ts` builds the same server from static
 * imports for the `@cosyte/cli/mcp` subpath.
 *
 * Why the split is needed at all: the bins are bundled with no code splitting, so a module they
 * reach by a dynamic `import()` is inlined into the bin, and the bundler hoists that module's static
 * imports of an external package to the top of the bin. A static SDK import anywhere the bins can
 * reach therefore loads the SDK at startup, for every command.
 *
 * @packageDocumentation
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { VERSION } from "../core/version.js";
import { dispatchTool, TOOL_DEFS } from "./tools.js";

/** The MCP server identity advertised to a client on connect. */
export const SERVER_INFO = { name: "cosyte", version: VERSION } as const;

/** The SDK values the server wiring needs: the server class and the two request schemas. */
export interface McpServerSdk {
  /** The SDK's low-level `Server` class. */
  readonly Server: typeof Server;
  /** The `tools/call` request schema. */
  readonly CallToolRequestSchema: typeof CallToolRequestSchema;
  /** The `tools/list` request schema. */
  readonly ListToolsRequestSchema: typeof ListToolsRequestSchema;
}

/**
 * Build the cosyte MCP server from the given SDK values, with its two request handlers wired to the
 * shared tool surface: `tools/list` advertises {@link TOOL_DEFS}, and `tools/call` routes to
 * {@link dispatchTool} (the same command handlers the terminal uses). The returned server is not yet
 * connected to a transport.
 *
 * Both handlers are explicit about what reaches the wire: `tools/list` copies each tool's title,
 * description, input schema and output schema, and `tools/call` passes the whole structured result
 * through, so what a client validates is exactly what the tool declared and produced.
 *
 * @param sdk - The SDK server class and request schemas, loaded statically or lazily by the caller.
 * @returns A configured, unconnected server.
 * @example
 * ```ts
 * import { Server } from "@modelcontextprotocol/sdk/server/index.js";
 * import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
 *
 * const server = wireMcpServer({ Server, CallToolRequestSchema, ListToolsRequestSchema });
 * ```
 */
export function wireMcpServer(sdk: McpServerSdk): Server {
  const server = new sdk.Server(SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(sdk.ListToolsRequestSchema, () => ({
    tools: TOOL_DEFS.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: {
        type: t.inputSchema.type,
        properties: { ...t.inputSchema.properties },
        ...(t.inputSchema.required !== undefined ? { required: [...t.inputSchema.required] } : {}),
        ...(t.inputSchema.additionalProperties !== undefined
          ? { additionalProperties: t.inputSchema.additionalProperties }
          : {}),
      },
      // Every advertised tool publishes its result schema; a client validates a reply against it
      // instead of pattern-matching the text block. Declared, so it is copied unconditionally.
      outputSchema: {
        type: t.outputSchema.type,
        properties: { ...t.outputSchema.properties },
        required: [...t.outputSchema.required],
        additionalProperties: t.outputSchema.additionalProperties,
      },
    })),
  }));

  server.setRequestHandler(sdk.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await dispatchTool(name, args ?? {});
    return {
      content: result.content.map((c) => ({ type: c.type, text: c.text })),
      isError: result.isError,
      // The whole structured value reaches the wire. A field-by-field copy here would silently
      // truncate the payload the called tool's own schema promises.
      structuredContent: { ...result.structuredContent },
    };
  });

  return server;
}
