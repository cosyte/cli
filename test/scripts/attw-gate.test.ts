/**
 * Tests for scripts/attw.mjs: the wrapper that makes the `attw` publish gate
 * report its own failure.
 *
 * WHAT THESE PIN, AND WHY EACH ONE IS HERE:
 *
 *  1. THE UPSTREAM BEHAVIOUR THE WRAPPER EXISTS FOR. `attw` prints "This package
 *     does not contain types." and exits 0. If a future `attw` upgrade fixes that
 *     exit code or rewords the sentence, this test reds, which is the point. A
 *     guard that silently stops matching is worse than no guard, and this is the
 *     one net in `attw.mjs` that depends on a string.
 *  2. That the wrapper turns that exit 0 into a failure.
 *  3. That the preflight catches a declared-but-missing artifact, which is the
 *     shape the false green actually takes here (a `dist/` removed, or not yet
 *     written, underneath the gate).
 *  4. THE `bin` HALF OF THE PREFLIGHT, which is this package's addition over the
 *     script it was ported from. A missing executable is invisible to `attw`: it
 *     is not part of the resolution surface, so `attw` reports every subpath green
 *     and exits 0 over a tarball with no working command in it. The fixture proves
 *     both halves: bare `attw` green, wrapper red naming the file.
 *  5. A NEGATIVE CONTROL. On a package whose tarball really does carry types, the
 *     wrapper is transparent: same exit status as `attw` itself, and green. A gate
 *     that only ever fails is not a gate, and a false red here would cost every
 *     later run an hour.
 *  6. THE GATE'S MOST BASIC OBLIGATION: that a real `attw` failure still fails.
 *     Without this, every other test here would pass on a wrapper that swallowed
 *     attw's own exit status, because net 2 reds the untyped fixture regardless.
 *  7. That `--profile node16`, which this package's `attw` script passes and which
 *     is load-bearing for the `./mcp` subpath, survives the wrapper unchanged.
 *  8. The refusals that keep net 2 readable. Each of these argument and config
 *     routes was measured to make the untyped sentence unreadable and hand back
 *     exit 0: the exact false green this file exists to close.
 *
 * The fixtures are minimal throwaway packages in a temp dir, nothing about this
 * repo's own build, so the suite does not need one and cannot race one. `attw` is
 * invoked with `--no-definitely-typed` so the runs stay offline; the wrapper
 * forwards arguments, which is what makes that possible.
 *
 * SECURITY: every subprocess call uses spawnSync with array args. No exec, no
 * shell-form.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const WRAPPER = join(REPO_ROOT, "scripts", "attw.mjs");
const ATTW_BIN = join(REPO_ROOT, "node_modules", ".bin", "attw");
const UNTYPED = "This package does not contain types.";
const OFFLINE = ["--no-definitely-typed"];
// Each case shells out to `attw --pack`, which runs a real `npm pack`; two of those
// in one test comfortably exceeds this suite's 10s default.
const SPAWN_TIMEOUT = 60_000;

interface RunResult {
  code: number;
  out: string;
}

function run(bin: string, args: string[], cwd: string): RunResult {
  const r = spawnSync(bin, args, { cwd, encoding: "utf8", shell: false, timeout: 120_000 });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const runAttw = (cwd: string, args: string[] = OFFLINE): RunResult =>
  run(ATTW_BIN, ["--pack", ".", ...args], cwd);
const runWrapper = (cwd: string, args: string[] = OFFLINE): RunResult =>
  run(process.execPath, [WRAPPER, ...args], cwd);

let root: string;

/** A package whose declaration file exists on disk but is left out of `files`. */
let typesNotPacked: string;
/** A package whose `package.json` points at a `dist/` that was never built. */
let noBuild: string;
/** A well-formed dual ESM/CJS package: the negative control. */
let wellFormed: string;
/** A package with a real attw problem: `require` resolves to ESM. */
let attwFails: string;
/** Declarations present, JS entry point missing: attw itself is green on this. */
let jsMissing: string;
/** Types and JS all present, the declared `bin` target absent: attw is green too. */
let binMissing: string;
/** A dual package whose `./mcp`-shaped subpath fails only under node10. */
let node10Only: string;
/** Declared declarations gone, an undeclared tsup-style shared chunk still packed. */
let strayChunk: string;
/** The same package with no declaration file left in the tarball at all. */
let noDeclarations: string;

