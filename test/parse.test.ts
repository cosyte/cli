import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { extractStableCode, parseCommand } from "../src/commands/parse.js";
import { EXIT } from "../src/core/exit-codes.js";
import type { RunDeps } from "../src/core/io.js";

const FIXTURES = join(import.meta.dirname, "__fixtures__");
const HL7 = readFileSync(join(FIXTURES, "adt-a01.hl7"));
const FHIR = readFileSync(join(FIXTURES, "patient.fhir.json"));

/** Build in-memory deps: `file` is returned for any path, `stdin` for `-`. */
function deps(file: Uint8Array, stdin: Uint8Array = new Uint8Array()): RunDeps {
  return { readFile: () => Promise.resolve(file), readStdin: () => Promise.resolve(stdin) };
}

describe("parse — command contract", () => {
  it("parses HL7 (autodetected) to a typed JSON envelope, exit 0, value-free stderr", async () => {
    const r = await parseCommand(["adt.hl7"], deps(HL7));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stderr).toBe("");
    const env = JSON.parse(r.stdout) as { format: string; model: unknown; warnings: unknown[] };
    expect(env.format).toBe("hl7");
    expect(env.model).toBeTypeOf("object");
    expect(Array.isArray(env.warnings)).toBe(true);
  });

  it("parses FHIR (autodetected) to a typed JSON envelope, exit 0", async () => {
    const r = await parseCommand(["patient.json"], deps(FHIR));
    expect(r.exit).toBe(EXIT.OK);
    const env = JSON.parse(r.stdout) as { format: string; model: { resourceType?: string } };
    expect(env.format).toBe("fhir");
    expect(env.model.resourceType).toBe("Patient");
  });

  it("reads stdin when the argument is `-`", async () => {
    const r = await parseCommand(["-"], deps(new Uint8Array(), FHIR));
    expect(r.exit).toBe(EXIT.OK);
    expect((JSON.parse(r.stdout) as { format: string }).format).toBe("fhir");
  });

  it("`cosyte parse` equals the library's programmatic parse (hl7)", async () => {
    const { parseHL7 } = await import("@cosyte/hl7");
    const r = await parseCommand(["adt.hl7"], deps(HL7));
    const env = JSON.parse(r.stdout) as { model: unknown };
    expect(env.model).toStrictEqual(
      JSON.parse(JSON.stringify(parseHL7(Buffer.from(HL7)).toJSON())),
    );
  });

  it("`cosyte parse` equals the library's programmatic parse (fhir)", async () => {
    const { parseResource, serializeResource } = await import("@cosyte/fhir");
    const r = await parseCommand(["p.json"], deps(FHIR));
    const env = JSON.parse(r.stdout) as { model: unknown };
    const { resource } = parseResource(new TextDecoder().decode(FHIR));
    expect(env.model).toStrictEqual(JSON.parse(serializeResource(resource)));
  });

  it("--json emits compact single-line output; default is pretty", async () => {
    const compact = await parseCommand(["-", "--json"], deps(new Uint8Array(), FHIR));
    const pretty = await parseCommand(["-"], deps(new Uint8Array(), FHIR));
    expect(compact.stdout.trimEnd()).not.toContain("\n");
    expect(pretty.stdout).toContain("\n  ");
  });

  it("honours an explicit --format override", async () => {
    const r = await parseCommand(["adt.hl7", "--format", "hl7"], deps(HL7));
    expect(r.exit).toBe(EXIT.OK);
    expect((JSON.parse(r.stdout) as { format: string }).format).toBe("hl7");
  });
});

