import { constants as bufferConstants } from "node:buffer";

import { describe, expect, it } from "vitest";

import { EXIT } from "../src/core/exit-codes.js";
import type { RunDeps } from "../src/core/io.js";
import { describeByteLimit, MAX_INPUT_BYTES } from "../src/core/limits.js";
import { oneChunk } from "../src/core/records.js";
import { run } from "../src/core/run.js";

/**
 * Bulk input for `cosyte parse`: an input past the documented size limit is a value-free refusal
 * naming the limit and a **data error**, never the internal-error code; and a multi-record input
 * (`--ndjson`, or MLLP frames) emits each record's line **as it is parsed**, before the rest of the
 * input has been read.
 *
 * The refusal is checked on all three input shapes independently, at the real documented limit, with
 * sources that would run past the platform's own string ceiling if anything here drained them.
 */

const enc = new TextEncoder();
const CHUNK = 8 * 1024 * 1024;

/** A VT/FS-framed MLLP frame around an HL7 payload. */
const frame = (hl7: string): number[] => [0x0b, ...enc.encode(hl7), 0x1c, 0x0d];
const HL7_MSG = "MSH|^~\\&|A|B|C|D|20240101||ADT^A01|1|P|2.5\rPID|1||123^^^HOSP\r";
const HL7_HEAD = "MSH|^~\\&|A|B|C|D|20240101||ADT^A01|1|P|2.5\r";
const FHIR_RECORD = '{"resourceType":"Patient","id":"ZZSENTINELBULK"}';

/**
 * A chunk source that opens with `lead` and then pads with filler until it would have produced
 * `total` bytes, counting what it was actually asked for. `total` is past
 * `buffer.constants.MAX_STRING_LENGTH`, so an implementation that read the whole input before
 * checking its size would fail on the platform's ceiling instead of refusing on the CLI's limit.
 */
function overLimitSource(
  lead: Uint8Array,
  total: number = bufferConstants.MAX_STRING_LENGTH + CHUNK,
): { open: () => AsyncGenerator<Uint8Array>; produced: () => number } {
  let produced = 0;
  const filler = Buffer.alloc(CHUNK, 0x61);
  async function* open(): AsyncGenerator<Uint8Array> {
    await Promise.resolve();
    const first = Buffer.concat([Buffer.from(lead), filler.subarray(0, CHUNK - lead.length)]);
    produced += first.length;
    yield first;
    while (produced < total) {
      produced += CHUNK;
      yield filler;
    }
  }
  return { open, produced: () => produced };
}

/** Deps whose stdin is a chunk stream; the whole-input readers reject, proving they are unused. */
function chunkDeps(open: () => AsyncIterable<Uint8Array>, sink?: (chunk: string) => void): RunDeps {
  const base = {
    readFile: () => Promise.reject(new Error("the whole-input reader must not be used here")),
    readStdin: () => Promise.reject(new Error("the whole-input reader must not be used here")),
    openStdin: open,
  };
  return sink === undefined ? base : { ...base, writeStdout: sink };
}

