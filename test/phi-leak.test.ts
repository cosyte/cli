import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { run } from "../src/core/run.js";
import type { RunDeps } from "../src/core/io.js";

/**
 * The load-bearing PHI safety layer (cli roadmap §7): the parsed model goes to **stdout** (the
 * explicit data channel), but **no input value ever reaches stderr** — under any command, flag, or
 * failure mode. Our synthetic fixtures carry sentinel identifiers; this suite proves they appear only
 * on the stdout data channel and never in a diagnostic.
 */

const FIXTURES = join(import.meta.dirname, "__fixtures__");
const HL7 = readFileSync(join(FIXTURES, "adt-a01.hl7"));
const FHIR = readFileSync(join(FIXTURES, "patient.fhir.json"));

/** Every sentinel value planted in the fixtures. None may appear on stderr. */
const SENTINELS = [
  "ZZSENTINELLAST",
  "ZZSENTINELFIRST",
  "MRN-000123",
  "SYNTHETIC ST",
  "METROPOLIS",
  "19800101",
  "1980-01-01",
];

function fileDeps(bytes: Uint8Array): RunDeps {
  return { readFile: () => Promise.resolve(bytes), readStdin: () => Promise.resolve(bytes) };
}

function assertNoSentinelOnStderr(stderr: string): void {
  for (const s of SENTINELS) expect(stderr).not.toContain(s);
}

describe("PHI leak matrix — stderr is value-free across every mode", () => {
  const cases: { name: string; argv: string[]; bytes: Uint8Array }[] = [
    { name: "hl7 default", argv: ["parse", "m.hl7"], bytes: HL7 },
    { name: "hl7 --json", argv: ["parse", "m.hl7", "--json"], bytes: HL7 },
    { name: "hl7 --quiet", argv: ["parse", "m.hl7", "--quiet"], bytes: HL7 },
    { name: "hl7 stdin", argv: ["parse", "-"], bytes: HL7 },
    { name: "fhir default", argv: ["parse", "p.json"], bytes: FHIR },
    { name: "fhir --json", argv: ["parse", "p.json", "--json"], bytes: FHIR },
    {
      name: "fhir --quiet --no-color",
      argv: ["parse", "p.json", "--quiet", "--no-color"],
      bytes: FHIR,
    },
    { name: "fhir stdin", argv: ["parse", "-"], bytes: FHIR },
  ];

  for (const c of cases) {
    it(`${c.name}: no sentinel on stderr; the model IS on stdout`, async () => {
      const r = await run(c.argv, fileDeps(c.bytes));
      assertNoSentinelOnStderr(r.stderr);
      // Sanity: the data channel really did carry the parsed model (so the test isn't vacuous).
      expect(r.stdout.length).toBeGreaterThan(0);
    });
  }

  it("an unwired --format error is value-free even when the input is full of PHI", async () => {
    const r = await run(["parse", "x.dcm", "--format", "dicom"], fileDeps(HL7));
    assertNoSentinelOnStderr(r.stderr);
    expect(r.stderr).toContain("CLI_FORMAT_UNSUPPORTED");
    expect(r.stdout).toBe("");
  });

  it("a forced-format parse failure never echoes the offending bytes", async () => {
    // A deliberately malformed FHIR document (not valid JSON) forced down the fhir branch.
    const bad = new TextEncoder().encode('{"resourceType":"Patient", ZZSENTINELLAST');
    const r = await run(["parse", "bad.json", "--format", "fhir"], fileDeps(bad));
    assertNoSentinelOnStderr(r.stderr);
  });

  it("--unsafe-show-values on a SUCCESSFUL parse still keeps stderr value-free", async () => {
    // The flag opens a value only on FAILURE diagnostics; a clean parse's stderr stays value-free
    // (values live on the stdout data channel, as requested).
    for (const bytes of [HL7, FHIR]) {
      const r = await run(["parse", "m", "--unsafe-show-values"], fileDeps(bytes));
      assertNoSentinelOnStderr(r.stderr);
      expect(r.stdout.length).toBeGreaterThan(0);
    }
  });

  it("`redact` is value-free even when pointed at a PHI-laden file (and never reads it)", async () => {
    const r = await run(["redact", "m.hl7"], fileDeps(HL7));
    assertNoSentinelOnStderr(r.stderr);
    expect(r.stderr).toContain("CLI_NOT_IMPLEMENTED");
    expect(r.stdout).toBe("");
  });
});

describe("PHI leak matrix — validate / inspect are value-free on BOTH channels", () => {
  // `validate` and `inspect` emit diagnostics / a structural summary, never the message data — so
  // unlike `parse`/`fmt` (whose stdout IS the data channel), neither channel may carry a sentinel.
  const cases: { name: string; argv: string[]; bytes: Uint8Array }[] = [
    { name: "validate hl7", argv: ["validate", "m.hl7"], bytes: HL7 },
    { name: "validate hl7 --json", argv: ["validate", "m.hl7", "--json"], bytes: HL7 },
    { name: "validate fhir", argv: ["validate", "p.json"], bytes: FHIR },
    { name: "validate fhir --json", argv: ["validate", "p.json", "--json"], bytes: FHIR },
    { name: "inspect hl7", argv: ["inspect", "m.hl7"], bytes: HL7 },
    { name: "inspect hl7 --json", argv: ["inspect", "m.hl7", "--json"], bytes: HL7 },
    { name: "inspect fhir", argv: ["inspect", "p.json"], bytes: FHIR },
    { name: "inspect fhir --json", argv: ["inspect", "p.json", "--json"], bytes: FHIR },
  ];
  for (const c of cases) {
    it(`${c.name}: no sentinel on stderr OR stdout`, async () => {
      const r = await run(c.argv, fileDeps(c.bytes));
      assertNoSentinelOnStderr(r.stderr);
      assertNoSentinelOnStderr(r.stdout); // validate/inspect stdout is value-free too
    });
  }
});

describe("PHI leak matrix — fmt keeps stderr value-free (stdout IS the data channel)", () => {
  // `fmt`'s stdout is a re-serialization of the message (values included, by request); only its
  // secondary channel (stderr) must be value-free.
  for (const c of [
    { name: "fmt hl7", argv: ["fmt", "m.hl7"], bytes: HL7 },
    { name: "fmt fhir", argv: ["fmt", "p.json"], bytes: FHIR },
  ]) {
    it(`${c.name}: no sentinel on stderr; the re-serialized message IS on stdout`, async () => {
      const r = await run(c.argv, fileDeps(c.bytes));
      assertNoSentinelOnStderr(r.stderr);
      expect(r.stdout.length).toBeGreaterThan(0);
    });
  }
});
