#!/usr/bin/env node
// The release install gate: prove a consumer can install and RUN this package, before anything is
// published. It packs this tree, installs the packed tarball from a directory OUTSIDE this
// repository's working tree, executes every declared `bin` from that installed copy, and refuses a
// dependency specifier that names a local path in a field a consumer's install resolves.
//
// WHY THIS IS NOT `npm publish --dry-run` AND NOT `pnpm smoke`:
//   * A dry-run packs a tarball; it never resolves that tarball's dependencies from a registry.
//   * `pnpm smoke` exercises `dist/` IN PLACE, so every path it walks is a path inside this repo.
// This gate answers the one question neither of those asks: given only the registry and the packed
// tarball, does the install exit zero and do the commands start.
//
// IT FAILS CLOSED. Every outcome that is not a clean pass exits non-zero and names a reason: an
// install that exited non-zero, a bin missing from the package, a bin that ran and failed, a local
// path in a consumer-resolved field, and each way the gate can fail to reach a verdict at all (its
// own time bound, an unanswering registry, a throw). A transient fault therefore costs a re-run; it
// never costs a permanently uninstallable version, which is the trade this gate exists to make.
//
// USAGE
//   node scripts/release-install-gate.mjs [options]
//     --package-dir <dir>       tree to pack (default: the current directory)
//     --consumer-dir <dir>      install here (default: a fresh directory under the system temp dir)
//     --pack-timeout-ms <n>     bound on the pack (default 300000)
//     --install-timeout-ms <n>  bound on the install (default 300000)
//     --bin-window-ms <n>       window each bin gets to crash on load (default 2000)
//     --manifest-only           run the consumer-specifier lint alone, offline, and stop
//     --json                    write the report to stdout as JSON
//     --keep                    keep the directories this run created
//   Progress and diagnostics go to stderr; stdout carries the report alone.

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

/** The manifest fields a consumer's own install resolves. A local path in one of these is fatal. */
const CONSUMER_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies"];

/**
 * The manifest field a consumer's install never resolves. A local path here is REPORTED and is
 * deliberately not a failure: this package carries one on purpose, so that its own test run has a
 * FHIR parser that is not on the registry. Counting it would red this gate on day one over a
 * specifier no consumer install ever reads.
 */
const IGNORED_FIELD = "devDependencies";

/** Every reason this gate can refuse. One string per failure class, so a run's output is triageable. */
const REASON = {
  LOCAL_PATH: "local-path-specifier",
  PACK_FAILED: "pack-failed",
  INSTALL_FAILED: "install-failed",
  INSTALL_INCOMPLETE: "install-incomplete",
  BIN_MISSING: "bin-missing",
  BIN_FAILED: "bin-failed",
  GATE_TIMEOUT: "gate-timeout",
  GATE_REGISTRY_UNREACHABLE: "gate-registry-unreachable",
  GATE_CONSUMER_DIR_INSIDE_PACKAGE: "gate-consumer-dir-inside-package",
  GATE_NO_BINS_DECLARED: "gate-no-bins-declared",
  GATE_ERROR: "gate-error",
};

/**
 * npm and undici error codes that mean the registry did not answer, as opposed to answering with a
 * refusal. Kept as whole-word codes rather than prose so an unrelated dependency name containing the
 * word "network" cannot be read as a network fault.
 */
const REGISTRY_FAULT_CODES = [
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "ERR_SOCKET_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "FETCH_ERROR",
];

/** A refusal carrying the reason string the report and the run's output are keyed on. */
class GateRefusal extends Error {
  /**
   * @param {string} reason one of REASON
   * @param {string} message a single line, safe to print in a public CI log
   */
  constructor(reason, message) {
    super(message);
    this.name = "GateRefusal";
    this.reason = reason;
  }
}

const log = (msg) => process.stderr.write(`release-install-gate: ${msg}\n`);

