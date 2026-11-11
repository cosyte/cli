import { afterEach, describe, expect, it, vi } from "vitest";

import { EXIT } from "../src/core/exit-codes.js";
import type { RunDeps } from "../src/core/io.js";
import { ndjsonRecords } from "../src/core/records.js";
import { run } from "../src/core/run.js";

/**
 * Output streams: `cosyte parse` writes its output a piece at a time through the injected sink and
 * waits whenever the sink says the consumer is behind, so a large run never holds its whole output.
 * And the NDJSON splitter reads a line that spans many input chunks without copying it once per
 * chunk.
 */

const enc = new TextEncoder();

/** A promise plus its resolver. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Let every queued promise job and one turn of the event loop run. */
const settle = (): Promise<void> => new Promise((r) => setImmediate(r));

/**
 * Wait until `done()` holds (the parser loads lazily, so the first write takes a while), then let
 * the event loop turn many more times: anything that does not wait would have run by then.
 */
async function quiesce(done: () => boolean): Promise<void> {
  const until = Date.now() + 5_000;
  while (!done() && Date.now() < until) await new Promise((r) => setTimeout(r, 5));
  for (let i = 0; i < 50; i++) await settle();
}

/** Deps reading `bytes` from stdin in `chunk`-byte pieces, writing through `sink`. */
function deps(
  bytes: Uint8Array,
  sink: (chunk: string) => void | Promise<void>,
  chunk = 64 * 1024,
): RunDeps & { pulled: () => number } {
  let pulled = 0;
  async function* open(): AsyncGenerator<Uint8Array> {
    for (let at = 0; at < bytes.length; at += chunk) {
      await Promise.resolve();
      pulled += 1;
      yield bytes.subarray(at, at + chunk);
    }
  }
  return {
    readFile: () => Promise.reject(new Error("unused")),
    readStdin: () => Promise.reject(new Error("unused")),
    openStdin: open,
    writeStdout: sink,
    pulled: () => pulled,
  };
}

const patients = (n: number): string =>
  Array.from({ length: n }, (_, i) => `{"resourceType":"Patient","id":"zz-${String(i)}"}\n`).join(
    "",
  );

describe("multi-record output waits for the consumer (drain)", () => {
  it("--ndjson: no record is written, and no input pulled, while the sink is waiting", async () => {
    const gate = deferred();
    const lines: string[] = [];
    // One record per input chunk, so a producer that does not wait would read and write them all.
    const d = deps(
      enc.encode(patients(5)),
      (line) => {
        lines.push(line);
        return lines.length === 1 ? gate.promise : undefined;
      },
      49,
    );

    const running = run(["parse", "-", "--ndjson", "--format", "fhir"], d);
    await quiesce(() => lines.length > 0);

    expect(lines).toHaveLength(1); // the first write is still waiting on drain
    expect(d.pulled()).toBeLessThanOrEqual(2);

    gate.resolve();
    const r = await running;
    expect(r.exit).toBe(EXIT.OK);
    expect(lines).toHaveLength(5);
    expect(r.stdout).toBe("");
  });

  it("a sink whose wait rejects ends the stream as an output failure, value-free", async () => {
    const lines: string[] = [];
    const d = deps(enc.encode(patients(3)), (line) => {
      lines.push(line);
      return Promise.reject(new Error("EPIPE zz-0"));
    });
    const r = await run(["parse", "-", "--ndjson", "--format", "fhir"], d);
    expect(r.exit).toBe(EXIT.IOERR);
    expect(r.stderr).toContain("CLI_OUTPUT_WRITE_FAILED");
    expect(r.stderr).not.toContain("zz-0");
    expect(lines).toHaveLength(1);
  });
});

