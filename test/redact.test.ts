import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { redactCommand } from "../src/commands/redact.js";
import {
  deidStatus,
  loadDeidDelegate,
  DEID_UNAVAILABLE_REASON,
  type DeidDelegate,
} from "../src/core/deid.js";
import { EXIT } from "../src/core/exit-codes.js";
import type { RunDeps } from "../src/core/io.js";
import { run } from "../src/core/run.js";

/**
 * `redact`/`deid` is the one command whose job is to strip identifiers. Everything it does is
 * delegated to `@cosyte/deid`; what it owns is the **refusal discipline**, and the load-bearing half
 * of that discipline is this: when the de-identification library is absent from the install, the
 * command must not touch the input it cannot strip. These deps reject on any read, so a passing test
 * proves no read occurred.
 */
const throwOnRead: RunDeps = {
  readFile: () => Promise.reject(new Error("redact must never read input when it cannot strip it")),
  readStdin: () =>
    Promise.reject(new Error("redact must never read input when it cannot strip it")),
};

const HL7 = readFileSync(join(import.meta.dirname, "__fixtures__", "adt-a01.hl7"));
const fileDeps = (bytes: Uint8Array): RunDeps => ({
  readFile: () => Promise.resolve(bytes),
  readStdin: () => Promise.resolve(bytes),
});

/** The error Node's ESM resolver actually raises for a package that is not installed. */
function moduleNotFound(specifier: string): Error {
  const e = new Error(`Cannot find package '${specifier}' imported from /app/dist/index.mjs`);
  (e as NodeJS.ErrnoException).code = "ERR_MODULE_NOT_FOUND";
  return e;
}

/** The real loader with its root import forced to the resolver failure an absent package raises. */
const absentLibrary = (): ReturnType<typeof loadDeidDelegate> =>
  loadDeidDelegate(() => Promise.reject(moduleNotFound("@cosyte/deid")));

describe("the de-id seam: the single point that answers 'is the ground layer here?'", () => {
  it("reports available, naming the delegated library and quoting its own label", async () => {
    const status = await deidStatus();
    expect(status.available).toBe(true);
    expect(status.reason).toContain("@cosyte/deid");
    expect(status.reason).toContain("Safe-Harbor-transformed");
  });

  it("reports unavailable, value-free, when the library cannot be resolved", async () => {
    const status = await deidStatus(absentLibrary);
    expect(status.available).toBe(false);
    expect(status.reason).toBe(DEID_UNAVAILABLE_REASON);
    expect(status.reason).toContain("@cosyte/deid");
    expect(status.reason).not.toMatch(/\s+at\s+\S+:\d+/); // no stack frame
  });

  it("propagates a non-resolution failure rather than reporting it as 'unavailable'", async () => {
    await expect(deidStatus(() => Promise.reject(new Error("a real library bug")))).rejects.toThrow(
      "a real library bug",
    );
  });
});

describe("redact with @cosyte/deid absent: 69, value-free, and the input is never read", () => {
  it("`redact <file>` exits 69 with empty stdout and never reads the file", async () => {
    const r = await redactCommand(["message.hl7"], throwOnRead, absentLibrary);
    expect(r.exit).toBe(EXIT.UNAVAILABLE);
    expect(r.exit).toBe(69);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("CLI_PARSER_UNAVAILABLE");
  });

  it("`redact -` (stdin form) exits 69 and never drains stdin", async () => {
    const r = await redactCommand(["-"], throwOnRead, absentLibrary);
    expect(r.exit).toBe(EXIT.UNAVAILABLE);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("CLI_PARSER_UNAVAILABLE");
  });

  it("names the package and says how to get it, with no stack frame and no input value", async () => {
    const r = await redactCommand(["message.hl7"], throwOnRead, absentLibrary);
    expect(r.stderr).toContain("@cosyte/deid");
    expect(r.stderr).toContain("optional dependency");
    expect(r.stderr).not.toMatch(/\s+at\s+\S+:\d+/);
    expect(r.stderr).not.toContain("message.hl7\n"); // the path is not echoed as content
  });

  it("never claims success or offers a scrubbed copy it did not produce", async () => {
    const r = await redactCommand(["message.hl7"], throwOnRead, absentLibrary);
    expect(r.stdout).toBe("");
    expect(r.stderr).not.toMatch(/de-identified copy (is )?(ready|written|emitted)/i);
  });

  it("an unknown flag is a usage error (exit 2), decided before anything else", async () => {
    const r = await redactCommand(["message.hl7", "--nope"], throwOnRead, absentLibrary);
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stderr).toContain("CLI_USAGE");
    expect(r.stdout).toBe("");
  });

  it("a missing <file> argument is a usage error, not a fake success", async () => {
    const r = await redactCommand([], fileDeps(HL7));
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stdout).toBe("");
  });
});

describe("a bug in the delegated library stays a bug", () => {
  it("an unrecognised throw propagates to the dispatcher rather than becoming a soft failure", async () => {
    // A CliError is a condition the command answers for; anything else is a defect, and the
    // contract reserves exit 70 for exactly that. The command must not dress it up as an
    // operation-level failure. The dispatcher then scrubs the message to a value-free
    // CLI_INTERNAL (`toCliError`, covered in diagnostics.test.ts), so no library exception text
    // ever reaches the terminal.
    const buggy: DeidDelegate = {
      label: "a label",
      version: "0.0.0",
      redact: () => Promise.reject(new TypeError("boom ZZSENTINELLAST")),
    };
    await expect(
      redactCommand(["m.hl7"], fileDeps(HL7), () => Promise.resolve(buggy)),
    ).rejects.toThrow(TypeError);
  });
});

describe("redact via run(): both command names reach the same wired command", () => {
  for (const cmd of ["redact", "deid"]) {
    it(`\`${cmd}\` produces a de-identified document and a manifest`, async () => {
      const r = await run([cmd, "m.hl7"], fileDeps(HL7));
      expect(r.exit).toBe(EXIT.OK);
      expect(r.stdout).toContain("MSH|");
      expect(r.stderr).toContain("@cosyte/deid");
    });
  }

  it("accepts the --format override", async () => {
    const r = await run(["redact", "m.hl7", "--format", "hl7"], fileDeps(HL7));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toContain("MSH|");
  });

  it("`redact -` reads stdin and de-identifies it", async () => {
    const r = await run(["redact", "-"], fileDeps(HL7));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toContain("MSH|");
  });
});
