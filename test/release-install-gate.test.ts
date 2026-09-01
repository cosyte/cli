/**
 * Tests for `scripts/release-install-gate.mjs` and for the release workflow that runs it.
 *
 * WHAT THIS GATE IS FOR, IN ONE SENTENCE: `@cosyte/cli@0.0.1` and `0.0.2` are on npm uninstallable
 * forever, and the only check that catches that shape is an `npm install` of the packed tarball from
 * a directory OUTSIDE this repository. So the assertions below are not about the script's internals;
 * they are about whether a defective release can still get past it.
 *
 * WHY EVERY POSITIVE CASE IS PAIRED WITH A NEGATIVE CONTROL. A gate that only ever passes asserts
 * nothing, and a gate that only ever fails is one someone disables. Each behaviour here is pinned
 * from both sides:
 *
 *   1. A local path in a field a CONSUMER resolves reds the gate, naming the field and the
 *      specifier, in each of the three fields and each of the shapes a local path takes. The control
 *      is THIS repository's own manifest, which carries `"@cosyte/fhir": "file:vendor/…tgz"` in
 *      `devDependencies` on purpose: it must reach a PASSING verdict, and the report must show the
 *      gate SAW that specifier rather than passing because it never looked.
 *   2. Both declared bins are EXECUTED from the installed copy, not stat-ed. The two shapes have
 *      opposite behaviour and both are pinned: a command that exits zero, and a long-lived stdio
 *      server that is still running at the end of its window. A bin that exits non-zero on load reds
 *      the gate, naming which bin and the first line of its diagnostic.
 *   3. A declared bin whose target is not in the tarball reds the gate as a PACKAGING DEFECT, with
 *      the install itself recorded as having exited zero, because "the tarball is missing a file"
 *      and "the install failed" send whoever reads the run at different things.
 *   4. An install that exits non-zero reds the gate.
 *   5. Every way the gate can fail to reach a verdict at all (its own time bound, a registry that
 *      does not answer, a throw inside the gate, an install directory inside this repository) reds
 *      it too, each with its own reason string. Failing closed is the point: a transient fault costs
 *      a re-run, never a permanently dead version.
 *   6. An installed copy that does NOT carry `@cosyte/fhir` or `@cosyte/transform` passes. Those two
 *      are absent from a real consumer install by design, and a gate that red on their absence could
 *      never run here at all.
 *   7. The publishing job cannot run without the gate: parsed out of the workflow file, since a
 *      job graph is the only place that fact lives.
 *
 * The fixtures are throwaway packages in a temp directory with NO dependencies, so every install
 * here is offline and cannot be flaked by a registry. The one case that must reach a registry points
 * at a closed local port on purpose.
 *
 * SECURITY: every subprocess call is spawnSync with array args. No exec, no shell form.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const REPO_ROOT = process.cwd();
const GATE = join(REPO_ROOT, "scripts", "release-install-gate.mjs");
const RELEASE_WORKFLOW = join(REPO_ROOT, ".github", "workflows", "release.yml");

/** Each case packs and installs a real tarball; the suite's 10s default does not cover that. */
const CASE_TIMEOUT = 120_000;
/** Short on purpose: the fixtures load nothing, so a crash on load lands well inside this. */
const BIN_WINDOW = "700";

interface BinResult {
  name: string;
  outcome: string;
  exitCode: number | null;
  diagnostic: string;
  target: string;
}

interface SpecifierFinding {
  field: string;
  name: string;
  specifier: string;
  kind: string;
}

interface GateReport {
  ok: boolean;
  reason: string | null;
  message: string;
  packageName: string | null;
  consumerDir: string | null;
  consumerDirOutsidePackageDir: boolean | null;
  installedPackages: string[];
  phases: {
    manifest?: {
      ok: boolean;
      inspectedFields: string[];
      ignoredField: string;
      localPathSpecifiers: SpecifierFinding[];
      ignoredLocalPathSpecifiers: SpecifierFinding[];
    };
    pack?: { ok: boolean; exitCode: number | null };
    install?: { ok: boolean; exitCode: number | null; durationMs: number };
    installedManifest?: { ok: boolean; localPathSpecifiers: SpecifierFinding[] };
    bins?: { ok: boolean; results: BinResult[] };
  };
}

