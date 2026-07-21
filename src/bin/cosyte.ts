#!/usr/bin/env node
/**
 * The `cosyte` executable — the thin process adapter over the testable {@link run} dispatcher. It
 * does exactly three untestable things: read `process.argv`, wire the real filesystem + `process.stdin`
 * as {@link RunDeps}, and write the {@link RunResult} to the process streams / exit code. All logic —
 * routing, autodetection, parsing, the exit-code contract, the value-free PHI posture — lives in the
 * covered `core`/`commands` modules; this file is intentionally trivial and coverage-excluded.
 *
 * @packageDocumentation
 */

/* v8 ignore start -- process wiring: argv/stdin/stdout/exit glue, exercised by the packaged bin smoke, not unit-covered */
import { readFileBytes, readStreamBytes, type RunDeps } from "../core/io.js";
import { run } from "../core/run.js";

const deps: RunDeps = {
  readFile: (path) => readFileBytes(path),
  readStdin: () => readStreamBytes(process.stdin),
};

run(process.argv.slice(2), deps)
  .then((result) => {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.exit;
  })
  .catch(() => {
    // Last-resort guard: a truly unexpected failure prints a value-free line and exits EX_SOFTWARE.
    process.stderr.write("cosyte: CLI_INTERNAL: an unexpected internal error occurred\n");
    process.exitCode = 70;
  });
/* v8 ignore stop */
