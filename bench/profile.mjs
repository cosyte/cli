// The parts of the audit a reading cannot give, against the built package:
//   pnpm build && pnpm bench:profile [--out <dir>]
//
// 1. Process start and cold imports. The bin's start (`cosyte --version`) against an empty Node
//    process, and the cold import of the built entry and of each package the command loads lazily
//    for a format, each in fresh processes, with the files each import loads and their gzip size.
// 2. Memory of one whole invocation. A reading's memory is the measuring process's own, which only
//    waits on the command, so here each case runs the bin once with bench/probe.mjs loaded first:
//    its peak V8 heap, its peak external memory and its peak resident set, each above the same
//    command's on a small input of the same format, over the input's bytes; and the bytes it wrote.
// 3. Throughput from each shape's smallest size to its largest, in process (the built `run`, the
//    dispatcher the bin calls, on an input held in memory), so process start does not flatter the
//    large sizes: warmed, then the median of 9 samples of whole calls.
// 4. Allocations per invocation and a long run for leaks, in process, on the small inputs a feed
//    sends all day.
// 5. One long NDJSON line against the same bytes as one message, the case where the line splitter
//    carries a line across read chunks.
// 5b. The bin's memory when its reader is slow: the same runs as section 2 on the inputs with the
//    most output, once read as fast as it comes and once read a piece at a time, so what a command
//    holds while it waits for its consumer is read apart from what it holds to do the work.
// 6. A CPU profile and a sampled heap profile of the hottest paths, with the top functions of each.
//    A function in this package is named by its place in dist/ (a CPU profile keeps the URL of the
//    running code); its name is the one it has in src/.
// 7. The budgets, read from the numbers above.
//
// `--out <dir>` writes profile.md and profile.json there with every .cpuprofile and .heapprofile, for
// a profiler's own view. The inputs are the bench's own, from bench/shapes.mjs: synthetic, built in
// code, written to a temporary directory for the bin to read and removed after.
//
// Run it with --expose-gc (the package script does): section 4 settles the heap between rounds.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GCProfiler } from "node:v8";
import { gzipSync } from "node:zlib";

import { SHAPES } from "./cli.bench.mjs";
import * as S from "./shapes.mjs";

const { KIB, MIB } = S;
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PROBE = join(HERE, "probe.mjs");
const IMPORT_TIME = join(HERE, "import-time.mjs");

const IMPORT_RUNS = 20;
const START_RUNS = 20;
const WARMUP_MS = 500;
const SAMPLES = 9;
const SAMPLE_MS = 100;
const PROFILE_MS = 2_000;
const TOP = 8;
const LONG_RUN_ROUNDS = 30;
const LONG_RUN_SETTLE = 6;
const LONG_RUN_ROUND_MS = 100;
const LONG_RUN_GROWTH_BYTES = 64 * KIB;

/** Proposed budgets: a dense shape's peak heap, an opaque payload's peak memory, a cold import, throughput kept. */
export const BUDGETS = {
  densePeakMultiple: 20,
  opaquePeakMultiple: 3,
  coldImportMs: 15,
  throughputKept: 0.5,
};

/** The shapes whose bytes are almost all one payload: their budget is the opaque one. */
const OPAQUE = new Set([
  "HL7 v2 ORU^R01 with a base64 document",
  "FHIR R4 Binary",
  "C-CDA with a base64 nonXMLBody",
  "DICOM CT",
]);

/** A small input of each shape's format: the base its large inputs' memory is read above. */
const SMALL = {
  "HL7 v2 ORU^R01": (i) => S.adtMessage(i),
  "HL7 v2 ORU^R01 with a base64 document": (i) => S.adtMessage(i),
  "MLLP stream of ADT^A01": () => S.mllpStream(1),
  "FHIR R4 collection Bundle": (i) => S.patientResource(i),
  "FHIR R4 Binary": (i) => S.patientResource(i),
  "FHIR R4 NDJSON of Patients": () => S.patientNdjson(1),
  "X12 837P batch": (i) => S.claimMessage(i),
  "ASTM E1394 results": (i) => S.astmMessage(i),
  "NCPDP SCRIPT NewRx": (i) => S.newRxMessage(i),
  "NCPDP Telecom B1": (i) => S.telecomMessage(i),
  "C-CDA CCD": (i) => S.ccdDocument(i),
  "C-CDA with a base64 nonXMLBody": (i) => S.ccdDocument(i),
  "DICOM SR, header only": (i) => S.srDocument(i, 50),
  "DICOM CT": (i) => S.srDocument(i, 50),
};