interface GateRun {
  status: number;
  report: GateReport;
  stderr: string;
}

/** Run the gate as the release path runs it: a real process, reading only its report and status. */
function runGate(args: string[], env: NodeJS.ProcessEnv = {}): GateRun {
  const r = spawnSync(process.execPath, [GATE, "--json", ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
    timeout: 180_000,
    env: { ...process.env, ...env },
  });
  const stdout = r.stdout ?? "";
  let report: GateReport;
  try {
    report = JSON.parse(stdout) as GateReport;
  } catch {
    throw new Error(`the gate wrote no JSON report. stdout=${stdout} stderr=${r.stderr ?? ""}`);
  }
  return { status: r.status ?? -1, report, stderr: r.stderr ?? "" };
}

let root: string;

/** Both bin shapes healthy, and a `file:` devDependency the way this repo carries one. */
let healthy: string;
/** A consumer-resolved `file:` specifier: the exact shape that killed `0.0.1` and `0.0.2`. */
let localPathDep: string;
/** A declared bin whose target was never built, so the tarball cannot carry it. */
let binNotBuilt: string;
/** A bin that exits non-zero on load. */
let binCrashes: string;
/** A manifest that declares no bin at all. */
let noBins: string;
/** A package with a registry dependency, for the run that points at a registry that is not there. */
let registryDep: string;
/** A manifest this gate cannot parse. */
let brokenManifest: string;
/** A consumer directory whose own manifest is malformed, so the install exits non-zero. */
let brokenConsumer: string;

/**
 * Stands in for a command whose optional siblings are absent from an installed copy, which is what
 * `@cosyte/fhir` and `@cosyte/transform` are in a real one. It reports them value-free and exits 0,
 * exactly as the CLI's own unavailable path does.
 */
const COMMAND_BIN = `#!/usr/bin/env node
let absent = 0;
for (const name of ["@cosyte/fhir", "@cosyte/transform"]) {
  try {
    await import(name);
  } catch {
    absent += 1;
  }
}
process.stderr.write("fixture: PARSER_UNAVAILABLE: " + absent + " optional package(s) absent\\n");
process.stdout.write("0.0.0\\n");
`;

/** Stands in for `cosyte-mcp`: a stdio server that never exits on its own. */
const SERVER_BIN = `#!/usr/bin/env node
setInterval(() => {}, 1000);
`;

/** Stands in for a bin that crashes on load, the only thing "does not run" can mean for a server. */
const CRASHING_BIN = `#!/usr/bin/env node
process.stderr.write("fixture: INTERNAL: the server failed to start\\n");
process.exitCode = 70;
`;

