// Benchmarks for the `cosyte` command, on @cosyte/bench, against the built package a user runs.
//
// A reading of this build (throughput, latency p50/p95/p99, and the cold import of the built entry
// with every file it loads and its gzip size):
//   pnpm build && pnpm bench:reading --no-memory --out bench-results/reading.json
// One shape only (as `<benchmark> / <size>` in the results):
//   pnpm bench:reading --no-memory --only "cosyte parse: HL7 v2 ORU^R01"
// The in-process benchmark with its memory (allocations, peak heap, a long run for leaks):
//   pnpm bench:reading --only detectFormat
// A base against head comparison, the base built in another checkout:
//   pnpm bench:compare --base <base checkout>/dist/index.mjs --head dist/index.mjs
// What a reading cannot give (peak memory of a whole run, cold import of each format package,
// throughput from the smallest size to the largest without process start, allocations and a long
// run of the in-process command, a CPU and heap profile), and the budgets:
//   pnpm bench:profile --out bench-results/profile
// On a pull request CI runs the comparison in its bench-compare job, and the Bench workflow takes a
// reading and a profile on a GitHub-hosted runner. Both are advisory: they post their numbers and
// fail nothing.
//
// A user meets this package as a process: `cosyte parse file`, start to exit. So every `cosyte`
// benchmark here starts the built bin in a fresh process on a file, its output to /dev/null, and
// times the whole invocation: process start, the import of the format's parser, the read, the
// parse and the JSON written out. One process a call, as a shell loop over many files runs it. The
// measuring process only waits, so the memory a reading reports for these is its own, not the
// command's: read them with `--no-memory`, and the command's own memory from the profile.
// `detectFormat`, the one step this package does itself on every input, is also measured in
// process, with its memory.
//
// The suite is handed the module under test rather than importing it, so one file measures both
// builds: the bin is found beside the built entry it was handed. Every input is synthetic and built
// in code by bench/shapes.mjs; it is written to a temporary directory for the command to read, and
// removed when the case is done.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineBenchmark, defineSuite } from "@cosyte/bench";

import * as S from "./shapes.mjs";

const { KIB, MIB } = S;

/**
 * Every shape the command reads, each at the size real traffic has and, where the shape grows, at
 * sizes well past it. `ops` are the commands run on it. `compare: true` puts a size in the pull
 * request comparison, which runs every compared case 24 times in fresh processes inside a 600
 * second budget; a reading measures every size.
 */
