/**
 * How the two bins start the stdio MCP server: `cosyte-mcp`, and `cosyte mcp`. The MCP SDK
 * (`@modelcontextprotocol/sdk`) is an optional dependency, so an install can lack it (npm's
 * `--omit=optional` leaves it out). This module loads it only when a server is actually started, and
 * an absent SDK becomes a value-free `CLI_PARSER_UNAVAILABLE` (exit `69`) that says what to install,
 * never a resolver error and a stack trace.
 *
 * Nothing here imports the SDK statically, and nothing the bins import may: the bins are bundled
 * without code splitting, so a static SDK import anywhere they can reach is hoisted to the top of the
 * bin and loads the SDK for every command (`absent-mcp-sdk.test.ts` walks that graph).
 *
 * @packageDocumentation
 */

import type * as McpServerModule from "@modelcontextprotocol/sdk/server/index.js";
import type * as McpStdioModule from "@modelcontextprotocol/sdk/server/stdio.js";
import type * as McpTypesModule from "@modelcontextprotocol/sdk/types.js";

import { loadOptionalPackage } from "../core/parsers.js";
import { wireMcpServer, type McpServerSdk } from "./wire.js";

/**
 * Why the MCP server cannot start, in words a user can act on. The SDK is an optional dependency of
 * this package, so it is in a default install and missing from one made with `--omit=optional` or
 * after it was removed. Value-free by construction: package names and a statement of fact.
 */
export const MCP_SDK_UNAVAILABLE =
  "the MCP server is unavailable in this install: it needs @modelcontextprotocol/sdk, an optional " +
  "dependency that is not installed (an install with --omit=optional leaves it out); install " +
  "@modelcontextprotocol/sdk alongside @cosyte/cli";

/** The three SDK modules the stdio server needs. */
export type McpSdkModules = readonly [
  typeof McpServerModule,
  typeof McpStdioModule,
  typeof McpTypesModule,
];

/** Everything the stdio server needs from the SDK, loaded. */
export interface McpSdk extends McpServerSdk {
  /** The SDK's stdio transport class. */
  readonly StdioServerTransport: typeof McpStdioModule.StdioServerTransport;
}

/** Import the three SDK modules. The specifiers stay external and dynamic in the built bins. */
function importMcpSdk(): Promise<McpSdkModules> {
  return Promise.all([
    import("@modelcontextprotocol/sdk/server/index.js"),
    import("@modelcontextprotocol/sdk/server/stdio.js"),
    import("@modelcontextprotocol/sdk/types.js"),
  ]);
}

/**
 * Load the MCP SDK, mapping an absent one to a value-free `CLI_PARSER_UNAVAILABLE` (exit `69`).
 * Any other failure (a present but broken SDK) propagates unchanged, for the bin to report as
 * `CLI_INTERNAL`.
 *
 * @param load - The import to run; the default imports the real SDK. Tests pass a failing one.
 * @returns The SDK values the stdio server needs.
 * @throws {CliError} `CLI_PARSER_UNAVAILABLE` (exit `69`) when the SDK is not installed.
 * @example
 * ```ts
 * const sdk = await loadMcpSdk();
 * ```
 */
export async function loadMcpSdk(
  load: () => Promise<McpSdkModules> = importMcpSdk,
): Promise<McpSdk> {
  const [server, stdio, types] = await loadOptionalPackage(MCP_SDK_UNAVAILABLE, load);
  return {
    Server: server.Server,
    StdioServerTransport: stdio.StdioServerTransport,
    CallToolRequestSchema: types.CallToolRequestSchema,
    ListToolsRequestSchema: types.ListToolsRequestSchema,
  };
}

/* v8 ignore start -- stdio transport wiring: connects the real process streams, exercised by the packaged bin smoke, not unit-covered */
/**
 * Start the cosyte MCP server on stdio for a bin, loading the SDK first. Resolves once the
 * transport is connected; the process then stays alive serving requests until its stdin closes.
 *
 * @returns A promise that resolves when the stdio transport is connected.
 * @throws {CliError} `CLI_PARSER_UNAVAILABLE` (exit `69`) when the SDK is not installed.
 * @example
 * ```ts
 * await launchStdioServer();
 * ```
 */
export async function launchStdioServer(): Promise<void> {
  const sdk = await loadMcpSdk();
  const server = wireMcpServer(sdk);
  await server.connect(new sdk.StdioServerTransport());
}
/* v8 ignore stop */