function writePkg(dir: string, pkg: unknown, files: Record<string, string>): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  for (const [name, body] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body, { mode: 0o755 });
  }
  return dir;
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "release-install-gate-test-"));

  healthy = writePkg(
    join(root, "healthy"),
    {
      name: "gate-fixture-healthy",
      version: "1.0.0",
      type: "module",
      bin: { "fixture-cli": "./bin/cli.mjs", "fixture-server": "./bin/server.mjs" },
      files: ["bin"],
      devDependencies: { "gate-fixture-vendored": "file:./vendor/vendored.tgz" },
    },
    { "bin/cli.mjs": COMMAND_BIN, "bin/server.mjs": SERVER_BIN },
  );

  localPathDep = writePkg(
    join(root, "local-path-dep"),
    {
      name: "gate-fixture-localpath",
      version: "1.0.0",
      type: "module",
      bin: { "fixture-cli": "./bin/cli.mjs" },
      files: ["bin"],
      dependencies: { "gate-fixture-vendored": "file:./vendor/vendored.tgz" },
    },
    { "bin/cli.mjs": COMMAND_BIN },
  );

  binNotBuilt = writePkg(
    join(root, "bin-not-built"),
    {
      name: "gate-fixture-notbuilt",
      version: "1.0.0",
      type: "module",
      bin: { "fixture-cli": "./dist/bin/cli.mjs", "fixture-other": "./bin/other.mjs" },
      files: ["dist", "bin"],
    },
    { "bin/other.mjs": COMMAND_BIN },
  );

  binCrashes = writePkg(
    join(root, "bin-crashes"),
    {
      name: "gate-fixture-crashes",
      version: "1.0.0",
      type: "module",
      bin: { "fixture-server": "./bin/server.mjs" },
      files: ["bin"],
    },
    { "bin/server.mjs": CRASHING_BIN },
  );

  noBins = writePkg(
    join(root, "no-bins"),
    { name: "gate-fixture-nobins", version: "1.0.0", type: "module", files: ["bin"] },
    { "bin/cli.mjs": COMMAND_BIN },
  );

  registryDep = writePkg(
    join(root, "registry-dep"),
    {
      name: "gate-fixture-registrydep",
      version: "1.0.0",
      type: "module",
      bin: { "fixture-cli": "./bin/cli.mjs" },
      files: ["bin"],
      dependencies: { "gate-fixture-served-by-a-registry": "^1.0.0" },
    },
    { "bin/cli.mjs": COMMAND_BIN },
  );

  brokenManifest = join(root, "broken-manifest");
  mkdirSync(brokenManifest, { recursive: true });
  writeFileSync(join(brokenManifest, "package.json"), "{ this is not a manifest\n");

  brokenConsumer = join(root, "broken-consumer");
  mkdirSync(brokenConsumer, { recursive: true });
  writeFileSync(join(brokenConsumer, "package.json"), "{ this is not a manifest\n");
});

afterAll(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
});

describe("the packed tarball installs from outside the repository", () => {
  it(
    "packs, installs outside this tree, and reports the directory it used",
    () => {
      const run = runGate(["--package-dir", healthy, "--bin-window-ms", BIN_WINDOW]);
      expect(run.report.reason).toBeNull();
      expect(run.report.ok).toBe(true);
      expect(run.status).toBe(0);
      expect(run.report.phases.pack?.ok).toBe(true);
      expect(run.report.phases.install?.ok).toBe(true);
      expect(run.report.phases.install?.exitCode).toBe(0);
      // The install directory is not the package tree and is not underneath it. An install that
      // could reach this repository's own files would prove nothing about a consumer.
      expect(run.report.consumerDirOutsidePackageDir).toBe(true);
      expect(run.report.consumerDir).not.toBeNull();
      expect(run.report.consumerDir?.startsWith(healthy)).toBe(false);
    },
    CASE_TIMEOUT,
  );

  it(
    "refuses when the install exits non-zero, and exits non-zero itself",
    () => {
      const run = runGate([
        "--package-dir",
        healthy,
        "--consumer-dir",
        brokenConsumer,
        "--bin-window-ms",
        BIN_WINDOW,
      ]);
      expect(run.report.ok).toBe(false);
      expect(run.report.reason).toBe("install-failed");
      expect(run.report.phases.install?.ok).toBe(false);
      expect(run.report.phases.install?.exitCode).not.toBe(0);
      expect(run.report.message).toMatch(/the install exited/);
      expect(run.status).not.toBe(0);
    },
    CASE_TIMEOUT,
  );

  it(
    "refuses an install directory inside the repository working tree",
    () => {
      const inside = join(healthy, "consumer-inside-the-tree");
      const run = runGate([
        "--package-dir",
        healthy,
        "--consumer-dir",
        inside,
        "--bin-window-ms",
        BIN_WINDOW,
      ]);
      expect(run.report.ok).toBe(false);
      expect(run.report.reason).toBe("gate-consumer-dir-inside-package");
      expect(run.report.consumerDirOutsidePackageDir).toBe(false);
      expect(run.status).not.toBe(0);
    },
    CASE_TIMEOUT,
  );
});

