import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type * as Terminology from "@cosyte/terminology";
import { describe, expect, it, vi } from "vitest";

import { mapCodesCommand } from "../src/commands/map-codes.js";
import { CLI_CODES } from "../src/core/diagnostics.js";
import { EXIT } from "../src/core/exit-codes.js";
import type { CosyteFormat } from "../src/core/format.js";
import type { RunDeps } from "../src/core/io.js";
import type * as Parsers from "../src/core/parsers.js";
import { run } from "../src/core/run.js";

/**
 * How each command behaves when a wrapped library is not there, or fails in a way it never
 * documented. Three seams are replaced for this file only:
 *
 * - Every `ncpdp` operation goes through the real `loadOptional` with an import that fails exactly
 *   as an absent optional package's does, so every command that needs it must answer
 *   `CLI_PARSER_UNAVAILABLE` (exit `69`), never a stack trace. (A `vi.mock` factory that throws is
 *   no use here: the test runner wraps its error, so it no longer looks like a missing package.)
 * - `@cosyte/x12` loads, but its parser throws a plain `Error` with no stable code: a defect inside
 *   the library. The command still answers `CLI_PARSE_FAILED` (exit `65`) without the message.
 * - `@cosyte/terminology` loads, but `loadConceptMap` throws a plain `TypeError` with no code. The
 *   map-codes refusal names no code it does not have, and echoes nothing of the message.
 *
 * Every input here is synthetic.
 */

/** A message no library error may carry onto stderr. */
const LIBRARY_DETAIL = "ZZLIBRARYDETAIL";

const mocks = vi.hoisted(() => ({
  /** The rejection Node's resolver gives for a package that is not installed. */
  moduleNotFound: (): Promise<never> => {
    const e = new Error("Cannot find package '@cosyte/ncpdp' imported from /app/dist/index.mjs");
    (e as NodeJS.ErrnoException).code = "ERR_MODULE_NOT_FOUND";
    return Promise.reject(e);
  },
  codeless: (): never => {
    throw new Error("ZZLIBRARYDETAIL");
  },
}));

vi.mock("../src/core/parsers.js", async (importOriginal) => {
  const real = await importOriginal<typeof Parsers>();
  const absent = (): Promise<never> => real.loadOptional("ncpdp", mocks.moduleNotFound);
  /** The real operation for every format but ncpdp, whose package is absent. */
  const route =
    <R>(op: (format: CosyteFormat, bytes: Uint8Array) => Promise<R>) =>
    (format: CosyteFormat, bytes: Uint8Array): Promise<R> =>
      format === "ncpdp" ? absent() : op(format, bytes);
  return {
    ...real,
    parseFormat: route(real.parseFormat),
    inspectFormat: route(real.inspectFormat),
    fmtFormat: route(real.fmtFormat),
    validateFormat: route(real.validateFormat),
  };
});
vi.mock("@cosyte/x12", () => ({ parseX12: mocks.codeless, serializeX12: mocks.codeless }));
vi.mock("@cosyte/terminology", async (importOriginal) => ({
  ...(await importOriginal<typeof Terminology>()),
  loadConceptMap: (): never => {
    throw new TypeError("ZZLIBRARYDETAIL");
  },
}));

const FIX = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

const deps = (bytes: Uint8Array): RunDeps => ({
  readFile: () => Promise.resolve(bytes),
  readStdin: () => Promise.resolve(bytes),
});

describe("an absent optional parser answers 69 from every command that needs it", () => {
  const SCRIPT = FIX("newrx.xml");

  for (const args of [
    ["parse", "m.xml"],
    ["parse", "m.xml", "--ndjson", "--format", "ncpdp"],
    ["fmt", "m.xml"],
    ["validate", "m.xml"],
    ["inspect", "m.xml"],
  ]) {
    it(args.join(" "), async () => {
      const r = await run(args, deps(SCRIPT));
      expect(r.exit).toBe(EXIT.UNAVAILABLE);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain(CLI_CODES.CLI_PARSER_UNAVAILABLE);
      expect(r.stderr).not.toMatch(/\s+at\s+\S+:\d+/);
    });
  }
});

describe("a parser that throws without a stable code is still a value-free data error", () => {
  const X12 = FIX("834.edi");

  it("parse and fmt answer CLI_PARSE_FAILED (65) with no code in parentheses", async () => {
    for (const command of ["parse", "fmt"]) {
      const r = await run([command, "m.edi"], deps(X12));
      expect(r.exit, command).toBe(EXIT.DATAERR);
      expect(r.stdout, command).toBe("");
      expect(r.stderr, command).toBe(
        `cosyte: ${CLI_CODES.CLI_PARSE_FAILED}: the x12 parser rejected the input\n`,
      );
    }
  });

  it("in a record stream, the failed record carries CLI_PARSE_FAILED and the stream goes on", async () => {
    const lines = new TextEncoder().encode("ISA*one\nISA*two\n");
    const r = await run(["parse", "-", "--ndjson", "--format", "x12"], deps(lines));
    expect(r.exit).toBe(EXIT.DATAERR);
    const records = r.stdout
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as unknown);
    expect(records).toStrictEqual([
      { record: 0, format: "x12", error: CLI_CODES.CLI_PARSE_FAILED },
      { record: 1, format: "x12", error: CLI_CODES.CLI_PARSE_FAILED },
    ]);
    expect(r.stderr).toContain("2 failed");
    expect(r.stderr).not.toContain(LIBRARY_DETAIL);
  });
});

describe("a ConceptMap loader that throws without a code", () => {
  it("is refused as CLI_MAP_INVALID (65), naming no code and echoing nothing", async () => {
    const r = await mapCodesCommand(
      ["map.json", "--system", "http://hl7.org/fhir/administrative-gender", "--code", "male"],
      deps(new TextEncoder().encode('{"resourceType":"ConceptMap"}')),
    );
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain(CLI_CODES.CLI_MAP_INVALID);
    expect(r.stderr).toContain("the supplied ConceptMap could not be loaded\n");
    expect(r.stderr).not.toContain("(");
    expect(r.stderr).not.toContain(LIBRARY_DETAIL);
  });
});
