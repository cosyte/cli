import { readFileSync } from "node:fs";
import { join } from "node:path";

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
 * fails here. That is the whole point. The load-bearing rule the matrix guards: the CLI never prints
 * a reassuring line and exits `0` on input it could not handle.
 */

const HL7 = "MSH|^~\\&|A|B|C|D|20240101||ADT^A01|1|P|2.5\r";
const VALID_FHIR = '{"resourceType":"Patient","id":"x","gender":"male"}';
/** Parseable but outside the required binding: a real invalid verdict, not an unparseable input. */
const INVALID_FHIR = '{"resourceType":"Patient","gender":"masculine"}';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Feed the given bytes to both readers; the command chooses file-vs-stdin from its argv. */
function deps(bytes: Uint8Array): RunDeps {
  return { readFile: () => Promise.resolve(bytes), readStdin: () => Promise.resolve(bytes) };
}

/** A dep whose stdin read throws a NON-CliError: the only way to reach the internal-error path. */
const throwingStdin: RunDeps = {
  readFile: () => Promise.reject(new Error("boom")),
  readStdin: () => Promise.reject(new Error("boom")),
};

/** Two NDJSON records, so a consumer that goes away on the first write has a stream to interrupt. */
const TWO_RECORDS = `${VALID_FHIR}\n${VALID_FHIR}\n`;

/**
 * A dep whose output sink is a consumer that has gone away: the closed-pipe shape, reproduced
 * in-process. The real bins reach the same code through the platform's own closed-stream error.
 */
const closedConsumer: RunDeps = {
  readFile: () => Promise.resolve(enc(TWO_RECORDS)),
  readStdin: () => Promise.resolve(enc(TWO_RECORDS)),
  writeStdout: () => {
    throw new Error("the consumer closed the pipe");
  },
};

interface Case {
  readonly name: string;
  readonly argv: string[];
  readonly deps: RunDeps;
  readonly exit: number;
}

const MATRIX: readonly Case[] = [
  // 0: success / valid verdict.
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
  // 1: operation-level failure (a real, expected CI signal: parseable but invalid).
  {
    name: "validate a parseable-but-invalid FHIR resource → INVALID, never 0",
    argv: ["validate", "p.json", "--format", "fhir"],
    deps: deps(enc(INVALID_FHIR)),
    exit: EXIT.INVALID,
  },
  // 2: usage error.
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
  // 65: data error (unparseable / undetected / unsupported).
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
  // 66, no input (unreadable file), surfaced value-free by the injected reader.
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
  // 69: unavailable (a capability the ground layer does not cover here).
  {
    name: "redact a format @cosyte/deid has no adapter for",
    argv: ["redact", "r.astm", "--format", "astm"],
    deps: deps(enc("H|\\^&\r")),
    exit: EXIT.UNAVAILABLE,
  },
  {
    name: "validate --profile (no profile loader yet)",
    argv: ["validate", "m.hl7", "--profile", "us-core"],
    deps: deps(enc(HL7)),
    exit: EXIT.UNAVAILABLE,
  },
  // 70: internal error (an unexpected exception), distinct from a handled bad input.
  {
    name: "a non-CliError thrown from the input reader",
    argv: ["parse", "-"],
    deps: throwingStdin,
    exit: EXIT.SOFTWARE,
  },
  // 74: output error (the consumer closed the stream), deliberately NOT the internal-error code:
  // nothing went wrong in the CLI, and the answer did not reach the consumer.
  {
    name: "a downstream consumer that closed the output stream",
    argv: ["parse", "bulk.ndjson", "--ndjson", "--format", "fhir"],
    deps: closedConsumer,
    exit: EXIT.IOERR,
  },
];

