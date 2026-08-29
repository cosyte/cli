/**
 * The `@cosyte/cli/mcp` subpath export: the **agent front door**. Importing this module (or running
 * the `cosyte-mcp` bin) is the boundary at which the `@modelcontextprotocol/sdk` dependency is loaded;
 * the CLI's `.` entry point and `cosyte parse` path never reach it.
 *
 * @packageDocumentation
 */

export { createMcpServer, startStdioServer, SERVER_INFO } from "./server.js";

export {
  dispatchTool,
  TOOL_DEFS,
  type McpToolDef,
  type McpToolInputSchema,
  type McpToolOutputSchema,
  type McpToolResult,
  type McpToolMeta,
  type McpStructuredResult,
  type McpToolStatus,
  type McpTextContent,
} from "./tools.js";
