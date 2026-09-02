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

// Delivery is one question with one answer, however the output was produced. The `stdoutOpen` flag
// alone cannot answer it: the platform flips it when it dispatches the closed-stream error, which is
// asynchronous, so a run whose writes are all enqueued before that error arrives would see an open
// stream, resolve, and report a success over bytes nobody received. So every chunk bound for stdout
// goes through `emit` and is owed an acknowledgement from the platform, and the invocation may not
// resolve until each one has come back.
let produced = false;
let delivered = true;
let queued = 0;
let onFlushed: (() => void) | undefined;

/** Queue one chunk of the data channel on stdout; it counts as undelivered until acknowledged. */
function emit(chunk: string): void {
  produced = true;
  if (!stdoutOpen) {
    delivered = false;
    return;
  }
  queued += 1;
  process.stdout.write(chunk, (err) => {
    if (err !== null && err !== undefined) delivered = false;
    queued -= 1;
    if (queued > 0 || onFlushed === undefined) return;
    const resume = onFlushed;
    onFlushed = undefined;
    resume();
  });
}

/** Resolve once every queued write has come back from the platform, acknowledged or failed. */
function flushed(): Promise<void> {
  if (queued === 0) return Promise.resolve();
  return new Promise((resolve) => {
    onFlushed = resolve;
  });
}

const deps: RunDeps = {
  readFile: (path) => readFileBytes(path),
  readStdin: () => readStreamBytes(process.stdin),
  openFile: (path) => fileChunks(path),
  openStdin: () => streamChunks(process.stdin),
  writeStdout: (chunk) => {
    // Fail fast so the rest of a record stream is not parsed into a channel that is already gone;
    // the acknowledgement in `emit` is what catches a consumer that leaves without a write failing.
    if (!stdoutOpen) throw new Error("stdout closed");
    emit(chunk);
  },
};

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
      // A single-result command hands its whole payload over here; a record stream has already
      // written itself, line by line, through `deps.writeStdout`. Both are the same `emit`.
      if (result.stdout !== "") emit(result.stdout);
      // Fail safe across the window where an acknowledgement is still outstanding: if the process
      // were ever to end without the platform coming back, the code left standing is the
      // output-error one, never a success over bytes nobody has confirmed receiving.
      if (produced) process.exitCode = EXIT.IOERR;
      await flushed();

      // Output that reached nobody overrides whatever the command resolved to: the invocation did
      // not finish, so it is never reported as the success (or the data error) it computed, and the
      // summary describing that outcome is withdrawn with it. A command that legitimately produced
      // no output at all is untouched by this: it delivered everything it owed.
      if (produced && !(delivered && stdoutOpen)) {
        reportOutputClosed();
        return;
      }
      if (result.stderr) note(result.stderr);
      process.exitCode = result.exit;
    })
    .catch(() => {
      // Last-resort guard: a truly unexpected failure prints a value-free line and exits EX_SOFTWARE.
      note("cosyte: CLI_INTERNAL: an unexpected internal error occurred\n");
      process.exitCode = 70;
    });
}
/* v8 ignore stop */
