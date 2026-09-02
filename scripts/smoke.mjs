#!/usr/bin/env node
// CLI-7 release-shape gate: smoke the BUILT package the way a consumer will.
//
// Three things a source-only suite cannot catch, exercised against `dist/` (not `src/`):
//   1. The `.` subpath library API imports as ESM *and* requires as CJS, and both drive a real
//      `run(["--version"])` + `detectFormat(...)` to the same answer: a broken dual build (a bad
//      `exports` map, an ESM-only construct leaking into CJS, a missing entry) fails here.
//   2. The `./mcp` subpath (the agent front door) imports/requires both ways and dispatches a tool.
//   3. Both `bin` executables actually run under `node`: `cosyte --version`, `cosyte parse -` over a
//      piped stdin message, and the `cosyte-mcp` stdio server starts without crashing on load.
//   4. A consumer that goes away (`| head -1`, a pager the user quit) does not turn into a success
//      over output nobody received. This one is HERE and not only in the source-level suite on
//      purpose: the platform reports a closed consumer asynchronously, so how much of a short run is
//      already enqueued when that report lands depends on how fast the process reaches its writes,
//      and the packaged bin under plain `node` starts far faster than the sources under a loader.
//      The measured window is wide enough that a defect invisible to the source suite ships here.
//
// Run after `build`; it consumes `dist/`. Wired into `verify.sh` (the ladder runs `smoke` when present).

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const HL7 = "MSH|^~\\&|A|B|C|D|20240101||ADT^A01|1|P|2.5\r";
const hl7Bytes = new TextEncoder().encode(HL7);
// The same message twice, MLLP-framed: two records, which is the record-stream write path over a
// stream short enough that both lines can be enqueued before a closed consumer is reported.
const MLLP_TWO = `\x0b${HL7}\x1c\r\x0b${HL7}\x1c\r`;
// run() needs injected input readers; --version and detectFormat never touch them, but be complete.
const deps = {
  readFile: () => Promise.resolve(hl7Bytes),
  readStdin: () => Promise.resolve(hl7Bytes),
};

let failures = 0;
function ok(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failures += 1;
  }
}

// --- 1. the `.` subpath library API, both module systems ------------------------------------------
async function checkCore(mod, label) {
  ok(typeof mod.run === "function", `${label}: run() exported`);
  ok(typeof mod.detectFormat === "function", `${label}: detectFormat() exported`);
  ok(mod.EXIT && mod.EXIT.OK === 0, `${label}: EXIT contract exported`);
  const version = await mod.run(["--version"], deps);
  ok(
    version.exit === 0 && version.stdout.trim().length > 0,
    `${label}: run(["--version"]) → exit 0 + a version`,
  );
  ok(mod.detectFormat(hl7Bytes).format === "hl7", `${label}: detectFormat(HL7) → "hl7"`);
}

// --- 2. the `./mcp` subpath (agent front door), both module systems -------------------------------
async function checkMcp(mod, label) {
  ok(typeof mod.dispatchTool === "function", `${label}: dispatchTool() exported`);
  ok(Array.isArray(mod.TOOL_DEFS) && mod.TOOL_DEFS.length > 0, `${label}: TOOL_DEFS advertised`);
  const r = await mod.dispatchTool("parse", { content: HL7 });
  ok(
    r.isError === false && r.structuredContent.exit === 0,
    `${label}: dispatchTool("parse", …) → ok`,
  );
}

// --- 3. the two bin executables under `node` ------------------------------------------------------
function runBin(relPath, args, stdin) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, relPath), ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (stdin !== undefined) child.stdin.write(stdin);
    child.stdin.end();
  });
}

/**
 * Run a bin with its stdout closed before it can deliver a byte, the way an early-exiting consumer
 * leaves. Resolves with the exit status and whatever the bin managed to say on its diagnostic
 * channel; `stdout` is not collected because the point is that nothing reaches it.
 */
function runBinClosedStdout(relPath, args, stdin) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, relPath), ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.stdout.destroy();
    child.stdin.on("error", () => {
      // The child is already gone; its end of the pipe went with it.
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (stdin !== undefined) child.stdin.write(stdin);
    child.stdin.end();
  });
}

/** Start a long-lived server bin and assert it does NOT crash on load within a short window. */
function startServerBin(relPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, relPath)], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let crashed = false;
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("exit", (code) => {
      if (code !== null && code !== 0) crashed = true;
    });
    setTimeout(() => {
      const exitedCleanly = child.exitCode === 0;
      child.kill("SIGTERM");
      // Success = it stayed alive serving (still running) OR exited 0; a non-zero load crash fails.
      resolve({ ok: !crashed, stderr, exitedCleanly });
    }, 700);
  });
}

/** The packaged bin, its consumer gone before a byte was read: one code, one value-free line. */
async function checkClosedConsumer(label, args, stdin, ioerr) {
  const r = await runBinClosedStdout("dist/bin/cosyte.mjs", args, stdin);
  ok(r.stdout === "", `${label}: the consumer really received nothing (the premise)`);
  ok(r.code === ioerr, `${label}: exit ${String(ioerr)}, never 0 (got ${String(r.code)})`);
  ok(
    r.stderr.includes("CLI_OUTPUT_WRITE_FAILED"),
    `${label}: the stable output-error code on stderr`,
  );
  ok(
    !/parsed \d+ \w+ record\(s\)/.test(r.stderr) && !/parsed \w+ with \d+ warning/.test(r.stderr),
    `${label}: no success summary over output nobody received`,
  );
  ok(
    !r.stderr.includes("EPIPE") && !/\s+at\s+\S+:\d+/.test(r.stderr),
    `${label}: value-free, no platform error identity and no stack frame`,
  );
}

async function main() {
  console.log("smoke: `.` subpath (built dual ESM/CJS)");
  const esm = await import(join(root, "dist/index.mjs"));
  await checkCore(esm, "ESM");
  await checkCore(require(join(root, "dist/index.cjs")), "CJS");

  console.log("smoke: `./mcp` subpath (built dual ESM/CJS)");
  await checkMcp(await import(join(root, "dist/mcp.mjs")), "ESM");
  await checkMcp(require(join(root, "dist/mcp.cjs")), "CJS");

  console.log("smoke: bin executables under node");
  const version = await runBin("dist/bin/cosyte.mjs", ["--version"]);
  ok(
    version.code === 0 && version.stdout.trim().length > 0,
    "cosyte --version → exit 0 + a version",
  );

  const parsed = await runBin("dist/bin/cosyte.mjs", ["parse", "-"], HL7);
  ok(
    parsed.code === 0 && parsed.stdout.length > 0,
    "cosyte parse - (piped HL7) → exit 0 + parsed model",
  );

  console.log("smoke: a downstream consumer that goes away, against the packaged bin");
  const ioerr = esm.EXIT.IOERR;
  ok(
    typeof ioerr === "number" && ioerr !== 0,
    "the output-error code is published on the contract",
  );
  await checkClosedConsumer("single write", ["parse", "-"], HL7, ioerr);
  await checkClosedConsumer("record stream", ["parse", "-"], MLLP_TWO, ioerr);

  const server = await startServerBin("dist/bin/cosyte-mcp.mjs");
  ok(
    server.ok,
    `cosyte-mcp stdio server starts without a load crash${server.ok ? "" : `: ${server.stderr}`}`,
  );

  if (failures > 0) {
    console.error(`smoke: FAIL, ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("smoke: ok, dual ESM/CJS `.` + `./mcp`, and both bins, all green");
}

main().catch((e) => {
  console.error(`smoke: FAIL, ${e?.stack ?? String(e)}`);
  process.exit(1);
});
