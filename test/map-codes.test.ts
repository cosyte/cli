import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mapCodesCommand } from "../src/commands/map-codes.js";
import { CLI_CODES, CliError } from "../src/core/diagnostics.js";
import { EXIT } from "../src/core/exit-codes.js";
import type { RunDeps } from "../src/core/io.js";

const FIXTURES = join(import.meta.dirname, "__fixtures__");
const CMAP = readFileSync(join(FIXTURES, "gender.conceptmap.json"));
const GENDER_SYSTEM = "http://hl7.org/fhir/administrative-gender";

function fileDeps(bytes: Uint8Array): RunDeps {
  return { readFile: () => Promise.resolve(bytes), readStdin: () => Promise.resolve(bytes) };
}

describe("map-codes — translate a code through a BYO FHIR ConceptMap", () => {
  it("translates a matched source code → target coding on stdout, exit 0", async () => {
    const r = await mapCodesCommand(
      ["gender.json", "--system", GENDER_SYSTEM, "--code", "male"],
      fileDeps(CMAP),
    );
    expect(r.exit).toBe(EXIT.OK);
    const body = JSON.parse(r.stdout) as {
      source: { code: string; system?: string };
      result: { unmapped: boolean; matches?: { target: { code: string; system?: string } }[] };
    };
    expect(body.source.code).toBe("male");
    expect(body.result.unmapped).toBe(false);
    expect(body.result.matches?.[0]?.target.code).toBe("M");
    expect(r.stderr).toContain("1 match(es)");
  });

  it("reads the ConceptMap from stdin via `-`", async () => {
    const r = await mapCodesCommand(
      ["-", "--system", GENDER_SYSTEM, "--code", "female"],
      fileDeps(CMAP),
    );
    expect(r.exit).toBe(EXIT.OK);
    const body = JSON.parse(r.stdout) as { result: { matches?: { target: { code: string } }[] } };
    expect(body.result.matches?.[0]?.target.code).toBe("F");
  });

  it("an unmapped source code → exit 1 with the value-free unmapped signal", async () => {
    const r = await mapCodesCommand(
      ["gender.json", "--system", GENDER_SYSTEM, "--code", "other"],
      fileDeps(CMAP),
    );
    expect(r.exit).toBe(EXIT.INVALID);
    const body = JSON.parse(r.stdout) as { result: { unmapped: boolean; code?: string } };
    expect(body.result.unmapped).toBe(true);
    expect(body.result.code).toBe("TERM_TRANSLATE_UNMAPPED");
    expect(r.stderr).toContain("TERM_TRANSLATE_UNMAPPED");
  });

  it("--json emits a compact { source, result } envelope, value-free stderr", async () => {
    const r = await mapCodesCommand(
      ["gender.json", "--system", GENDER_SYSTEM, "--code", "male", "--json"],
      fileDeps(CMAP),
    );
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stderr).toBe("");
    const body = JSON.parse(r.stdout) as { source: unknown; result: { unmapped: boolean } };
    expect(body.result.unmapped).toBe(false);
  });

  it("--quiet suppresses the stderr note (the exit code is the whole signal)", async () => {
    const r = await mapCodesCommand(
      ["gender.json", "--system", GENDER_SYSTEM, "--code", "other", "--quiet"],
      fileDeps(CMAP),
    );
    expect(r.exit).toBe(EXIT.INVALID);
    expect(r.stderr).toBe("");
  });

  it("a system-less source still translates against every group", async () => {
    const r = await mapCodesCommand(["gender.json", "--code", "male"], fileDeps(CMAP));
    expect(r.exit).toBe(EXIT.OK);
  });

  it("carries the optional --version and --display through to the echoed source", async () => {
    const r = await mapCodesCommand(
      [
        "gender.json",
        "--system",
        GENDER_SYSTEM,
        "--code",
        "male",
        "--version",
        "4.0.1",
        "--display",
        "Male",
      ],
      fileDeps(CMAP),
    );
    expect(r.exit).toBe(EXIT.OK);
    const body = JSON.parse(r.stdout) as { source: { version?: string; display?: string } };
    expect(body.source.version).toBe("4.0.1");
    expect(body.source.display).toBe("Male");
  });

  it("a missing <conceptmap> argument is a usage error (exit 2)", async () => {
    const r = await mapCodesCommand(["--code", "male"], fileDeps(CMAP));
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stderr).toContain("missing <conceptmap>");
  });

  it("a missing --code is a usage error (exit 2)", async () => {
    const r = await mapCodesCommand(["gender.json"], fileDeps(CMAP));
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stderr).toContain("requires --code");
  });

  it("an unknown flag is a usage error (exit 2)", async () => {
    const r = await mapCodesCommand(["gender.json", "--code", "male", "--nope"], fileDeps(CMAP));
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stderr).toContain(CLI_CODES.CLI_USAGE);
  });

  it("an unreadable ConceptMap file is a value-free no-input error (exit 66)", async () => {
    const noInput: RunDeps = {
      readFile: () =>
        Promise.reject(
          new CliError(CLI_CODES.CLI_NO_INPUT, EXIT.NOINPUT, "cannot read input file"),
        ),
      readStdin: () => Promise.resolve(new Uint8Array()),
    };
    const r = await mapCodesCommand(["missing.json", "--code", "male"], noInput);
    expect(r.exit).toBe(EXIT.NOINPUT);
    expect(r.stderr).toContain(CLI_CODES.CLI_NO_INPUT);
  });

  it("empty ConceptMap input is a data error (exit 65)", async () => {
    const r = await mapCodesCommand(["empty.json", "--code", "male"], fileDeps(new Uint8Array()));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain(CLI_CODES.CLI_EMPTY_INPUT);
  });

  it("a ConceptMap that is not valid JSON is a value-free CLI_MAP_INVALID (exit 65)", async () => {
    const bad = new TextEncoder().encode("{ not json");
    const r = await mapCodesCommand(["bad.json", "--code", "male"], fileDeps(bad));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain(CLI_CODES.CLI_MAP_INVALID);
    expect(r.stderr).toContain("not valid JSON");
  });

  it("a structurally-invalid ConceptMap surfaces the stable loader code, not its bytes", async () => {
    const notAMap = new TextEncoder().encode(JSON.stringify({ resourceType: "Patient" }));
    const r = await mapCodesCommand(["patient.json", "--code", "male"], fileDeps(notAMap));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain(CLI_CODES.CLI_MAP_INVALID);
    expect(r.stderr).toContain("TERM_CONCEPTMAP_MALFORMED");
  });

  it("propagates an unexpected (non-CliError) read failure for the dispatcher to map", async () => {
    const boom: RunDeps = {
      readFile: () => Promise.reject(new Error("boom")),
      readStdin: () => Promise.resolve(new Uint8Array()),
    };
    await expect(mapCodesCommand(["x.json", "--code", "male"], boom)).rejects.toThrow();
  });
});