describe("exit-code golden matrix: the documented contract is locked", () => {
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

/**
 * `redact`'s own row of the matrix. It is the command with the most ways to fail, and every one of
 * them has to land on a documented code: never `0` over input it could not strip, and never `70`,
 * which the contract reserves for a bug. The de-identification library's own exception message is
 * discarded on every path, exactly as a parser's is.
 */
describe("exit-code matrix: redact", () => {
  const FIXTURES = join(import.meta.dirname, "__fixtures__");
  const FIX = (name: string): Uint8Array => readFileSync(join(FIXTURES, name));

  const REDACT: readonly Case[] = [
    {
      name: "a clean pass over a covered format",
      argv: ["redact", "m.hl7"],
      deps: deps(FIX("adt-a01.hl7")),
      exit: EXIT.OK,
    },
    {
      name: "an input the de-identifier could not fully handle",
      argv: ["redact", "b.edi"],
      deps: deps(FIX("834-blocked.edi")),
      exit: EXIT.INVALID,
    },
    {
      name: "an unknown flag",
      argv: ["redact", "m.hl7", "--nope"],
      deps: deps(FIX("adt-a01.hl7")),
      exit: EXIT.USAGE,
    },
    {
      name: "bytes that do not parse as the resolved format (hl7)",
      argv: ["redact", "x.hl7", "--format", "hl7"],
      deps: deps(enc("{ not an hl7 message at all")),
      exit: EXIT.DATAERR,
    },
    {
      name: "bytes that do not parse as the resolved format (fhir)",
      argv: ["redact", "x.json", "--format", "fhir"],
      deps: deps(enc("{ not json")),
      exit: EXIT.DATAERR,
    },
    {
      name: "bytes that do not parse as the resolved format (x12)",
      argv: ["redact", "x.edi", "--format", "x12"],
      deps: deps(enc("nothing like an interchange")),
      exit: EXIT.DATAERR,
    },
    {
      name: "bytes that do not parse as the resolved format (ccda)",
      argv: ["redact", "x.xml", "--format", "ccda"],
      deps: deps(enc("<not-a-clinical-document")),
      exit: EXIT.DATAERR,
    },
    {
      name: "a format this CLI cannot serialize (dicom)",
      argv: ["redact", "s.dcm"],
      deps: deps(FIX("sample.dcm")),
      exit: EXIT.DATAERR,
    },
    {
      name: "empty input",
      argv: ["redact", "-"],
      deps: deps(new Uint8Array()),
      exit: EXIT.DATAERR,
    },
    {
      name: "a nonexistent path",
      argv: ["redact", "gone.hl7"],
      deps: {
        readFile: () =>
          Promise.reject(
            new CliError(CLI_CODES.CLI_NO_INPUT, EXIT.NOINPUT, "cannot read input file: gone.hl7"),
          ),
        readStdin: () => Promise.resolve(new Uint8Array()),
      },
      exit: EXIT.NOINPUT,
    },
    {
      name: "a format the de-identifier has no adapter for",
      argv: ["redact", "rx.xml"],
      deps: deps(FIX("newrx.xml")),
      exit: EXIT.UNAVAILABLE,
    },
  ];

  for (const c of REDACT) {
    it(`${c.name} → exit ${String(c.exit)}`, async () => {
      const r = await run([...c.argv], c.deps);
      expect(r.exit).toBe(c.exit);
    });
  }

  it("never reaches the internal-error code, and never emits an exception message", async () => {
    for (const c of REDACT) {
      const r = await run([...c.argv], c.deps);
      expect(r.exit, c.name).not.toBe(EXIT.SOFTWARE);
      expect(r.stderr, c.name).not.toMatch(/\s+at\s+\S+:\d+/); // no stack frame
      expect(r.stderr, c.name).not.toContain("CLI_INTERNAL");
    }
  });

  it("emits nothing on the data channel on every non-zero outcome", async () => {
    for (const c of REDACT) {
      if (c.exit === EXIT.OK) continue;
      const r = await run([...c.argv], c.deps);
      expect(r.stdout, c.name).toBe("");
    }
  });
});