/** A promise plus its resolver, for holding an input open until the output has been observed. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Resolve to `marker` if `promise` has not settled within `ms`, without leaving a timer behind. */
async function within<T>(promise: Promise<T>, ms: number, marker: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(marker), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

describe("an input past the documented limit is refused, value-free, as a data error", () => {
  it("a single message: exit 65 naming the limit, never exit 70, never a byte of the input", async () => {
    const src = overLimitSource(enc.encode(HL7_HEAD));
    const r = await run(["parse", "-"], chunkDeps(src.open));

    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.exit).not.toBe(EXIT.SOFTWARE);
    expect(r.stderr).toContain("CLI_INPUT_TOO_LARGE");
    expect(r.stderr).toContain(describeByteLimit());
    expect(r.stderr).not.toContain("MSH");
    expect(r.stderr).not.toContain("aaa");
    expect(r.stdout).toBe("");
    // The refusal arrived while the input was still arriving: the source was never drained.
    expect(src.produced()).toBeLessThanOrEqual(MAX_INPUT_BYTES + CHUNK);
    expect(src.produced()).toBeLessThan(bufferConstants.MAX_STRING_LENGTH);
  }, 30_000);

  it("an --ndjson input: exit 65 naming the limit, after the records that did parse", async () => {
    const src = overLimitSource(enc.encode(`${FHIR_RECORD}\n`));
    const r = await run(["parse", "-", "--ndjson"], chunkDeps(src.open));

    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.exit).not.toBe(EXIT.SOFTWARE);
    expect(r.stderr).toContain("CLI_INPUT_TOO_LARGE");
    expect(r.stderr).toContain(describeByteLimit());
    expect(r.stderr).not.toContain("ZZSENTINELBULK");
    // The one complete record reached the data channel before the refusal; the exit code, not the
    // output, says the run did not complete.
    expect(r.stdout.trim().split("\n")).toHaveLength(1);
    expect(src.produced()).toBeLessThanOrEqual(MAX_INPUT_BYTES + CHUNK);
    expect(src.produced()).toBeLessThan(bufferConstants.MAX_STRING_LENGTH);
  }, 30_000);

  it("an MLLP input: exit 65 naming the limit, after the frames that did complete", async () => {
    // One complete frame, then a frame that opens and never closes: the stream runs past the limit.
    const src = overLimitSource(new Uint8Array([...frame(HL7_MSG), 0x0b]));
    const r = await run(["parse", "-"], chunkDeps(src.open));

    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.exit).not.toBe(EXIT.SOFTWARE);
    expect(r.stderr).toContain("CLI_INPUT_TOO_LARGE");
    expect(r.stderr).toContain(describeByteLimit());
    expect(r.stderr).not.toContain("MSH");
    expect(r.stdout.trim().split("\n")).toHaveLength(1);
    expect(src.produced()).toBeLessThanOrEqual(MAX_INPUT_BYTES + CHUNK);
    expect(src.produced()).toBeLessThan(bufferConstants.MAX_STRING_LENGTH);
  }, 30_000);

  it("a whole-input reader handing over exactly the limit plus one byte is refused too", async () => {
    const bytes = Buffer.alloc(MAX_INPUT_BYTES + 1, 0x61);
    bytes.write(HL7_HEAD, 0, "utf-8");
    const r = await run(["parse", "big.hl7"], {
      readFile: () => Promise.resolve(bytes),
      readStdin: () => Promise.resolve(new Uint8Array()),
    });

    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.exit).not.toBe(EXIT.SOFTWARE);
    expect(r.stderr).toContain("CLI_INPUT_TOO_LARGE");
    expect(r.stderr).toContain(describeByteLimit());
  }, 30_000);

  it("an input under the limit is never refused for its size (the negative control)", async () => {
    // The same input shape, well under the ceiling: nothing about it triggers the refusal, so the
    // assertions above are about the size and not about the shape of the fixture.
    const bytes = Buffer.alloc(1024, 0x61);
    bytes.write(HL7_HEAD, 0, "utf-8");
    const r = await run(["parse", "small.hl7"], {
      readFile: () => Promise.resolve(bytes),
      readStdin: () => Promise.resolve(new Uint8Array()),
    });
    expect(r.stderr).not.toContain("CLI_INPUT_TOO_LARGE");
    expect(r.exit).toBe(EXIT.OK);
  });
});

