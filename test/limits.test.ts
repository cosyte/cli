import { constants as bufferConstants } from "node:buffer";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterAll, describe, expect, it } from "vitest";

import { CliError } from "../src/core/diagnostics.js";
import { EXIT } from "../src/core/exit-codes.js";
import { fileChunks, readFileBytes, readStreamBytes, streamChunks } from "../src/core/io.js";
import { describeByteLimit, inputTooLargeError, MAX_INPUT_BYTES } from "../src/core/limits.js";
import { collectChunks, oneChunk, withinLimit } from "../src/core/records.js";

/**
 * The CLI's own input-size ceiling: where it sits relative to the platform's, how it is stated, and
 * that it is enforced against the **running total** as input arrives rather than after an oversized
 * input has been assembled. The last property is the whole point: a check that runs only after the
 * bytes are in memory cannot stop the platform allocation failure it exists to pre-empt.
 */

const dir = mkdtempSync(join(tmpdir(), "cosyte-cli-limits-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A chunk source that would produce `total` bytes, and records how many it was actually asked for. */
function countedSource(
  total: number,
  chunkSize: number,
): { chunks: () => AsyncGenerator<Uint8Array>; produced: () => number } {
  let produced = 0;
  const filler = Buffer.alloc(chunkSize, 0x61);
  async function* chunks(): AsyncGenerator<Uint8Array> {
    await Promise.resolve();
    while (produced < total) {
      const size = Math.min(chunkSize, total - produced);
      produced += size;
      yield size === chunkSize ? filler : filler.subarray(0, size);
    }
  }
  return { chunks, produced: () => produced };
}

describe("the documented limit sits below the platform's own ceilings", () => {
  it("is strictly less than the smaller ceiling (MAX_STRING_LENGTH)", () => {
    expect(MAX_INPUT_BYTES).toBeLessThan(bufferConstants.MAX_STRING_LENGTH);
    expect(MAX_INPUT_BYTES).toBeLessThan(bufferConstants.MAX_LENGTH);
    expect(bufferConstants.MAX_STRING_LENGTH).toBeLessThanOrEqual(bufferConstants.MAX_LENGTH);
  });

  it("is a concrete number of bytes, stated with an explicit byte-based unit", () => {
    expect(Number.isInteger(MAX_INPUT_BYTES)).toBe(true);
    expect(describeByteLimit()).toBe("67108864 bytes (64 MiB)");
    expect(describeByteLimit()).toMatch(/\b\d+ bytes\b/);
    expect(describeByteLimit(1000)).toBe("1000 bytes");
  });

  it("the refusal is a value-free data error naming the limit, never the internal-error code", () => {
    const e = inputTooLargeError();
    expect(e.code).toBe("CLI_INPUT_TOO_LARGE");
    expect(e.exit).toBe(EXIT.DATAERR);
    expect(e.exit).not.toBe(EXIT.SOFTWARE);
    expect(e.message).toContain(describeByteLimit());
  });
});

describe("withinLimit: the count runs as the input arrives", () => {
  it("passes a stream that stays under the limit through unchanged", async () => {
    const bytes = new TextEncoder().encode("MSH|^~\\&|");
    const out = await collectChunks(withinLimit(oneChunk(bytes), 1024));
    expect(new TextDecoder().decode(out)).toBe("MSH|^~\\&|");
  });

  it("refuses at limit + 1 byte with the value-free data error", async () => {
    const bytes = new Uint8Array(65);
    await expect(collectChunks(withinLimit(oneChunk(bytes), 64))).rejects.toMatchObject({
      code: "CLI_INPUT_TOO_LARGE",
      exit: EXIT.DATAERR,
    });
  });

  it("accepts exactly the limit", async () => {
    const bytes = new Uint8Array(64);
    expect((await collectChunks(withinLimit(oneChunk(bytes), 64))).length).toBe(64);
  });

  it("stops pulling the source the moment the total crosses: never drains a huge input", async () => {
    // The source would produce more bytes than a single string can hold, which is the failure mode
    // this limit exists to pre-empt: assembling it first and checking afterwards is exactly what a
    // post-hoc check does, and it cannot get here. 8 MiB chunks, one refusal, nothing near the ceiling.
    const chunkSize = 8 * 1024 * 1024;
    const src = countedSource(bufferConstants.MAX_STRING_LENGTH + chunkSize, chunkSize);
    await expect(collectChunks(withinLimit(src.chunks(), MAX_INPUT_BYTES))).rejects.toMatchObject({
      code: "CLI_INPUT_TOO_LARGE",
    });
    expect(src.produced()).toBeLessThanOrEqual(MAX_INPUT_BYTES + chunkSize);
    expect(src.produced()).toBeLessThan(bufferConstants.MAX_STRING_LENGTH);
  }, 30_000);
});

describe("readStreamBytes: the same running count on the whole-input reader", () => {
  it("refuses a stream past the limit without concatenating it", async () => {
    const stream = Readable.from([Buffer.alloc(40), Buffer.alloc(40)]);
    await expect(readStreamBytes(stream, 64)).rejects.toMatchObject({
      code: "CLI_INPUT_TOO_LARGE",
      exit: EXIT.DATAERR,
    });
  });

  it("still returns a stream that fits", async () => {
    const bytes = await readStreamBytes(Readable.from([Buffer.from("MS"), Buffer.from("H|")]), 64);
    expect(new TextDecoder().decode(bytes)).toBe("MSH|");
  });
});

describe("readFileBytes: an oversized file is refused before it is read", () => {
  it("refuses a file whose size already exceeds the limit", async () => {
    const p = join(dir, "big.txt");
    writeFileSync(p, "x".repeat(200));
    await expect(readFileBytes(p, 100)).rejects.toMatchObject({
      code: "CLI_INPUT_TOO_LARGE",
      exit: EXIT.DATAERR,
    });
  });

  it("reads a file that fits", async () => {
    const p = join(dir, "small.txt");
    writeFileSync(p, "MSH|");
    expect(new TextDecoder().decode(await readFileBytes(p, 100))).toBe("MSH|");
  });

  it("keeps the value-free no-input error for a missing file", async () => {
    await expect(readFileBytes(join(dir, "nope.txt"), 100)).rejects.toMatchObject({
      code: "CLI_NO_INPUT",
      exit: EXIT.NOINPUT,
    });
  });
});

describe("chunk readers", () => {
  it("fileChunks streams a file's bytes", async () => {
    const p = join(dir, "chunked.txt");
    writeFileSync(p, "MSH|^~\\&|A|B\r");
    const out = await collectChunks(fileChunks(p));
    expect(new TextDecoder().decode(out)).toBe("MSH|^~\\&|A|B\r");
  });

  it("fileChunks raises the value-free CLI_NO_INPUT for a missing file", async () => {
    await expect(collectChunks(fileChunks(join(dir, "gone.txt")))).rejects.toBeInstanceOf(CliError);
    await expect(collectChunks(fileChunks(join(dir, "gone.txt")))).rejects.toMatchObject({
      code: "CLI_NO_INPUT",
    });
  });

  it("fileChunks raises CLI_NO_INPUT for a directory (openable, unreadable as a file)", async () => {
    await expect(collectChunks(fileChunks(dir))).rejects.toMatchObject({ code: "CLI_NO_INPUT" });
  });

  it("streamChunks yields each chunk as it arrives, encoding string chunks as utf-8", async () => {
    const sizes: number[] = [];
    for await (const chunk of streamChunks(Readable.from([Buffer.from("MS"), "H|"]))) {
      sizes.push(chunk.length);
    }
    expect(sizes).toStrictEqual([2, 2]);
  });

  it("oneChunk yields nothing for empty input", async () => {
    const seen: number[] = [];
    for await (const chunk of oneChunk(new Uint8Array())) seen.push(chunk.length);
    expect(seen).toStrictEqual([]);
  });
});
