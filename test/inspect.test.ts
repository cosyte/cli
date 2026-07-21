import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { inspectCommand } from "../src/commands/inspect.js";
import { EXIT } from "../src/core/exit-codes.js";
import { CLI_CODES } from "../src/core/diagnostics.js";
import type { RunDeps } from "../src/core/io.js";

const FIXTURES = join(import.meta.dirname, "__fixtures__");
const HL7 = readFileSync(join(FIXTURES, "adt-a01.hl7"));
const FHIR = readFileSync(join(FIXTURES, "patient.fhir.json"));

/** Every sentinel value planted in the fixtures — none may appear in a structural summary. */
const SENTINELS = ["ZZSENTINELLAST", "ZZSENTINELFIRST", "MRN-000123", "SYNTHETIC ST", "METROPOLIS"];

function deps(file: Uint8Array, stdin: Uint8Array = new Uint8Array()): RunDeps {
  return { readFile: () => Promise.resolve(file), readStdin: () => Promise.resolve(stdin) };
}

function assertValueFree(text: string): void {
  for (const s of SENTINELS) expect(text).not.toContain(s);
}

describe("inspect — value-free structural summary", () => {
  it("HL7: human summary with message type, version, segment counts — never a value", async () => {
    const r = await inspectCommand(["adt.hl7"], deps(HL7));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toContain("ADT^A01"); // message type code (structural, not PHI)
    expect(r.stdout).toContain("PID: 1");
    expect(r.stdout).toContain("segments:");
    assertValueFree(r.stdout);
    assertValueFree(r.stderr);
  });

  it("HL7 --json: a value-free structural summary object", async () => {
    const r = await inspectCommand(["adt.hl7", "--json"], deps(HL7));
    expect(r.exit).toBe(EXIT.OK);
    const s = JSON.parse(r.stdout) as {
      format: string;
      messageType: string;
      segmentCount: number;
      segments: Record<string, number>;
    };
    expect(s.format).toBe("hl7");
    expect(s.messageType).toBe("ADT^A01");
    expect(s.segmentCount).toBe(4);
    expect(s.segments["PID"]).toBe(1);
    assertValueFree(r.stdout);
  });

  it("FHIR: resourceType + issue count, value-free", async () => {
    const r = await inspectCommand(["p.json"], deps(FHIR));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toContain("Patient");
    assertValueFree(r.stdout);
  });

  it("FHIR Bundle: entry count + per-resourceType counts", async () => {
    const bundle = new TextEncoder().encode(
      '{"resourceType":"Bundle","type":"collection","entry":[' +
        '{"resource":{"resourceType":"Patient"}},' +
        '{"resource":{"resourceType":"Observation"}},' +
        '{"resource":{"resourceType":"Patient"}}]}',
    );
    const r = await inspectCommand(["b.json", "--format", "fhir", "--json"], deps(bundle));
    const s = JSON.parse(r.stdout) as {
      resourceType: string;
      entryCount: number;
      entryResourceTypes: Record<string, number>;
    };
    expect(s.resourceType).toBe("Bundle");
    expect(s.entryCount).toBe(3);
    expect(s.entryResourceTypes["Patient"]).toBe(2);
    expect(s.entryResourceTypes["Observation"]).toBe(1);
  });

  it("FHIR Bundle: human summary renders entry counts and bundle type", async () => {
    const bundle = new TextEncoder().encode(
      '{"resourceType":"Bundle","type":"searchset","entry":[' +
        '{"resource":{"resourceType":"Patient"}},' +
        '{"resource":{"resourceType":"Patient"}}]}',
    );
    const r = await inspectCommand(["b.json"], deps(bundle));
    expect(r.stdout).toContain("bundle type:   searchset");
    expect(r.stdout).toContain("entries:       2");
    expect(r.stdout).toContain("Patient: 2");
  });

  it("FHIR Bundle without a type / an entry without a resource → value-free fallbacks", async () => {
    const bundle = new TextEncoder().encode(
      '{"resourceType":"Bundle","entry":[{"fullUrl":"urn:uuid:1"}]}',
    );
    const r = await inspectCommand(["b.json", "--format", "fhir"], deps(bundle));
    expect(r.stdout).toContain("bundle type:   (unknown)");
    expect(r.stdout).toContain("(none): 1"); // an entry with no wrapped resource
  });

  it("a resource with no resourceType renders '(unknown)', never a value", async () => {
    const r = await inspectCommand(
      ["x.json", "--format", "fhir"],
      deps(new TextEncoder().encode("{}")),
    );
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toContain("resource type: (unknown)");
  });

  it("reads stdin via `-`", async () => {
    const r = await inspectCommand(["-"], deps(new Uint8Array(), FHIR));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toContain("Patient");
  });
});

describe("inspect — fail-safe exit codes", () => {
  it("unparseable input is a data error (65), value-free", async () => {
    const bad = new TextEncoder().encode("{ not json ZZSENTINELLAST");
    const r = await inspectCommand(["bad.json", "--format", "fhir"], deps(bad));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain(CLI_CODES.CLI_PARSE_FAILED);
    expect(r.stderr).not.toContain("ZZSENTINELLAST");
  });

  it("a missing <file> argument is a usage error (2)", async () => {
    const r = await inspectCommand([], deps(HL7));
    expect(r.exit).toBe(EXIT.USAGE);
  });

  it("an invalid flag is a usage error (2)", async () => {
    const r = await inspectCommand(["p.json", "--nope"], deps(FHIR));
    expect(r.exit).toBe(EXIT.USAGE);
  });
});
