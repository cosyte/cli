/**
 * The `@cosyte/cli/mcp` subpath export — the **agent front door**. Importing this module (or running
 * the `cosyte-mcp` bin) is the boundary at which the `@modelcontextprotocol/sdk` dependency is loaded;
 * the CLI's `.` entry point and `cosyte parse` path never reach it (ADR 0021 / 0022).
 *
 * @packageDocumentation
 */

export { createMcpServer, startStdioServer, SERVER_INFO } from "./server.js";

export {
  dispatchTool,
  TOOL_DEFS,
  type McpToolDef,
  type McpToolInputSchema,
  type McpToolResult,
  type McpToolMeta,
  type McpTextContent,
} from "./tools.js";