describe("parse — fail-safe exit-code contract", () => {
  it("missing <file> argument is a usage error (exit 2)", async () => {
    const r = await parseCommand([], deps(HL7));
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stderr).toContain("CLI_USAGE");
  });

  it("an invalid flag is a usage error (exit 2)", async () => {
    const r = await parseCommand(["adt.hl7", "--nope"], deps(HL7));
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stderr).toContain("CLI_USAGE");
  });

  it("an unknown --format value is a usage error (exit 2)", async () => {
    const r = await parseCommand(["adt.hl7", "--format", "xyz"], deps(HL7));
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stderr).toContain("CLI_USAGE");
  });

  it("empty input is a data error (exit 65)", async () => {
    const r = await parseCommand(["-"], deps(new Uint8Array(), new Uint8Array()));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain("CLI_EMPTY_INPUT");
  });

  it("an undetectable format is a data error (exit 65), never a guess", async () => {
    const r = await parseCommand(["x.txt"], deps(new TextEncoder().encode("hello world")));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain("CLI_FORMAT_UNDETECTED");
  });

  it("a recognised-but-unwired --format is a data error (exit 65), never faked", async () => {
    const r = await parseCommand(["x.dcm", "--format", "dicom"], deps(HL7));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain("CLI_FORMAT_UNSUPPORTED");
  });

  it("a no-input read error surfaces as exit 66 (value-free)", async () => {
    const { CliError, CLI_CODES } = await import("../src/core/diagnostics.js");
    const failing: RunDeps = {
      readFile: () =>
        Promise.reject(
          new CliError(CLI_CODES.CLI_NO_INPUT, EXIT.NOINPUT, "cannot read input file"),
        ),
      readStdin: () => Promise.resolve(new Uint8Array()),
    };
    const r = await parseCommand(["gone.hl7"], failing);
    expect(r.exit).toBe(EXIT.NOINPUT);
    expect(r.stderr).toContain("CLI_NO_INPUT");
  });

  it("propagates a non-CliError read failure for the dispatcher to map", async () => {
    const boom: RunDeps = {
      readFile: () => Promise.reject(new Error("unexpected")),
      readStdin: () => Promise.resolve(new Uint8Array()),
    };
    await expect(parseCommand(["x.hl7"], boom)).rejects.toThrow("unexpected");
  });

  it("an HL7 parser rejection is a data error (exit 65) with a stable code token, never the bytes", async () => {
    // Force the HL7 branch on non-HL7 content (no MSH): the parser raises a fatal.
    const bad = new TextEncoder().encode('{"resourceType":"Patient","secret":"ZZSENTINELLAST"}');
    const r = await parseCommand(["bad.hl7", "--format", "hl7"], deps(bad));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain("CLI_PARSE_FAILED");
    expect(r.stderr).toMatch(/\([A-Z0-9_]+\)/); // a stable code token, in parentheses
    expect(r.stderr).not.toContain("ZZSENTINELLAST");
  });

  it("a FHIR parser rejection is a data error (exit 65), value-free", async () => {
    // Force the FHIR branch on malformed JSON: the codec raises a fatal.
    const bad = new TextEncoder().encode("{ this is not json ZZSENTINELFIRST");
    const r = await parseCommand(["bad.json", "--format", "fhir"], deps(bad));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain("CLI_PARSE_FAILED");
    expect(r.stderr).not.toContain("ZZSENTINELFIRST");
  });
});

describe("parse — pass-through of the wrapped library's warnings", () => {
  it("surfaces FHIR issues as value-free envelope warnings (code + severity + expression)", async () => {
    // A high-precision decimal raises a read-time DECIMAL_PRECISION_AT_RISK issue (value-free).
    const withIssue = new TextEncoder().encode(
      '{"resourceType":"Observation","valueDecimal":1.00000000000000000001}',
    );
    const r = await parseCommand(["p.json", "--format", "fhir"], deps(withIssue));
    expect(r.exit).toBe(EXIT.OK);
    const env = JSON.parse(r.stdout) as { warnings: { code: string; expression?: string }[] };
    expect(env.warnings.length).toBeGreaterThan(0);
    for (const w of env.warnings) expect(typeof w.code).toBe("string");
  });

  it("surfaces HL7 warnings (e.g. MLLP framing stripped) as value-free envelope warnings", async () => {
    const framed = Buffer.concat([Buffer.from([0x0b]), HL7, Buffer.from([0x1c, 0x0d])]);
    const r = await parseCommand(["m.hl7", "--format", "hl7"], deps(framed));
    const env = JSON.parse(r.stdout) as { warnings: { code: string }[] };
    expect(env.warnings.length).toBeGreaterThan(0);
    expect(r.stderr).toContain("warning(s)");
  });
});

describe("parse — value-free warning note", () => {
  it("emits a value-free warning COUNT on stderr when the parse recovered warnings, unless --quiet", async () => {
    // MLLP framing bytes trigger a documented HL7 warning without any PHI.
    const framed = Buffer.concat([Buffer.from([0x0b]), HL7, Buffer.from([0x1c, 0x0d])]);
    const loud = await parseCommand(["m.hl7", "--format", "hl7"], deps(framed));
    const quiet = await parseCommand(["m.hl7", "--format", "hl7", "--quiet"], deps(framed));
    const env = JSON.parse(loud.stdout) as { warnings: unknown[] };
    if (env.warnings.length > 0) {
      expect(loud.stderr).toContain("warning(s)");
      expect(loud.stderr).not.toMatch(/ZZSENTINEL/);
      expect(quiet.stderr).toBe("");
    }
  });
});

describe("extractStableCode — only bare uppercase code tokens pass, never input bytes", () => {
  it("returns a stable code token from an error-shaped value", () => {
    expect(extractStableCode({ code: "MALFORMED_JSON" })).toBe("MALFORMED_JSON");
    expect(extractStableCode({ code: "MISSING_MSH_1" })).toBe("MISSING_MSH_1");
  });

  it("returns null when there is no code, a non-string code, a non-token, or a pure-digit code", () => {
    expect(extractStableCode(new Error("boom"))).toBeNull();
    expect(extractStableCode({ code: 123 })).toBeNull();
    expect(extractStableCode({ code: "patient ZZSENTINELLAST" })).toBeNull();
    expect(extractStableCode({ code: "000123" })).toBeNull(); // pure-digit → could be a raw MRN, refused
    expect(extractStableCode("just a string")).toBeNull();
    expect(extractStableCode(null)).toBeNull();
  });
});
