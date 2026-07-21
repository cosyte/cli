import { describe, expect, it } from "vitest";

import { redactCommand } from "../src/commands/redact.js";
import { run } from "../src/core/run.js";
import { EXIT } from "../src/core/exit-codes.js";
import { deidStatus } from "../src/core/deid.js";
import type { RunDeps } from "../src/core/io.js";

/**
 * `redact`/`deid` is the one command whose job is to strip PHI. Until `@cosyte/deid` ships, it must be
 * an HONEST, typed `CLI_NOT_IMPLEMENTED` — never a fake success, never a partial scrub presented as
 * de-identified (the cardinal false-safety hazard). It must also never touch the input it cannot yet
 * safely strip: these deps reject on any read, so a passing test proves the input was never read.
 */
const throwOnRead: RunDeps = {
  readFile: () => Promise.reject(new Error("redact must never read input")),
  readStdin: () => Promise.reject(new Error("redact must never read input")),
};

describe("redact/deid — honest NOT_IMPLEMENTED gated on @cosyte/deid", () => {
  it("the de-id seam reports unavailable (the gate the command reads before touching input)", () => {
    const status = deidStatus();
    expect(status.available).toBe(false);
    expect(status.reason).toContain("@cosyte/deid");
  });

  it("`redact <file>` is a distinct non-zero exit (69), value-free, empty stdout", () => {
    const r = redactCommand(["message.hl7"]);
    expect(r.exit).toBe(EXIT.UNAVAILABLE);
    expect(r.exit).toBe(69);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("CLI_NOT_IMPLEMENTED");
  });

  it("never claims success or de-identification (no false-safety wording)", () => {
    const r = redactCommand(["message.hl7"]);
    // It must not read as "here is your de-identified / redacted output".
    expect(r.stderr).toMatch(/not yet available/i);
    expect(r.stderr).not.toMatch(/de-identified copy (is )?(ready|written|emitted)/i);
    expect(r.stdout).toBe(""); // no output that could be mistaken for a scrubbed model
  });

  it("an unknown flag is a usage error (exit 2), not a fake success", () => {
    const r = redactCommand(["message.hl7", "--nope"]);
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stderr).toContain("CLI_USAGE");
  });

  it("accepts the future surface (--format) without erroring the parse", () => {
    const r = redactCommand(["message.hl7", "--format", "hl7"]);
    expect(r.exit).toBe(EXIT.UNAVAILABLE);
  });

  it("via run(): both `redact` and `deid` route here and never read input", async () => {
    for (const cmd of ["redact", "deid"]) {
      const r = await run([cmd, "secret.hl7"], throwOnRead);
      expect(r.exit).toBe(EXIT.UNAVAILABLE);
      expect(r.stderr).toContain("CLI_NOT_IMPLEMENTED");
      expect(r.stdout).toBe("");
    }
  });

  it("via run(): `redact -` (stdin form) still never drains stdin", async () => {
    const r = await run(["redact", "-"], throwOnRead);
    expect(r.exit).toBe(EXIT.UNAVAILABLE);
    expect(r.stdout).toBe("");
  });
});
