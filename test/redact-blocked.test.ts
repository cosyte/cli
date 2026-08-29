import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEID_BLOCKED, deidentifyOrFail, loadDeidDelegate, parseOrFail } from "../src/core/deid.js";
import { CliError } from "../src/core/diagnostics.js";
import { EXIT } from "../src/core/exit-codes.js";
import type { RunDeps } from "../src/core/io.js";
import { run } from "../src/core/run.js";

/**
 * The fail-closed rule, which is the whole reason this command is allowed to exist: when the
 * delegated de-identifier reports that it could **not** handle an element, the run is not a
 * de-identified copy and must not be offered as one. No output, a non-zero exit, and the blocked loci
 * named so the gap is visible rather than silently tolerated.
 *
 * `834.edi` drives this for real: measured against the delegate's default policy, ten of its loci
 * fall to the open-ended catch-all category and are blocked. It is not a doctored input; it is the
 * fixture the rest of the suite already parses.
 */

const FIXTURES = join(import.meta.dirname, "__fixtures__");
const X12 = readFileSync(join(FIXTURES, "834.edi"));
const HL7 = readFileSync(join(FIXTURES, "adt-a01.hl7"));

function deps(bytes: Uint8Array): RunDeps {
  return { readFile: () => Promise.resolve(bytes), readStdin: () => Promise.resolve(bytes) };
}

describe("a blocked locus is a refusal, never a de-identified copy", () => {
  it("the delegate really does block loci in this input (the premise, not just the remedy)", async () => {
    const delegate = await loadDeidDelegate();
    const { manifest } = await delegate.redact("x12", X12);
    const blocked = manifest.filter((e) => e.disposition === DEID_BLOCKED);
    expect(blocked.length).toBeGreaterThan(0);
  });

  it("exits 1: never 0, never the internal-error code", async () => {
    const r = await run(["redact", "834.edi"], deps(X12));
    expect(r.exit).toBe(EXIT.INVALID);
    expect(r.exit).toBe(1);
    expect(r.exit).not.toBe(EXIT.OK);
    expect(r.exit).not.toBe(EXIT.SOFTWARE);
  });

  it("emits nothing on the data channel: not a partial scrub, not a half-document", async () => {
    const r = await run(["redact", "834.edi"], deps(X12));
    expect(r.stdout).toBe("");
  });

  it("names every blocked locus and its disposition code", async () => {
    const delegate = await loadDeidDelegate();
    const { manifest } = await delegate.redact("x12", X12);
    const blocked = manifest.filter((e) => e.disposition === DEID_BLOCKED);

    const r = await run(["redact", "834.edi"], deps(X12));
    for (const entry of blocked) {
      expect(r.stderr).toContain(entry.locus);
      expect(r.stderr).toContain(entry.code);
    }
    expect(r.stderr).toContain("CLI_DEID_INCOMPLETE");
    expect(r.stderr).toContain(String(blocked.length));
  });

  it("no wording offers the run as a de-identified copy", async () => {
    const r = await run(["redact", "834.edi"], deps(X12));
    for (const channel of [r.stdout, r.stderr]) {
      expect(channel).not.toMatch(/HIPAA[- ]compliant|certified de-identified|is de-identified/i);
      expect(channel).not.toMatch(/de-identified copy (is )?(ready|written|emitted)/i);
    }
    expect(r.stderr).toContain("no output was emitted");
  });

  it("the refusal is value-free: no element value from the input reaches stderr", async () => {
    const r = await run(["redact", "834.edi"], deps(X12));
    // The blocked loci are the employer/insurer names, the street, the city and the policy number.
    for (const value of [
      "EMPLOYER CO",
      "MEDPAY INSURANCE",
      "100 MAIN ST",
      "COLUMBUS",
      "POLICY-0001",
      "OTHERGRP-1",
    ]) {
      expect(X12.toString("utf8")).toContain(value); // the input really carries it
      expect(r.stderr).not.toContain(value); // the diagnostic never does
    }
  });

  it("a fully-handled input is still a clean pass (the blocked path is not a blanket refusal)", async () => {
    const r = await run(["redact", "m.hl7"], deps(HL7));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout.length).toBeGreaterThan(0);
    expect(r.stderr).not.toContain("CLI_DEID_INCOMPLETE");
    expect(r.stderr).toContain("0 blocked");
  });
});

describe("the two failure boundaries: a rejected input and a fatal the library reports", () => {
  it("a parser rejection is a value-free data error naming the format and a stable code", () => {
    const thrown = ((): unknown => {
      try {
        parseOrFail("hl7", () => {
          throw Object.assign(new Error("MSH not found in ZZSENTINELLAST|..."), {
            code: "MISSING_MSH",
          });
        });
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(thrown).toBeInstanceOf(CliError);
    const err = thrown as CliError;
    expect(err.code).toBe("CLI_PARSE_FAILED");
    expect(err.exit).toBe(EXIT.DATAERR);
    expect(err.message).toContain("hl7");
    expect(err.message).toContain("MISSING_MSH");
    expect(err.message).not.toContain("ZZSENTINELLAST"); // the library's message is discarded
  });

  it("a parser rejection with no stable code still says nothing about the input", () => {
    try {
      parseOrFail("ccda", () => {
        throw new Error("unexpected token at ZZSENTINELFIRST");
      });
      expect.unreachable();
    } catch (e) {
      expect((e as CliError).code).toBe("CLI_PARSE_FAILED");
      expect((e as CliError).message).not.toContain("ZZSENTINELFIRST");
    }
  });

  it("a fatal the library names is an operation-level failure (exit 1), value-free", () => {
    try {
      deidentifyOrFail(() => {
        throw Object.assign(new Error("keyed transform, no key, for MRN-000123"), {
          code: "DEID_NO_KEY",
        });
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).code).toBe("CLI_DEID_INCOMPLETE");
      expect((e as CliError).exit).toBe(EXIT.INVALID);
      expect((e as CliError).message).toContain("DEID_NO_KEY");
      expect((e as CliError).message).not.toContain("MRN-000123");
    }
  });

  it("an error the library did NOT name propagates: a bug stays a bug, never a soft exit 1", () => {
    expect(() =>
      deidentifyOrFail(() => {
        throw new TypeError("cannot read properties of undefined");
      }),
    ).toThrow(TypeError);
  });

  it("a completed pass passes straight through both boundaries", () => {
    expect(parseOrFail("x12", () => 42)).toBe(42);
    const outcome = { output: "x", manifest: [] };
    expect(deidentifyOrFail(() => outcome)).toBe(outcome);
  });
});