function args(argv) {
  const out = { target: argv[0], dir: undefined, only: [] };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--out") out.dir = argv[++i];
    else if (argv[i] === "--only") out.only.push(argv[++i]);
  }
  return out;
}

function size(bytes) {
  const abs = Math.abs(bytes);
  if (abs >= MIB) return `${(bytes / MIB).toFixed(2)} MiB`;
  if (abs >= KIB) return `${(bytes / KIB).toFixed(1)} KiB`;
  return `${String(Math.round(bytes))} B`;
}

function ms(value) {
  return value >= 100 ? `${value.toFixed(0)} ms` : `${value.toFixed(2)} ms`;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function toBytes(data) {
  return typeof data === "string" ? Buffer.from(data) : data;
}

/* 1. Process start and cold imports ----------------------------------------------------------- */

function wallMs(argv) {
  const start = performance.now();
  const r = spawnSync(process.execPath, argv, { stdio: ["ignore", "ignore", "ignore"] });
  if (r.status !== 0) throw new Error(`a timed process exited ${String(r.status)}`);
  return performance.now() - start;
}

function importOnce(url, mode) {
  const r = spawnSync(process.execPath, [IMPORT_TIME, url, ...(mode === undefined ? [] : [mode])], {
    encoding: "utf8",
    maxBuffer: 16 * MIB,
  });
  if (r.status !== 0) throw new Error(`the import of ${url} exited ${String(r.status)}`);
  return JSON.parse(r.stdout);
}

/** The packages the command loads for each format, beside its own built entry. */
const PACKAGES = [
  "@cosyte/hl7",
  "@cosyte/fhir",
  "@cosyte/x12",
  "@cosyte/astm",
  "@cosyte/ncpdp",
  "@cosyte/ccda",
  "@cosyte/dicom",
  "@cosyte/mllp",
  "@cosyte/transform",
  "@cosyte/terminology",
  "@cosyte/deid",
];

function startSection(target, bin, data) {
  const runs = { empty: [], version: [], help: [] };
  for (let i = 0; i < START_RUNS; i++) {
    runs.empty.push(wallMs(["--eval", ""]));
    runs.version.push(wallMs([bin, "--version"]));
    runs.help.push(wallMs([bin, "--help"]));
  }
  const empty = median(runs.empty);
  data.start = { emptyMs: empty, versionMs: median(runs.version), helpMs: median(runs.help) };
  const imports = [];
  const entries = [
    { name: "@cosyte/cli (built entry)", url: pathToFileURL(target).href },
    { name: "@cosyte/cli (bin, not run)", url: pathToFileURL(bin).href, filesOnly: true },
    ...PACKAGES.map((name) => ({ name, url: import.meta.resolve(name) })),
  ];
  for (const entry of entries) {
    // The bin is one bundled file whose only static imports are Node built-ins, and importing it
    // runs it: its files are itself.
    const { files } =
      entry.filesOnly === true ? { files: [entry.url] } : importOnce(entry.url, "files");
    let bytes = 0;
    let gzip = 0;
    for (const f of files) {
      const content = readFileSync(fileURLToPath(f));
      bytes += content.length;
      gzip += gzipSync(content).length;
    }
    const times = [];
    if (entry.filesOnly !== true)
      for (let i = 0; i < IMPORT_RUNS; i++) times.push(importOnce(entry.url).ms);
    imports.push({
      name: entry.name,
      medianMs: times.length === 0 ? null : median(times),
      files: files.length,
      bytes,
      gzipBytes: gzip,
    });
  }
  data.imports = imports;
  const lines = [
    "### Process start and cold imports",
    "",
    `Median of ${String(START_RUNS)} fresh processes each, interleaved: an empty Node process ${ms(empty)}, \`cosyte --version\` ${ms(data.start.versionMs)} (${ms(data.start.versionMs - empty)} above it), \`cosyte --help\` ${ms(data.start.helpMs)}.`,
    "",
    `Each import is timed inside a fresh process, from just before \`import()\` to just after, median of ${String(IMPORT_RUNS)}; the files are every file that import loads, with their gzip size. The bin row is its size only: importing it runs it.`,
    "",
    "| Module | Cold import | Files | Bytes | Gzipped | Budget |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of imports) {
    const within =
      r.medianMs === null ? "n/a" : r.medianMs < BUDGETS.coldImportMs ? "within" : "**over**";
    lines.push(
      `| ${r.name} | ${r.medianMs === null ? "n/a" : ms(r.medianMs)} | ${String(r.files)} | ${size(r.bytes)} | ${size(r.gzipBytes)} | ${within} |`,
    );
  }
  return lines;
}

/* 2. Memory of one whole invocation ----------------------------------------------------------- */

/** How a slow reader reads: up to this many bytes, then this long a pause (about 16 MiB a second). */
const SLOW_READ_BYTES = 64 * KIB;
const SLOW_READ_PAUSE_MS = 4;

/**
 * Run the bin once with the probe loaded; resolves to its peaks, its wall time and its output bytes.
 * `slow` reads stdout a piece at a time with a pause between, as a pager or a network sink does;
 * otherwise it is read as fast as it arrives.
 */
function probeRun(bin, argv, dir, slow = false) {
  const out = join(dir, `probe-${String(Math.random()).slice(2)}.json`);
  return new Promise((resolvePromise, reject) => {
    const start = performance.now();
    const child = spawn(process.execPath, ["--import", pathToFileURL(PROBE).href, bin, ...argv], {
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, COSYTE_BENCH_PROBE_OUT: out },
    });
    let written = 0;
    let timer;
    if (slow) {
      // Paused mode: nothing is read but what this loop takes, so the pipe fills and stays full.
      const take = () => {
        let left = SLOW_READ_BYTES;
        for (let c = child.stdout.read(); c !== null; c = left > 0 ? child.stdout.read() : null) {
          written += c.length;
          left -= c.length;
        }
        timer = setTimeout(take, SLOW_READ_PAUSE_MS);
      };
      child.stdout.pause();
      timer = setTimeout(take, SLOW_READ_PAUSE_MS);
    } else {
      child.stdout.on("data", (chunk) => {
        written += chunk.length;
      });
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (timer !== undefined) clearTimeout(timer);
      for (let c = child.stdout.read(); c !== null; c = child.stdout.read()) written += c.length;
      const wall = performance.now() - start;
      if (code !== 0) {
        reject(new Error(`cosyte exited ${String(code)}`));
        return;
      }
      const report = JSON.parse(readFileSync(out, "utf8"));
      rmSync(out, { force: true });
      resolvePromise({ ...report, written, wallMs: wall });
    });
  });
}

