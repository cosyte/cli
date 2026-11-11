/**
 * The scaling gate for the `cosyte` command, from `@cosyte/test-utils/perf`, run by `pnpm test:perf`
 * and never under coverage (see `vitest.perf.config.ts`).
 *
 * It asks one question: does the command's cost grow faster than its input? Each gate runs the
 * whole command in process (argument parsing, autodetection, the chunked read, the wrapped parser
 * and the JSON written to stdout) through `sync-cli.ts`, on two axes: 4 times the inputs, and inputs
 * 4 times longer. Each ratio must stay inside the band the shared contract fixes. It does not see a
 * constant-factor slowdown: a command 10% slower everywhere passes, and always will. The base
 * against head comparison on a pull request (`bench/cli.bench.mjs`) is the instrument for that.
 *
 * Two paths, because they are two different loops in this package:
 * - `cosyte validate` on one HL7 v2 message: the single-message path, which reads the whole input,
 *   detects its format, parses it once and reports a verdict;
 * - `cosyte parse --ndjson` on a bulk file of FHIR Patients: the multi-record path, which splits the
 *   input into lines as it arrives, parses each and writes one NDJSON line a record.
 *
 * Neither is the HL7 `parse` with its JSON model: its cost per segment is high enough that a
 * quadratic of the size the self-check plants would only show above a few thousand segments, where
 * one pass takes too long for the warmup to settle on a shared runner. The library's own gate holds
 * the parse; the JSON the command writes is one `JSON.stringify`.
 *
 * The self-check of each proves its fixtures are large enough for the gate to fail: the same command
 * on the same bytes, reached quadratically (every segment, or every line, found by scanning from the
 * start of the input), must clear the ceiling at exactly these sizes. Every input is synthetic and
 * built here from an index.
 */

import {
  assertScalingGateFires,
  scalingGate,
  type ScalingGateOptions,
} from "@cosyte/test-utils/perf";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startSyncCli, type SyncCli, type SyncResult } from "./sync-cli.js";

const encoder = new TextEncoder();

/** A synthetic ADT^A01 of five segments, the same length for every index. No PHI. */
function adtMessage(i: number): string {
  const id = String(i % 1_000_000).padStart(6, "0");
  return (
    `MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|A${id}|P|2.5\r` +
    `EVN|A01|20260101120000\r` +
    `PID|1||FAKE${id}^^^HOSP^MR||Doe^Jane^Q||19800101|F|||123 Main St^^Anytown^CA^90001\r` +
    `NK1|1|Doe^John^R|SPO|123 Main St^^Anytown^CA^90001\r` +
    `PV1|1|I|WARD^101^A|||||DOC123^Smith^Robert\r`
  );
}

/** A synthetic ORU^R01 with `obx` result lines. No PHI. */
function oruMessage(i: number, obx: number): Uint8Array {
  const id = String(i % 1_000_000).padStart(6, "0");
  const results = Array.from(
    { length: obx },
    (_v, k) =>
      `OBX|${String(k + 1)}|NM|GLU^Glucose^LN||${String(80 + (k % 40))}|mg/dL|70-110|N|||F|||20260101120000`,
  ).join("\r");
  return encoder.encode(
    `MSH|^~\\&|LAB|SENDFAC|EHR|RECVFAC|20260101120000||ORU^R01|R${id}|P|2.5\r` +
      `PID|1||FAKE${id}^^^HOSP^MR||Roe^Sam^T||19750615|M\r` +
      `OBR|1||ACC${id}|CBC^Complete Blood Count^LN|||20260101120000\r` +
      `${results}\r`,
  );
}

/**
 * A synthetic FHIR Patient on one line, about 600 bytes, the same length for every index. No PHI:
 * every name, identifier, address and number is made up.
 */
function patientLine(i: number): string {
  const id = String(i % 1_000_000).padStart(6, "0");
  return `${JSON.stringify({
    resourceType: "Patient",
    id: `syn-${id}`,
    identifier: [{ system: "urn:oid:2.16.840.1.113883.19.999", value: `MRN${id}` }],
    active: true,
    name: [{ use: "official", family: "Doe", given: ["Jane", "Q"] }],
    telecom: [{ system: "phone", value: "(555) 555-0100", use: "home" }],
    gender: "female",
    birthDate: "1980-01-01",
    address: [
      { line: ["123 Main St"], city: "Anytown", state: "CA", postalCode: "00000", country: "US" },
    ],
    maritalStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus",
          code: "M",
          display: "Married",
        },
      ],
    },
  })}\n`;
}

/** NDJSON of `lines` synthetic Patients, one a line: a bulk data export file. No PHI. */
function patientNdjson(i: number, lines: number): Uint8Array {
  const out: string[] = [];
  for (let k = 0; k < lines; k++) out.push(patientLine(i * 100_000 + k));
  return encoder.encode(out.join(""));
}

