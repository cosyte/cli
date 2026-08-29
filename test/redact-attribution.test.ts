import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadDeidDelegate } from "../src/core/deid.js";
import { EXIT } from "../src/core/exit-codes.js";
import type { RunDeps } from "../src/core/io.js";
import { helpText, run } from "../src/core/run.js";

/**
 * Whose policy is this? The CLI's answer is "not mine". It reports the delegated library's own
 * published label and version and asserts **no de-identification standard of its own**: the standard
 * behind that label was never read from an authoritative source here, and a tool that implies a
 * certification it cannot back is exactly how a false-safety impression gets made.
 *
 * The label and version are read from the installed library rather than typed into this test, so a
 * hard-coded copy in the CLI would fail here the moment the library moved.
 */

const FIXTURES = join(import.meta.dirname, "__fixtures__");
const FIX = (name: string): Uint8Array => readFileSync(join(FIXTURES, name));

/** The wording no channel may ever carry: a claim the CLI is in no position to make. */
const FALSE_SAFETY = /HIPAA[- ]compliant|certified de-identified|is de-identified/i;
/** Any other shape of "we conform to a standard". */
const CONFORMANCE_CLAIM = /\bcompliant\b|\bcertifie[ds]\b|\bconforms? to\b|\bguarantee[sd]?\b/i;

function deps(bytes: Uint8Array): RunDeps {
  return { readFile: () => Promise.resolve(bytes), readStdin: () => Promise.resolve(bytes) };
}

const PRODUCING: readonly { format: string; bytes: Uint8Array }[] = [
  { format: "hl7", bytes: FIX("adt-a01.hl7") },
  { format: "fhir", bytes: FIX("patient.fhir.json") },
  { format: "x12", bytes: FIX("834-enrollee.edi") },
  { format: "ccda", bytes: FIX("ccd.xml") },
];

describe("redact attributes its policy to the delegated library, verbatim", () => {
  for (const c of PRODUCING) {
    it(`${c.format}: stderr names the package and quotes its own label and version`, async () => {
      const delegate = await loadDeidDelegate();
      const r = await run(["redact", "in", "--format", c.format], deps(c.bytes));
      expect(r.exit).toBe(EXIT.OK);
      expect(r.stdout.length).toBeGreaterThan(0);
      expect(r.stderr).toContain("@cosyte/deid");
      expect(r.stderr).toContain(delegate.label);
      expect(r.stderr).toContain(delegate.version);
    });
  }

  it("the label is the library's own, not a phrase this CLI invented", async () => {
    const delegate = await loadDeidDelegate();
    // Non-vacuity: the library really does publish a label, and it is deliberately not the word
    // "de-identified".
    expect(delegate.label.length).toBeGreaterThan(0);
    expect(delegate.label).not.toMatch(FALSE_SAFETY);
    expect(delegate.version.length).toBeGreaterThan(0);
  });

  it("a blocked run still attributes the policy to the library", async () => {
    const delegate = await loadDeidDelegate();
    const r = await run(["redact", "834.edi"], deps(FIX("834.edi")));
    expect(r.exit).toBe(EXIT.INVALID);
    expect(r.stderr).toContain("@cosyte/deid");
    expect(r.stderr).toContain(delegate.label);
    expect(r.stderr).toContain(delegate.version);
  });
});

describe("no channel, in any mode, claims a de-identification standard", () => {
  const modes: { name: string; argv: string[]; bytes: Uint8Array }[] = [
    { name: "hl7 clean", argv: ["redact", "m.hl7"], bytes: FIX("adt-a01.hl7") },
    { name: "fhir clean", argv: ["redact", "p.json"], bytes: FIX("patient.fhir.json") },
    { name: "x12 clean", argv: ["redact", "e.edi"], bytes: FIX("834-enrollee.edi") },
    { name: "ccda clean", argv: ["redact", "c.xml"], bytes: FIX("ccd.xml") },
    { name: "x12 blocked", argv: ["redact", "834.edi"], bytes: FIX("834.edi") },
    { name: "astm refused", argv: ["redact", "r.astm"], bytes: FIX("patient.astm") },
    { name: "ncpdp refused", argv: ["redact", "rx.xml"], bytes: FIX("newrx.xml") },
    { name: "dicom refused", argv: ["redact", "s.dcm"], bytes: FIX("sample.dcm") },
    { name: "unparseable", argv: ["redact", "x.hl7", "--format", "hl7"], bytes: FIX("ccd.xml") },
    { name: "deid alias", argv: ["deid", "m.hl7"], bytes: FIX("adt-a01.hl7") },
  ];

  for (const m of modes) {
    it(`${m.name}: neither channel claims conformance`, async () => {
      const r = await run(m.argv, deps(m.bytes));
      for (const channel of [r.stdout, r.stderr]) {
        expect(channel).not.toMatch(FALSE_SAFETY);
      }
      // stdout may be the de-identified document itself, so the prose rule is stderr's.
      expect(r.stderr).not.toMatch(CONFORMANCE_CLAIM);
    });
  }

  it("the help text describes the delegation without claiming a standard", () => {
    const help = helpText();
    expect(help).toContain("@cosyte/deid");
    expect(help).not.toMatch(FALSE_SAFETY);
    expect(help).not.toMatch(CONFORMANCE_CLAIM);
  });
});

describe("the DICOM refusal does not blame the delegated library", () => {
  it("names the CLI's own output channel, not a gap in the library", async () => {
    const r = await run(["redact", "s.dcm"], deps(FIX("sample.dcm")));
    expect(r.exit).toBe(EXIT.DATAERR);
    // The library DOES cover DICOM; this CLI's data channel is text and cannot carry Part 10 bytes.
    // Attributing the refusal to the library would be a false attribution.
    expect(r.stderr).toContain("output channel");
    expect(r.stderr).not.toContain("@cosyte/deid");
  });
});
