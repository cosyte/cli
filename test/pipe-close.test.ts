import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EXIT } from "../src/core/exit-codes.js";

/**
 * A DOWNSTREAM CONSUMER THAT GOES AWAY, MEASURED AGAINST REAL PROCESSES.
 *
 * Piping into a reader that stops early is ordinary shell usage. Everything else in this suite
 * drives the closed-consumer case through an INJECTED sink inside the test process, which proves
 * what the command layer does and nothing at all about what the operator's terminal sees: the
 * process adapters register the platform's stream handlers, and an unheard `'error'` event on
 * `process.stdout` is fatal, printing a stack trace naming this machine's paths. That is the leak
 * this file exists to hold shut, so every case here SPAWNS a real bin and closes the child's real
 * stdout.
 *
 * WHAT IS ASSERTED, in the order it matters:
 *
 *   1. The exit code is the documented output-error code, on both write paths and whether or not a
 *      byte ever reached the consumer. A run whose answer did not arrive is never a success.
 *   2. Nothing on stderr carries a stack frame, a platform error identity (`EPIPE`, a Node error
 *      name, an internal module path) or a byte of the input. The stable diagnostic code, and that
 *      is all.
 *   3. A closed stderr cannot turn the quiet termination into an unhandled error: the code still
 *      arrives.
 *   4. The agent front door behaves the same when its client goes away.
 *
 * ASSERT THE PREMISE, NOT ONLY THE REMEDY. Two vacuity traps have already sprung in this
 * repository's suite, so three premises are asserted directly rather than assumed: the spawned bin
 * really runs and really produces the output the assertions are about; the sentinel really is
 * present in what the consumer would have received, so its absence from stderr is a verdict rather
 * than an accident of a run that emitted nothing; and the unguarded shape really does fail the way
 * this file claims, replayed as a NEGATIVE CONTROL against the platform itself.
 *
 * ▶ THE RECORD COUNT IS LOAD-BEARING, AND A BIG ONE HIDES THE DEFECT THIS FILE IS ABOUT. A record
 * stream writes line by line, and the platform reports a closed consumer ASYNCHRONOUSLY. So a long
 * stream fails on a later write and is caught whatever the adapter does with the earlier ones, while
 * a SHORT one can have every line enqueued before the report arrives: an adapter that never waits
 * for the platform's acknowledgement then sees an open stream, resolves, and reports a success over
 * bytes nobody received. That is the whole failure, and only a small count reaches it. So the
 * closed-before-a-byte cases below run at ONE and TWO records, the long fixture is kept only for the
 * mid-stream case that needs a stream long enough to interrupt, and every closed-consumer case
 * refuses a success summary on stderr as well as a zero exit. A sibling gate on the PACKAGED bin
 * under plain `node` lives in `scripts/smoke.mjs`, because the window widens on a faster start.
 *
 * SECURITY: every subprocess call uses `spawn` with array args and `shell: false`. No exec, no
 * string interpolation into a command line.
 *
 * Each case spawns a bin through `tsx`, which pays a cold TypeScript start every time, and the MCP
 * cases wait for a server to come up. The shared 10s default is not enough headroom for that on a
 * loaded box (a single cold spawn is measured at 3.7s under contention elsewhere in this suite), so
 * every case carries its own budget.
 */
const SLOW_MS = 60_000;

const REPO_ROOT = process.cwd();
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");
const COSYTE = join(REPO_ROOT, "src", "bin", "cosyte.ts");
const COSYTE_MCP = join(REPO_ROOT, "src", "bin", "cosyte-mcp.ts");

/** A value from the INPUT. If it ever reaches stderr, a value has escaped the data channel. */
const SENTINEL = "ZZPIPESENTINELZZ";

/** One MCP request, enough to make the server write a reply onto the channel we have closed. */
const MCP_REQUEST =
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "pipe-close", version: "0" },
    },
  }) + "\n";

let dir: string;
let patientPath: string;
let bulkPath: string;
/** One record, and two: small enough that every line is enqueued before the close is reported. */
let onePath: string;
let twoPath: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "cosyte-pipe-close-"));
  patientPath = join(dir, "patient.json");
  bulkPath = join(dir, "bulk.ndjson");
  onePath = join(dir, "one.ndjson");
  twoPath = join(dir, "two.ndjson");
  const patient = (id: string): string =>
    JSON.stringify({
      resourceType: "Patient",
      id,
      gender: "male",
      name: [{ family: SENTINEL, given: ["Q"] }],
    });
  writeFileSync(patientPath, patient("one") + "\n");
  writeFileSync(onePath, patient("r0") + "\n");
  writeFileSync(twoPath, [patient("r0"), patient("r1")].join("\n") + "\n");
  // Large enough that the child is still writing when the consumer goes away: the OS pipe buffer
  // holds far less than this, so the stream cannot have finished behind the test's back.
  const lines: string[] = [];
  for (let i = 0; i < 4000; i += 1) lines.push(patient(`p${String(i)}`));
  writeFileSync(bulkPath, lines.join("\n") + "\n");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Spawned {
  /** The child's exit status, or `null` when it was killed by a signal. */
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  /** Whatever reached the consumer before it closed the stream. */
  readonly stdout: string;
  readonly stderr: string;
}