function writePkg(dir: string, pkg: Record<string, unknown>, files: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "attw-gate-"));

  typesNotPacked = join(root, "types-not-packed");
  writePkg(
    typesNotPacked,
    {
      name: "attw-gate-fixture-unpacked",
      version: "1.0.0",
      main: "./index.js",
      types: "./index.d.ts",
      files: ["index.js"],
    },
    { "index.js": "module.exports = {};\n", "index.d.ts": "export declare const a: number;\n" },
  );

  noBuild = join(root, "no-build");
  writePkg(
    noBuild,
    {
      name: "attw-gate-fixture-nobuild",
      version: "1.0.0",
      type: "module",
      exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
      files: ["dist"],
    },
    {},
  );

  wellFormed = join(root, "well-formed");
  writePkg(
    wellFormed,
    {
      name: "attw-gate-fixture-wellformed",
      version: "1.0.0",
      type: "module",
      exports: {
        ".": {
          import: { types: "./index.d.ts", default: "./index.js" },
          require: { types: "./index.d.cts", default: "./index.cjs" },
        },
      },
      files: ["index.js", "index.d.ts", "index.cjs", "index.d.cts"],
    },
    {
      "index.js": "export const a = 1;\n",
      "index.d.ts": "export declare const a: number;\n",
      "index.cjs": "module.exports.a = 1;\n",
      "index.d.cts": "export declare const a: number;\n",
    },
  );

  // ESM-only, with no `require` condition: attw's strict profile reports
  // CJSResolvesToESM and exits non-zero of its own accord.
  attwFails = join(root, "attw-fails");
  writePkg(
    attwFails,
    {
      name: "attw-gate-fixture-problem",
      version: "1.0.0",
      type: "module",
      exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
      files: ["index.js", "index.d.ts"],
    },
    { "index.js": "export const a = 1;\n", "index.d.ts": "export declare const a: number;\n" },
  );

  jsMissing = join(root, "js-missing");
  writePkg(
    jsMissing,
    {
      name: "attw-gate-fixture-jsmissing",
      version: "1.0.0",
      main: "./dist/index.js",
      types: "./index.d.ts",
      files: ["index.d.ts"],
    },
    { "index.d.ts": "export declare const a: number;\n" },
  );

  // The shape of this package: a `bin` package whose executable is emitted by the
  // same build as its declarations, and which `attw` never looks at.
  binMissing = join(root, "bin-missing");
  writePkg(
    binMissing,
    {
      name: "attw-gate-fixture-binmissing",
      version: "1.0.0",
      type: "module",
      bin: { "fixture-cmd": "./dist/bin/fixture.mjs" },
      exports: {
        ".": {
          import: { types: "./index.d.ts", default: "./index.js" },
          require: { types: "./index.d.cts", default: "./index.cjs" },
        },
      },
      files: ["index.js", "index.d.ts", "index.cjs", "index.d.cts", "dist"],
    },
    {
      "index.js": "export const a = 1;\n",
      "index.d.ts": "export declare const a: number;\n",
      "index.cjs": "module.exports.a = 1;\n",
      "index.d.cts": "export declare const a: number;\n",
    },
  );

  // `files: ["dist"]` packs every declaration `tsup` emits, and `package.json` names
  // only four of this package's ten: the shared `dist/io-<hash>.d.ts`/`.d.cts` and
  // the four `dist/bin/*.d.ts`/`.d.cts` ride along unnamed. `analysis.types` is true
  // if the tarball carries ANY declaration, so any one of those six keeps attw off
  // the untyped branch. These two fixtures are a declared declaration lost with one
  // undeclared survivor, and the same tree with none.
  const chunkPkg = {
    version: "1.0.0",
    type: "module",
    exports: {
      ".": {
        import: { types: "./dist/index.d.ts", default: "./dist/index.mjs" },
        require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" },
      },
    },
    files: ["dist"],
  };
  const chunkJs = {
    "dist/index.mjs": "export const a = 1;\n",
    "dist/index.cjs": "module.exports.a = 1;\n",
  };

  strayChunk = join(root, "stray-chunk");
  mkdirSync(join(strayChunk, "dist"), { recursive: true });
  writePkg(
    strayChunk,
    { name: "attw-gate-fixture-straychunk", ...chunkPkg },
    {
      ...chunkJs,
      "dist/io-abc123.d.ts": "export declare const shared: number;\n",
      "dist/io-abc123.d.cts": "export declare const shared: number;\n",
    },
  );

  noDeclarations = join(root, "no-declarations");
  mkdirSync(join(noDeclarations, "dist"), { recursive: true });
  writePkg(noDeclarations, { name: "attw-gate-fixture-nodecl", ...chunkPkg }, chunkJs);

  // The same shape as this package: a `dist/`-rooted dual build with a second
  // subpath that resolves under node16 and fails under node10, which is exactly why
  // this package's attw script carries `--profile node16`. Measured on this
  // fixture: exit 1 without the flag, exit 0 with it.
  node10Only = join(root, "node10-only");
  mkdirSync(join(node10Only, "dist"), { recursive: true });
  writePkg(
    node10Only,
    {
      name: "attw-gate-fixture-node10only",
      version: "1.0.0",
      type: "module",
      main: "./dist/index.cjs",
      module: "./dist/index.mjs",
      types: "./dist/index.d.ts",
      exports: {
        ".": {
          import: { types: "./dist/index.d.ts", default: "./dist/index.mjs" },
          require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" },
        },
        "./sub": {
          import: { types: "./dist/sub.d.ts", default: "./dist/sub.mjs" },
          require: { types: "./dist/sub.d.cts", default: "./dist/sub.cjs" },
        },
      },
      files: ["dist"],
    },
    {
      "dist/index.mjs": "export const a = 1;\n",
      "dist/index.d.ts": "export declare const a: number;\n",
      "dist/index.cjs": "module.exports.a = 1;\n",
      "dist/index.d.cts": "export declare const a: number;\n",
      "dist/sub.mjs": "export const b = 1;\n",
      "dist/sub.d.ts": "export declare const b: number;\n",
      "dist/sub.cjs": "module.exports.b = 1;\n",
      "dist/sub.d.cts": "export declare const b: number;\n",
    },
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("attw's own exit code (the reason this wrapper exists)", () => {
  it(
    "reports an untyped pack and still exits 0",
    () => {
      const r = runAttw(typesNotPacked);
      expect(r.out).toContain(UNTYPED);
      // If this ever fails because the status is now non-zero, attw has fixed the
      // early return in getExitCode() and net 2 of scripts/attw.mjs is redundant.
      // Read that file's header before deleting anything.
      expect(r.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "keeps that exit 0 under this package's own --profile node16 invocation",
    () => {
      // The false green is not an artefact of a lenient flag set. It survives the
      // exact arguments package.json passes.
      const r = runAttw(typesNotPacked, [...OFFLINE, "--profile", "node16"]);
      expect(r.out).toContain(UNTYPED);
      expect(r.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );
});

describe("scripts/attw.mjs", () => {
  it(
    "fails when the tarball carries no types, where attw exits 0",
    () => {
      const r = runWrapper(typesNotPacked);
      expect(r.out).toContain(UNTYPED);
      expect(r.code).not.toBe(0);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "fails on the untyped pack under --profile node16 too",
    () => {
      const r = runWrapper(typesNotPacked, [...OFFLINE, "--profile", "node16"]);
      expect(r.out).toContain(UNTYPED);
      expect(r.code).not.toBe(0);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "fails, naming the file, when a declared artifact was never built",
    () => {
      const r = runWrapper(noBuild);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./dist/index.d.ts");
      expect(r.out).toContain("missing");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "fails, naming the file, when the declared bin target is absent and attw is green",
    () => {
      // attw never reads `bin`, so this tarball passes its analysis while carrying
      // no executable at all. That is the whole reason the preflight walks `bin`.
      const bare = runAttw(binMissing);
      expect(bare.out).not.toContain(UNTYPED);
      expect(bare.code).toBe(0);

      const r = runWrapper(binMissing);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./dist/bin/fixture.mjs");
      expect(r.out).toContain("missing");
      expect(r.out).not.toContain(UNTYPED);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "does not claim attw would have said 'untyped' when only JS is missing",
    () => {
      // Measured: with the declarations intact, bare attw reports no problems and
      // exits 0 on this fixture. The preflight still reds it, but must not tell the
      // reader something about attw's behaviour that is false for this case.
      const bare = runAttw(jsMissing);
      expect(bare.out).toContain("No problems found");
      expect(bare.code).toBe(0);
      const r = runWrapper(jsMissing);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./dist/index.js");
      expect(r.out).not.toContain(UNTYPED);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "still fails when attw itself fails, with attw's own status",
    () => {
      const bare = runAttw(attwFails);
      expect(bare.code).not.toBe(0);
      expect(bare.out).not.toContain(UNTYPED);
      const wrapped = runWrapper(attwFails);
      expect(wrapped.code).toBe(bare.code);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "is transparent on a package that really does ship types",
    () => {
      const bare = runAttw(wellFormed);
      const wrapped = runWrapper(wellFormed);
      expect(bare.out).not.toContain(UNTYPED);
      expect(wrapped.code).toBe(bare.code);
      expect(wrapped.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "forwards --profile node16 rather than reinterpreting it",
    () => {
      // This package's `./mcp` subpath fails node10 resolution and passes node16,
      // so the profile decides the verdict. The wrapper must not change it in
      // either direction: red without the flag, green with it, both times matching
      // what bare attw does on the same tree.
      const bareStrict = runAttw(node10Only);
      const wrappedStrict = runWrapper(node10Only);
      expect(bareStrict.code).not.toBe(0);
      expect(wrappedStrict.code).toBe(bareStrict.code);

      const profiled = [...OFFLINE, "--profile", "node16"];
      const bareProfiled = runAttw(node10Only, profiled);
      const wrappedProfiled = runWrapper(node10Only, profiled);
      expect(bareProfiled.code).toBe(0);
      expect(wrappedProfiled.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );
});

describe("the preflight message does not over-claim what attw would have said", () => {
  // This is the claim the wrapper is most tempted to get wrong, and a single
  // sentence is false for one of these two trees whichever one you pick. Both are
  // measured, and this package really does pack six undeclared declarations that
  // put a real build on either side of the line.
  it(
    "attw itself reds when an undeclared declaration survives, and greens when none does",
    () => {
      const withChunk = runAttw(strayChunk);
      expect(withChunk.out).not.toContain(UNTYPED);
      expect(withChunk.code).not.toBe(0);

      const withNone = runAttw(noDeclarations);
      expect(withNone.out).toContain(UNTYPED);
      expect(withNone.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "names the missing declaration on both trees without promising either verdict",
    () => {
      for (const dir of [strayChunk, noDeclarations]) {
        const r = runWrapper(dir);
        expect(r.code).not.toBe(0);
        expect(r.out).toContain("./dist/index.d.ts");
        expect(r.out).toContain("./dist/index.d.cts");
        // The false-green sentence may be quoted as one of two outcomes, but the
        // message must never assert that this tree produced it.
        expect(r.out).not.toContain(`would have reported "${UNTYPED}"`);
        expect(r.out).toContain("depends on");
        expect(r.out).toContain("Neither one names the missing file");
      }
    },
    SPAWN_TIMEOUT,
  );
});

describe("the refusals that keep the post-check readable", () => {
  // Each of these was measured to make bare attw exit 0 with the untyped sentence
  // unreadable, on the very fixture whose tarball carries no types.
  it.each([
    ["--quiet", ["--quiet"]],
    ["-q", ["-q"]],
    ["--format json", ["--format", "json"]],
    ["-f json", ["-f", "json"]],
    ["--format=json", ["--format=json"]],
    ["--config-path", ["--config-path", "other.json"]],
  ])("refuses %s", (_name, extra) => {
    const r = runWrapper(typesNotPacked, [...OFFLINE, ...extra]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("attw gate");
    expect(r.out).not.toContain(UNTYPED);
  });

  it(
    "catches a clustered short flag it did not recognise, via the empty-transcript net",
    () => {
      // The refusal matches an exact argv token, so commander's clustered form gets
      // past it. `-qP` still reds, because the wrapper treats an empty transcript as
      // a failure rather than a pass. Measured limit of that backstop, stated in the
      // script header: `-fjson` and `-Pf json` produce output and do get through.
      const r = runWrapper(typesNotPacked, [...OFFLINE, "-qP"]);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("printed nothing");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "refuses a .attw.json that sets quiet or format",
    () => {
      const dir = join(root, "config-blinded");
      writePkg(
        dir,
        {
          name: "attw-gate-fixture-configblind",
          version: "1.0.0",
          main: "./index.js",
          types: "./index.d.ts",
          files: ["index.js"],
        },
        {
          "index.js": "module.exports = {};\n",
          "index.d.ts": "export declare const a: number;\n",
          ".attw.json": JSON.stringify({ quiet: true }),
        },
      );
      // Bare attw takes the config and goes silent: exit 0 over an untyped pack.
      const bare = runAttw(dir);
      expect(bare.code).toBe(0);
      expect(bare.out).not.toContain(UNTYPED);

      const r = runWrapper(dir);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain(".attw.json");
    },
    SPAWN_TIMEOUT,
  );
});
