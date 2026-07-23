import { describe, expect, it } from "vitest";

import { CLI_CODES, CliError } from "../src/core/diagnostics.js";
import { EXIT } from "../src/core/exit-codes.js";
import type { RunDeps } from "../src/core/io.js";
import { run } from "../src/core/run.js";

/**
 * CLI-7 release hardening: the **exit-code golden matrix**, locked as a stability contract.
 *
 * The documented exit-code map (`core/exit-codes.ts`, cli roadmap §4.3) is a designed surface that CI
 * pipelines and shell scripts branch on. This table pins one representative (command, input-class)
 * invocation for **every** code in the contract, driven end-to-end through the top-level {@link run}
 * dispatcher. A regression that turns an invalid-input exit `1` into a `0`, or that renumbers a code,
 * fails here — that is the whole point. The load-bearing rule the matrix guards: the CLI never prints
 * a reassuring line and exits `0` on input it could not handle.
 */

const HL7 = "MSH|^~\\&|A|B|C|D|20240101||ADT^A01|1|P|2.5\r";
const VALID_FHIR = '{"resourceType":"Patient","id":"x","gender":"male"}';
/** Parseable but outside the required binding — a real invalid verdict, not an unparseable input. */
const INVALID_FHIR = '{"resourceType":"Patient","gender":"masculine"}';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Feed the given bytes to both readers; the command chooses file-vs-stdin from its argv. */
function deps(bytes: Uint8Array): RunDeps {
  return { readFile: () => Promise.resolve(bytes), readStdin: () => Promise.resolve(bytes) };
}

/** A dep whose stdin read throws a NON-CliError — the only way to reach the internal-error path. */
const throwingStdin: RunDeps = {
  readFile: () => Promise.reject(new Error("boom")),
  readStdin: () => Promise.reject(new Error("boom")),
};

interface Case {
  readonly name: string;
  readonly argv: string[];
  readonly deps: RunDeps;
  readonly exit: number;
}

const MATRIX: readonly Case[] = [
  // 0 — success / valid verdict.
  { name: "--version", argv: ["--version"], deps: deps(new Uint8Array()), exit: EXIT.OK },
  {
    name: "parse a valid HL7 message",
    argv: ["parse", "m.hl7"],
    deps: deps(enc(HL7)),
    exit: EXIT.OK,
  },
  {
    name: "validate a valid FHIR resource",
    argv: ["validate", "p.json", "--format", "fhir"],
    deps: deps(enc(VALID_FHIR)),
    exit: EXIT.OK,
  },
  {
    name: "inspect a valid HL7 message",
    argv: ["inspect", "m.hl7"],
    deps: deps(enc(HL7)),
    exit: EXIT.OK,
  },
  // 1 — operation-level failure (a real, expected CI signal: parseable but invalid).
  {
    name: "validate a parseable-but-invalid FHIR resource → INVALID, never 0",
    argv: ["validate", "p.json", "--format", "fhir"],
    deps: deps(enc(INVALID_FHIR)),
    exit: EXIT.INVALID,
  },
  // 2 — usage error.
  {
    name: "an unknown command",
    argv: ["frobnicate"],
    deps: deps(new Uint8Array()),
    exit: EXIT.USAGE,
  },
  {
    name: "a missing <file> argument",
    argv: ["parse"],
    deps: deps(new Uint8Array()),
    exit: EXIT.USAGE,
  },
  {
    name: "an unknown flag",
    argv: ["parse", "m.hl7", "--nope"],
    deps: deps(enc(HL7)),
    exit: EXIT.USAGE,
  },
  // 65 — data error (unparseable / undetected / unsupported).
  {
    name: "an undetectable format",
    argv: ["parse", "m.txt"],
    deps: deps(enc("just some text")),
    exit: EXIT.DATAERR,
  },
  {
    name: "unparseable input under a forced format",
    argv: ["parse", "bad.json", "--format", "fhir"],
    deps: deps(enc("{ not json")),
    exit: EXIT.DATAERR,
  },
  {
    name: "a (format, op) the parser does not support",
    argv: ["parse", "x.dcm", "--format", "dicom"],
    deps: deps(enc(HL7)),
    exit: EXIT.DATAERR,
  },
  // 66 — no input (unreadable file), surfaced value-free by the injected reader.
  {
    name: "an unreadable file",
    argv: ["parse", "gone.hl7"],
    deps: {
      readFile: () =>
        Promise.reject(
          new CliError(CLI_CODES.CLI_NO_INPUT, EXIT.NOINPUT, "cannot read input file: gone.hl7"),
        ),
      readStdin: () => Promise.resolve(new Uint8Array()),
    },
    exit: EXIT.NOINPUT,
  },
  // 69 — unavailable (a capability gated on a not-yet-built ground layer).
  {
    name: "redact before @cosyte/deid ships",
    argv: ["redact", "m.hl7"],
    deps: deps(enc(HL7)),
    exit: EXIT.UNAVAILABLE,
  },
  {
    name: "validate --profile (no profile loader yet)",
    argv: ["validate", "m.hl7", "--profile", "us-core"],
    deps: deps(enc(HL7)),
    exit: EXIT.UNAVAILABLE,
  },
  // 70 — internal error (an unexpected exception), distinct from a handled bad input.
  {
    name: "a non-CliError thrown from the input reader",
    argv: ["parse", "-"],
    deps: throwingStdin,
    exit: EXIT.SOFTWARE,
  },
];

describe("exit-code golden matrix — the documented contract is locked", () => {
  for (const c of MATRIX) {
    it(`${c.name} → exit ${String(c.exit)}`, async () => {
      const r = await run([...c.argv], c.deps);
      expect(r.exit).toBe(c.exit);
    });
  }

  it("covers every code in the documented exit-code map", () => {
    const covered = new Set(MATRIX.map((c) => c.exit));
    for (const code of Object.values(EXIT)) {
      expect(covered.has(code)).toBe(true);
    }
  });

  it("the load-bearing rule: no invocation the CLI could not handle exits 0", async () => {
    for (const c of MATRIX) {
      if (c.exit === EXIT.OK) continue;
      const r = await run([...c.argv], c.deps);
      expect(r.exit).not.toBe(EXIT.OK);
    }
  });
});