async function memorySection(bin, data, only) {
  const dir = mkdtempSync(join(tmpdir(), "cosyte-cli-profile-"));
  const rows = [];
  try {
    for (const shape of SHAPES) {
      if (only.length > 0 && !only.includes(shape.group)) continue;
      for (const op of shape.ops) {
        const smallFile = join(dir, "small");
        writeFileSync(smallFile, SMALL[shape.name](0));
        const base = await probeRun(bin, [...op.split(" "), smallFile], dir);
        for (const s of shape.sizes) {
          const content = toBytes(s.build(0));
          if (content.length < 256 * KIB) continue;
          const file = join(dir, "input");
          writeFileSync(file, content);
          const r = await probeRun(bin, [...op.split(" "), file], dir);
          rows.push({
            shape: shape.name,
            op,
            size: s.label,
            inputBytes: content.length,
            opaque: OPAQUE.has(shape.name),
            peakHeapBytes: r.peakHeapBytes,
            heapAboveBytes: r.peakHeapBytes - base.peakHeapBytes,
            peakExternalBytes: r.peakExternalBytes,
            residentAboveBytes: r.peakResidentBytes - base.peakResidentBytes,
            peakResidentBytes: r.peakResidentBytes,
            writtenBytes: r.written,
            wallMs: r.wallMs,
            collections: r.collections,
          });
        }
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  data.memory = rows;
  const lines = [
    "### Memory of one whole invocation",
    "",
    "The bin run once on the input, in a fresh process, with V8's GC profiler loaded first. Peak heap is the most V8 heap in use before any collection or at exit; the multiple is that peak above the same command's on a small input of the same format (the loaded code and its caches), over the input's bytes. Resident is the process's peak resident set above the small input's, over the input's bytes: every byte, Buffers included. Output is what the command wrote to stdout, over the input's bytes. Sizes under 256 KiB are left out: the resident set moves in pages and arenas.",
    "",
    `Budgets (proposed): heap under ${String(BUDGETS.densePeakMultiple)} times the input for a dense shape, resident memory under ${String(BUDGETS.opaquePeakMultiple)} times for an opaque payload.`,
    "",
    "| Command | Shape | Size | Peak heap | Heap multiple | Resident multiple | Output multiple | Time | Budget |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    const heapX = r.heapAboveBytes / r.inputBytes;
    const rssX = r.residentAboveBytes / r.inputBytes;
    const within = r.opaque
      ? rssX < BUDGETS.opaquePeakMultiple
        ? "within"
        : "**over**"
      : heapX < BUDGETS.densePeakMultiple
        ? "within"
        : "**over**";
    lines.push(
      `| cosyte ${r.op} | ${r.shape}${r.opaque ? " (opaque)" : ""} | ${r.size} | ${size(r.peakHeapBytes)} | ${heapX.toFixed(1)}x | ${rssX.toFixed(1)}x | ${(r.writtenBytes / r.inputBytes).toFixed(1)}x | ${ms(r.wallMs)} | ${within} |`,
    );
  }
  return lines;
}

/* 3. In-process throughput -------------------------------------------------------------------- */

/** The input in the chunks a file read stream delivers (64 KiB). */
async function* chunksOf(bytes) {
  for (let at = 0; at < bytes.length; at += 64 * KIB) yield bytes.subarray(at, at + 64 * KIB);
}

/** One invocation of the built dispatcher on `bytes`; resolves to the characters it wrote. */
async function invoke(cli, argv, bytes) {
  let written = 0;
  const deps = {
    readFile: () => Promise.resolve(bytes),
    readStdin: () => Promise.resolve(bytes),
    openFile: () => chunksOf(bytes),
    openStdin: () => chunksOf(bytes),
    writeStdout: (chunk) => {
      written += chunk.length;
    },
  };
  const result = await cli.run([...argv, "input"], deps);
  if (result.exit !== 0) throw new Error(`cosyte exited ${String(result.exit)}`);
  return written + result.stdout.length;
}

async function runFor(pass, duration) {
  const end = performance.now() + duration;
  let passes = 0;
  while (performance.now() < end) {
    await pass();
    passes++;
  }
  return passes;
}

async function msPerPass(pass) {
  await runFor(pass, WARMUP_MS);
  const samples = [];
  for (let i = 0; i < SAMPLES; i++) {
    const start = performance.now();
    let passes = 0;
    while (performance.now() - start < SAMPLE_MS) {
      await pass();
      passes++;
    }
    samples.push((performance.now() - start) / passes);
  }
  return median(samples);
}

async function throughputSection(cli, data, only) {
  const rows = [];
  for (const shape of SHAPES) {
    if (only.length > 0 && !only.includes(shape.group)) continue;
    const first = shape.sizes[0];
    const last = shape.sizes[shape.sizes.length - 1];
    if (first === last) continue;
    for (const op of shape.ops) {
      const rate = async (s) => {
        const bytes = toBytes(s.build(0));
        const per = await msPerPass(() => invoke(cli, op.split(" "), bytes));
        return { bytesPerSecond: bytes.length / (per / 1000), ms: per };
      };
      const small = await rate(first);
      const large = await rate(last);
      rows.push({
        shape: shape.name,
        op,
        smallest: first.label,
        largest: last.label,
        smallBytesPerSecond: small.bytesPerSecond,
        largeBytesPerSecond: large.bytesPerSecond,
        smallMs: small.ms,
        largeMs: large.ms,
        kept: large.bytesPerSecond / small.bytesPerSecond,
      });
    }
  }
  data.throughput = rows;
  const lines = [
    "### Throughput, smallest size against largest, in process",
    "",
    `The built dispatcher (\`run\`, which the bin calls) on one input held in memory, read in 64 KiB chunks as a file is; no process start. Warmed for ${String(WARMUP_MS)} ms, then the median of ${String(SAMPLES)} samples of at least ${String(SAMPLE_MS)} ms of whole calls. Budget (proposed): bytes a second at the largest size at least ${String(BUDGETS.throughputKept * 100)}% of the smallest's.`,
    "",
    "| Command | Shape | Smallest | Largest | Call, smallest | Call, largest | Bytes/s, smallest | Bytes/s, largest | Kept | Budget |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    lines.push(
      `| cosyte ${r.op} | ${r.shape} | ${r.smallest} | ${r.largest} | ${ms(r.smallMs)} | ${ms(r.largeMs)} | ${size(r.smallBytesPerSecond)}/s | ${size(r.largeBytesPerSecond)}/s | ${(r.kept * 100).toFixed(0)}% | ${r.kept >= BUDGETS.throughputKept ? "within" : "**over**"} |`,
    );
  }
  return lines;
}

/* 4. Allocations and a long run --------------------------------------------------------------- */

function settle() {
  for (let i = 0; i < 4; i++) globalThis.gc();
}

/** Bytes allocated per call: the heap's growth over `n` calls plus everything collected during them. */
async function allocationsPerCall(pass, n) {
  settle();
  const profiler = new GCProfiler();
  const before = process.memoryUsage().heapUsed;
  profiler.start();
  for (let i = 0; i < n; i++) await pass();
  const { statistics } = profiler.stop();
  const after = process.memoryUsage().heapUsed;
  let collected = 0;
  for (const gc of statistics) {
    collected += gc.beforeGC.heapStatistics.usedHeapSize - gc.afterGC.heapStatistics.usedHeapSize;
  }
  return (after - before + collected) / n;
}

/** The Theil-Sen slope of `ys` against their index. */
function theilSen(ys) {
  const slopes = [];
  for (let i = 0; i < ys.length; i++) {
    for (let j = i + 1; j < ys.length; j++) slopes.push((ys[j] - ys[i]) / (j - i));
  }
  return median(slopes);
}

async function longRun(pass) {
  let calls = 0;
  const start = performance.now();
  while (performance.now() - start < LONG_RUN_ROUND_MS) {
    await pass();
    calls++;
  }
  const heaps = [];
  for (let round = 0; round < LONG_RUN_ROUNDS; round++) {
    for (let i = 0; i < calls; i++) await pass();
    settle();
    heaps.push(process.memoryUsage().heapUsed);
  }
  const measured = heaps.slice(LONG_RUN_SETTLE);
  const growth = theilSen(measured) * (measured.length - 1);
  return { callsPerRound: calls, growthBytes: growth, growing: growth >= LONG_RUN_GROWTH_BYTES };
}

async function allocationSection(cli, data) {
  if (typeof globalThis.gc !== "function") {
    data.allocations = null;
    return ["### Allocations and a long run", "", "Skipped: run with --expose-gc."];
  }
  const workloads = [
    { name: "cosyte parse: ADT^A01, 280 B", argv: ["parse"], bytes: () => S.adtMessage(0) },
    { name: "cosyte validate: ADT^A01, 280 B", argv: ["validate"], bytes: () => S.adtMessage(0) },
    {
      name: "cosyte parse: FHIR Patient, 1.5 KiB",
      argv: ["parse"],
      bytes: () => S.patientResource(0),
    },
    { name: "cosyte parse: X12 837P, 900 B", argv: ["parse"], bytes: () => S.claimMessage(0) },
    { name: "cosyte parse: ASTM result, 280 B", argv: ["parse"], bytes: () => S.astmMessage(0) },
    {
      name: "cosyte parse: NCPDP Telecom B1, 280 B",
      argv: ["parse"],
      bytes: () => S.telecomMessage(0),
    },
    {
      name: "cosyte validate: C-CDA CCD, 13 KiB",
      argv: ["validate"],
      bytes: () => S.ccdDocument(0),
    },
    { name: "cosyte inspect: DICOM CT, 514 KiB", argv: ["inspect"], bytes: () => S.ctImage(0) },
    { name: "cosyte parse: MLLP, 100 frames", argv: ["parse"], bytes: () => S.mllpStream(100) },
    {
      name: "cosyte parse --ndjson: 100 Patients",
      argv: ["parse", "--ndjson"],
      bytes: () => S.patientNdjson(100),
    },
  ];
  const rows = [];
  for (const w of workloads) {
    const bytes = toBytes(w.bytes());
    const pass = () => invoke(cli, w.argv, bytes);
    await runFor(pass, WARMUP_MS);
    const perCall = await allocationsPerCall(pass, 200);
    const leak = await longRun(pass);
    rows.push({ name: w.name, inputBytes: bytes.length, allocatedPerCall: perCall, ...leak });
  }
  data.allocations = rows;
  const lines = [
    "### Allocations per invocation and a long run",
    "",
    `In process, warmed. Allocated is the heap's growth over 200 calls plus everything the collections during them reclaimed, per call (V8 heap only). The long run is ${String(LONG_RUN_ROUNDS)} rounds of calls (as many as fill ${String(LONG_RUN_ROUND_MS)} ms in the first), the heap settled after each; the growth is the Theil-Sen slope over the last ${String(LONG_RUN_ROUNDS - LONG_RUN_SETTLE)} rounds times their span, and a run is growing from ${size(LONG_RUN_GROWTH_BYTES)}.`,
    "",
    "| Workload | Input | Allocated a call | Multiple of input | Calls a round | Long-run growth | Growing |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.name} | ${size(r.inputBytes)} | ${size(r.allocatedPerCall)} | ${(r.allocatedPerCall / r.inputBytes).toFixed(1)}x | ${String(r.callsPerRound)} | ${size(r.growthBytes)} | ${r.growing ? "**yes**" : "no"} |`,
    );
  }
  return lines;
}

/* 5. One long NDJSON line --------------------------------------------------------------------- */

async function ndjsonLineSection(cli, data) {
  const rows = [];
  for (const mib of [1, 4, 16]) {
    const bytes = Buffer.from(`${S.bundleResource(0, mib * MIB)}\n`);
    const once = async (argv) => {
      await invoke(cli, argv, bytes);
      const times = [];
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        await invoke(cli, argv, bytes);
        times.push(performance.now() - start);
      }
      return median(times);
    };
    const line = await once(["parse", "--ndjson", "--json"]);
    const whole = await once(["parse", "--json"]);
    rows.push({ inputBytes: bytes.length, ndjsonMs: line, messageMs: whole });
  }
  data.ndjsonLine = rows;
  const lines = [
    "### One long NDJSON line",
    "",
    "One FHIR Bundle on one line, read in 64 KiB chunks: `cosyte parse --ndjson` against `cosyte parse` on the same bytes, in process, median of 3 warm calls. The extra time is the line splitter's alone.",
    "",
    "| Input | parse --ndjson | parse | Extra |",
    "| --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    lines.push(
      `| ${size(r.inputBytes)} | ${ms(r.ndjsonMs)} | ${ms(r.messageMs)} | ${ms(r.ndjsonMs - r.messageMs)} |`,
    );
  }
  return lines;
}

