import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEID_BLOCKED, loadDeidDelegate, type DeidCoveredFormat } from "../src/core/deid.js";
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
 *
 * The HL7 clean input is `adt-a01-no-visit.hl7`: `adt-a01.hl7` with its PV1-19 visit number left
 * out. Under the delegate's default policy a visit number is blocked, so `adt-a01.hl7` itself is a
 * refusal, pinned in redact-blocked.test.ts.
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

/** The clean HL7 input: planted PID identifiers, the full MSH-7/EVN-2 timestamp, no visit number. */
const HL7_CLEAN = "adt-a01-no-visit.hl7";

const COVERED: readonly Covered[] = [
  { format: "hl7", fixture: HL7_CLEAN, bytes: FIX(HL7_CLEAN) },
  { format: "fhir", fixture: "patient.fhir.json", bytes: FIX("patient.fhir.json") },
  { format: "x12", fixture: "834-enrollee.edi", bytes: FIX("834-enrollee.edi") },
  { format: "ccda", fixture: "ccd.xml", bytes: FIX("ccd.xml") },
];

describe("redact over a covered format: a de-identified document + the delegate's manifest", () => {
  for (const c of COVERED) {
    // AC-7 (hl7), AC-11 (every covered format): exit 0 and a document that re-parses.
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

    // AC-7: exactly one stderr line per delegate manifest entry.
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

    // AC-8 (hl7), AC-11 (every covered format): no planted sentinel on either channel.
    it(`${c.format}: no planted sentinel survives onto either channel`, async () => {
      const text = Buffer.from(c.bytes).toString("utf8");
      const planted = SENTINELS.filter((s) => text.includes(s));
      // Non-vacuity: a fixture that stopped carrying identifiers cannot pass this by having none.
      expect(planted.length).toBeGreaterThan(0);

      const r = await run(["redact", c.fixture], deps(c.bytes));
      expect(r.exit).toBe(EXIT.OK);
      for (const s of planted) {
        expect(r.stdout).not.toContain(s);
        expect(r.stderr).not.toContain(s);
      }
    });
  }

  // AC-11
  it("the covered set is exactly hl7, fhir, x12 and ccda", () => {
    expect(COVERED.map((c) => c.format).sort()).toStrictEqual(["ccda", "fhir", "hl7", "x12"]);
  });
});

describe("the clean HL7 input under the delegate's default policy", () => {
  const BYTES = FIX(HL7_CLEAN);
  const TEXT = Buffer.from(BYTES).toString("latin1");
  /**
   * The fields of the first segment with this id, split on the field separator. For a segment other
   * than MSH field n sits at index n; MSH-1 is the separator itself, so MSH-n sits at index n - 1.
   */
  const fields = (segment: string): readonly string[] =>
    (TEXT.split("\r").find((s) => s.startsWith(`${segment}|`)) ?? "").split("|");
  /** The full MSH-7 / EVN-2 timestamp the input carries. */
  const TIMESTAMP = "20240101120000";
  /** The planted PID identifiers: an MR-typed PID-3, the name, the birth date, the address. */
  const PLANTED = [
    "MRN-000123",
    "ZZSENTINELLAST",
    "ZZSENTINELFIRST",
    "19800101",
    "123 SYNTHETIC ST",
    "METROPOLIS",
  ];

  const redact = (): ReturnType<typeof run> => run(["redact", HL7_CLEAN], deps(BYTES));
  const pid3 = async (): Promise<{ locus: string; disposition: string; code: string }> => {
    const delegate = await loadDeidDelegate();
    const { manifest } = await delegate.redact("hl7", BYTES);
    const entry = manifest.find((e) => /^PID-3(\[|$)/.test(e.locus));
    if (entry === undefined) throw new Error("the delegate reported no PID-3 entry");
    return entry;
  };

  // AC-7: the premise, asserted rather than assumed.
  it("the input carries the planted PID identifiers and no visit number", () => {
    expect(fields("PID")[3]).toBe("MRN-000123^^^HOSP^MR");
    for (const s of PLANTED) expect(TEXT).toContain(s);
    expect(fields("PV1").length).toBeGreaterThan(1);
    expect(fields("PV1")[19] ?? "").toBe("");
    expect(TEXT).not.toContain("VISIT-");
  });

  // AC-7: the premise on the delegate's side.
  it("the delegate's own manifest for it has zero blocked entries", async () => {
    const delegate = await loadDeidDelegate();
    const { manifest } = await delegate.redact("hl7", BYTES);
    expect(manifest.length).toBeGreaterThan(0);
    expect(manifest.filter((e) => e.disposition === DEID_BLOCKED)).toStrictEqual([]);
  });

  // AC-7
  it("exits 0 and reports 0 blocked in the stderr tally", async () => {
    const r = await redact();
    expect(r.exit).toBe(EXIT.OK);
    const tally = r.stderr
      .split("\n")
      .filter((l) => /^cosyte: redact: hl7: \d+ loci acted on /.test(l));
    expect(tally).toHaveLength(1);
    expect(tally[0]).toMatch(/, 0 blocked\)$/);
    expect(r.stderr).not.toContain("CLI_DEID_INCOMPLETE");
  });

  // AC-8: the MRN is removed by the delegate, not replaced by a surrogate.
  it("renders the delegate's PID-3 entry as removed, DEID_CATEGORY_REMOVED", async () => {
    const entry = await pid3();
    expect(entry.disposition).toBe("removed");
    expect(entry.code).toBe("DEID_CATEGORY_REMOVED");

    const r = await redact();
    const line = r.stderr.split("\n").find((l) => l.includes(` ${entry.locus} x`));
    expect(line).toBeDefined();
    expect(line).toMatch(/ removed DEID_CATEGORY_REMOVED$/);
    expect(r.stderr).not.toContain("DEID_CATEGORY_PSEUDONYMIZED");
  });

  // AC-8
  it("stdout carries none of the planted sentinels, the MRN included", async () => {
    const r = await redact();
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toContain("MSH|");
    for (const s of PLANTED) expect(r.stdout).not.toContain(s);
  });

  // AC-9: the full MSH-7 / EVN-2 timestamp does not survive. This is the guard that reds if a
  // delegate that leaves those two fields unchanged is ever resolved again.
  it("the full MSH-7 and EVN-2 timestamp does not reach stdout", async () => {
    expect(fields("MSH")[6]).toBe(TIMESTAMP);
    expect(fields("EVN")[2]).toBe(TIMESTAMP);

    const r = await redact();
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toContain("MSH|");
    expect(r.stdout).not.toContain(TIMESTAMP);
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