describe("a single message's output is written in pieces, not built whole", () => {
  const bundle = JSON.stringify({
    resourceType: "Bundle",
    type: "collection",
    entry: Array.from({ length: 3_000 }, (_, i) => ({
      resource: { resourceType: "Patient", id: `zz-${String(i)}`, active: true },
    })),
  });

  it("pretty output reaches the sink in bounded pieces, and joins to the same text", async () => {
    const pieces: string[] = [];
    const r = await run(
      ["parse", "-"],
      deps(enc.encode(bundle), (p) => void pieces.push(p)),
    );
    const whole = await run(["parse", "-"], {
      readFile: () => Promise.reject(new Error("unused")),
      readStdin: () => Promise.resolve(enc.encode(bundle)),
    });

    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toBe(""); // delivered through the sink, not held on the result
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(128 * 1024);
    expect(pieces.join("")).toBe(whole.stdout); // the same bytes as the whole-result path
    expect(r.stderr).toBe(whole.stderr);
  });

  it("--json output joins to the same compact text", async () => {
    const pieces: string[] = [];
    const r = await run(
      ["parse", "-", "--json"],
      deps(enc.encode(bundle), (p) => void pieces.push(p)),
    );
    const whole = await run(["parse", "-", "--json"], {
      readFile: () => Promise.reject(new Error("unused")),
      readStdin: () => Promise.resolve(enc.encode(bundle)),
    });
    expect(r.exit).toBe(EXIT.OK);
    expect(pieces.join("")).toBe(whole.stdout);
  });

  it("waits on the sink between pieces", async () => {
    const gate = deferred();
    const pieces: string[] = [];
    const running = run(
      ["parse", "-"],
      deps(enc.encode(bundle), (p) => {
        pieces.push(p);
        return pieces.length === 1 ? gate.promise : undefined;
      }),
    );
    await quiesce(() => pieces.length > 0);
    expect(pieces).toHaveLength(1);
    gate.resolve();
    const r = await running;
    expect(r.exit).toBe(EXIT.OK);
    expect(pieces.length).toBeGreaterThan(1);
  });

  it("a sink that fails part way resolves to the output failure, value-free", async () => {
    let calls = 0;
    const r = await run(
      ["parse", "-"],
      deps(enc.encode(bundle), () => {
        calls += 1;
        if (calls === 2) throw new Error("EPIPE zz-1");
      }),
    );
    expect(r.exit).toBe(EXIT.IOERR);
    expect(r.stderr).toContain("CLI_OUTPUT_WRITE_FAILED");
    expect(r.stderr).not.toContain("zz-1");
    expect(r.stdout).toBe("");
  });
});

describe("the NDJSON splitter copies a long line once, not once per chunk", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a 1 MiB line in 1 KiB chunks is copied about once", async () => {
    const line = Buffer.alloc(1024 * 1024, 0x61);
    async function* chunks(): AsyncGenerator<Uint8Array> {
      await Promise.resolve();
      for (let at = 0; at < line.length; at += 1024) yield line.subarray(at, at + 1024);
      yield enc.encode("\n");
    }
    const concat = vi.spyOn(Buffer, "concat");
    const out: Uint8Array[] = [];
    for await (const r of ndjsonRecords(chunks())) out.push(r);

    expect(out).toHaveLength(1);
    expect(out[0]?.length).toBe(line.length);
    const copied = concat.mock.results.reduce((n, r) => n + (r.value as Buffer).length, 0);
    expect(copied).toBeLessThanOrEqual(2 * line.length);
  });

  it("lines that start in one chunk and end in a later one come out whole and in order", async () => {
    // A blank line, a line of Unicode spaces only (no record), and a record after a leading space.
    const unicodeSpaces = String.fromCharCode(0xa0, 0x2028);
    const accented = ` ${String.fromCharCode(0xe9)}`;
    const text = `{"a":1}\r\n\n  \n${unicodeSpaces}\n{"b":"zz-2"}\n${accented}\n{"c":3}`;
    for (const size of [1, 2, 3, 5, 8, 64]) {
      const bytes = enc.encode(text);
      async function* chunks(): AsyncGenerator<Uint8Array> {
        await Promise.resolve();
        for (let at = 0; at < bytes.length; at += size) yield bytes.subarray(at, at + size);
      }
      const out: string[] = [];
      for await (const r of ndjsonRecords(chunks())) out.push(new TextDecoder().decode(r));
      expect(out).toEqual(['{"a":1}', '{"b":"zz-2"}', accented, '{"c":3}']);
    }
  });
});
