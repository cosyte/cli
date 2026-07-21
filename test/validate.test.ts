import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateCommand } from "../src/commands/validate.js";
import { EXIT } from "../src/core/exit-codes.js";
import { CLI_CODES, CliError } from "../src/core/diagnostics.js";
import type { RunDeps } from "../src/core/io.js";
import { SHOW_VALUES } from "../src/core/phi.js";

const FIXTURES = join(import.meta.dirname, "__fixtures__");
const HL7 = readFileSync(join(FIXTURES, "adt-a01.hl7"));
const FHIR = readFileSync(join(FIXTURES, "patient.fhir.json"));

/** An invalid FHIR Patient: `gender` is outside its required binding (a value-domain error). */
const INVALID_FHIR = new TextEncoder().encode('{"resourceType":"Patient","gender":"masculine"}');

function deps(file: Uint8Array, stdin: Uint8Array = new Uint8Array()): RunDeps {
  return { readFile: () => Promise.resolve(file), readStdin: () => Promise.resolve(stdin) };
}

describe("validate — verdict in the exit code", () => {
  it("a valid HL7 message → exit 0, value-free 'valid' summary", async () => {
    const r = await validateCommand(["adt.hl7"], deps(HL7));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stderr).toContain("is valid");
    expect(r.stdout).toBe("");
  });

  it("a valid FHIR resource → exit 0", async () => {
    const r = await validateCommand(["patient.json"], deps(FHIR));
    expect(r.exit).toBe(EXIT.OK);
  });

  it("a parseable-but-invalid FHIR resource → exit 1 (INVALID), never exit 0", async () => {
    const r = await validateCommand(["p.json", "--format", "fhir"], deps(INVALID_FHIR));
    expect(r.exit).toBe(EXIT.INVALID);
    expect(r.stderr).toContain("INVALID");
    expect(r.stderr).toContain("CODE_INVALID");
    expect(r.stderr).toContain("Patient.gender"); // value-free FHIRPath location
    expect(r.stderr).not.toContain("masculine"); // never the offending value
  });

  it("--json emits a value-free verdict + findings on stdout; exit carries the verdict", async () => {
    const r = await validateCommand(["p.json", "--format", "fhir", "--json"], deps(INVALID_FHIR));
    expect(r.exit).toBe(EXIT.INVALID);
    expect(r.stderr).toBe("");
    const body = JSON.parse(r.stdout) as {
      format: string;
      valid: boolean;
      findings: { code: string; severity: string; location: string }[];
    };
    expect(body.format).toBe("fhir");
    expect(body.valid).toBe(false);
    expect(body.findings.length).toBeGreaterThan(0);
    expect(r.stdout).not.toContain("masculine");
  });

  it("--quiet makes the exit code the whole signal (empty stderr/stdout)", async () => {
    const valid = await validateCommand(["p.json", "--format", "fhir", "--quiet"], deps(FHIR));
    expect(valid.exit).toBe(EXIT.OK);
    expect(valid.stderr).toBe("");
    const invalid = await validateCommand(
      ["p.json", "--format", "fhir", "--quiet"],
      deps(INVALID_FHIR),
    );
    expect(invalid.exit).toBe(EXIT.INVALID);
    expect(invalid.stderr).toBe("");
  });

  it("a value-free read-time issue is surfaced as a finding but does not fail a clean resource", async () => {
    // A high-precision decimal raises a read-time DECIMAL_PRECISION_AT_RISK (warning, value-free).
    const withIssue = new TextEncoder().encode(
      '{"resourceType":"Observation","valueDecimal":1.00000000000000000001}',
    );
    const r = await validateCommand(["o.json", "--format", "fhir", "--json"], deps(withIssue));
    const body = JSON.parse(r.stdout) as { findings: { code: string; severity: string }[] };
    expect(body.findings.length).toBeGreaterThan(0);
    expect(body.findings.some((f) => f.code === "DECIMAL_PRECISION_AT_RISK")).toBe(true);
  });

  it("HL7 warnings are surfaced as findings but do not fail the verdict (parseable ⇒ valid)", async () => {
    const framed = Buffer.concat([Buffer.from([0x0b]), HL7, Buffer.from([0x1c, 0x0d])]);
    const r = await validateCommand(["m.hl7", "--format", "hl7"], deps(framed));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stderr).toContain("warning");
    expect(r.stderr).toContain("is valid");
  });
});

describe("validate — the verdict matches the library, never invented", () => {
  it("`validate`'s exit 0/1 equals @cosyte/fhir validateResource().valid", async () => {
    const { parseResource, validateResource } = await import("@cosyte/fhir");
    for (const bytes of [FHIR, INVALID_FHIR]) {
      const { resource } = parseResource(new TextDecoder().decode(bytes));
      const libValid = validateResource(resource).valid;
      const r = await validateCommand(["p.json", "--format", "fhir"], deps(bytes));
      expect(r.exit === EXIT.OK).toBe(libValid);
    }
  });
});

describe("validate — fail-safe exit codes distinguish invalid from unparseable", () => {
  it("unparseable input is a DATA error (65), NOT an invalid verdict (1)", async () => {
    const r = await validateCommand(
      ["bad.json", "--format", "fhir"],
      deps(new TextEncoder().encode("{ not json")),
    );
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain(CLI_CODES.CLI_PARSE_FAILED);
  });

  it("a missing <file> argument is a usage error (2)", async () => {
    const r = await validateCommand([], deps(HL7));
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stderr).toContain(CLI_CODES.CLI_USAGE);
  });

  it("an invalid flag is a usage error (2)", async () => {
    const r = await validateCommand(["p.json", "--nope"], deps(FHIR));
    expect(r.exit).toBe(EXIT.USAGE);
  });

  it("an unreadable file surfaces as no-input (66), value-free", async () => {
    const failing: RunDeps = {
      readFile: () =>
        Promise.reject(
          new CliError(CLI_CODES.CLI_NO_INPUT, EXIT.NOINPUT, "cannot read input file"),
        ),
      readStdin: () => Promise.resolve(new Uint8Array()),
    };
    const r = await validateCommand(["gone.json"], failing);
    expect(r.exit).toBe(EXIT.NOINPUT);
    expect(r.stderr).toContain(CLI_CODES.CLI_NO_INPUT);
  });
});

describe("validate — profile is gated, never faked", () => {
  it("--profile is an honest CLI_NOT_IMPLEMENTED (69); the input is never read", async () => {
    let read = false;
    const spying: RunDeps = {
      readFile: () => {
        read = true;
        return Promise.resolve(HL7);
      },
      readStdin: () => Promise.resolve(new Uint8Array()),
    };
    const r = await validateCommand(["m.hl7", "--profile", "us-core"], spying);
    expect(r.exit).toBe(EXIT.UNAVAILABLE);
    expect(r.stderr).toContain(CLI_CODES.CLI_NOT_IMPLEMENTED);
    expect(read).toBe(false);
  });
});

describe("validate — PHI posture on a parse failure", () => {
  it("value-free by default; the offending input appears only under --unsafe-show-values", async () => {
    const bad = new TextEncoder().encode('{"secret":"ZZSENTINELLAST"}');
    const safe = await validateCommand(["bad.hl7", "--format", "hl7"], deps(bad));
    expect(safe.stderr).not.toContain("ZZSENTINELLAST");
    const unsafe = await validateCommand(["bad.hl7", "--format", "hl7"], deps(bad), SHOW_VALUES);
    expect(unsafe.stderr).toContain("ZZSENTINELLAST");
  });
});
