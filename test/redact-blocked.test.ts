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
 *
 * `adt-a01.hl7` drives it for HL7: its PV1-19 visit number falls to the same catch-all category
 * under the delegate's default policy, so the whole run is refused.
 */

const FIXTURES = join(import.meta.dirname, "__fixtures__");
const X12 = readFileSync(join(FIXTURES, "834.edi"));
const HL7_BLOCKED = readFileSync(join(FIXTURES, "adt-a01.hl7"));
const HL7_CLEAN = readFileSync(join(FIXTURES, "adt-a01-no-visit.hl7"));

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
      "GOLD PPO",
    ]) {
      expect(X12.toString("utf8")).toContain(value); // the input really carries it
      expect(r.stderr).not.toContain(value); // the diagnostic never does
    }
  });

  // AC-7: the clean HL7 input, so the blocked path is shown not to be a blanket refusal.
  it("a fully-handled input is still a clean pass (the blocked path is not a blanket refusal)", async () => {
    const r = await run(["redact", "m.hl7"], deps(HL7_CLEAN));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout.length).toBeGreaterThan(0);
    expect(r.stderr).not.toContain("CLI_DEID_INCOMPLETE");
    expect(r.stderr).toContain("0 blocked");
  });
});

describe("an X12 value the delegate cannot place is blocked, so the run is refused", () => {
  // The clean 834 (it redacts with exit 0), changed in one place each. The delegate decides every
  // X12 element it outputs, so a value at a position no rule names, or a code it does not recognise,
  // is blocked rather than passed through, and the whole run is refused.
  const CLEAN = readFileSync(join(FIXTURES, "834-enrollee.edi"), "latin1");
  const variant = (from: string, to: string): Buffer => {
    expect(CLEAN).toContain(from);
    return Buffer.from(CLEAN.replace(from, to), "latin1");
  };
  /** Every value the 834 carries that could identify the member, plus each case's own planted value. */
  const VALUES = ["ZZSENTINELLAST", "ZZSENTINELFIRST", "MRN-000123", "19800101", "ZZEXTRA"];

  const CASES = [
    {
      name: "a REF-03 after the member's REF-02 (a position no rule names)",
      bytes: variant("REF*0F*MRN-000123~", "REF*0F*MRN-000123*ZZEXTRA~"),
    },
    {
      name: "an NM1-01 entity code the delegate does not recognise (lower case 'il')",
      bytes: variant("NM1*IL*", "NM1*il*"),
    },
  ];

  it("the clean 834 these cases start from still redacts with exit 0", async () => {
    const r = await run(["redact", "e.edi"], deps(Buffer.from(CLEAN, "latin1")));
    expect(r.exit).toBe(EXIT.OK);
  });

  for (const c of CASES) {
    it(`${c.name}: exits 1, emits nothing, and echoes no value from the document`, async () => {
      const r = await run(["redact", "e.edi"], deps(c.bytes));
      expect(r.exit).toBe(EXIT.INVALID);
      expect(r.exit).toBe(1);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain("CLI_DEID_INCOMPLETE");
      expect(r.stderr).toContain("DEID_LOCUS_BLOCKED");
      expect(r.stderr).toContain("no output was emitted");
      const text = c.bytes.toString("latin1");
      for (const value of VALUES.filter((v) => text.includes(v))) {
        expect(r.stdout).not.toContain(value);
        expect(r.stderr).not.toContain(value);
      }
    });
  }
});

describe("an HL7 visit number is blocked by the delegate, so the run is refused", () => {
  /** The delegate's own manifest for `adt-a01.hl7`, and its blocked entries. */
  async function delegateBlocked(): Promise<
    readonly { locus: string; count: number; disposition: string; code: string }[]
  > {
    const delegate = await loadDeidDelegate();
    const { manifest } = await delegate.redact("hl7", HL7_BLOCKED);
    return manifest.filter((e) => e.disposition === DEID_BLOCKED);
  }

  // AC-3: the premise, measured on the installed delegate rather than assumed.
  it("the delegate's own manifest blocks the PV1 visit-number locus with DEID_LOCUS_BLOCKED", async () => {
    const blocked = await delegateBlocked();
    const visit = blocked.filter((e) => /^PV1-19(\[|$)/.test(e.locus));
    expect(visit).toHaveLength(1);
    expect(visit[0]?.code).toBe("DEID_LOCUS_BLOCKED");
  });

  // AC-3
  it("exits 1 with nothing on stdout, CLI_DEID_INCOMPLETE and 'no output was emitted'", async () => {
    const r = await run(["redact", "adt-a01.hl7"], deps(HL7_BLOCKED));
    expect(r.exit).toBe(EXIT.INVALID);
    expect(r.exit).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("CLI_DEID_INCOMPLETE");
    expect(r.stderr).toContain("no output was emitted");
  });

  // AC-3: every blocked entry, its locus and disposition code exactly as the delegate reported them.
  it("names every blocked locus with its code, on one stderr line each", async () => {
    const blocked = await delegateBlocked();
    expect(blocked.length).toBeGreaterThan(0);

    const r = await run(["redact", "adt-a01.hl7"], deps(HL7_BLOCKED));
    const lines = r.stderr.split("\n");
    for (const entry of blocked) {
      const line = lines.find((l) => l.includes(` ${entry.locus} x${String(entry.count)} `));
      expect(line, entry.locus).toBeDefined();
      expect(line).toMatch(new RegExp(` ${entry.disposition} ${entry.code}$`));
    }
  });
});

describe("the two failure boundaries: a rejected input and a fatal the library reports", () => {
  // AC-14
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

  // AC-14
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

  // AC-14
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

  // AC-14
  it("an error the library did NOT name propagates: a bug stays a bug, never a soft exit 1", () => {
    expect(() =>
      deidentifyOrFail(() => {
        throw new TypeError("cannot read properties of undefined");
      }),
    ).toThrow(TypeError);
  });

  // AC-14
  it("a completed pass passes straight through both boundaries", () => {
    expect(parseOrFail("x12", () => 42)).toBe(42);
    const outcome = { output: "x", manifest: [] };
    expect(deidentifyOrFail(() => outcome)).toBe(outcome);
  });
});