interface Options {
  /** Close the child's stdout. `0` closes it before the child can write a byte. */
  readonly closeStdoutAfterLines?: number;
  /** Leave the child's stdout open: the control shape. */
  readonly keepStdoutOpen?: boolean;
  /** Close the child's stderr as well, so the diagnostic has nowhere to go. */
  readonly closeStderr?: boolean;
  /** Bytes to write to the child's stdin. The stream is deliberately NOT ended: an EOF would give
   * a server a second way to exit and make the assertion about the closed stream vacuous. */
  readonly stdin?: string;
}

/** Spawn a real process, close the streams the case is about, and collect what came back. */
function spawnBin(argv: readonly string[], options: Options = {}): Promise<Spawned> {
  return new Promise<Spawned>((resolve) => {
    // Every stream is a pipe so this helper owns all three ends. Nothing reads the child's stdin
    // unless a case supplies bytes for it, and it is released once the process is gone.
    const child = spawn(TSX_BIN, [...argv], {
      cwd: REPO_ROOT,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));

    let closed = false;
    const closeStdout = (): void => {
      if (closed) return;
      closed = true;
      child.stdout.destroy();
    };
    const after = options.closeStdoutAfterLines ?? 0;
    if (options.keepStdoutOpen !== true && after === 0) closeStdout();
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (options.keepStdoutOpen === true || after === 0) return;
      if (stdout.split("\n").length - 1 >= after) closeStdout();
    });

    if (options.closeStderr === true) child.stderr.destroy();

    child.stdin.on("error", () => {
      // The child exited first; its end of the pipe is gone and there is nothing left to send.
    });
    if (options.stdin !== undefined) child.stdin.write(options.stdin);

    // The child's stdin is held open on purpose, so `close` needs the writable released once the
    // process is gone or it would never fire.
    child.on("exit", () => child.stdin.destroy());
    child.on("close", (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

/**
 * A run whose output reached nobody must not also print the summary of the work it did. The exit
 * code alone is not the whole criterion: a reassuring line over undelivered output is the shape the
 * published contract refuses, and it is what an adapter that never confirms delivery prints.
 */
function expectNoSuccessSummary(stderr: string): void {
  expect(stderr).not.toMatch(/parsed \d+ \w+ record\(s\)/);
  expect(stderr).not.toMatch(/parsed \w+ with \d+ warning/);
}

/** No stack frame, no platform error identity, no byte of the input: the value-free posture. */
function expectValueFree(stderr: string): void {
  expect(stderr).not.toContain(SENTINEL);
  expect(stderr).not.toContain("EPIPE");
  expect(stderr).not.toMatch(/\bError\b/);
  expect(stderr).not.toMatch(/\s+at\s+\S+:\d+/);
  expect(stderr).not.toContain("node:internal");
  expect(stderr).not.toContain("Unhandled");
  expect(stderr).not.toContain("Warning");
  expect(stderr).not.toContain("resourceType");
}

describe("the premise: the spawned bin runs, and the sentinel really is in what it writes", () => {
  it(
    "parses a single resource to stdout and exits 0 when the consumer stays",
    async () => {
      const r = await spawnBin([COSYTE, "parse", patientPath], { keepStdoutOpen: true });
      expect(r.code).toBe(EXIT.OK);
      expect(r.stdout).toContain(SENTINEL);
      expect(r.stderr).toBe("");
    },
    SLOW_MS,
  );

  it(
    "streams every record to stdout and exits 0 when the consumer stays",
    async () => {
      const r = await spawnBin([COSYTE, "parse", bulkPath, "--ndjson", "--format", "fhir"], {
        keepStdoutOpen: true,
      });
      expect(r.code).toBe(EXIT.OK);
      expect(r.stdout.split("\n").length - 1).toBe(4000);
      expect(r.stdout).toContain(SENTINEL);
    },
    SLOW_MS,
  );

  it(
    "streams a one-record and a two-record input in full when the consumer stays",
    async () => {
      for (const [path, n] of [
        [onePath, 1],
        [twoPath, 2],
      ] as const) {
        const r = await spawnBin([COSYTE, "parse", path, "--ndjson", "--format", "fhir"], {
          keepStdoutOpen: true,
        });
        expect(r.code).toBe(EXIT.OK);
        expect(r.stdout.split("\n").length - 1).toBe(n);
        expect(r.stdout).toContain(SENTINEL);
        // The premise for the cases below: with the consumer present these runs DO print the
        // summary that must never appear once the consumer has gone.
        expect(r.stderr).toMatch(/parsed \d+ \w+ record\(s\)/);
      }
    },
    SLOW_MS,
  );

  it(
    "still routes an ordinary failure to its own code with the consumer present",
    async () => {
      const r = await spawnBin([COSYTE, "frobnicate"], { keepStdoutOpen: true });
      expect(r.code).toBe(EXIT.USAGE);
      expect(r.stderr).toContain("CLI_USAGE");
    },
    SLOW_MS,
  );
});

describe("a single-write result whose consumer closed the stream", () => {
  it(
    "exits under the documented output-error code instead of the success it resolved to",
    async () => {
      const r = await spawnBin([COSYTE, "parse", patientPath]);
      expect(r.code).toBe(EXIT.IOERR);
      expect(r.code).not.toBe(EXIT.OK);
      expect(r.signal).toBeNull();
      // Nothing at all was delivered: the whole result was one write into a stream already gone.
      expect(r.stdout).toBe("");
    },
    SLOW_MS,
  );

  it(
    "says so once, value-free, under the same stable code the record stream uses",
    async () => {
      const r = await spawnBin([COSYTE, "parse", patientPath]);
      expect(r.stderr).toContain("CLI_OUTPUT_WRITE_FAILED");
      expect(r.stderr.split("CLI_OUTPUT_WRITE_FAILED")).toHaveLength(2);
      expectNoSuccessSummary(r.stderr);
      expectValueFree(r.stderr);
    },
    SLOW_MS,
  );

  it(
    "reports the same way under --json, where the payload is a single compact write",
    async () => {
      const r = await spawnBin([COSYTE, "parse", patientPath, "--json"]);
      expect(r.code).toBe(EXIT.IOERR);
      expect(r.stderr).toContain("CLI_OUTPUT_WRITE_FAILED");
      expectValueFree(r.stderr);
    },
    SLOW_MS,
  );
});

describe("a record stream whose consumer goes away part way through", () => {
  it(
    "keeps the lines already delivered and exits under the same output-error code",
    async () => {
      const r = await spawnBin([COSYTE, "parse", bulkPath, "--ndjson", "--format", "fhir"], {
        closeStdoutAfterLines: 2,
      });
      expect(r.code).toBe(EXIT.IOERR);
      expect(r.code).not.toBe(EXIT.OK);
      expect(r.signal).toBeNull();
      expect(r.stdout.split("\n").length - 1).toBeGreaterThanOrEqual(2);
      // The premise: the run really was interrupted rather than allowed to finish.
      expect(r.stdout.split("\n").length - 1).toBeLessThan(4000);
      expect(r.stderr).toContain("CLI_OUTPUT_WRITE_FAILED");
      expectNoSuccessSummary(r.stderr);
      expectValueFree(r.stderr);
    },
    SLOW_MS,
  );

  it(
    "resolves to the same code, never 0, when the stream closes before the first line",
    async () => {
      const r = await spawnBin([COSYTE, "parse", bulkPath, "--ndjson", "--format", "fhir"]);
      expect(r.code).toBe(EXIT.IOERR);
      expect(r.code).not.toBe(EXIT.OK);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain("CLI_OUTPUT_WRITE_FAILED");
      expectNoSuccessSummary(r.stderr);
      expectValueFree(r.stderr);
    },
    SLOW_MS,
  );

  it(
    "reports one failure under one code, whichever write path hit it",
    async () => {
      // The record stream here is ONE record: the count at which the two paths' handling of the
      // platform's asynchronous close report can diverge, and so the count at which this criterion
      // is actually measured rather than assumed.
      const single = await spawnBin([COSYTE, "parse", patientPath]);
      const stream = await spawnBin([COSYTE, "parse", onePath, "--ndjson", "--format", "fhir"]);
      expect(single.code).toBe(stream.code);
      expect(single.code).toBe(EXIT.IOERR);
      expect(single.stderr).toContain("CLI_OUTPUT_WRITE_FAILED");
      expect(stream.stderr).toContain("CLI_OUTPUT_WRITE_FAILED");
      // One failure, one outcome: on this surface the two paths are not merely both non-zero, they
      // are byte for byte the same diagnostic.
      expect(stream.stderr).toBe(single.stderr);
    },
    SLOW_MS,
  );
});

/**
 * THE SHORT STREAM, which is where an adapter that never waits for the platform stays green. Every
 * line is enqueued before the closed-consumer report is dispatched, so nothing throws, the command
 * resolves to success, and only an acknowledgement from the platform can tell the process that its
 * output reached nobody.
 */
describe("a record stream short enough to be written before the close is reported", () => {
  it.each([
    { label: "one record", path: (): string => onePath },
    { label: "two records", path: (): string => twoPath },
  ])(
    "never reports $label as a success when the consumer received nothing",
    async ({ path }) => {
      const argv = [COSYTE, "parse", path(), "--ndjson", "--format", "fhir"];
      const r = await spawnBin(argv);
      expect(r.code).toBe(EXIT.IOERR);
      expect(r.code).not.toBe(EXIT.OK);
      expect(r.signal).toBeNull();
      // The premise: nothing at all reached the consumer, so this is the undelivered case.
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain("CLI_OUTPUT_WRITE_FAILED");
      expectNoSuccessSummary(r.stderr);
      expectValueFree(r.stderr);
    },
    SLOW_MS,
  );
});

describe("the diagnostic channel is gone as well", () => {
  it(
    "still terminates under the documented code, with no unhandled error",
    async () => {
      const r = await spawnBin([COSYTE, "parse", patientPath], { closeStderr: true });
      expect(r.code).toBe(EXIT.IOERR);
      expect(r.code).not.toBe(EXIT.OK);
      // An unhandled 'error' event is exit 1 with a stack trace (see the negative control below),
      // so the documented code arriving IS the assertion that nothing went unhandled.
      expect(r.code).not.toBe(1);
      expect(r.signal).toBeNull();
    },
    SLOW_MS,
  );

  it(
    "does the same for a record stream interrupted part way through",
    async () => {
      const r = await spawnBin([COSYTE, "parse", bulkPath, "--ndjson", "--format", "fhir"], {
        closeStdoutAfterLines: 2,
        closeStderr: true,
      });
      expect(r.code).toBe(EXIT.IOERR);
      expect(r.signal).toBeNull();
    },
    SLOW_MS,
  );
});

describe("the agent front door, when the client has gone away", () => {
  it(
    "terminates quietly under the same code as the terminal bin",
    async () => {
      const r = await spawnBin([COSYTE_MCP], { stdin: MCP_REQUEST });
      expect(r.code).toBe(EXIT.IOERR);
      expect(r.signal).toBeNull();
      expect(r.stderr).toContain("cosyte-mcp: CLI_OUTPUT_WRITE_FAILED");
      expectValueFree(r.stderr);
      // A stack trace from inside the transport would name this machine's install paths.
      expect(r.stderr).not.toContain("node_modules");
    },
    SLOW_MS,
  );

  it(
    "does the same when the server is reached through the subcommand",
    async () => {
      const r = await spawnBin([COSYTE, "mcp"], { stdin: MCP_REQUEST });
      expect(r.code).toBe(EXIT.IOERR);
      expect(r.signal).toBeNull();
      expect(r.stderr).toContain("cosyte: CLI_OUTPUT_WRITE_FAILED");
      expectValueFree(r.stderr);
      expect(r.stderr).not.toContain("node_modules");
    },
    SLOW_MS,
  );

  it(
    "terminates under the same code with its diagnostic channel closed too",
    async () => {
      const r = await spawnBin([COSYTE_MCP], { stdin: MCP_REQUEST, closeStderr: true });
      expect(r.code).toBe(EXIT.IOERR);
      expect(r.code).not.toBe(1);
      expect(r.signal).toBeNull();
    },
    SLOW_MS,
  );
});

/**
 * THE NEGATIVE CONTROL. Every assertion above is a claim about what this repository's process
 * adapters add to the platform. A reader cannot believe it without seeing what the platform does on
 * its own, and a guard nobody has watched fail is a guard nobody can believe. So the unguarded
 * shape is replayed here against `node` itself, and the failure this file exists to prevent must
 * appear: the stack trace, the platform error identity, and the exit status that is not ours.
 */
describe("the negative control: the platform's own behaviour without these handlers", () => {
  it(
    "a write to a closed stdout with no listener is fatal, traced, and exits 1",
    async () => {
      const unguarded = 'process.stdout.write("x".repeat(1 << 20), () => {});';
      const r = await new Promise<Spawned>((resolve) => {
        const child = spawn(process.execPath, ["-e", unguarded], {
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stderr = "";
        child.stderr.setEncoding("utf-8");
        child.stderr.on("data", (chunk: string) => (stderr += chunk));
        child.stdout.destroy();
        child.on("close", (code, signal) => {
          resolve({ code, signal, stdout: "", stderr });
        });
      });

      expect(r.code).toBe(1);
      expect(r.code).not.toBe(EXIT.IOERR);
      expect(r.stderr).toContain("EPIPE");
      expect(r.stderr).toMatch(/\s+at\s+\S+:\d+/);
      // The exact shapes `expectValueFree` refuses: without this, that helper could be asserting
      // the absence of text that never appears on any platform.
      expect(() => expectValueFree(r.stderr)).toThrow();
    },
    SLOW_MS,
  );
});
