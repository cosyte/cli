import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { run } from "../src/core/run.js";
import { parseCommand } from "../src/commands/parse.js";
import {
  extractPhiPosture,
  unsafeInputSuffix,
  VALUE_FREE,
  SHOW_VALUES,
  UNSAFE_SHOW_VALUES_FLAG,
} from "../src/core/phi.js";
import { EXIT } from "../src/core/exit-codes.js";
import type { RunDeps } from "../src/core/io.js";

function deps(bytes: Uint8Array): RunDeps {
  return { readFile: () => Promise.resolve(bytes), readStdin: () => Promise.resolve(bytes) };
}

/** A malformed input carrying a sentinel PHI-shaped token, forced down a parser branch so it fails. */
const SENTINEL = "ZZSENTINELLAST";
const BAD_HL7 = new TextEncoder().encode(`{"resourceType":"Patient","secret":"${SENTINEL}"}`);

describe("extractPhiPosture — the single, order-independent flag resolver", () => {
  it("defaults to value-free when the flag is absent", () => {
    const { posture, argv } = extractPhiPosture(["parse", "x.hl7"]);
    expect(posture.showValues).toBe(false);
    expect(argv).toStrictEqual(["parse", "x.hl7"]);
  });

  it("recognises the flag before the subcommand and strips it", () => {
    const { posture, argv } = extractPhiPosture([UNSAFE_SHOW_VALUES_FLAG, "parse", "x.hl7"]);
    expect(posture.showValues).toBe(true);
    expect(argv).toStrictEqual(["parse", "x.hl7"]);
  });

  it("recognises the flag after the subcommand and strips every occurrence", () => {
    const { posture, argv } = extractPhiPosture([
      "parse",
      "x.hl7",
      UNSAFE_SHOW_VALUES_FLAG,
      UNSAFE_SHOW_VALUES_FLAG,
    ]);
    expect(posture.showValues).toBe(true);
    expect(argv).toStrictEqual(["parse", "x.hl7"]);
  });
});

describe("unsafeInputSuffix — the single value-echoing chokepoint", () => {
  it("returns empty under the value-free default (no value ever appended)", () => {
    expect(unsafeInputSuffix(BAD_HL7, VALUE_FREE)).toBe("");
  });

  it("returns a bounded, single-line excerpt under --unsafe-show-values", () => {
    const suffix = unsafeInputSuffix(BAD_HL7, SHOW_VALUES);
    expect(suffix).toContain("unsafe-show-values");
    expect(suffix).toContain(SENTINEL);
    expect(suffix).not.toContain("\n");
  });

  it("returns empty for empty input even under --unsafe-show-values", () => {
    expect(unsafeInputSuffix(new Uint8Array(), SHOW_VALUES)).toBe("");
  });

  it("bounds the excerpt length (does not dump a whole message)", () => {
    const big = new TextEncoder().encode("A".repeat(5000));
    const suffix = unsafeInputSuffix(big, SHOW_VALUES);
    // The excerpt itself is capped near UNSAFE_EXCERPT_MAX; the whole 5000 chars must not appear.
    expect(suffix.length).toBeLessThan(400);
  });
});

describe("the gate property — a value reaches stderr IFF --unsafe-show-values is set", () => {
  it("WITHOUT the flag: a parse failure is value-free (no sentinel on stderr)", async () => {
    const r = await run(["parse", "bad.hl7", "--format", "hl7"], deps(BAD_HL7));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain("CLI_PARSE_FAILED");
    expect(r.stderr).not.toContain(SENTINEL);
  });

  it("WITH the flag: the same failure MAY echo the offending input on stderr", async () => {
    const r = await run(
      ["parse", "bad.hl7", "--format", "hl7", UNSAFE_SHOW_VALUES_FLAG],
      deps(BAD_HL7),
    );
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain("CLI_PARSE_FAILED");
    expect(r.stderr).toContain(SENTINEL); // the door is open — the value is shown deliberately
  });

  it("the flag position is irrelevant (before the subcommand works too)", async () => {
    const r = await run(
      [UNSAFE_SHOW_VALUES_FLAG, "parse", "bad.hl7", "--format", "hl7"],
      deps(BAD_HL7),
    );
    expect(r.stderr).toContain(SENTINEL);
  });

  it("the flag does NOT move values onto stderr for a SUCCESSFUL parse", async () => {
    const fhir = new TextEncoder().encode(
      `{"resourceType":"Patient","name":[{"family":"${SENTINEL}"}]}`,
    );
    const r = await run(["parse", "p.json", UNSAFE_SHOW_VALUES_FLAG], deps(fhir));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stderr).not.toContain(SENTINEL); // stderr stays value-free on success
    expect(r.stdout).toContain(SENTINEL); // the model (the data channel) carries it, as requested
  });

  it("parseCommand defaults to the value-free posture when none is passed", async () => {
    const r = await parseCommand(["bad.hl7", "--format", "hl7"], deps(BAD_HL7));
    expect(r.stderr).not.toContain(SENTINEL);
  });
});

describe("never writes a temp file / never logs to a file", () => {
  it("no command creates any file in the working directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cosyte-cli-notmp-"));
    const cwd = process.cwd();
    try {
      process.chdir(dir);
      // A representative spread: a success, a failure, both with and without the unsafe flag, and the
      // redact command — none of these may leave a scratch/log file behind.
      const fhir = new TextEncoder().encode('{"resourceType":"Patient","id":"x"}');
      await run(["parse", "p.json"], deps(fhir));
      await run(["parse", "bad.hl7", "--format", "hl7"], deps(BAD_HL7));
      await run(["parse", "bad.hl7", "--format", "hl7", UNSAFE_SHOW_VALUES_FLAG], deps(BAD_HL7));
      await run(["redact", "p.json"], deps(fhir));
      expect(readdirSync(dir)).toStrictEqual([]);
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
