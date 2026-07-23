/**
 * The **stdio MCP server** — the JSON-RPC/stdio adapter over the same shared `core`/`commands` the
 * `cosyte` terminal command drives (ADR 0022, cli roadmap §Phase 5). This is the **only** module that
 * touches `@modelcontextprotocol/sdk`, so the SDK — the CLI's single third-party runtime dependency —
 * stays **isolated behind the `./mcp` subpath and lazy-loaded**: a `cosyte parse` invocation never
 * imports this file and therefore never loads the SDK (ADR 0021, proven by `mcp-isolation.test.ts`).
 *
 * The server is a **local stdio subprocess**, implicitly trusted by the user/agent that launched it —
 * not a hosted network endpoint (cli roadmap §2 non-goal). It is **stateless per call**: each tool
 * request is one operation over the wrapped libraries, with the same value-free PHI posture the CLI
 * proves once and both adapters inherit.
 *
 * @packageDocumentation
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { VERSION } from "../core/version.js";
import { dispatchTool, TOOL_DEFS } from "./tools.js";

/** The MCP server identity advertised to a client on connect. */
export const SERVER_INFO = { name: "cosyte", version: VERSION } as const;

/**
 * Build the cosyte MCP {@link Server} with its two request handlers wired to the shared tool surface:
 * `tools/list` advertises {@link TOOL_DEFS}, and `tools/call` routes to {@link dispatchTool} (the same
 * command handlers the terminal uses). The returned server is **not yet connected** to a transport —
 * the caller connects it to stdio (in production) or to an in-memory transport (in tests), so the
 * handler wiring is drivable without a subprocess.
 *
 * @returns A configured, unconnected {@link Server}.
 * @example
 * ```ts
 * import { createMcpServer } from "@cosyte/cli/mcp";
 *
 * const server = createMcpServer();
 * typeof server.connect; // => "function"
 * ```
 */
export function createMcpServer(): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOL_DEFS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: {
        type: t.inputSchema.type,
        properties: { ...t.inputSchema.properties },
        ...(t.inputSchema.required !== undefined ? { required: [...t.inputSchema.required] } : {}),
        ...(t.inputSchema.additionalProperties !== undefined
          ? { additionalProperties: t.inputSchema.additionalProperties }
          : {}),
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await dispatchTool(name, args ?? {});
    return {
      content: result.content.map((c) => ({ type: c.type, text: c.text })),
      isError: result.isError,
      structuredContent: { exit: result.structuredContent.exit, ok: result.structuredContent.ok },
    };
  });

  return server;
}

/* v8 ignore start -- stdio transport wiring: connects the real process streams, exercised by the packaged bin smoke, not unit-covered */
/**
 * Start the cosyte MCP server on **stdio** and resolve once the transport is connected. The process
 * then stays alive serving requests until its stdin closes. This is the entry both the `cosyte-mcp`
 * bin and the `cosyte mcp` subcommand call.
 *
 * @returns A promise that resolves when the stdio transport is connected.
 * @example
 * ```ts
 * import { startStdioServer } from "@cosyte/cli/mcp";
 *
 * typeof startStdioServer; // => "function"
 * ```
 */
export async function startStdioServer(): Promise<void> {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}
/* v8 ignore stop */