describe("both declared bins are executed from the installed copy", () => {
  it(
    "runs a terminating command and a long-lived server, and records which is which",
    () => {
      const run = runGate(["--package-dir", healthy, "--bin-window-ms", BIN_WINDOW]);
      expect(run.report.ok).toBe(true);
      const results = run.report.phases.bins?.results ?? [];
      expect(results.map((r) => r.name).sort()).toEqual(["fixture-cli", "fixture-server"]);

      // Executed, not stat-ed: a command that terminates must have exited zero...
      const command = results.find((r) => r.name === "fixture-cli");
      expect(command?.outcome).toBe("exited-zero");
      expect(command?.exitCode).toBe(0);

      // ...and a stdio server that never exits on its own must still be serving at the end of the
      // window. "Does not run" cannot mean "did not terminate" for this shape.
      const server = results.find((r) => r.name === "fixture-server");
      expect(server?.outcome).toBe("still-running");
    },
    CASE_TIMEOUT,
  );

  it(
    "refuses a bin that exits non-zero on load, naming the bin and its first diagnostic line",
    () => {
      const run = runGate(["--package-dir", binCrashes, "--bin-window-ms", BIN_WINDOW]);
      expect(run.report.ok).toBe(false);
      expect(run.report.reason).toBe("bin-failed");
      expect(run.report.message).toContain("fixture-server");
      expect(run.report.message).toContain("the server failed to start");
      expect(run.status).not.toBe(0);
      // Distinct from a packaging defect and from an install failure: the install exited zero and
      // the file was there. It ran, and it failed.
      expect(run.report.phases.install?.exitCode).toBe(0);
    },
    CASE_TIMEOUT,
  );

  it(
    "refuses a manifest that declares no bin at all, rather than passing vacuously",
    () => {
      const run = runGate(["--package-dir", noBins, "--bin-window-ms", BIN_WINDOW]);
      expect(run.report.ok).toBe(false);
      expect(run.report.reason).toBe("gate-no-bins-declared");
      expect(run.status).not.toBe(0);
    },
    CASE_TIMEOUT,
  );
});

describe("a consumer-resolved local path is refused", () => {
  it(
    "reds the gate on a file: specifier in dependencies, naming the field and the specifier",
    () => {
      const run = runGate(["--package-dir", localPathDep, "--bin-window-ms", BIN_WINDOW]);
      expect(run.report.ok).toBe(false);
      expect(run.report.reason).toBe("local-path-specifier");
      expect(run.report.message).toContain("dependencies");
      expect(run.report.message).toContain("file:./vendor/vendored.tgz");
      expect(run.report.phases.manifest?.localPathSpecifiers).toEqual([
        {
          field: "dependencies",
          name: "gate-fixture-vendored",
          specifier: "file:./vendor/vendored.tgz",
          kind: "file: protocol",
        },
      ]);
      expect(run.status).not.toBe(0);
      // Refused BEFORE anything was packed or installed, which is what "rather than publish it"
      // requires: the refusal cannot depend on an install that would itself have failed.
      expect(run.report.phases.pack).toBeUndefined();
      expect(run.report.phases.install).toBeUndefined();
    },
    CASE_TIMEOUT,
  );

  // Every consumer-resolved field, and every shape a local path takes. The lint layer is offline,
  // so these are cheap enough to enumerate rather than sample.
  const shapes: Array<[string, string, string]> = [
    ["dependencies", "file:../vendored.tgz", "file: protocol"],
    ["dependencies", "link:../vendored", "link: protocol"],
    ["dependencies", "./vendored.tgz", "relative path"],
    ["dependencies", "../vendored.tgz", "relative path"],
    ["dependencies", "/opt/vendored.tgz", "absolute path"],
    ["optionalDependencies", "file:../vendored.tgz", "file: protocol"],
    ["optionalDependencies", "link:../vendored", "link: protocol"],
    ["peerDependencies", "file:../vendored.tgz", "file: protocol"],
    ["peerDependencies", "../vendored.tgz", "relative path"],
  ];
  for (const [field, specifier, kind] of shapes) {
    it(
      `reds the gate on ${specifier} in ${field}`,
      () => {
        const dir = writePkg(
          join(root, `shape-${field}-${Buffer.from(specifier).toString("hex")}`),
          {
            name: "gate-fixture-shape",
            version: "1.0.0",
            type: "module",
            bin: { "fixture-cli": "./bin/cli.mjs" },
            [field]: { "gate-fixture-vendored": specifier },
          },
          { "bin/cli.mjs": COMMAND_BIN },
        );
        const run = runGate(["--manifest-only", "--package-dir", dir]);
        expect(run.report.ok).toBe(false);
        expect(run.report.reason).toBe("local-path-specifier");
        expect(run.report.message).toContain(field);
        expect(run.report.message).toContain(specifier);
        expect(run.report.phases.manifest?.localPathSpecifiers[0]?.kind).toBe(kind);
        expect(run.status).not.toBe(0);
      },
      CASE_TIMEOUT,
    );
  }

  it(
    "does not red on a specifier a consumer's install resolves normally",
    () => {
      const dir = writePkg(
        join(root, "healthy-specifiers"),
        {
          name: "gate-fixture-healthyspec",
          version: "1.0.0",
          type: "module",
          bin: { "fixture-cli": "./bin/cli.mjs" },
          dependencies: { "gate-fixture-ranged": "^1.2.3" },
          optionalDependencies: { "gate-fixture-tagged": "latest" },
          peerDependencies: { "gate-fixture-aliased": "npm:gate-fixture-other@^1.0.0" },
        },
        { "bin/cli.mjs": COMMAND_BIN },
      );
      const run = runGate(["--manifest-only", "--package-dir", dir]);
      expect(run.report.ok).toBe(true);
      expect(run.report.phases.manifest?.localPathSpecifiers).toEqual([]);
      expect(run.status).toBe(0);
    },
    CASE_TIMEOUT,
  );
});

