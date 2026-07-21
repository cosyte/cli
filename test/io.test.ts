import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterAll, describe, expect, it } from "vitest";

import { readFileBytes, readStreamBytes } from "../src/core/io.js";
import { CliError } from "../src/core/diagnostics.js";
import { EXIT } from "../src/core/exit-codes.js";

const dir = mkdtempSync(join(tmpdir(), "cosyte-cli-io-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("readFileBytes", () => {
  it("reads a file's bytes", async () => {
    const p = join(dir, "in.txt");
    writeFileSync(p, "MSH|^~\\&|");
    const bytes = await readFileBytes(p);
    expect(new TextDecoder().decode(bytes)).toBe("MSH|^~\\&|");
  });

  it("raises a value-free CLI_NO_INPUT (exit 66) for a missing file", async () => {
    await expect(readFileBytes(join(dir, "nope.txt"))).rejects.toMatchObject({
      code: "CLI_NO_INPUT",
      exit: EXIT.NOINPUT,
    });
  });

  it("raises CLI_NO_INPUT for a directory (unreadable as a file)", async () => {
    await expect(readFileBytes(dir)).rejects.toBeInstanceOf(CliError);
  });
});

describe("readStreamBytes", () => {
  it("drains a stream of Buffers", async () => {
    const bytes = await readStreamBytes(Readable.from([Buffer.from("MS"), Buffer.from("H|")]));
    expect(new TextDecoder().decode(bytes)).toBe("MSH|");
  });

  it("encodes string chunks as utf-8", async () => {
    const bytes = await readStreamBytes(Readable.from(["café"]));
    expect(new TextDecoder().decode(bytes)).toBe("café");
  });

  it("returns empty bytes for an empty stream", async () => {
    const bytes = await readStreamBytes(Readable.from([]));
    expect(bytes.length).toBe(0);
  });
});
