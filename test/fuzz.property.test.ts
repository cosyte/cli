import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { EXIT } from "../src/core/exit-codes.js";
import type { RunDeps } from "../src/core/io.js";
import { run } from "../src/core/run.js";
import { dispatchTool } from "../src/mcp/tools.js";

/**
 * CLI-7 release-hardening fuzz of the CLI's two input boundaries — the terminal (`run`, over the
 * argv + stdin byte stream) and the agent surface (`dispatchTool`, over a tool name + arguments).
 *
 * The bar (cli roadmap §6 "Fuzz — required, this is an input boundary"): arbitrary/adversarial argv
 * vectors and input bytes NEVER crash the CLI into an unhandled exception with a stack trace carrying
 * input. Every invocation degrades to a typed result with a documented exit code and a value-free
 * secondary channel — never a thrown Error, never a raw `at …` stack frame on stderr / in a tool's
 * text.
 *
 * The case count scales via `CLI_FUZZ_RUNS` so the nightly Fuzz workflow (`.github/workflows/fuzz.yml`)
 * runs the same properties at a far higher count than the per-PR gate. `pnpm test:fuzz` runs this file.
 */

const FUZZ_RUNS = Number(process.env["CLI_FUZZ_RUNS"] ?? "300");

/** The documented exit-code contract (`core/exit-codes.ts`) — every invocation must resolve to one. */
const EXIT_CODES = new Set<number>(Object.values(EXIT));

/** A Node stack-trace frame — `\n    at <fn> (<file>:<line>)`. None may ever reach a user channel. */
const STACK_FRAME = /\n\s+at\s/;

/** Feed the SAME fuzzed bytes to both a file read and a stdin read (the two ways input enters). */
function fuzzDeps(bytes: Uint8Array): RunDeps {
  return { readFile: () => Promise.resolve(bytes), readStdin: () => Promise.resolve(bytes) };
}

/** Tokens the argv arbitrary is built from: real commands/flags plus free-form adversarial strings. */
const ARGV_TOKENS = [
  "parse",
  "validate",
  "inspect",
  "fmt",
  "convert",
  "map-codes",
  "redact",
  "deid",
  "completion",
  "mcp",
  "-",
  "m.hl7",
  "p.json",
  "--format",
  "hl7",
  "fhir",
  "dicom",
  "x12",
  "ccda",
  "ncpdp",
  "astm",
  "mllp",
  "--json",
  "--ndjson",
  "--quiet",
  "--no-color",
  "--unsafe-show-values",
  "--to",
  "--code",
  "--system",
  "--help",
  "-h",
  "--version",
  "-V",
  "bash",
  "zsh",
  "fish",
];

const argvArb = fc.array(
  fc.oneof(fc.constantFrom(...ARGV_TOKENS), fc.string(), fc.string({ unit: "binary" })),
  { maxLength: 8 },
);

describe("fuzz — the argv + stdin boundary never throws and never leaks a stack trace", () => {
  it("run() over arbitrary argv and input bytes always resolves to a documented, value-free result", async () => {
    await fc.assert(
      fc.asyncProperty(argvArb, fc.uint8Array({ maxLength: 512 }), async (argv, bytes) => {
        const r = await run([...argv], fuzzDeps(bytes));
        // A well-formed RunResult with a documented exit code — never an unhandled throw.
        expect(typeof r.stdout).toBe("string");
        expect(typeof r.stderr).toBe("string");
        expect(EXIT_CODES.has(r.exit)).toBe(true);
        // The secondary channel never carries a raw stack frame (which could embed input).
        expect(STACK_FRAME.test(r.stderr)).toBe(false);
      }),
      { numRuns: FUZZ_RUNS },
    );
  });

  it("run() with well-formed text piped as stdin still never throws for any command token", async () => {
    const texts = [
      "MSH|^~\\&|A|B|C|D|20240101||ADT^A01|1|P|2.5\r",
      '{"resourceType":"Patient","id":"x"}',
      "ISA*00*          *00*          *ZZ*S",
      "not a healthcare message at all",
      "",
    ];
    await fc.assert(
      fc.asyncProperty(argvArb, fc.constantFrom(...texts), async (argv, text) => {
        const r = await run([...argv], fuzzDeps(new TextEncoder().encode(text)));
        expect(EXIT_CODES.has(r.exit)).toBe(true);
        expect(STACK_FRAME.test(r.stderr)).toBe(false);
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});

describe("fuzz — the MCP tool boundary never throws and never leaks a stack trace", () => {
  const toolNames = [
    "parse",
    "validate",
    "inspect",
    "convert",
    "redact",
    "map-codes",
    "",
    "unknown",
  ];

  it("dispatchTool() over arbitrary names and arguments always resolves value-free", async () => {
    const argsArb = fc.record(
      {
        content: fc.oneof(fc.string(), fc.string({ unit: "binary" }), fc.constant(undefined)),
        format: fc.oneof(fc.string(), fc.constant(undefined)),
        to: fc.oneof(fc.constantFrom("fhir", "hl7"), fc.string(), fc.constant(undefined)),
      },
      { requiredKeys: [] },
    );

    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...toolNames), argsArb, async (name, args) => {
        const r = await dispatchTool(name, args);
        // Structurally an MCP CallToolResult with value-free metadata — never a thrown Error.
        expect(typeof r.isError).toBe("boolean");
        expect(Array.isArray(r.content)).toBe(true);
        expect(EXIT_CODES.has(r.structuredContent.exit)).toBe(true);
        for (const block of r.content) {
          expect(STACK_FRAME.test(block.text)).toBe(false);
        }
      }),
      { numRuns: FUZZ_RUNS },
    );
  });
});
