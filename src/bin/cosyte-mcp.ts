#!/usr/bin/env node
/**
 * The `cosyte-mcp` executable: the stdio MCP server's process entry. It does exactly one untestable
 * thing: start the server on the real `process.stdin`/`process.stdout` and let the process stay alive
 * serving requests. All logic (the tool surface, the shared command core, the value-free PHI posture)
 * lives in the covered `mcp`/`core`/`commands` modules; this file is intentionally trivial and
 * coverage-excluded. It is the twin of `cosyte.ts` for the agent front door.
 *
 * @packageDocumentation
 */

/* v8 ignore start -- process wiring: starts the stdio server on the real process streams, exercised by the packaged bin smoke, not unit-covered */
import { CLI_CODES } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import { startStdioServer } from "../mcp/server.js";

// stdout is the only channel this server can answer on, and the client owns the other end of it. A
// host that exits mid-reply closes the pipe, which Node reports as an 'error' event on the stream:
// fatal if nothing is listening, and a stack trace naming this machine's paths is exactly what a
// value-free posture must not print. So the event is heard and the server terminates quietly.
let stderrOpen = true;
let reported = false;

process.stderr.on("error", () => {
  stderrOpen = false;
});

/** Write one value-free line to the diagnostic channel, tolerating a channel that is already gone. */
function note(line: string): void {
  if (!stderrOpen) return;
  try {
    process.stderr.write(line);
  } catch {
    // The diagnostic channel went away as well; the exit code is the whole signal.
    stderrOpen = false;
  }
}

process.stdout.on("error", () => {
  if (reported) return;
  reported = true;
  note(
    `cosyte-mcp: ${CLI_CODES.CLI_OUTPUT_WRITE_FAILED}: could not write to the output stream; it closed before the output was delivered\n`,
  );
  process.exitCode = EXIT.IOERR;
  // Closing the input ends the stdio transport, so the loop drains and the process exits under the
  // code just set; `process.exit()` would truncate the diagnostic that was queued above.
  process.stdin.destroy();
});

startStdioServer().catch(() => {
  // A truly unexpected startup failure prints a value-free line and exits EX_SOFTWARE.
  note("cosyte-mcp: CLI_INTERNAL: the MCP server failed to start\n");
  process.exitCode = 70;
});
/* v8 ignore stop */