/* 5b. Output under back-pressure ---------------------------------------------------------------- */

/** The runs with the most output for their input: what a slow reader makes the bin hold, if anything. */
const BACKPRESSURE = [
  { argv: ["parse"], shape: "HL7 v2 ORU^R01", size: "1 MiB", build: () => S.oruMessage(0, MIB) },
  {
    argv: ["parse"],
    shape: "MLLP stream of ADT^A01",
    size: "16,000 frames, 4.4 MiB",
    build: () => S.mllpStream(16_000),
  },
  {
    argv: ["parse", "--ndjson"],
    shape: "FHIR R4 NDJSON of Patients",
    size: "4,000 lines, 5.9 MiB",
    build: () => S.patientNdjson(4_000),
  },
  {
    argv: ["parse"],
    shape: "FHIR R4 collection Bundle",
    size: "4 MiB",
    build: () => S.bundleResource(0, 4 * MIB),
  },
];

async function backpressureSection(bin, data) {
  const dir = mkdtempSync(join(tmpdir(), "cosyte-cli-backpressure-"));
  const rows = [];
  try {
    for (const c of BACKPRESSURE) {
      const content = toBytes(c.build());
      const file = join(dir, "input");
      writeFileSync(file, content);
      const fast = await probeRun(bin, [...c.argv, file], dir, false);
      const slow = await probeRun(bin, [...c.argv, file], dir, true);
      rows.push({
        command: `cosyte ${c.argv.join(" ")}`,
        shape: c.shape,
        size: c.size,
        inputBytes: content.length,
        writtenBytes: slow.written,
        fast: {
          peakHeapBytes: fast.peakHeapBytes,
          peakExternalBytes: fast.peakExternalBytes,
          peakResidentBytes: fast.peakResidentBytes,
          wallMs: fast.wallMs,
        },
        slow: {
          peakHeapBytes: slow.peakHeapBytes,
          peakExternalBytes: slow.peakExternalBytes,
          peakResidentBytes: slow.peakResidentBytes,
          wallMs: slow.wallMs,
        },
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  data.backpressure = rows;
  const lines = [
    "### Output under back-pressure",
    "",
    `The bin run once on the input as in the memory section, its stdout read two ways: as fast as it arrives, and by a slow reader that takes up to ${size(SLOW_READ_BYTES)} and then pauses ${String(SLOW_READ_PAUSE_MS)} ms. A command that waits for its reader holds about the same either way; one that does not queues the output its reader has not taken yet. Peak heap and external memory are read as in the memory section, and resident is the process's whole peak resident set.`,
    "",
    "| Command | Shape | Size | Output | Peak heap, fast | Peak heap, slow | External, fast | External, slow | Resident, fast | Resident, slow | Time, slow |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.command} | ${r.shape} | ${r.size} | ${size(r.writtenBytes)} | ${size(r.fast.peakHeapBytes)} | ${size(r.slow.peakHeapBytes)} | ${size(r.fast.peakExternalBytes)} | ${size(r.slow.peakExternalBytes)} | ${size(r.fast.peakResidentBytes)} | ${size(r.slow.peakResidentBytes)} | ${ms(r.slow.wallMs)} |`,
    );
  }
  return lines;
}

/* 6. CPU and heap profile --------------------------------------------------------------------- */

/** The profiler's own frames: the root and idle time, which belong to no workload. */
function isProfilerFrame(frame) {
  return frame.functionName === "(root)" || frame.functionName === "(idle)";
}

/** A function's name and where it lives: this package's src/ through its source map, else the file. */
function key(frame) {
  const name = frame.functionName === "" ? "(anonymous)" : frame.functionName;
  if (frame.url === "") return name;
  let file = frame.url.startsWith("file:") ? fileURLToPath(frame.url) : frame.url;
  if (file.startsWith(ROOT)) file = relative(ROOT, file);
  const store = file.indexOf("node_modules/.pnpm/");
  if (store !== -1) {
    const at = file.indexOf("node_modules/", store + 19);
    if (at !== -1) file = file.slice(at + 13);
  }
  return `${name} ${file}:${String(frame.lineNumber + 1)}`;
}

function topSelfTime(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i]);
    if (isProfilerFrame(node.callFrame)) continue;
    const dt = profile.timeDeltas[i] ?? 0;
    total += dt;
    const k = key(node.callFrame);
    self.set(k, (self.get(k) ?? 0) + dt);
  }
  return [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([name, us]) => ({ name, share: us / total }));
}

