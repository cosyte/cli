import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadDeidDelegate, type DeidCoveredFormat } from "../src/core/deid.js";
import { EXIT } from "../src/core/exit-codes.js";
import type { RunDeps } from "../src/core/io.js";
import { run } from "../src/core/run.js";

/**
 * `redact` per format: what the delegated de-identifier covers, and what it refuses.
 *
 * A covered format gets a real de-identified document on **stdout** and the delegate's own value-free
 * manifest on stderr. Everything else is a typed, value-free refusal with **empty stdout**, and the
 * two refusals are deliberately distinct: a format the library ships no adapter for is an unavailable
 * capability (`69`), while DICOM is a format the library *does* cover and the **CLI** cannot carry, so
 * it is the CLI's own unsupported (format, operation) cell (`65`).
 *
 * The sentinel assertions are the point of the whole command: every planted identifier the fixture
 * carries must be gone from the output. Each case first proves the fixture actually carries the
 * sentinels it claims to, so a fixture that quietly lost them cannot pass this vacuously.
 */

const FIXTURES = join(import.meta.dirname, "__fixtures__");
const FIX = (name: string): Uint8Array => readFileSync(join(FIXTURES, name));
const enc = new TextEncoder();

/** Every sentinel identifier planted across the fixtures (the PHI-leak matrix's own vocabulary). */
const SENTINELS = [
  "ZZSENTINELLAST",
  "ZZSENTINELFIRST",
  "MRN-000123",
  "123 SYNTHETIC ST",
  "METROPOLIS",
  "19800101",
  "1980-01-01",
];

function deps(bytes: Uint8Array): RunDeps {
  return { readFile: () => Promise.resolve(bytes), readStdin: () => Promise.resolve(bytes) };
}

/** A VT/FS-framed MLLP frame wrapping the sentinel-bearing HL7 fixture. */
const MLLP = new Uint8Array([0x0b, ...FIX("adt-a01.hl7"), 0x1c, 0x0d]);

interface Covered {
  readonly format: DeidCoveredFormat;
  readonly fixture: string;
  readonly bytes: Uint8Array;
}

const COVERED: readonly Covered[] = [
  { format: "hl7", fixture: "adt-a01.hl7", bytes: FIX("adt-a01.hl7") },
  { format: "fhir", fixture: "patient.fhir.json", bytes: FIX("patient.fhir.json") },
  { format: "x12", fixture: "834-enrollee.edi", bytes: FIX("834-enrollee.edi") },
  { format: "ccda", fixture: "ccd.xml", bytes: FIX("ccd.xml") },
];

describe("redact over a covered format: a de-identified document + the delegate's manifest", () => {
  for (const c of COVERED) {
    it(`${c.format}: exits 0 and writes a document that re-parses as ${c.format}`, async () => {
      const r = await run(["redact", c.fixture], deps(c.bytes));
      expect(r.exit).toBe(EXIT.OK);
      expect(r.stdout.length).toBeGreaterThan(0);

      // The data channel really is a document of the same format: re-serialize it through the
      // wrapped parser, which rejects anything it cannot parse.
      const round = await run(
        ["fmt", "out", "--format", c.format],
        deps(enc.encode(r.stdout.trimEnd())),
      );
      expect(round.exit, `redacted ${c.format} must re-parse: ${round.stderr}`).toBe(EXIT.OK);
    });

    it(`${c.format}: stderr carries one value-free record per manifest entry`, async () => {
      // Ask the delegate directly for the manifest this input produces, then hold the command's
      // stderr to it entry by entry. The manifest is value-free by the delegate's contract (its
      // locus is a path), which is what lets it go on the diagnostic channel at all.
      const delegate = await loadDeidDelegate();
      const { manifest } = await delegate.redact(c.format, c.bytes);
      expect(manifest.length).toBeGreaterThan(0);

      const r = await run(["redact", c.fixture], deps(c.bytes));
      const entryLines = r.stderr
        .split("\n")
        .filter((l) => l.startsWith("cosyte: redact: ") && / x\d+ /.test(l));
      expect(entryLines.length).toBe(manifest.length);

      for (const [i, entry] of manifest.entries()) {
        const line = entryLines[i] ?? "";
        expect(line).toContain(entry.category);
        expect(line).toContain(entry.transform);
        expect(line).toContain(entry.locus);
        expect(line).toContain(`x${String(entry.count)}`);
        expect(line).toContain(entry.disposition);
        expect(line).toContain(entry.code);
      }
    });

    it(`${c.format}: no planted sentinel survives onto stdout`, async () => {
      const text = Buffer.from(c.bytes).toString("utf8");
      const planted = SENTINELS.filter((s) => text.includes(s));
      // Non-vacuity: a fixture that stopped carrying identifiers cannot pass this by having none.
      expect(planted.length).toBeGreaterThan(0);

      const r = await run(["redact", c.fixture], deps(c.bytes));
      expect(r.exit).toBe(EXIT.OK);
      for (const s of planted) expect(r.stdout).not.toContain(s);
    });
  }

  it("the covered set is exactly hl7, fhir, x12 and ccda", () => {
    expect(COVERED.map((c) => c.format).sort()).toStrictEqual(["ccda", "fhir", "hl7", "x12"]);
  });
});

