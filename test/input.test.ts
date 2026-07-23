import { describe, expect, it } from "vitest";

import { resolveInput } from "../src/core/input.js";
import { EXIT } from "../src/core/exit-codes.js";
import { CLI_CODES, CliError } from "../src/core/diagnostics.js";
import type { RunDeps } from "../src/core/io.js";

const enc = new TextEncoder();
const FHIR = enc.encode('{"resourceType":"Patient"}');
const HL7 = enc.encode("MSH|^~\\&|A|B|C|D|20240101||ADT^A01|1|P|2.5\r");

function deps(file: Uint8Array, stdin: Uint8Array = new Uint8Array()): RunDeps {
  return { readFile: () => Promise.resolve(file), readStdin: () => Promise.resolve(stdin) };
}

describe("resolveInput — the shared input + format front door", () => {
  it("resolves a file to a wired format + bytes (autodetected)", async () => {
    const r = await resolveInput("p.json", undefined, deps(FHIR), "parse");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.format).toBe("fhir");
      expect(r.input.bytes).toBe(FHIR);
    }
  });

  it("reads stdin for `-`", async () => {
    const r = await resolveInput("-", undefined, deps(new Uint8Array(), HL7), "parse");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.format).toBe("hl7");
  });

  it("honours a valid --format override", async () => {
    const r = await resolveInput("p.json", "fhir", deps(FHIR), "parse");
    expect(r.ok && r.input.format).toBe("fhir");
  });

  it("a missing source is a usage error (2)", async () => {
    const r = await resolveInput(undefined, undefined, deps(FHIR), "parse");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.result.exit).toBe(EXIT.USAGE);
      expect(r.result.stderr).toContain(CLI_CODES.CLI_USAGE);
    }
  });

  it("empty input is a data error (65)", async () => {
    const r = await resolveInput("-", undefined, deps(new Uint8Array(), new Uint8Array()), "parse");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.result.exit).toBe(EXIT.DATAERR);
  });

  it("an unknown --format is a usage error (2)", async () => {
    const r = await resolveInput("p.json", "xyz", deps(FHIR), "parse");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.result.exit).toBe(EXIT.USAGE);
  });

  it("an undetectable format is a data error (65), never a guess", async () => {
    const r = await resolveInput("x.txt", undefined, deps(enc.encode("hello world")), "parse");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.result.stderr).toContain(CLI_CODES.CLI_FORMAT_UNDETECTED);
  });

  it("a format that does not support the requested op is a data error (65), never faked", async () => {
    const r = await resolveInput("x.dcm", "dicom", deps(HL7), "parse");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.result.stderr).toContain(CLI_CODES.CLI_FORMAT_UNSUPPORTED);
  });

  it("a CliError read failure is caught and returned (66)", async () => {
    const failing: RunDeps = {
      readFile: () =>
        Promise.reject(
          new CliError(CLI_CODES.CLI_NO_INPUT, EXIT.NOINPUT, "cannot read input file"),
        ),
      readStdin: () => Promise.resolve(new Uint8Array()),
    };
    const r = await resolveInput("gone.json", undefined, failing, "parse");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.result.exit).toBe(EXIT.NOINPUT);
  });

  it("a non-CliError read failure propagates for the dispatcher to map", async () => {
    const boom: RunDeps = {
      readFile: () => Promise.reject(new Error("unexpected")),
      readStdin: () => Promise.resolve(new Uint8Array()),
    };
    await expect(resolveInput("x.json", undefined, boom, "parse")).rejects.toThrow("unexpected");
  });
});
