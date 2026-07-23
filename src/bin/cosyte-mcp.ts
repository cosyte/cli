#!/usr/bin/env node
/**
 * The `cosyte-mcp` executable — the stdio MCP server's process entry. It does exactly one untestable
 * thing: start the server on the real `process.stdin`/`process.stdout` and let the process stay alive
 * serving requests. All logic — the tool surface, the shared command core, the value-free PHI posture —
 * lives in the covered `mcp`/`core`/`commands` modules; this file is intentionally trivial and
 * coverage-excluded. It is the twin of `cosyte.ts` for the agent front door (ADR 0022).
 *
 * @packageDocumentation
 */

/* v8 ignore start -- process wiring: starts the stdio server on the real process streams, exercised by the packaged bin smoke, not unit-covered */
import { startStdioServer } from "../mcp/server.js";

startStdioServer().catch(() => {
  // A truly unexpected startup failure prints a value-free line and exits EX_SOFTWARE.
  process.stderr.write("cosyte-mcp: CLI_INTERNAL: the MCP server failed to start\n");
  process.exitCode = 70;
});
/* v8 ignore stop */
