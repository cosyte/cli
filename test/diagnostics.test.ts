import { describe, expect, it } from "vitest";

import { CLI_CODES, CliError, formatDiagnostic, toCliError } from "../src/core/diagnostics.js";
import { EXIT } from "../src/core/exit-codes.js";

describe("CLI_CODES registry", () => {
  it("is key === value so the set survives Object.values into a snapshot", () => {
    for (const [k, v] of Object.entries(CLI_CODES)) expect(k).toBe(v);
  });
});

describe("CliError", () => {
  it("carries a code, an exit code, and a value-free message", () => {
    const e = new CliError(CLI_CODES.CLI_USAGE, EXIT.USAGE, "missing <file> argument");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("CliError");
    expect(e.code).toBe("CLI_USAGE");
    expect(e.exit).toBe(EXIT.USAGE);
    expect(e.message).toBe("missing <file> argument");
  });
});

describe("formatDiagnostic", () => {
  it("renders a stable, value-free stderr line", () => {
    const line = formatDiagnostic(
      new CliError(CLI_CODES.CLI_NO_INPUT, EXIT.NOINPUT, "cannot read the named file"),
    );
    expect(line).toBe("cosyte: CLI_NO_INPUT: cannot read the named file");
  });
});

describe("toCliError", () => {
  it("passes a CliError through unchanged", () => {
    const orig = new CliError(CLI_CODES.CLI_USAGE, EXIT.USAGE, "bad flag");
    expect(toCliError(orig)).toBe(orig);
  });

  it("maps any other thrown value to a value-free CLI_INTERNAL, discarding the original message", () => {
    const e = toCliError(new Error("PID-5 = ZZSENTINELLAST"));
    expect(e.code).toBe(CLI_CODES.CLI_INTERNAL);
    expect(e.exit).toBe(EXIT.SOFTWARE);
    expect(e.message).not.toContain("ZZSENTINELLAST");
  });

  it("maps a non-Error throw (e.g. a string) safely", () => {
    expect(toCliError("boom").code).toBe(CLI_CODES.CLI_INTERNAL);
  });
});
