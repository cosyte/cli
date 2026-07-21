import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fmtCommand } from "../src/commands/fmt.js";
import { EXIT } from "../src/core/exit-codes.js";
import { CLI_CODES } from "../src/core/diagnostics.js";
import type { RunDeps } from "../src/core/io.js";
import { SHOW_VALUES } from "../src/core/phi.js";

const FIXTURES = join(import.meta.dirname, "__fixtures__");
const HL7 = readFileSync(join(FIXTURES, "adt-a01.hl7"));
const FHIR = readFileSync(join(FIXTURES, "patient.fhir.json"));

function deps(file: Uint8Array, stdin: Uint8Array = new Uint8Array()): RunDeps {
  return { readFile: () => Promise.resolve(file), readStdin: () => Promise.resolve(stdin) };
}

describe("fmt — canonical re-serialization via the wrapped serializer", () => {
  it("HL7: emits the library's spec-clean, CR-separated serialization on stdout, exit 0", async () => {
    const { parseHL7 } = await import("@cosyte/hl7");
    const r = await fmtCommand(["adt.hl7"], deps(HL7));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toBe(`${parseHL7(Buffer.from(HL7)).toString()}\n`);
    expect(r.stdout).toContain("MSH|^~\\&"); // spec-clean HL7
  });

  it("FHIR: emits the library's canonical JSON on stdout, exit 0", async () => {
    const { parseResource, serializeResource } = await import("@cosyte/fhir");
    const r = await fmtCommand(["p.json"], deps(FHIR));
    expect(r.exit).toBe(EXIT.OK);
    const { resource } = parseResource(new TextDecoder().decode(FHIR));
    expect(r.stdout).toBe(`${serializeResource(resource)}\n`);
  });

  it("fmt round-trips: parse(fmt(x)) structurally equals parse(x) (fhir)", async () => {
    const { parseResource, serializeResource } = await import("@cosyte/fhir");
    const messy = new TextEncoder().encode('{  "resourceType" : "Patient" , "id":"x"  }');
    const r = await fmtCommand(["p.json", "--format", "fhir"], deps(messy));
    const reparsed = parseResource(r.stdout.trimEnd()).resource;
    const original = parseResource(new TextDecoder().decode(messy)).resource;
    expect(serializeResource(reparsed)).toBe(serializeResource(original));
  });

  it("reads stdin via `-`", async () => {
    const r = await fmtCommand(["-"], deps(new Uint8Array(), FHIR));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toContain("Patient");
  });

  it("surfaces a value-free parse-warning note on stderr, suppressed by --quiet", async () => {
    const framed = Buffer.concat([Buffer.from([0x0b]), HL7, Buffer.from([0x1c, 0x0d])]);
    const loud = await fmtCommand(["m.hl7", "--format", "hl7"], deps(framed));
    const quiet = await fmtCommand(["m.hl7", "--format", "hl7", "--quiet"], deps(framed));
    expect(loud.stderr).toContain("parse warning(s)");
    expect(loud.stderr).not.toContain("ZZSENTINEL");
    expect(quiet.stderr).toBe("");
  });
});

describe("fmt — fail-safe: no partial emit on unparseable input", () => {
  it("an unparseable input is a data error (65) with empty stdout, never half a message", async () => {
    const r = await fmtCommand(
      ["bad.hl7", "--format", "hl7"],
      deps(new TextEncoder().encode("nope")),
    );
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain(CLI_CODES.CLI_PARSE_FAILED);
  });

  it("value-free by default; offending input echoed only under --unsafe-show-values", async () => {
    const bad = new TextEncoder().encode('{"x":"ZZSENTINELLAST"}');
    const safe = await fmtCommand(["bad.hl7", "--format", "hl7"], deps(bad));
    expect(safe.stderr).not.toContain("ZZSENTINELLAST");
    const unsafe = await fmtCommand(["bad.hl7", "--format", "hl7"], deps(bad), SHOW_VALUES);
    expect(unsafe.stderr).toContain("ZZSENTINELLAST");
  });

  it("a missing <file> argument is a usage error (2)", async () => {
    const r = await fmtCommand([], deps(HL7));
    expect(r.exit).toBe(EXIT.USAGE);
  });

  it("an invalid flag is a usage error (2)", async () => {
    const r = await fmtCommand(["p.json", "--nope"], deps(FHIR));
    expect(r.exit).toBe(EXIT.USAGE);
  });
});