describe("multi-record output is emitted before the whole input has been read", () => {
  it("--ndjson: the first record's line lands while the rest of the input is still withheld", async () => {
    const gate = deferred<void>();
    const firstLine = deferred<string>();
    const lines: string[] = [];
    let drained = false;

    async function* source(): AsyncGenerator<Uint8Array> {
      yield enc.encode(`{"resourceType":"Patient","id":"one"}\n`);
      await gate.promise; // the remainder of the input never arrives until the output is observed
      yield enc.encode(`{"resourceType":"Patient","id":"two"}\n`);
      drained = true;
    }

    const running = run(
      ["parse", "-", "--ndjson", "--format", "fhir"],
      chunkDeps(source, (chunk) => {
        lines.push(chunk);
        if (lines.length === 1) firstLine.resolve(chunk);
      }),
    );

    const first = await within(firstLine.promise, 2_000, "NEVER ARRIVED");
    expect(first).not.toBe("NEVER ARRIVED");
    expect(JSON.parse(first) as { record: number }).toMatchObject({ record: 0 });
    expect(drained).toBe(false); // a read-it-all-then-emit implementation cannot reach this line

    gate.resolve();
    const r = await running;
    expect(r.exit).toBe(EXIT.OK);
    expect(lines).toHaveLength(2);
    expect(r.stdout).toBe(""); // the output went to the sink as it was produced, not into the result
    expect(drained).toBe(true);
  });

  it("MLLP: the first frame's line lands while the rest of the stream is still withheld", async () => {
    const gate = deferred<void>();
    const firstLine = deferred<string>();
    const lines: string[] = [];
    let drained = false;

    async function* source(): AsyncGenerator<Uint8Array> {
      yield new Uint8Array(frame(HL7_MSG));
      await gate.promise;
      yield new Uint8Array(frame(HL7_MSG));
      drained = true;
    }

    const running = run(
      ["parse", "-", "--format", "mllp"],
      chunkDeps(source, (chunk) => {
        lines.push(chunk);
        if (lines.length === 1) firstLine.resolve(chunk);
      }),
    );

    const first = await within(firstLine.promise, 2_000, "NEVER ARRIVED");
    expect(first).not.toBe("NEVER ARRIVED");
    expect(JSON.parse(first) as { record: number; format: string }).toMatchObject({
      record: 0,
      format: "hl7",
    });
    expect(drained).toBe(false);

    gate.resolve();
    const r = await running;
    expect(r.exit).toBe(EXIT.OK);
    expect(lines).toHaveLength(2);
  });

  it("a record split across two chunks is still one record", async () => {
    const lines: string[] = [];
    async function* source(): AsyncGenerator<Uint8Array> {
      await Promise.resolve();
      yield enc.encode('{"resourceType":"Pat');
      yield enc.encode('ient","id":"split"}\n{"resourceType":"Patient","id":"b"}');
    }
    const r = await run(
      ["parse", "-", "--ndjson", "--format", "fhir"],
      chunkDeps(source, (chunk) => lines.push(chunk)),
    );
    expect(r.exit).toBe(EXIT.OK);
    expect(lines).toHaveLength(2);
    expect(lines.join("")).toContain('"split"');
  });
});

describe("a fatal condition part way through never resolves to OK", () => {
  it("keeps the emitted lines and exits with the failing record stream's own code", async () => {
    // Three good records, then a frame that opens and never closes: a truncated stream, detected at
    // the end, after three lines have already been written.
    const lines: string[] = [];
    async function* source(): AsyncGenerator<Uint8Array> {
      await Promise.resolve();
      yield new Uint8Array([...frame(HL7_MSG), ...frame(HL7_MSG), ...frame(HL7_MSG), 0x0b]);
      yield enc.encode("MSH|^~\\&|C|D\r");
    }
    const r = await run(
      ["parse", "-"],
      chunkDeps(source, (chunk) => lines.push(chunk)),
    );

    expect(lines).toHaveLength(3);
    expect(r.exit).not.toBe(EXIT.OK);
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain("CLI_PARSE_FAILED");
    expect(r.stderr).not.toContain("MSH");
  });

  it("a downstream consumer closing the pipe ends the stream with a value-free write failure", async () => {
    const lines: string[] = [];
    async function* source(): AsyncGenerator<Uint8Array> {
      await Promise.resolve();
      for (let i = 0; i < 5; i += 1) yield enc.encode(`{"resourceType":"Patient","id":"p"}\n`);
    }
    const r = await run(
      ["parse", "-", "--ndjson", "--format", "fhir"],
      chunkDeps(source, (chunk) => {
        lines.push(chunk);
        if (lines.length >= 2) throw new Error("EPIPE");
      }),
    );

    expect(lines).toHaveLength(2);
    expect(r.exit).not.toBe(EXIT.OK);
    expect(r.stderr).toContain("CLI_OUTPUT_WRITE_FAILED");
    expect(r.stderr).not.toContain("EPIPE");
    expect(r.stderr).not.toContain("resourceType");
  });
});

