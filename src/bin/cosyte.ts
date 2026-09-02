#!/usr/bin/env node
/**
 * The `cosyte` executable: the thin process adapter over the testable {@link run} dispatcher. It
 * does exactly three untestable things: read `process.argv`, wire the real filesystem + `process.stdin`
 * as {@link RunDeps}, and write the {@link RunResult} to the process streams / exit code. All logic
 * (routing, autodetection, parsing, the exit-code contract, the value-free PHI posture) lives in the
 * covered `core`/`commands` modules; this file is intentionally trivial and coverage-excluded.
 *
 * @packageDocumentation
 */

/* v8 ignore start -- process wiring: argv/stdin/stdout/exit glue, exercised by the packaged bin smoke, not unit-covered */
import { CLI_CODES } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import {
  fileChunks,
  readFileBytes,
  readStreamBytes,
  streamChunks,
  type RunDeps,
} from "../core/io.js";
import { run } from "../core/run.js";

// `cosyte mcp` keeps the process alive serving a client over stdout; every other invocation resolves
// a result and returns. The two differ in what a closed stdout means, so it is resolved up front.
const serverMode = process.argv[2] === "mcp";

// A consumer that closes the pipe (a pager the user quit, a `head` that has seen enough) makes the
// next write fail. Node reports that as an 'error' event on the stream, which is fatal if nothing is
// listening, so the sink below is marked closed instead and the command resolves it as a write
// failure. A server has no result to resolve: it terminates quietly under the same code.
let stdoutOpen = true;
let stderrOpen = true;
let reported = false;

// The diagnostic channel can go away too (`cosyte parse big.ndjson 2>&1 | head -1` closes both at
// once). An unheard 'error' event there would turn a quiet termination into an unhandled platform
// error, so it is heard and the channel is marked gone: from here on stderr is best effort and the
// exit code is the signal that survives.
process.stderr.on("error", () => {
  stderrOpen = false;
});

/** Write one value-free line to the diagnostic channel, tolerating a channel that is already gone. */
function note(line: string): void {
  if (!stderrOpen) return;
  try {
    process.stderr.write(line);
  } catch {
    // The diagnostic channel went away mid-write; the exit code is the whole signal.
    stderrOpen = false;
  }
}

/**
 * Report a closed output stream once, value-free: a stable code and no byte of the input, the
 * platform's error text or the failing stream's identity.
 */
function reportOutputClosed(): void {
  if (reported) return;
  reported = true;
  note(
    `cosyte: ${CLI_CODES.CLI_OUTPUT_WRITE_FAILED}: could not write to the output stream; it closed before the output was delivered\n`,
  );
  process.exitCode = EXIT.IOERR;
}

process.stdout.on("error", () => {
  stdoutOpen = false;
  if (!serverMode) return;
  // A server whose only channel is gone can answer nothing more. Closing the input ends the stdio
  // transport so the loop drains under the code set here; `process.exit()` would truncate the
  // diagnostic that was just queued.
  reportOutputClosed();
  process.stdin.destroy();
});

const deps: RunDeps = {
  readFile: (path) => readFileBytes(path),
  readStdin: () => readStreamBytes(process.stdin),
  openFile: (path) => fileChunks(path),
  openStdin: () => streamChunks(process.stdin),
  writeStdout: (chunk) => {
    if (!stdoutOpen) throw new Error("stdout closed");
    process.stdout.write(chunk);
  },
};

/**
 * Write a whole single-result payload to stdout and resolve to whether the consumer actually got it.
 * The record stream fails fast through `deps.writeStdout`; a single write has no later write to
 * fail, so it waits for the platform's acknowledgement instead. Otherwise a result that never
 * reached anyone would still be reported as the success the command resolved to.
 */
function writeResult(chunk: string): Promise<boolean> {
  if (!stdoutOpen) return Promise.resolve(false);
  return new Promise((resolve) => {
    process.stdout.write(chunk, (err) => {
      resolve(err === null || err === undefined);
    });
  });
}

// The `cosyte mcp` subcommand starts the stdio MCP server (also reachable as the `cosyte-mcp` bin).
// It is dispatched here, before `run`, and the server module is DYNAMICALLY imported so the
// @modelcontextprotocol/sdk dependency loads only on this path: a plain `cosyte parse` never pulls it
// (ADR 0021 isolation). A server invocation stays alive serving requests; it does not return a result.
if (serverMode) {
  import("../mcp/server.js")
    .then(({ startStdioServer }) => startStdioServer())
    .catch(() => {
      note("cosyte: CLI_INTERNAL: the MCP server failed to start\n");
      process.exitCode = 70;
    });
} else {
  run(process.argv.slice(2), deps)
    .then(async (result) => {
      const delivered = result.stdout === "" ? true : await writeResult(result.stdout);
      if (result.stderr) note(result.stderr);
      process.exitCode = result.exit;
      // An undelivered result overrides whatever the command resolved to: the invocation did not
      // finish, so it is never reported as the success (or the data error) it would otherwise be.
      // A record stream that failed mid-flight has already reported itself, through the result.
      if (!delivered) reportOutputClosed();
    })
    .catch(() => {
      // Last-resort guard: a truly unexpected failure prints a value-free line and exits EX_SOFTWARE.
      note("cosyte: CLI_INTERNAL: an unexpected internal error occurred\n");
      process.exitCode = 70;
    });
}
/* v8 ignore stop */