describe("a local path a consumer never installs is not a release blocker", () => {
  it(
    "passes on this repository's own unmodified manifest, having seen the file: devDependency",
    () => {
      const run = runGate(["--manifest-only", "--package-dir", REPO_ROOT]);
      expect(run.report.ok).toBe(true);
      expect(run.report.reason).toBeNull();
      expect(run.status).toBe(0);
      expect(run.report.packageName).toBe("@cosyte/cli");
      expect(run.report.phases.manifest?.localPathSpecifiers).toEqual([]);

      // NOT VACUOUS: the gate has to have LOOKED at the specifier it is passing over. This asserts
      // the report names it, so a gate that skipped devDependencies entirely would red here.
      const ignored = run.report.phases.manifest?.ignoredLocalPathSpecifiers ?? [];
      const fhir = ignored.find((e) => e.name === "@cosyte/fhir");
      expect(fhir?.field).toBe("devDependencies");
      expect(fhir?.specifier).toMatch(/^file:/);

      // And the manifest really does still carry it: the fixture for this criterion is the repo.
      const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
        devDependencies: Record<string, string>;
      };
      expect(manifest.devDependencies["@cosyte/fhir"]).toMatch(/^file:vendor\//);
    },
    CASE_TIMEOUT,
  );

  it(
    "passes a full run whose installed copy carries neither @cosyte/fhir nor @cosyte/transform",
    () => {
      const run = runGate(["--package-dir", healthy, "--bin-window-ms", BIN_WINDOW]);
      expect(run.report.ok).toBe(true);
      expect(run.report.installedPackages).not.toContain("@cosyte/fhir");
      expect(run.report.installedPackages).not.toContain("@cosyte/transform");
      // The command bin reached for both, found neither, said so value-free on stderr and exited
      // zero. A gate that read that diagnostic as a failure could never pass a real install here.
      const command = run.report.phases.bins?.results.find((r) => r.name === "fixture-cli");
      expect(command?.outcome).toBe("exited-zero");
      expect(command?.diagnostic).toContain("2 optional package(s) absent");
    },
    CASE_TIMEOUT,
  );
});

