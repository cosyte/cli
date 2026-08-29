import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { redactCommand } from "../src/commands/redact.js";
import { loadDeidDelegate } from "../src/core/deid.js";
import { run } from "../src/core/run.js";
import type { RunDeps } from "../src/core/io.js";
import { dispatchTool, type McpToolResult } from "../src/mcp/tools.js";

/**
 * The load-bearing PHI safety layer (cli roadmap §7): the parsed model goes to **stdout** (the
 * explicit data channel), but **no input value ever reaches stderr**: under any command, flag, or
 * failure mode. Our synthetic fixtures carry sentinel identifiers; this suite proves they appear only
 * on the stdout data channel and never in a diagnostic.
 *
 * The **agent surface** is in the matrix too, because a tool result's `structuredContent` is a second
 * place a value could reach a caller. It splits the same way: the tool's own payload is the data
 * channel (the explicit request), and every other property of the structured result is value-free.
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

describe("PHI leak matrix: stderr is value-free across every mode", () => {
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
    // convert's stdout IS the converted FHIR (the data channel); only its stderr must be value-free.
    { name: "convert hl7", argv: ["convert", "m.hl7", "--to", "fhir"], bytes: HL7 },
    {
      name: "convert hl7 --json",
      argv: ["convert", "m.hl7", "--to", "fhir", "--json"],
      bytes: HL7,
    },
    {
      name: "convert hl7 --quiet",
      argv: ["convert", "m.hl7", "--to", "fhir", "--quiet"],
      bytes: HL7,
    },
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

  it("`map-codes` pointed at a PHI-laden (non-ConceptMap) file fails value-free on BOTH channels", async () => {
    // map-codes reads a ConceptMap (reference data). A PHI-laden HL7 file is not one. It must reject
    // with a stable code and never echo the file's bytes on either channel.
    const r = await run(["map-codes", "m.hl7", "--code", "male"], fileDeps(HL7));
    assertNoSentinelOnStderr(r.stderr);
    assertNoSentinelOnStderr(r.stdout);
    expect(r.stderr).toContain("CLI_MAP_INVALID");
    expect(r.stdout).toBe("");
  });
});

describe("PHI leak matrix: validate / inspect are value-free on BOTH channels", () => {
  // `validate` and `inspect` emit diagnostics / a structural summary, never the message data, so
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

describe("PHI leak matrix: the agent surface's structured result", () => {
  const HL7_TEXT = new TextDecoder().decode(HL7);
  const FHIR_TEXT = new TextDecoder().decode(FHIR);

  /** The structured result minus the tool's own payload: the part that must never carry a value. */
  function outcomeOnly(r: McpToolResult): string {
    const sc = r.structuredContent;
    return JSON.stringify({ ok: sc.ok, status: sc.status, exit: sc.exit, code: sc.code });
  }

  // `parse` / `convert` answer with the requested data, so their payload carries values by design;
  // every other property of the structured result, and the whole result on a failure, must not.
  for (const c of [
    { name: "parse hl7", tool: "parse", args: { content: HL7_TEXT } },
    { name: "parse fhir", tool: "parse", args: { content: FHIR_TEXT } },
    { name: "convert hl7", tool: "convert", args: { content: HL7_TEXT } },
  ]) {
    it(`${c.name}: the outcome fields are value-free; the payload IS the data channel`, async () => {
      const r = await dispatchTool(c.tool, c.args);
      assertNoSentinelOnStderr(outcomeOnly(r));
      // Assert the premise as well as the remedy: the payload really did carry the requested data,
      // so a green here cannot mean "there was nothing to leak".
      expect(JSON.stringify(r.structuredContent.data).length).toBeGreaterThan(100);
      expect(r.structuredContent.status).toBe("success");
    });
  }

  // `validate` / `inspect` report a verdict and a structural summary: value-free on every property,
  // so no sentinel may appear anywhere in the result, payload included.
  for (const c of [
    { name: "validate hl7", tool: "validate", args: { content: HL7_TEXT } },
    { name: "validate fhir", tool: "validate", args: { content: FHIR_TEXT } },
    { name: "inspect hl7", tool: "inspect", args: { content: HL7_TEXT } },
    { name: "inspect fhir", tool: "inspect", args: { content: FHIR_TEXT } },
  ]) {
    it(`${c.name}: no sentinel anywhere in the structured result, payload included`, async () => {
      const r = await dispatchTool(c.tool, c.args);
      assertNoSentinelOnStderr(JSON.stringify(r));
      expect(r.structuredContent.data).toBeDefined();
    });
  }

  // Every failure mode, over PHI-laden input: nothing of the input reaches the result at all.
  for (const c of [
    { name: "unsupported operation", tool: "parse", args: { content: HL7_TEXT, format: "dicom" } },
    { name: "not a convertible source", tool: "convert", args: { content: FHIR_TEXT } },
    { name: "unsupported target", tool: "convert", args: { content: HL7_TEXT, to: "x12" } },
    { name: "unknown tool", tool: HL7_TEXT, args: { content: HL7_TEXT } },
    { name: "non-string content", tool: "parse", args: { content: 1 } },
  ]) {
    it(`${c.name}: the whole failed result is value-free`, async () => {
      const r = await dispatchTool(c.tool, c.args);
      expect(r.structuredContent.status).toBe("failed");
      expect(r.structuredContent.data).toBeUndefined();
      assertNoSentinelOnStderr(JSON.stringify(r));
    });
  }
});