export const SHAPES = [
  {
    group: "hl7",
    name: "HL7 v2 ORU^R01",
    ops: ["parse", "inspect", "fmt", "validate"],
    sizes: [
      // The message a feed carries all day. 8 of them, so a pass is 8 files in a row.
      { label: "ADT^A01, 280 B", inputs: 8, build: (i) => S.adtMessage(i), compare: ["parse"] },
      { label: "1 MiB", inputs: 1, build: (i) => S.oruMessage(i, MIB) },
      { label: "4 MiB", inputs: 1, build: (i) => S.oruMessage(i, 4 * MIB) },
    ],
  },
  {
    group: "hl7",
    name: "HL7 v2 ORU^R01 with a base64 document",
    ops: ["parse", "inspect", "fmt", "validate"],
    sizes: [
      { label: "1 MiB", inputs: 1, build: (i) => S.oruDocument(i, MIB) },
      { label: "8 MiB", inputs: 1, build: (i) => S.oruDocument(i, 8 * MIB) },
    ],
  },
  {
    group: "hl7",
    name: "MLLP stream of ADT^A01",
    ops: ["parse", "inspect"],
    sizes: [
      { label: "1 frame", inputs: 8, build: () => S.mllpStream(1) },
      // An interface engine's capture of one connection: many small messages in a row.
      {
        label: "1,000 frames, 279 KiB",
        inputs: 1,
        build: () => S.mllpStream(1_000),
        compare: ["parse"],
      },
      { label: "16,000 frames, 4.4 MiB", inputs: 1, build: () => S.mllpStream(16_000) },
    ],
  },
  {
    group: "fhir",
    name: "FHIR R4 collection Bundle",
    ops: ["parse", "inspect", "fmt", "validate"],
    sizes: [
      {
        label: "Patient, 1.5 KiB",
        inputs: 8,
        build: (i) => S.patientResource(i),
        compare: ["parse"],
      },
      { label: "1 MiB", inputs: 1, build: (i) => S.bundleResource(i, MIB) },
      { label: "4 MiB", inputs: 1, build: (i) => S.bundleResource(i, 4 * MIB) },
    ],
  },
  {
    group: "fhir",
    name: "FHIR R4 Binary",
    ops: ["parse", "inspect", "fmt", "validate"],
    sizes: [
      { label: "1 MiB", inputs: 1, build: (i) => S.binaryResource(i, MIB) },
      { label: "8 MiB", inputs: 1, build: (i) => S.binaryResource(i, 8 * MIB) },
    ],
  },
  {
    group: "fhir",
    name: "FHIR R4 NDJSON of Patients",
    ops: ["parse --ndjson"],
    sizes: [
      { label: "1 line", inputs: 8, build: () => S.patientNdjson(1) },
      // A bulk data export file: many small resources in a row.
      { label: "1,000 lines, 1.5 MiB", inputs: 1, build: () => S.patientNdjson(1_000) },
      { label: "4,000 lines, 5.9 MiB", inputs: 1, build: () => S.patientNdjson(4_000) },
    ],
  },
  {
    group: "x12",
    name: "X12 837P batch",
    ops: ["parse", "inspect", "fmt", "validate"],
    sizes: [
      { label: "one claim, 900 B", inputs: 8, build: (i) => S.claimMessage(i), compare: ["parse"] },
      { label: "1 MiB", inputs: 1, build: (i) => S.claimBatch(i, MIB) },
      { label: "4 MiB", inputs: 1, build: (i) => S.claimBatch(i, 4 * MIB) },
    ],
  },
  {
    group: "astm",
    name: "ASTM E1394 results",
    ops: ["parse", "inspect", "fmt", "validate"],
    sizes: [
      { label: "one result, 280 B", inputs: 8, build: (i) => S.astmMessage(i) },
      { label: "256 KiB", inputs: 1, build: (i) => S.astmBatch(i, 256 * KIB) },
      { label: "1 MiB", inputs: 1, build: (i) => S.astmBatch(i, MIB) },
    ],
  },
  {
    // NCPDP transactions are bounded by their standards (a Telecom claim's fields are fixed, a
    // SCRIPT message carries one prescription), so they come in one size: small, many in a row.
    group: "ncpdp",
    name: "NCPDP SCRIPT NewRx",
    // The synthetic NewRx declares no namespace, which detection asks for, so it names its format.
    ops: [
      "parse --format ncpdp",
      "inspect --format ncpdp",
      "fmt --format ncpdp",
      "validate --format ncpdp",
    ],
    sizes: [{ label: "1.6 KiB", inputs: 8, build: (i) => S.newRxMessage(i) }],
  },
  {
    group: "ncpdp",
    name: "NCPDP Telecom B1",
    ops: ["parse", "inspect", "fmt", "validate"],
    sizes: [{ label: "280 B", inputs: 8, build: (i) => S.telecomMessage(i) }],
  },
  {
    group: "ccda",
    name: "C-CDA CCD",
    ops: ["inspect", "fmt", "validate"],
    sizes: [
      { label: "13 KiB", inputs: 8, build: (i) => S.ccdDocument(i) },
      { label: "1 MiB", inputs: 1, build: (i) => S.ccdDense(i, MIB) },
      { label: "4 MiB", inputs: 1, build: (i) => S.ccdDense(i, 4 * MIB) },
    ],
  },
  {
    group: "ccda",
    name: "C-CDA with a base64 nonXMLBody",
    ops: ["inspect", "fmt", "validate"],
    sizes: [
      { label: "1 MiB", inputs: 1, build: (i) => S.ccdUnstructured(i, MIB) },
      { label: "8 MiB", inputs: 1, build: (i) => S.ccdUnstructured(i, 8 * MIB) },
    ],
  },
  {
    group: "dicom",
    name: "DICOM SR, header only",
    ops: ["inspect", "validate"],
    sizes: [
      { label: "50 measurements, 26 KiB", inputs: 8, build: (i) => S.srDocument(i, 50) },
      { label: "1,000 measurements, 503 KiB", inputs: 1, build: (i) => S.srDocument(i, 1_000) },
      { label: "4,000 measurements, 2 MiB", inputs: 1, build: (i) => S.srDocument(i, 4_000) },
    ],
  },
  {
    group: "dicom",
    name: "DICOM CT",
    ops: ["inspect", "validate"],
    sizes: [
      { label: "single frame, 514 KiB", inputs: 4, build: (i) => S.ctImage(i) },
      { label: "20 frames, 10 MiB", inputs: 1, build: (i) => S.enhancedCt(i, 20) },
    ],
  },
];

/** The groups a CI job reads one at a time, each with every benchmark it holds. */
export const GROUPS = [...new Set(SHAPES.map((s) => s.group))];