describe("a bin missing from the package is reported as a packaging defect", () => {
  it(
    "names the missing bin and distinguishes it from an install that exited non-zero",
    () => {
      const run = runGate(["--package-dir", binNotBuilt, "--bin-window-ms", BIN_WINDOW]);
      expect(run.report.ok).toBe(false);
      expect(run.report.reason).toBe("bin-missing");
      expect(run.report.message).toContain("packaging defect");
      expect(run.report.message).toContain("fixture-cli");
      expect(run.report.message).toContain("./dist/bin/cli.mjs");
      expect(run.status).not.toBe(0);

      // The distinction the criterion asks for, asserted rather than described: the install itself
      // exited zero, so this is what the tarball carries.
      expect(run.report.phases.install?.ok).toBe(true);
      expect(run.report.phases.install?.exitCode).toBe(0);
      expect(run.report.reason).not.toBe("install-failed");
      expect(run.report.reason).not.toBe("bin-failed");
    },
    CASE_TIMEOUT,
  );
});

describe("a gate that cannot reach a verdict fails closed", () => {
  it(
    "refuses when the install exceeds its time bound",
    () => {
      const run = runGate([
        "--package-dir",
        healthy,
        "--install-timeout-ms",
        "1",
        "--bin-window-ms",
        BIN_WINDOW,
      ]);
      expect(run.report.ok).toBe(false);
      expect(run.report.reason).toBe("gate-timeout");
      expect(run.report.message).toContain("did not finish inside 1ms");
      expect(run.status).not.toBe(0);
    },
    CASE_TIMEOUT,
  );

  it(
    "refuses when the registry does not answer, distinctly from an install that was refused",
    () => {
      // Port 9 is the discard port and nothing is listening on it here, so the connection is
      // refused immediately rather than hanging: a registry that does not answer, deterministically.
      const run = runGate(["--package-dir", registryDep, "--bin-window-ms", BIN_WINDOW], {
        npm_config_registry: "http://127.0.0.1:9",
        npm_config_fetch_retries: "0",
      });
      expect(run.report.ok).toBe(false);
      expect(run.report.reason).toBe("gate-registry-unreachable");
      expect(run.report.message).toContain("the registry did not answer");
      expect(run.report.reason).not.toBe("install-failed");
      expect(run.status).not.toBe(0);
    },
    CASE_TIMEOUT,
  );

  it(
    "refuses when the gate itself throws, naming the reason",
    () => {
      const run = runGate(["--package-dir", brokenManifest]);
      expect(run.report.ok).toBe(false);
      expect(run.report.reason).toBe("gate-error");
      expect(run.report.message).toContain("could not reach a verdict");
      expect(run.status).not.toBe(0);
    },
    CASE_TIMEOUT,
  );

  it(
    "refuses an argument it does not understand rather than running a narrower gate",
    () => {
      const run = runGate(["--not-an-option"]);
      expect(run.report.ok).toBe(false);
      expect(run.report.reason).toBe("gate-error");
      expect(run.status).not.toBe(0);
    },
    CASE_TIMEOUT,
  );

  it(
    "never reports a passing verdict from any of those conditions",
    () => {
      const failures = [
        runGate(["--package-dir", brokenManifest]),
        runGate(["--not-an-option"]),
        runGate([
          "--package-dir",
          healthy,
          "--install-timeout-ms",
          "1",
          "--bin-window-ms",
          BIN_WINDOW,
        ]),
      ];
      for (const run of failures) {
        expect(run.report.ok).toBe(false);
        expect(run.status).not.toBe(0);
      }
      // Each reason is distinguishable from the others: one string per failure class.
      const reasons = failures.map((f) => f.report.reason);
      expect(new Set(reasons).size).toBeGreaterThan(1);
    },
    CASE_TIMEOUT,
  );
});

// --- the release workflow's job graph ---------------------------------------------------------

interface WorkflowJob {
  name: string;
  body: string;
}

/**
 * Split a workflow's `jobs:` mapping into its top-level jobs and their raw blocks.
 *
 * Deliberately not a YAML parser: this reads ONE file, whose shape is two nested maps, and adding a
 * YAML dependency to assert a fact about a 70-line file would be a worse trade. It is written to
 * report NOTHING rather than something wrong when the shape changes, and every caller below asserts
 * on what it found first, so a reader that silently matched zero jobs cannot pass a test.
 */