describe("per-record isolation survives incremental emission", () => {
  it("a bad record among good ones gets its own value-free line, and the run exits 65", async () => {
    const lines: string[] = [];
    async function* source(): AsyncGenerator<Uint8Array> {
      await Promise.resolve();
      yield enc.encode(
        `{"resourceType":"Patient","id":"a"}\n` +
          `{ not json ZZSENTINELBAD\n` +
          `{"resourceType":"Patient","id":"c"}\n`,
      );
    }
    const r = await run(
      ["parse", "-", "--ndjson", "--format", "fhir"],
      chunkDeps(source, (chunk) => lines.push(chunk)),
    );

    expect(lines).toHaveLength(3);
    expect(r.exit).toBe(EXIT.DATAERR);
    const parsed = lines.map((l) => JSON.parse(l) as { record: number; error?: string });
    expect(parsed.map((p) => p.record)).toStrictEqual([0, 1, 2]);
    expect(parsed[1]?.error).toBeDefined();
    expect(parsed[0]?.error).toBeUndefined();
    expect(lines.join("")).not.toContain("ZZSENTINELBAD");
    expect(r.stderr).not.toContain("ZZSENTINELBAD");
    expect(r.stderr).toContain("1 failed");
  });

  it("blank lines carry no record and are skipped, not failed", async () => {
    const lines: string[] = [];
    async function* source(): AsyncGenerator<Uint8Array> {
      await Promise.resolve();
      yield enc.encode(`{"resourceType":"Patient","id":"a"}\n\n   \n{"resourceType":"Patient"}\n`);
    }
    const r = await run(
      ["parse", "-", "--ndjson", "--format", "fhir"],
      chunkDeps(source, (chunk) => lines.push(chunk)),
    );
    expect(r.exit).toBe(EXIT.OK);
    expect(lines).toHaveLength(2);
  });
});

describe("an input that frames no record at all is a data error, never a silent success", () => {
  it("zero bytes is the empty-input data error", async () => {
    const source = (): AsyncGenerator<Uint8Array> => oneChunk(new Uint8Array());
    const r = await run(["parse", "-", "--ndjson", "--format", "fhir"], chunkDeps(source));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.exit).not.toBe(EXIT.OK);
    expect(r.stderr).toContain("CLI_EMPTY_INPUT");
  });

  it("whitespace that frames no --ndjson record is a data error", async () => {
    const lines: string[] = [];
    async function* source(): AsyncGenerator<Uint8Array> {
      await Promise.resolve();
      yield enc.encode("\n \n\n");
    }
    const r = await run(
      ["parse", "-", "--ndjson", "--format", "fhir"],
      chunkDeps(source, (chunk) => lines.push(chunk)),
    );
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.exit).not.toBe(EXIT.OK);
    expect(r.stderr).toContain("CLI_PARSE_FAILED");
    expect(lines).toHaveLength(0);
  });

  it("an MLLP stream with no frame in it is a data error", async () => {
    async function* source(): AsyncGenerator<Uint8Array> {
      await Promise.resolve();
      yield new Uint8Array([0x1c, 0x0d]);
    }
    const r = await run(["parse", "-", "--format", "mllp"], chunkDeps(source));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.exit).not.toBe(EXIT.OK);
    expect(r.stderr).toContain("CLI_PARSE_FAILED");
  });
});
