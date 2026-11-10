// The worker half of test/perf/sync-cli.ts: it runs the `cosyte` dispatcher from src/ (through tsx,
// since a worker does not go through Vitest's transform) on an input held in memory, and wakes the
// waiting thread through a shared Int32Array when the invocation has resolved.
//
// Slot 0 is the state (0 running, 1 done, 2 failed), slot 1 the exit code, slot 2 the number of
// characters written to stdout. Nothing about the input or the output crosses back but those two
// numbers.

import { parentPort, workerData } from "node:worker_threads";

import { tsImport } from "tsx/esm/api";

const { run } = await tsImport("../../src/core/run.ts", import.meta.url);

const CHUNK = 64 * 1024;
const state = new Int32Array(workerData.state);

/** The input in the chunks a file read stream delivers (64 KiB, its default high water mark). */
async function* chunks(bytes) {
  for (let at = 0; at < bytes.length; at += CHUNK) yield bytes.subarray(at, at + CHUNK);
}

function finish(code, exit, written) {
  Atomics.store(state, 1, exit);
  Atomics.store(state, 2, written);
  Atomics.store(state, 0, code);
  Atomics.notify(state, 0);
}

parentPort.on("message", ({ argv, bytes }) => {
  let written = 0;
  const deps = {
    readFile: () => Promise.resolve(bytes),
    readStdin: () => Promise.resolve(bytes),
    openFile: () => chunks(bytes),
    openStdin: () => chunks(bytes),
    writeStdout: (chunk) => {
      written += chunk.length;
    },
  };
  run(argv, deps).then(
    (result) => finish(1, result.exit, written + result.stdout.length),
    () => finish(2, -1, 0),
  );
});

// Ready: the dispatcher is loaded and the handler is listening.
finish(1, 0, 0);
