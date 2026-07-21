import { describe, expect, it } from "vitest";

import { run } from "../src/core/run.js";
import { EXIT } from "../src/core/exit-codes.js";
import type { RunDeps } from "../src/core/io.js";

const noDeps: RunDeps = {
  readFile: () => Promise.resolve(new Uint8Array()),
  readStdin: () => Promise.resolve(new Uint8Array()),
};

describe("run — top-level dispatch", () => {
  it("no arguments prints help on stdout, exit 0", async () => {
    const r = await run([], noDeps);
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toContain("Usage:");
    expect(r.stderr).toBe("");
  });

  it("--help / -h prints help, exit 0", async () => {
    expect((await run(["--help"], noDeps)).stdout).toContain("parse");
    expect((await run(["-h"], noDeps)).exit).toBe(EXIT.OK);
  });

  it("`parse --help` shows help rather than erroring", async () => {
    const r = await run(["parse", "--help"], noDeps);
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toContain("Usage:");
  });

  it("--version / -V prints the version, exit 0", async () => {
    const r = await run(["--version"], noDeps);
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect((await run(["-V"], noDeps)).exit).toBe(EXIT.OK);
  });

  it("an unknown command is a usage error (exit 2)", async () => {
    const r = await run(["frobnicate"], noDeps);
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stderr).toContain("CLI_USAGE");
    expect(r.stderr).toContain("unknown command");
  });

  it("routes `parse` to the parse command", async () => {
    const fhir = new TextEncoder().encode('{"resourceType":"Patient"}');
    const r = await run(["parse", "-"], {
      readFile: () => Promise.resolve(new Uint8Array()),
      readStdin: () => Promise.resolve(fhir),
    });
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toContain('"fhir"');
  });

  it("maps an unexpected exception to CLI_INTERNAL (exit 70), value-free", async () => {
    const boom: RunDeps = {
      readFile: () => Promise.reject(new Error("SECRET-PHI-IN-MESSAGE")),
      readStdin: () => Promise.resolve(new Uint8Array()),
    };
    const r = await run(["parse", "x.hl7"], boom);
    expect(r.exit).toBe(EXIT.SOFTWARE);
    expect(r.stderr).toContain("CLI_INTERNAL");
    expect(r.stderr).not.toContain("SECRET-PHI-IN-MESSAGE");
  });
});