function readJobs(yaml: string): WorkflowJob[] {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start < 0) return [];
  const jobs: WorkflowJob[] = [];
  let current: { name: string; lines: string[] } | null = null;
  const flush = (): void => {
    if (current !== null) jobs.push({ name: current.name, body: current.lines.join("\n") });
  };
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    // A non-indented, non-blank line is the next top-level key, so `jobs:` has ended.
    if (line.trim() !== "" && /^\S/.test(line)) break;
    const header = /^ {2}([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(line);
    if (header?.[1] !== undefined) {
      flush();
      current = { name: header[1], lines: [] };
      continue;
    }
    if (current !== null) current.lines.push(line);
  }
  flush();
  return jobs;
}

describe("the publishing job cannot run without the gate", () => {
  it("wires the gate ahead of the publish, with no path around it", () => {
    const yaml = readFileSync(RELEASE_WORKFLOW, "utf8");

    // The gate has to be on the workflow that publishes, and that workflow has to run on the
    // branch that publishes. Asserted first, so nothing below can pass over the wrong file.
    expect(yaml).toMatch(/^on:\s*$/m);
    expect(yaml).toMatch(/^ {2}push:\s*$/m);
    expect(yaml).toMatch(/^ {4}branches:\s*\[\s*main\s*\]/m);

    const jobs = readJobs(yaml);
    expect(jobs.length).toBeGreaterThanOrEqual(2);

    const publishing = jobs.filter((j) =>
      /uses:\s*cosyte\/\.github\/\.github\/workflows\/release\.yml@/.test(j.body),
    );
    expect(publishing).toHaveLength(1);
    const publish = publishing[0];
    expect(publish).toBeDefined();

    const gates = jobs.filter((j) => /release-install-gate\.mjs/.test(j.body));
    expect(gates).toHaveLength(1);
    const gate = gates[0];
    expect(gate).toBeDefined();
    if (publish === undefined || gate === undefined) return;
    expect(gate.name).not.toBe(publish.name);

    // The publish depends on the gate. This is the whole criterion.
    const needs = /^ {4}needs:\s*(.+)$/m.exec(publish.body);
    expect(needs?.[1]).toBeDefined();
    expect(needs?.[1]).toContain(gate.name);

    // ...and nothing lets it run anyway. A job whose `needs` failed or was skipped is skipped, and
    // the ONLY thing that overrides that is a condition, so neither job may carry one.
    expect(publish.body).not.toMatch(/^ {4}if:/m);
    expect(gate.body).not.toMatch(/^ {4}if:/m);
    expect(gate.body).not.toMatch(/continue-on-error:\s*true/);

    // The gate must build before it packs: `files` ships `dist`, and a tarball packed without it
    // carries no bin target at all.
    const buildAt = gate.body.indexOf("pnpm build");
    const gateAt = gate.body.indexOf("release-install-gate.mjs");
    expect(buildAt).toBeGreaterThan(-1);
    expect(buildAt).toBeLessThan(gateAt);

    // The caller's permission grants are load-bearing and this change must not have cost one:
    // dropping `actions: read` alone breaks the shared workflow at startup.
    for (const grant of [
      /^ {6}actions:\s*read/m,
      /^ {6}contents:\s*write/m,
      /^ {6}id-token:\s*write/m,
      /^ {6}pull-requests:\s*write/m,
    ]) {
      expect(publish.body).toMatch(grant);
    }
  });

  it("reads a job graph that really is there, and would not pass over a missing one", () => {
    // The negative control for the reader itself. Given a workflow whose publish does NOT depend on
    // the gate, the same assertions must fail, or the test above proves nothing.
    const unwired = [
      "on:",
      "  push:",
      "    branches: [main]",
      "",
      "jobs:",
      "  install-gate:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: node scripts/release-install-gate.mjs",
      "",
      "  release:",
      "    uses: cosyte/.github/.github/workflows/release.yml@main",
      "",
    ].join("\n");
    const jobs = readJobs(unwired);
    expect(jobs.map((j) => j.name)).toEqual(["install-gate", "release"]);
    const publish = jobs.find((j) => j.name === "release");
    expect(publish?.body).not.toMatch(/^ {4}needs:/m);

    // And a file with no `jobs:` mapping yields nothing rather than a confident answer.
    expect(readJobs("name: Release\non:\n  push:\n")).toEqual([]);
  });
});
