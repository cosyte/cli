import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { convertCommand, convertOutcome } from "../src/commands/convert.js";
import { CLI_CODES } from "../src/core/diagnostics.js";
import { EXIT } from "../src/core/exit-codes.js";
import type { Finding } from "../src/core/findings.js";
import type { RunDeps } from "../src/core/io.js";
import { SHOW_VALUES } from "../src/core/phi.js";

const FIXTURES = join(import.meta.dirname, "__fixtures__");
const HL7 = readFileSync(join(FIXTURES, "adt-a01.hl7"));
const FHIR = readFileSync(join(FIXTURES, "patient.fhir.json"));

function fileDeps(bytes: Uint8Array): RunDeps {
  return { readFile: () => Promise.resolve(bytes), readStdin: () => Promise.resolve(bytes) };
}

const throwingDeps: RunDeps = {
  readFile: () => Promise.reject(Object.assign(new Error("boom"), { code: undefined })),
  readStdin: () => Promise.resolve(new Uint8Array()),
};

describe("convert — HL7 v2 → FHIR via @cosyte/transform", () => {
  it("converts an ADT^A01 to a FHIR message Bundle on stdout, exit 0", async () => {
    const r = await convertCommand(["adt.hl7", "--to", "fhir"], fileDeps(HL7));
    expect(r.exit).toBe(EXIT.OK);
    const bundle = JSON.parse(r.stdout) as {
      resourceType: string;
      type: string;
      entry?: unknown[];
    };
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("message");
    expect((bundle.entry ?? []).length).toBeGreaterThan(0);
  });

  it("stdout equals the library's serialized bundle (the CLI adds no shaping)", async () => {
    const [{ parseHL7 }, { toFhir }, { serializeResource }] = await Promise.all([
      import("@cosyte/hl7"),
      import("@cosyte/transform"),
      import("@cosyte/fhir"),
    ]);
    const expected = serializeResource(toFhir(parseHL7(Buffer.from(HL7))).bundle);
    const r = await convertCommand(["adt.hl7", "--to", "fhir"], fileDeps(HL7));
    // Normalize the only non-deterministic part — transform's random fullUrl/reference UUIDs — so the
    // property under test is "the CLI serializes the library's bundle verbatim, adding no shaping",
    // not "two independent conversions allocate the same UUIDs" (they never do).
    const normalize = (s: string): string => s.replace(/urn:uuid:[0-9a-f-]+/g, "urn:uuid:X");
    expect(normalize(r.stdout.trimEnd())).toBe(normalize(expected));
  });

  it("surfaces value-free transform findings on stderr + a summary", async () => {
    const r = await convertCommand(["adt.hl7", "--to", "fhir"], fileDeps(HL7));
    expect(r.stderr).toContain("cosyte: convert:");
    expect(r.stderr).toContain("hl7 → fhir OK");
    // A locator (v2 index → FHIRPath), never a field value.
    expect(r.stderr).toMatch(/TRANSFORM_[A-Z_]+ at [A-Z0-9.[\]]+/);
  });

  it("--json emits an envelope { format, bundle, findings } on stdout, value-free stderr", async () => {
    const r = await convertCommand(["adt.hl7", "--to", "fhir", "--json"], fileDeps(HL7));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stderr).toBe("");
    const body = JSON.parse(r.stdout) as {
      format: string;
      bundle: { resourceType: string };
      findings: unknown[];
    };
    expect(body.format).toBe("fhir");
    expect(body.bundle.resourceType).toBe("Bundle");
    expect(Array.isArray(body.findings)).toBe(true);
  });

  it("--quiet suppresses the stderr findings (the bundle is still on stdout)", async () => {
    const r = await convertCommand(["adt.hl7", "--to", "fhir", "--quiet"], fileDeps(HL7));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stderr).toBe("");
    expect(r.stdout).toContain("Bundle");
  });

  it("--to is required (missing → usage error, exit 2)", async () => {
    const r = await convertCommand(["adt.hl7"], fileDeps(HL7));
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stderr).toContain(CLI_CODES.CLI_USAGE);
    expect(r.stderr).toContain("--to fhir");
  });

  it("only --to fhir is supported (other target → usage error, exit 2)", async () => {
    const r = await convertCommand(["adt.hl7", "--to", "x12"], fileDeps(HL7));
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stderr).toContain("only --to fhir is supported");
  });

  it("an unknown flag is a usage error (exit 2)", async () => {
    const r = await convertCommand(["adt.hl7", "--to", "fhir", "--nope"], fileDeps(HL7));
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stderr).toContain(CLI_CODES.CLI_USAGE);
  });

  it("a missing <file> argument is a usage error (exit 2)", async () => {
    const r = await convertCommand(["--to", "fhir"], fileDeps(HL7));
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stderr).toContain("missing <file>");
  });

  it("a non-HL7 source (e.g. FHIR) is a value-free data error, exit 65", async () => {
    const r = await convertCommand(["patient.json", "--to", "fhir"], fileDeps(FHIR));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain(CLI_CODES.CLI_FORMAT_UNSUPPORTED);
    expect(r.stderr).toContain("not an HL7 v2 source");
    expect(r.stdout).toBe("");
  });

  it("an unparseable HL7 input is a value-free CLI_PARSE_FAILED (exit 65), no bytes echoed", async () => {
    const bad = new TextEncoder().encode("MSH|garbage-without-required-fields");
    const r = await convertCommand(["bad.hl7", "--to", "fhir", "--format", "hl7"], fileDeps(bad));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain(CLI_CODES.CLI_PARSE_FAILED);
    expect(r.stdout).toBe("");
  });

  it("--unsafe-show-values may append the offending input on a parse failure", async () => {
    const bad = new TextEncoder().encode("MSH|ZZSENTINEL-BROKEN");
    const r = await convertCommand(
      ["bad.hl7", "--to", "fhir", "--format", "hl7"],
      fileDeps(bad),
      SHOW_VALUES,
    );
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain("ZZSENTINEL-BROKEN");
  });

  it("a fhirPath-less finding renders with its v2 locator only (no ` → `)", async () => {
    // A non-IG-mapped trigger (ADT^A13) is segment-assembled → an information finding at MSH.9 that
    // carries a v2 location but no FHIRPath.
    const a13 = new TextEncoder().encode(
      "MSH|^~\\&|A|B|C|D|20240101120000||ADT^A13|1|P|2.5\rEVN|A13|20240101120000\rPID|1||X^^^H^MR||DOE^JANE||19800101|F\r",
    );
    const r = await convertCommand(["a13.hl7", "--to", "fhir"], fileDeps(a13));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stderr).toContain("TRANSFORM_SEGMENT_ASSEMBLED at MSH.9");
    expect(r.stderr).not.toContain("MSH.9 →");
  });

  it("an error-severity transform issue drives a non-zero exit (1), bundle still on stdout", async () => {
    // This minimal ORU^R01 produces a resource the library flags as invalid (an error-severity
    // TRANSFORM_RESOURCE_INVALID) — the load-bearing rule: a conversion error is never exit 0.
    const oru = new TextEncoder().encode(
      "MSH|^~\\&|A|B|C|D|20240101120000||ORU^R01|1|P|2.5\rPID|1||X^^^H^MR||DOE^JANE||19800101|F\rOBR|1|||CBC\rOBX|1|NM|WBC||7.5|10*3/uL|||||F\r",
    );
    const r = await convertCommand(["oru.hl7", "--to", "fhir"], fileDeps(oru));
    expect(r.exit).toBe(EXIT.INVALID);
    expect(r.stderr).toContain("error TRANSFORM_RESOURCE_INVALID");
    expect(r.stderr).toContain("produced 1 error(s)");
    expect((JSON.parse(r.stdout) as { resourceType: string }).resourceType).toBe("Bundle");
  });

  it("propagates an unexpected (non-CliError) read failure for the dispatcher to map", async () => {
    await expect(convertCommand(["x.hl7", "--to", "fhir"], throwingDeps)).rejects.toThrow();
  });
});

describe("convertOutcome — the error-severity verdict + value-free report", () => {
  it("an error-severity finding drives hasError (→ the command exits non-zero)", () => {
    const findings: Finding[] = [
      { code: "TRANSFORM_RESOURCE_INVALID", severity: "error", location: "PID → Patient" },
    ];
    const { hasError, report } = convertOutcome(findings);
    expect(hasError).toBe(true);
    expect(report).toContain("produced 1 error(s)");
    expect(report).toContain("error TRANSFORM_RESOURCE_INVALID at PID → Patient");
  });

  it("only non-error findings → no error verdict, an OK summary", () => {
    const findings: Finding[] = [
      { code: "TRANSFORM_ELEMENT_DROPPED", severity: "information", location: "PID.13" },
      { code: "TRANSFORM_TIMESTAMP_NO_TIMEZONE", severity: "warning", location: "TS.1" },
    ];
    const { hasError, report } = convertOutcome(findings);
    expect(hasError).toBe(false);
    expect(report).toContain("hl7 → fhir OK (2 finding(s))");
  });

  it("no findings → OK with a zero count", () => {
    expect(convertOutcome([]).report).toContain("OK (0 finding(s))");
  });
});