describe("redact over a format the de-identifier has no adapter for: 69, nothing emitted", () => {
  const cases: { name: string; argv: string[]; bytes: Uint8Array }[] = [
    { name: "astm", argv: ["redact", "r.astm"], bytes: FIX("patient.astm") },
    { name: "ncpdp (SCRIPT)", argv: ["redact", "rx.xml"], bytes: FIX("newrx.xml") },
    { name: "mllp", argv: ["redact", "s.mllp", "--format", "mllp"], bytes: MLLP },
  ];

  for (const c of cases) {
    it(`${c.name}: exits 69 with CLI_NOT_IMPLEMENTED and empty stdout`, async () => {
      const r = await run(c.argv, deps(c.bytes));
      expect(r.exit).toBe(EXIT.UNAVAILABLE);
      expect(r.exit).toBe(69);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain("CLI_NOT_IMPLEMENTED");
    });

    it(`${c.name}: no byte of the input reaches either channel`, async () => {
      const r = await run(c.argv, deps(c.bytes));
      // Every run of >= 6 printable characters in the fixture: none may appear in a diagnostic.
      const text = Buffer.from(c.bytes).toString("utf8");
      const tokens = [...text.matchAll(/[A-Za-z0-9]{6,}/g)].map((m) => m[0]);
      expect(tokens.length).toBeGreaterThan(0);
      for (const t of tokens) expect(r.stderr).not.toContain(t);
      expect(r.stdout).toBe("");
    });
  }
});

describe("redact over a format this CLI cannot serialize: 65, the CLI's own limit", () => {
  it("dicom exits 65 with CLI_FORMAT_UNSUPPORTED and empty stdout", async () => {
    const r = await run(["redact", "sample.dcm"], deps(FIX("sample.dcm")));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.exit).toBe(65);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("CLI_FORMAT_UNSUPPORTED");
  });

  it("dicom's refusal blames the CLI's channel, not the delegated library", async () => {
    const r = await run(["redact", "sample.dcm"], deps(FIX("sample.dcm")));
    expect(r.stderr).not.toContain("CLI_NOT_IMPLEMENTED");
    expect(r.stderr).toMatch(/output channel/);
  });

  it("no byte of the dicom fixture reaches a diagnostic", async () => {
    const r = await run(["redact", "sample.dcm"], deps(FIX("sample.dcm")));
    const text = Buffer.from(FIX("sample.dcm")).toString("latin1");
    const tokens = [...text.matchAll(/[A-Za-z0-9]{6,}/g)].map((m) => m[0]);
    expect(tokens.length).toBeGreaterThan(0);
    for (const t of tokens) expect(r.stderr).not.toContain(t);
  });
});