/**
 * The bytes of `input`, rebuilt the slow way: each piece that ends with `terminator` is found by
 * scanning from the first byte, one byte at a time, so the cost grows with the square of the number
 * of pieces. The rebuilt bytes are the input's own, which the self-check confirms before it times
 * anything.
 */
function rebuildQuadratic(input: Uint8Array, terminator: number): Uint8Array {
  let pieces = 0;
  for (const byte of input) if (byte === terminator) pieces++;
  const out = new Uint8Array(input.length);
  let written = 0;
  for (let p = 0; p < pieces; p++) {
    let start = 0;
    let seen = 0;
    while (seen < p) if (input[start++] === terminator) seen++;
    // The end is found the same way, from the first byte, as a splitter that keeps no offsets does.
    let end = 0;
    let ended = 0;
    while (ended <= p) if (input[end++] === terminator) ended++;
    end--;
    out.set(input.subarray(start, end + 1), written);
    written += end + 1 - start;
  }
  out.set(input.subarray(written), written);
  return out;
}

const CR = 0x0d;
const LF = 0x0a;

let cli: SyncCli;

beforeAll(() => {
  cli = startSyncCli();
});

afterAll(async () => {
  await cli.close();
});

/** What a run is reduced to: it must have succeeded and written something. */
function weigh(result: SyncResult): number {
  if (result.exit !== 0) throw new Error(`the command exited ${String(result.exit)}`);
  return result.written;
}

function same(a: SyncResult, b: SyncResult): boolean {
  return a.exit === b.exit && a.written === b.written;
}

/** `cosyte validate` on one message. Both phases, and the self-check, use exactly these. */
function singleMessage(): ScalingGateOptions<Uint8Array, SyncResult> {
  return {
    name: "cosyte validate, one HL7 v2 message",
    parse: (bytes) => cli.call(["validate", "--json", "message.hl7"], bytes),
    weigh,
    count: { n: 100, generate: (i) => encoder.encode(adtMessage(i)) },
    // Four inputs: on a GitHub-hosted runner two of them made a base phase of 3.9 ms, under the
    // gate's 4 ms floor.
    size: { inputs: 4, size: 500, generate: (i, size) => oruMessage(i, size) },
  };
}

/** `cosyte parse --ndjson` on a bulk file. Both phases, and the self-check, use exactly these. */
function ndjsonRecords(): ScalingGateOptions<Uint8Array, SyncResult> {
  return {
    name: "cosyte parse --ndjson, FHIR Patients",
    parse: (bytes) => cli.call(["parse", "--ndjson", "patients.ndjson"], bytes),
    weigh,
    count: { n: 50, generate: (i) => patientNdjson(i, 4) },
    // 320 lines. On GitHub-hosted runners the planted quadratic cleared the ceiling by a margin of
    // 1.12 at 150 lines and fell short of it (signal 5.9) at 200: the quadratic must outweigh the
    // linear parse of each line, which it does only from a few hundred lines.
    size: { inputs: 1, size: 320, generate: (i, size) => patientNdjson(i, size) },
  };
}

const out = (...a: unknown[]): void => {
  process.stderr.write(`EXPLORE ${a.map(String).join(" ")}\n`);
};

function probe(
  label: string,
  options: ScalingGateOptions<Uint8Array, SyncResult>,
  term: number,
): void {
  try {
    const r = scalingGate(options);
    const m = /ratio:\s+([0-9.]+)/.exec(JSON.stringify(r.size));
    out(label, "REAL", r.size.status, m?.[1] ?? "?");
  } catch (e) {
    out(label, "REALFAIL", String(e).replace(/\s+/g, " ").slice(0, 300));
  }
  try {
    const rr = assertScalingGateFires(options, {
      regressedParse: (b: Uint8Array) => options.parse(rebuildQuadratic(b, term)),
      equals: same,
    });
    out(label, "SELF margin", rr.margin);
  } catch (e) {
    out(label, "SELFFAIL", String(e).replace(/\s+/g, " ").slice(0, 120));
  }
}

describe("explore", () => {
  for (const [inputs, size] of [
    [4, 400],
    [3, 400],
    [4, 350],
    [2, 450],
    [4, 300],
  ] as const) {
    it(`validate ${String(inputs)} x ${String(size)}`, () => {
      const o = singleMessage();
      probe(
        `validate ${String(inputs)}x${String(size)}`,
        { ...o, size: { inputs, size, generate: (i: number, z: number) => oruMessage(i, z) } },
        CR,
      );
    });
  }
  for (const lines of [320, 480, 640]) {
    it(`ndjson ${String(lines)}`, () => {
      const o = ndjsonRecords();
      probe(
        `ndjson ${String(lines)}`,
        { ...o, size: { inputs: 1, size: lines, generate: (i: number, z: number) => patientNdjson(i, z) } },
        LF,
      );
    });
  }
});