function topAllocations(profile) {
  const self = new Map();
  let total = 0;
  const walk = (node) => {
    if (!isProfilerFrame(node.callFrame) && node.selfSize > 0) {
      const k = key(node.callFrame);
      self.set(k, (self.get(k) ?? 0) + node.selfSize);
      total += node.selfSize;
    }
    for (const child of node.children) walk(child);
  };
  walk(profile.head);
  return [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([name, bytes]) => ({ name, share: total === 0 ? 0 : bytes / total }));
}

async function profileSection(cli, data, dir) {
  const workloads = [
    { name: "cosyte parse: HL7 v2 ORU^R01, 1 MiB", argv: ["parse"], bytes: S.oruMessage(0, MIB) },
    { name: "cosyte parse: MLLP, 1,000 frames", argv: ["parse"], bytes: S.mllpStream(1_000) },
    { name: "cosyte parse: FHIR Bundle, 1 MiB", argv: ["parse"], bytes: S.bundleResource(0, MIB) },
    {
      name: "cosyte validate: FHIR Bundle, 1 MiB",
      argv: ["validate"],
      bytes: S.bundleResource(0, MIB),
    },
    {
      name: "cosyte parse --ndjson: 1,000 Patients",
      argv: ["parse", "--ndjson"],
      bytes: S.patientNdjson(1_000),
    },
    { name: "cosyte parse: X12 837P batch, 1 MiB", argv: ["parse"], bytes: S.claimBatch(0, MIB) },
    { name: "cosyte parse: ASTM, 1 MiB", argv: ["parse"], bytes: S.astmBatch(0, MIB) },
    { name: "cosyte validate: C-CDA CCD, 1 MiB", argv: ["validate"], bytes: S.ccdDense(0, MIB) },
    { name: "cosyte inspect: DICOM SR, 2 MiB", argv: ["inspect"], bytes: S.srDocument(0, 4_000) },
  ];
  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 100 });
  await session.post("HeapProfiler.enable");
  const lines = [
    "### CPU and heap profile of the hottest paths",
    "",
    `In process, each workload warmed for ${String(WARMUP_MS)} ms, then profiled alone for ${String(PROFILE_MS)} ms: self time from a CPU profile sampled every 100 us, and allocation from a sampled heap profile (an estimate, V8 heap only). (program) and (garbage collector) are V8's own time.`,
  ];
  data.profile = [];
  for (const [index, w] of workloads.entries()) {
    const bytes = toBytes(w.bytes);
    const pass = () => invoke(cli, w.argv, bytes);
    await runFor(pass, WARMUP_MS);
    await session.post("HeapProfiler.startSampling", {
      samplingInterval: 16_384,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
    await session.post("Profiler.start");
    const passes = await runFor(pass, PROFILE_MS);
    const { profile: cpu } = await session.post("Profiler.stop");
    const { profile: heap } = await session.post("HeapProfiler.stopSampling");
    if (dir !== undefined) {
      writeFileSync(resolve(dir, `${String(index + 1)}.cpuprofile`), JSON.stringify(cpu));
      writeFileSync(resolve(dir, `${String(index + 1)}.heapprofile`), JSON.stringify(heap));
    }
    const cpuTop = topSelfTime(cpu);
    const heapTop = topAllocations(heap);
    data.profile.push({ name: w.name, passes, cpuTop, heapTop });
    lines.push(
      "",
      `#### ${String(index + 1)}. ${w.name}`,
      "",
      `${String(passes)} calls in ${String(PROFILE_MS)} ms, ${(PROFILE_MS / Math.max(passes, 1)).toFixed(2)} ms a call.`,
      "",
      "| Self time | Function | Allocated | Function |",
      "| --- | --- | --- | --- |",
    );
    for (let i = 0; i < TOP; i++) {
      const c = cpuTop[i];
      const h = heapTop[i];
      lines.push(
        `| ${c === undefined ? "" : `${(c.share * 100).toFixed(1)}%`} | ${c === undefined ? "" : `\`${c.name}\``} | ${h === undefined ? "" : `${(h.share * 100).toFixed(1)}%`} | ${h === undefined ? "" : `\`${h.name}\``} |`,
      );
    }
  }
  session.disconnect();
  return lines;
}

/* main ---------------------------------------------------------------------------------------- */

const SECTIONS = [
  "start",
  "memory",
  "throughput",
  "allocations",
  "ndjson",
  "backpressure",
  "profile",
];

async function main() {
  const options = args(process.argv.slice(2));
  if (options.target === undefined) {
    process.stderr.write(
      "usage: node --expose-gc bench/profile.mjs <dist/index.mjs> [--out <dir>] [--only <section or group>]...\n",
    );
    return 2;
  }
  const target = resolve(options.target);
  const bin = join(dirname(target), "bin", "cosyte.mjs");
  statSync(bin);
  const cli = await import(pathToFileURL(target).href);
  if (options.dir !== undefined) mkdirSync(options.dir, { recursive: true });
  const sections = options.only.filter((o) => SECTIONS.includes(o));
  const groups = options.only.filter((o) => !SECTIONS.includes(o));
  const want = (s) => sections.length === 0 || sections.includes(s);
  const data = { node: process.version, platform: `${process.platform}-${process.arch}` };
  const lines = [
    "## @cosyte/cli: process start, memory, throughput and profile",
    "",
    `Node ${process.version}, ${process.platform}-${process.arch}.`,
  ];
  if (want("start")) lines.push("", ...startSection(target, bin, data));
  if (want("memory")) lines.push("", ...(await memorySection(bin, data, groups)));
  if (want("throughput")) lines.push("", ...(await throughputSection(cli, data, groups)));
  if (want("allocations")) lines.push("", ...(await allocationSection(cli, data)));
  if (want("ndjson")) lines.push("", ...(await ndjsonLineSection(cli, data)));
  if (want("backpressure")) lines.push("", ...(await backpressureSection(bin, data)));
  if (want("profile")) lines.push("", ...(await profileSection(cli, data, options.dir)));
  const text = `${lines.join("\n")}\n`;
  process.stdout.write(text);
  if (options.dir !== undefined) {
    writeFileSync(resolve(options.dir, "profile.md"), text);
    writeFileSync(resolve(options.dir, "profile.json"), `${JSON.stringify(data, null, 2)}\n`);
  }
  return 0;
}

process.exitCode = await main();