/**
 * The built bin beside the built entry `cli` was imported from. `loadOptionalPackage` calls the
 * loader it is handed before it awaits anything, so a stack taken in that loader has the entry's
 * frame right under it: the base and the head of a comparison each start their own bin.
 */
export function binOf(cli) {
  let stack = "";
  void cli.loadOptionalPackage("", () => {
    stack = new Error("where").stack ?? "";
    return Promise.resolve();
  });
  const here = import.meta.url;
  for (const match of stack.matchAll(/(file:\/\/[^\s)]+?):\d+:\d+/g)) {
    if (match[1] !== here) return fileURLToPath(new URL("bin/cosyte.mjs", match[1]));
  }
  throw new Error("@cosyte/cli bench: could not find the built entry the suite was handed");
}

/** The name of the benchmark that runs `op` on `shape`. */
export function benchmarkName(shape, op) {
  return `cosyte ${op}: ${shape.name}`;
}

/** The command line of one op on one file: `cosyte <op words> <file>`. */
function argsOf(op, file) {
  return [...op.split(" "), file];
}

/**
 * Run the bin once on one input and wait for it to exit, its output to /dev/null. An exit other
 * than 0 is a broken case, never a number: the error names the exit, never the input.
 */
function runOnce(bin, input) {
  const result = spawnSync(process.execPath, [bin, ...input.args], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  if (result.status !== 0) {
    throw new Error(`cosyte exited ${String(result.status ?? result.signal)}`);
  }
  return 1;
}

/** The sizes of one shape and op as @cosyte/bench takes them: each corpus written to a temporary directory. */
function sizesOf(shape, op) {
  return shape.sizes.map((size) => ({
    label: size.label,
    compare: size.compare?.includes(op) ?? false,
    build: () => {
      const dir = mkdtempSync(join(tmpdir(), "cosyte-cli-bench-"));
      let bytes = 0;
      const inputs = Array.from({ length: size.inputs }, (_v, i) => {
        const data = size.build(i);
        const file = join(dir, `input-${String(i)}`);
        writeFileSync(file, data);
        bytes += Buffer.byteLength(data);
        return { args: argsOf(op, file) };
      });
      return { inputs, bytes, teardown: () => rmSync(dir, { recursive: true, force: true }) };
    },
  }));
}

/** One small input of every format, then one large input of every format that grows. */
function detectSizes() {
  const small = () => [
    S.adtMessage(0),
    S.mllpStream(1),
    S.patientResource(0),
    S.claimMessage(0),
    S.astmMessage(0),
    S.newRxMessage(0),
    S.telecomMessage(0),
    S.ccdDocument(0),
    S.srDocument(0, 50),
  ];
  const large = () => [
    S.oruMessage(0, MIB),
    S.mllpStream(4_000),
    S.bundleResource(0, MIB),
    S.claimBatch(0, MIB),
    S.astmBatch(0, MIB),
    S.ccdDense(0, MIB),
    S.enhancedCt(0, 4),
  ];
  const corpus = (build) => () => {
    const inputs = build().map((x) => (typeof x === "string" ? Buffer.from(x) : x));
    return { inputs, bytes: inputs.reduce((n, b) => n + b.length, 0) };
  };
  return [
    { label: "one small input of each format", build: corpus(small), compare: true },
    { label: "one large input of each format", build: corpus(large), compare: false },
  ];
}

const benchmarks = [
  defineBenchmark({
    // Process start: the bin loads, prints its version and exits. Every invocation pays this.
    name: "cosyte --version",
    sizes: [
      {
        label: "process start",
        compare: true,
        build: () => ({ inputs: [{ args: ["--version"] }] }),
      },
    ],
    bind: (cli) => {
      const bin = binOf(cli);
      return (input) => runOnce(bin, input);
    },
  }),
  defineBenchmark({
    // The one step this package does itself on every input, in process: it reads 512 bytes at
    // most, so its cost should not move with the input's size.
    name: "detectFormat",
    sizes: detectSizes(),
    bind: (cli) => (bytes) => cli.detectFormat(bytes),
    weigh: (result) => (result.format === null ? 0 : 1),
  }),
];

for (const shape of SHAPES) {
  for (const op of shape.ops) {
    benchmarks.push(
      defineBenchmark({
        name: benchmarkName(shape, op),
        sizes: sizesOf(shape, op),
        bind: (cli) => {
          const bin = binOf(cli);
          return (input) => runOnce(bin, input);
        },
      }),
    );
  }
}

export default defineSuite({ name: "@cosyte/cli", benchmarks });