/** The first non-empty line of a diagnostic, trimmed. Bounded so a stack trace cannot flood a log. */
function firstLine(text) {
  const line = String(text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line === undefined ? "" : line.slice(0, 400);
}

/**
 * The line of a failed package-manager run worth quoting: its own error line if it printed one,
 * otherwise the first line of anything it said. Without the preference a leading deprecation WARNING
 * becomes the reported cause, which sends whoever reads the run at the wrong thing entirely.
 */
function errorLine(text) {
  const lines = String(text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const named = lines.find((l) => /npm error|npm ERR!|^ERR_|ERROR|ELIFECYCLE/.test(l));
  return (named ?? lines[0] ?? "").slice(0, 400);
}

/**
 * Classify a dependency specifier as a local path, or not.
 *
 * The three shapes are the ones a consumer's install cannot resolve from a registry: the `file:` and
 * `link:` protocols, and a bare filesystem path (relative or absolute, either separator). A registry
 * range, a `npm:` alias, a git URL and a tarball URL all resolve for a consumer and are not flagged.
 *
 * @param {unknown} specifier
 * @returns {string | null} the kind of local path, or null
 */
function localPathKind(specifier) {
  if (typeof specifier !== "string") return null;
  const s = specifier.trim();
  if (s.startsWith("file:")) return "file: protocol";
  if (s.startsWith("link:")) return "link: protocol";
  if (s.startsWith("./") || s.startsWith("../") || s === "." || s === "..") return "relative path";
  if (s.startsWith(".\\") || s.startsWith("..\\")) return "relative path";
  if (s.startsWith("/")) return "absolute path";
  if (/^[A-Za-z]:[\\/]/.test(s)) return "absolute path";
  return null;
}

/**
 * Every local-path specifier in the fields a consumer resolves, plus the ones deliberately ignored.
 *
 * @param {Record<string, unknown>} manifest
 */
function scanSpecifiers(manifest) {
  const found = [];
  const ignored = [];
  for (const field of [...CONSUMER_FIELDS, IGNORED_FIELD]) {
    const block = manifest[field];
    if (block === null || typeof block !== "object") continue;
    for (const [name, specifier] of Object.entries(block)) {
      const kind = localPathKind(specifier);
      if (kind === null) continue;
      const entry = { field, name, specifier: String(specifier), kind };
      if (field === IGNORED_FIELD) ignored.push(entry);
      else found.push(entry);
    }
  }
  return { found, ignored };
}

/**
 * The `bin` map a manifest declares, normalised to name -> target. npm allows a bare string, which
 * means "one bin, named after the package"; both spellings are handled so neither shape reads as a
 * package with no bins.
 *
 * @param {Record<string, unknown>} manifest
 * @returns {Record<string, string>}
 */
function binMap(manifest) {
  const bin = manifest.bin;
  if (typeof bin === "string") {
    const name =
      String(manifest.name ?? "")
        .split("/")
        .pop() ?? "";
    return name === "" ? {} : { [name]: bin };
  }
  if (bin === null || typeof bin !== "object") return {};
  const out = {};
  for (const [name, target] of Object.entries(bin)) {
    if (typeof target === "string") out[name] = target;
  }
  return out;
}

/** True when `child` is `parent` or sits underneath it. Both must already exist on disk. */
function isInside(child, parent) {
  const c = realpathSync(child);
  const p = realpathSync(parent);
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
}

/** Read and parse a manifest. A malformed or absent one throws, which the gate reports as its own. */
function readManifest(dir) {
  const path = join(dir, "package.json");
  if (!existsSync(path)) throw new Error(`no package.json at ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Top-level package names present in a consumer's node_modules, scopes expanded, dots dropped. */
function installedPackages(consumerDir) {
  const nm = join(consumerDir, "node_modules");
  if (!existsSync(nm)) return [];
  const names = [];
  for (const entry of readdirSync(nm)) {
    if (entry.startsWith(".")) continue;
    if (entry.startsWith("@")) {
      for (const inner of readdirSync(join(nm, entry))) names.push(`${entry}/${inner}`);
    } else {
      names.push(entry);
    }
  }
  return names.sort();
}

/**
 * Run a declared bin from the installed copy and decide whether it RAN.
 *
 * The two bins this package ships have opposite shapes and one rule covers both: a terminal command
 * exits, a stdio server does not. So "did not run" can only mean one thing that is true of both, and
 * it is the thing that actually breaks a consumer: the process exited NON-ZERO inside the window.
 * Exiting zero and still serving at the end of the window are both "it ran".
 *
 * @returns {Promise<{name: string, outcome: string, exitCode: number|null, diagnostic: string}>}
 */
function runBin(name, launcher, args, cwd, windowMs) {
  return new Promise((resolveRun) => {
    let settled = false;
    let stderrText = "";
    let stdoutText = "";
    /** Set by `exit`, which is authoritative about the status even if the pipes are still draining. */
    let exited = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    const child = spawn(launcher.command, launcher.args.concat(args), {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    const finish = (outcome, exitCode) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      const diagnostic = firstLine(stderrText) || firstLine(stdoutText);
      resolveRun({ name, outcome, exitCode, diagnostic });
    };
    const settleFromExit = (code) => finish(code === 0 ? "exited-zero" : "exited-non-zero", code);
    child.stdout.on("data", (d) => (stdoutText += d.toString()));
    child.stderr.on("data", (d) => (stderrText += d.toString()));
    child.on("error", (err) => {
      stderrText += `${err.message}\n`;
      finish("spawn-failed", null);
    });
    // `exit` records the status; `close` settles, because only then is the diagnostic complete.
    child.on("exit", (code) => (exited = code));
    child.on("close", () => settleFromExit(exited));
    timer = setTimeout(() => {
      // A process that HAS exited is never reported as still running, however late its pipes close:
      // that mistake would turn a bin crashing on load into a pass.
      if (exited !== null) {
        settleFromExit(exited);
        return;
      }
      // Still serving at the end of the window: a long-lived stdio server did not crash on load.
      // Its handles are released too, so a server that declines to die cannot hang the gate.
      child.kill("SIGTERM");
      child.unref();
      finish("still-running", null);
    }, windowMs);
  });
}

async function gate(opts) {
  const packageDir = resolve(opts.packageDir);
  /** @type {{ok: boolean, reason: string|null, message: string, phases: Record<string, unknown>}} */
  const report = {
    ok: false,
    reason: null,
    message: "",
    packageDir,
    packageName: null,
    consumerDir: null,
    consumerDirOutsidePackageDir: null,
    tarball: null,
    installedPackages: [],
    phases: {},
  };
  const created = [];

  try {
    // --- 1. the consumer-resolved specifier lint, offline, before anything is packed -------------
    const manifest = readManifest(packageDir);
    report.packageName = typeof manifest.name === "string" ? manifest.name : null;
    const { found, ignored } = scanSpecifiers(manifest);
    report.phases.manifest = {
      ok: found.length === 0,
      inspectedFields: CONSUMER_FIELDS,
      ignoredField: IGNORED_FIELD,
      localPathSpecifiers: found,
      ignoredLocalPathSpecifiers: ignored,
    };
    for (const entry of ignored) {
      log(`note: ${entry.field} "${entry.name}": "${entry.specifier}" is a ${entry.kind}, and is`);
      log(`      not a consumer-resolved field, so it is not a release blocker`);
    }
    if (found.length > 0) {
      const e = found[0];
      throw new GateRefusal(
        REASON.LOCAL_PATH,
        `${e.field} "${e.name}": "${e.specifier}" is a ${e.kind}; a consumer's install cannot ` +
          `resolve it (${found.length} such specifier(s) in the source manifest)`,
      );
    }
    log(`the ${CONSUMER_FIELDS.join(", ")} fields name no local path`);
    if (opts.manifestOnly) {
      report.ok = true;
      report.message = "the consumer-resolved fields name no local path";
      return report;
    }

    // --- 2. the bins this package promises -------------------------------------------------------
    const declaredBins = binMap(manifest);
    const binNames = Object.keys(declaredBins);
    if (binNames.length === 0) {
      throw new GateRefusal(
        REASON.GATE_NO_BINS_DECLARED,
        "the manifest declares no bin, so this gate would assert nothing about a command running",
      );
    }

    // --- 3. a consumer directory that is NOT inside this repository's working tree ----------------
    let consumerDir;
    if (opts.consumerDir === undefined) {
      consumerDir = mkdtempSync(join(tmpdir(), "release-install-gate-consumer-"));
      created.push(consumerDir);
    } else {
      consumerDir = resolve(opts.consumerDir);
      if (!existsSync(consumerDir)) mkdirSync(consumerDir, { recursive: true });
    }
    report.consumerDir = consumerDir;
    const inside = isInside(consumerDir, packageDir);
    report.consumerDirOutsidePackageDir = !inside;
    if (inside) {
      throw new GateRefusal(
        REASON.GATE_CONSUMER_DIR_INSIDE_PACKAGE,
        `the install directory ${consumerDir} is inside the package working tree ${packageDir}; ` +
          "an install that can reach this repository's own files proves nothing about a consumer",
      );
    }
    // npm walks UP for a package root, so an unmarked directory would install somewhere else
    // entirely. `wx` is an exclusive create, so a manifest already there is left exactly as it is
    // with no check-then-write window in between: a caller-supplied one is never overwritten, and a
    // deliberately broken one is a thing this gate has to be able to observe.
    const consumerManifest = join(consumerDir, "package.json");
    try {
      const body = { name: "release-install-gate-consumer", version: "0.0.0", private: true };
      writeFileSync(consumerManifest, `${JSON.stringify(body, null, 2)}\n`, { flag: "wx" });
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
    }

    // --- 4. pack this tree, into a directory outside it too --------------------------------------
    const packDir = mkdtempSync(join(tmpdir(), "release-install-gate-pack-"));
    created.push(packDir);
    log(`packing ${packageDir}`);
    const packed = spawnSync("pnpm", ["pack", "--pack-destination", packDir], {
      cwd: packageDir,
      encoding: "utf8",
      shell: false,
      timeout: opts.packTimeoutMs,
    });
    const packOutput = `${packed.stdout ?? ""}${packed.stderr ?? ""}`;
    report.phases.pack = { ok: packed.status === 0, exitCode: packed.status };
    if (packed.error !== undefined && packed.error.code !== "ETIMEDOUT") {
      throw new Error(`pnpm pack could not be run: ${firstLine(packed.error.message)}`);
    }
    if (packed.error !== undefined || packed.signal !== null) {
      throw new GateRefusal(
        REASON.GATE_TIMEOUT,
        `packing did not finish inside ${opts.packTimeoutMs}ms ` +
          `(${firstLine(packed.error?.message) || String(packed.signal)})`,
      );
    }
    if (packed.status !== 0) {
      throw new GateRefusal(
        REASON.PACK_FAILED,
        `pnpm pack exited ${packed.status}: ${errorLine(packOutput)}`,
      );
    }
    const tarballs = readdirSync(packDir).filter((f) => f.endsWith(".tgz"));
    if (tarballs.length !== 1) {
      throw new Error(`expected exactly one packed tarball, found ${tarballs.length}`);
    }
    const tarball = join(packDir, tarballs[0]);
    report.tarball = tarball;

    // --- 5. install it, as a consumer would ------------------------------------------------------
    // The pack step uses this repo's declared package manager; the INSTALL uses the tool a consumer
    // uses, because the question it answers is the consumer's, not this repo's.
    log(`installing ${tarballs[0]} into ${consumerDir}`);
    const startedAt = Date.now();
    const installed = spawnSync("npm", ["install", tarball, "--no-audit", "--no-fund"], {
      cwd: consumerDir,
      encoding: "utf8",
      shell: false,
      timeout: opts.installTimeoutMs,
    });
    const installOutput = `${installed.stdout ?? ""}${installed.stderr ?? ""}`;
    report.phases.install = {
      ok: installed.status === 0,
      exitCode: installed.status,
      durationMs: Date.now() - startedAt,
    };
    if (installed.error !== undefined && installed.error.code !== "ETIMEDOUT") {
      throw new Error(`npm install could not be run: ${firstLine(installed.error.message)}`);
    }
    if (installed.error !== undefined || installed.signal !== null) {
      const detail = firstLine(installed.error?.message) || String(installed.signal);
      throw new GateRefusal(
        REASON.GATE_TIMEOUT,
        `the install did not finish inside ${opts.installTimeoutMs}ms (${detail})`,
      );
    }
    if (installed.status !== 0) {
      const fault = REGISTRY_FAULT_CODES.find((code) =>
        new RegExp(`\\b${code}\\b`).test(installOutput),
      );
      if (fault !== undefined) {
        throw new GateRefusal(
          REASON.GATE_REGISTRY_UNREACHABLE,
          `the registry did not answer (${fault}); this gate reaches no verdict, so it refuses`,
        );
      }
      throw new GateRefusal(
        REASON.INSTALL_FAILED,
        `the install exited ${installed.status}: ${errorLine(installOutput)}`,
      );
    }
    report.installedPackages = installedPackages(consumerDir);

    // --- 6. what the install actually delivered --------------------------------------------------
    const name = report.packageName;
    if (typeof name !== "string" || name === "") {
      throw new Error("the manifest declares no name, so the installed copy cannot be located");
    }
    const installedDir = join(consumerDir, "node_modules", ...name.split("/"));
    if (!existsSync(installedDir)) {
      throw new GateRefusal(
        REASON.INSTALL_INCOMPLETE,
        `the install exited zero but ${name} is not present under the consumer's node_modules`,
      );
    }
    const installedManifest = readManifest(installedDir);
    const installedScan = scanSpecifiers(installedManifest);
    report.phases.installedManifest = {
      ok: installedScan.found.length === 0,
      localPathSpecifiers: installedScan.found,
      ignoredLocalPathSpecifiers: installedScan.ignored,
    };
    if (installedScan.found.length > 0) {
      const e = installedScan.found[0];
      throw new GateRefusal(
        REASON.LOCAL_PATH,
        `the installed copy resolves ${e.field} "${e.name}": "${e.specifier}", a ${e.kind}`,
      );
    }

    // --- 7. every declared bin is present in the installed copy ----------------------------------
    const installedBins = binMap(installedManifest);
    const binResults = [];
    for (const binName of binNames) {
      const target = installedBins[binName];
      if (target === undefined) {
        throw new GateRefusal(
          REASON.BIN_MISSING,
          `packaging defect: the installed package declares no target for bin "${binName}", ` +
            "which this tree's manifest declares; the install itself exited zero",
        );
      }
      const targetPath = join(installedDir, target);
      const present = existsSync(targetPath) && statSync(targetPath).isFile();
      if (!present || statSync(targetPath).size === 0) {
        throw new GateRefusal(
          REASON.BIN_MISSING,
          `packaging defect: bin "${binName}" is declared as ${target} and is missing from the ` +
            "installed package; the install itself exited zero, so this is what the tarball " +
            "carries, not an install failure",
        );
      }
      binResults.push({ name: binName, target, targetPath });
    }

    // --- 8. and every declared bin RUNS from the installed copy -----------------------------------
    const outcomes = [];
    for (const entry of binResults) {
      const link = join(consumerDir, "node_modules", ".bin", entry.name);
      // The `.bin` link is the path a consumer's shell invokes, so it is preferred. Falling back to
      // the target file under `node` is not a way past a packaging defect: the target's presence was
      // established above, and this only decides which of two real paths to the same file is used.
      const launcher = existsSync(link)
        ? { command: link, args: [] }
        : { command: process.execPath, args: [entry.targetPath] };
      log(`running bin "${entry.name}"`);
      const outcome = await runBin(
        entry.name,
        launcher,
        ["--version"],
        consumerDir,
        opts.binWindowMs,
      );
      outcomes.push({ ...outcome, target: entry.target, launcher: launcher.command });
      if (outcome.outcome === "exited-non-zero" || outcome.outcome === "spawn-failed") {
        report.phases.bins = { ok: false, results: outcomes };
        throw new GateRefusal(
          REASON.BIN_FAILED,
          `bin "${entry.name}" did not run: ${outcome.outcome}` +
            (outcome.exitCode === null ? "" : ` (exit ${outcome.exitCode})`) +
            (outcome.diagnostic === "" ? "" : `: ${outcome.diagnostic}`),
        );
      }
      log(`  bin "${entry.name}": ${outcome.outcome}`);
    }
    report.phases.bins = { ok: true, results: outcomes };

    report.ok = true;
    report.message =
      `${name} packs, installs from ${consumerDir} outside this tree, and all ` +
      `${binNames.length} declared bin(s) run from the installed copy`;
    return report;
  } catch (err) {
    if (err instanceof GateRefusal) {
      report.reason = err.reason;
      report.message = err.message;
    } else {
      report.reason = REASON.GATE_ERROR;
      report.message = `the gate could not reach a verdict: ${firstLine(
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      )}`;
    }
    report.ok = false;
    return report;
  } finally {
    if (!opts.keep) {
      for (const dir of created) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          // A leftover temp directory is not a verdict; never let cleanup decide the exit code.
        }
      }
    }
  }
}

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "package-dir": { type: "string" },
      "consumer-dir": { type: "string" },
      "pack-timeout-ms": { type: "string" },
      "install-timeout-ms": { type: "string" },
      "bin-window-ms": { type: "string" },
      "manifest-only": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      keep: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });
  const number = (raw, fallback, label) => {
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} must be a positive number`);
    return n;
  };
  return {
    packageDir: values["package-dir"] ?? process.cwd(),
    consumerDir: values["consumer-dir"],
    packTimeoutMs: number(values["pack-timeout-ms"], 300_000, "--pack-timeout-ms"),
    installTimeoutMs: number(values["install-timeout-ms"], 300_000, "--install-timeout-ms"),
    binWindowMs: number(values["bin-window-ms"], 2_000, "--bin-window-ms"),
    manifestOnly: values["manifest-only"] === true,
    json: values.json === true,
    keep: values.keep === true,
  };
}

async function main() {
  let opts;
  try {
    opts = parseOptions(process.argv.slice(2));
  } catch (err) {
    const message = `the gate could not reach a verdict: ${firstLine(
      err instanceof Error ? err.message : String(err),
    )}`;
    process.stdout.write(`${JSON.stringify({ ok: false, reason: REASON.GATE_ERROR, message })}\n`);
    log(`REFUSED (${REASON.GATE_ERROR}): ${message}`);
    process.exitCode = 1;
    return;
  }
  const report = await gate(opts);
  if (opts.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.ok) {
    log(`OK: ${report.message}`);
    if (!opts.json) process.stdout.write(`release-install-gate: OK\n`);
  } else {
    log(`REFUSED (${report.reason}): ${report.message}`);
    log("no publish should follow this run");
    process.exitCode = 1;
  }
}

await main();