describe("PHI leak matrix: redact is value-free on stderr in EVERY mode", () => {
  // `redact` renders the de-identifier's own manifest onto stderr, which makes it the one command
  // whose diagnostic channel is built from the library's report of what it touched. That report is
  // value-free by the library's contract (its locus is a path); this matrix is what holds it to
  // that, across every mode the command has: a covered format, a refused format, a run the library
  // could not complete, the library absent, `--format` given and omitted, file and stdin.
  const X12_CLEAN = readFileSync(join(FIXTURES, "834-enrollee.edi"));
  const X12_BLOCKED = readFileSync(join(FIXTURES, "834-blocked.edi"));
  const CCDA = readFileSync(join(FIXTURES, "ccd.xml"));
  const ASTM = readFileSync(join(FIXTURES, "patient.astm"));
  const DICOM = readFileSync(join(FIXTURES, "sample.dcm"));

  const cases: { name: string; argv: string[]; bytes: Uint8Array }[] = [
    { name: "hl7 covered, file", argv: ["redact", "m.hl7"], bytes: HL7 },
    { name: "hl7 covered, stdin", argv: ["redact", "-"], bytes: HL7 },
    { name: "hl7 covered, --format", argv: ["redact", "m", "--format", "hl7"], bytes: HL7 },
    { name: "fhir covered", argv: ["redact", "p.json"], bytes: FHIR },
    { name: "x12 covered", argv: ["redact", "e.edi"], bytes: X12_CLEAN },
    { name: "ccda covered", argv: ["redact", "c.xml"], bytes: CCDA },
    { name: "deid alias", argv: ["deid", "m.hl7"], bytes: HL7 },
    { name: "blocked run", argv: ["redact", "b.edi"], bytes: X12_BLOCKED },
    { name: "astm refused", argv: ["redact", "r.astm"], bytes: ASTM },
    { name: "dicom refused", argv: ["redact", "s.dcm"], bytes: DICOM },
    { name: "unparseable under --format", argv: ["redact", "x", "--format", "hl7"], bytes: FHIR },
    { name: "unsafe-show-values", argv: ["redact", "m.hl7", "--unsafe-show-values"], bytes: HL7 },
  ];

  for (const c of cases) {
    it(`${c.name}: no sentinel on stderr`, async () => {
      const r = await run(c.argv, fileDeps(c.bytes));
      assertNoSentinelOnStderr(r.stderr);
    });
  }

  it("a covered run keeps every sentinel off BOTH channels: that is the whole command", async () => {
    for (const bytes of [HL7, FHIR, X12_CLEAN, CCDA]) {
      const r = await run(["redact", "in"], fileDeps(bytes));
      expect(r.exit).toBe(0);
      assertNoSentinelOnStderr(r.stderr);
      assertNoSentinelOnStderr(r.stdout); // redact's stdout is the STRIPPED document
      expect(r.stdout.length).toBeGreaterThan(0);
    }
  });

  it("the blocked run really did block, and still named no value", async () => {
    const delegate = await loadDeidDelegate();
    const { manifest } = await delegate.redact("x12", X12_BLOCKED);
    expect(manifest.filter((e) => e.disposition === "blocked").length).toBeGreaterThan(0);

    const r = await run(["redact", "b.edi"], fileDeps(X12_BLOCKED));
    expect(r.exit).toBe(1);
    expect(r.stdout).toBe("");
    assertNoSentinelOnStderr(r.stderr);
  });

  it("with the library absent, nothing is read and no sentinel can reach either channel", async () => {
    const absent = (): ReturnType<typeof loadDeidDelegate> =>
      loadDeidDelegate(() => Promise.reject(Object.assign(new Error("Cannot find package"), {})));
    const r = await redactCommand(["m.hl7"], fileDeps(HL7), absent);
    expect(r.stdout).toBe("");
    assertNoSentinelOnStderr(r.stderr);
  });

  it("`--unsafe-show-values` does not open a door on redact, unlike on parse", async () => {
    // The opt-in excerpt exists for a parse failure a developer is debugging. On redact an excerpt
    // of the un-stripped input is precisely the leak the command exists to prevent, so this command
    // never honours it: proved against an input the hl7 parser rejects.
    const r = await run(["redact", "x", "--format", "hl7", "--unsafe-show-values"], fileDeps(FHIR));
    expect(r.exit).not.toBe(0);
    assertNoSentinelOnStderr(r.stderr);
    expect(r.stderr).not.toContain("unsafe-show-values");
  });
});

describe("PHI leak matrix: fmt keeps stderr value-free (stdout IS the data channel)", () => {
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
