/**
 * The `cosyte` dispatcher as a synchronous call, for the scaling gate.
 *
 * `@cosyte/test-utils/perf` times a synchronous function, and every command the CLI runs is async: it
 * loads its parser lazily and reads its input as a stream. So the dispatcher runs in a worker thread
 * and this thread blocks on a shared Int32Array until the invocation resolves. The whole command
 * runs as it does from the bin (argument parsing, autodetection, the chunked read, the wrapped
 * parser, the JSON written to stdout), on an input held in memory; only process start and the
 * terminal are left out. Each call costs one message and one wake-up on top of the command, the same
 * at every size, so it cancels out of a ratio.
 */

import { Worker } from "node:worker_threads";

/** What one invocation returned: its exit code and how many characters it wrote to stdout. */
export interface SyncResult {
  readonly exit: number;
  readonly written: number;
}

/** A started worker: call it like a function, and close it when done. */
export interface SyncCli {
  readonly call: (argv: readonly string[], bytes: Uint8Array) => SyncResult;
  readonly close: () => Promise<number>;
}

/** Start the worker and wait until the dispatcher is loaded. */
export function startSyncCli(): SyncCli {
  const shared = new SharedArrayBuffer(3 * Int32Array.BYTES_PER_ELEMENT);
  const state = new Int32Array(shared);
  const worker = new Worker(new URL("./cli-worker.mjs", import.meta.url), {
    workerData: { state: shared },
  });
  // Loading src/ through tsx takes a few seconds; 60 s is for a machine that is very busy.
  if (Atomics.wait(state, 0, 0, 60_000) === "timed-out") {
    throw new Error("the cli worker did not start within 60 s");
  }
  return {
    call: (argv, bytes) => {
      Atomics.store(state, 0, 0);
      worker.postMessage({ argv, bytes });
      Atomics.wait(state, 0, 0);
      if (Atomics.load(state, 0) !== 1) throw new Error("the cli worker's invocation rejected");
      return { exit: Atomics.load(state, 1), written: Atomics.load(state, 2) };
    },
    close: () => worker.terminate(),
  };
}
