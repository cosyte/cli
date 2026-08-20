import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CliError } from "../src/core/diagnostics.js";
import type { RunDeps } from "../src/core/io.js";
import { describeByteLimit, inputTooLargeError, MAX_INPUT_BYTES } from "../src/core/limits.js";
import { helpText, run } from "../src/core/run.js";

/**
 * The documented size limit is **one number, stated in three places**: the refusal a caller reads on
 * stderr, `cosyte --help`, and the published command reference.
 *
 * The help output is rendered from the constant the code enforces, so changing the constant changes
 * the help text with it (proved below by rendering a different limit). The command reference is a
 * static document, so this suite is what keeps it honest: move the constant without editing the
 * reference and these assertions red, in the same build, before the two can disagree in public.
 */

const REFERENCE = readFileSync(
  join(import.meta.dirname, "..", "docs-content", "reference-commands.md"),
  "utf-8",
);
const README = readFileSync(join(import.meta.dirname, "..", "README.md"), "utf-8");

const noDeps: RunDeps = {
  readFile: () => Promise.resolve(new Uint8Array()),
  readStdin: () => Promise.resolve(new Uint8Array()),
};

/** Every "<number> bytes" claim in a text, as numbers. */
function byteClaims(text: string): number[] {
  return [...text.matchAll(/(\d[\d,]*)\s*bytes/g)].map((m) => Number(m[1]?.replace(/,/g, "")));
}

describe("the limit is stated as a concrete number with an explicit byte-based unit", () => {
  it("on the refusal diagnostic", () => {
    const message = inputTooLargeError().message;
    expect(message).toMatch(/\b\d+ bytes\b/);
    expect(byteClaims(message)).toContain(MAX_INPUT_BYTES);
  });

  it("in the help output", async () => {
    const help = (await run(["--help"], noDeps)).stdout;
    expect(help).toMatch(/\b\d+ bytes\b/);
    expect(byteClaims(help)).toContain(MAX_INPUT_BYTES);
  });

  it("in the published command reference", () => {
    expect(REFERENCE).toMatch(/\b\d+ bytes\b/);
    expect(byteClaims(REFERENCE)).toContain(MAX_INPUT_BYTES);
  });
});

describe("the surfaces cannot disagree in one build", () => {
  it("the help output and the command reference state the same limit, and no other", async () => {
    const help = (await run(["--help"], noDeps)).stdout;
    expect(new Set(byteClaims(help))).toStrictEqual(new Set([MAX_INPUT_BYTES]));
    expect(new Set(byteClaims(REFERENCE))).toStrictEqual(new Set([MAX_INPUT_BYTES]));
    expect(new Set(byteClaims(README))).toStrictEqual(new Set([MAX_INPUT_BYTES]));
  });

  it("all three carry the same rendered limit text", async () => {
    const rendered = describeByteLimit();
    expect((await run(["--help"], noDeps)).stdout).toContain(rendered);
    expect(REFERENCE).toContain(rendered);
    expect(README).toContain(rendered);
    expect(inputTooLargeError().message).toContain(rendered);
  });

  it("changing the limit changes the help text: it is rendered, never typed in", () => {
    expect(helpText(1024)).toContain("1024 bytes");
    expect(helpText(1024)).not.toContain(describeByteLimit());
    expect(helpText()).toContain(describeByteLimit());
  });

  it("the refusal names whatever limit was applied", () => {
    const e: CliError = inputTooLargeError(4096);
    expect(e.message).toContain("4096 bytes");
    expect(e.code).toBe("CLI_INPUT_TOO_LARGE");
  });

  it("the help output names the refusal's code and its data-error exit code", async () => {
    const help = (await run(["--help"], noDeps)).stdout;
    expect(help).toContain("CLI_INPUT_TOO_LARGE");
    expect(help).toContain("65");
  });
});
