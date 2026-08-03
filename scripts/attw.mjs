#!/usr/bin/env node
/**
 * scripts/attw.mjs: the `attw` publish gate, made to report its own failure.
 *
 * WHY THIS WRAPPER EXISTS. `attw` PRINTS "This package does not contain types."
 * AND EXITS 0. That is not a bug in `attw`: an untyped package is a legitimate npm
 * package, so the CLI treats "no types at all" as a description, not a problem.
 * From `@arethetypeswrong/cli@0.18.4` (the version pinned in this repo's
 * devDependencies), `node_modules/@arethetypeswrong/cli/dist/getExitCode.js`,
 * first statement:
 *
 *     export function getExitCode(analysis, opts) {
 *         if (!analysis.types) {
 *             return 0;
 *         }
 *
 * The problem list is consulted only after that early return, so no `--profile`,
 * `--ignore-rules` or config setting can reach it. For a package that ships types,
 * "does not contain types" does not mean "fine, untyped": it means THE TYPES WERE
 * NOT IN THE TARBALL, which is a broken publish. The gate says nothing, and its
 * caller reads the 0. A false red costs an hour; A FALSE GREEN MERGES.
 *
 * MEASURED IN THIS REPOSITORY, NOT INHERITED FROM THE SIBLING THIS WAS PORTED
 * FROM. Both runs used this package's real invocation (`--pack . --profile
 * node16`), on a quiet box, with no concurrency of any kind:
 *
 *     rm -rf dist && ./node_modules/.bin/attw --pack . --profile node16
 *         -> "This package does not contain types."   exit 0
 *     pnpm build, then delete ALL TEN emitted .d.ts/.d.cts files
 *         -> "This package does not contain types."   exit 0
 *
 * THE RACE ONLY SUPPLIES THE CONDITION; IT IS NOT THE DEFECT. The second run above
 * is the realistic one, because `tsup` emits JS in one pass and the declarations in
 * a later pass. Instrumented on one build of this package, polling at 10ms: all
 * eight emitted `.mjs`/`.cjs` files appeared on a single poll at 4.92s and all ten
 * declarations on a single later poll at 11.82s, leaving a 6.90s interval in which
 * `dist/` holds JS and no declarations at all. Treat the interval as one machine's
 * measurement rather than a constant; it moves with load (a run on a busier box
 * read 7.85s). What does not move is the ordering, and that all ten declarations
 * land together. A concurrent build or `pnpm clean` in the same working tree lands
 * `attw` inside that interval. Which is why this is not answered with a lock, a
 * lease or a build queue: the gate is supposed to be able to tell you its own
 * inputs were missing, whatever removed them.
 *
 * WHICH SILENCE YOU GET DEPENDS ON THE PACKED-BUT-UNDECLARED DECLARATIONS, AND THIS
 * PACKAGE HAS SIX. `files: ["dist"]` packs every declaration `tsup` emits, while
 * `package.json` names only four of them (`dist/index.d.ts`, `dist/index.d.cts`,
 * `dist/mcp.d.ts`, `dist/mcp.d.cts`). The other six ride along unnamed: the shared
 * chunk `dist/io-<hash>.d.ts` / `.d.cts`, and the four `dist/bin/*.d.ts` / `.d.cts`.
 * `analysis.types` is true if the tarball carries ANY declaration, so any ONE of
 * those six is enough to keep `attw` off the untyped branch. Measured on this tree,
 * JS intact, deleting the four declared declarations and then widening:
 *
 *     the four declared gone; io-* and bin/* still packed  -> "No types",  exit 1
 *     ...and io-* gone too; bin/* still packed             -> "No types",  exit 1
 *     ...and bin/* gone too; io-* still packed             -> "No types",  exit 1
 *     all ten gone                                         -> UNTYPED,     exit 0
 *
 * So a PARTIAL declaration loss is caught by `attw` itself, and only a TOTAL one is
 * the false green. The build window above is the total one, which is why it is the
 * case that matters. Neither verdict names WHICH promised file is gone, and that is
 * the preflight's job: it is why the preflight's message reports both outcomes
 * instead of promising the exit 0.
 *
 * `--profile node16` IS DELIBERATE HERE AND IS FORWARDED, NEVER REINTERPRETED.
 * Measured on a fully built tree: with the flag, all three subpaths are green and
 * `attw` exits 0; without it, `@cosyte/cli/mcp` reports "Resolution failed" under
 * `node10` and `attw` exits 1. This script passes every argument it is given
 * straight through, so the profile keeps meaning exactly what it meant before.
 *
 * TWO NETS, and they catch different things. Keep both:
 *
 *   1. PREFLIGHT (structural, no string matching). Every relative artifact path
 *      `package.json` promises must exist and be non-empty before `attw` runs:
 *      `main`, `module`, `types`, `typings`, every string leaf of `exports`, and
 *      every target of `bin`. This is the net that catches the window above, and it
 *      names the missing file instead of leaving the reader to infer it.
 *
 *      THE `bin` HALF IS THIS PACKAGE'S ADDITION, AND IT IS MEASURED RATHER THAN
 *      ASSUMED. `bin` is outside the resolution surface `attw` analyses. With
 *      `dist/bin/cosyte.mjs` deleted and everything else built, `attw --pack .
 *      --profile node16` printed every subpath green and exited 0, over a tarball
 *      missing the `cosyte` executable, which is what this package is for. The
 *      sibling this was ported from ships no `bin` and so had nothing to check.
 *
 *   2. POST-CHECK. If `attw` still reports an untyped package, fail. The preflight
 *      cannot see this case: the declaration files can be present on disk and still
 *      be absent from the tarball, because `files` (or an `.npmignore`) left them
 *      out. No instance of that is on record in this repo. It is the case
 *      `attw --pack` exists to catch, and the whole point here is that it catches
 *      it silently.
 *
 * BLINDING. The post-check matches `attw`'s untyped sentence, which is a plain,
 * un-chalked string in `dist/render/untyped.js`. That makes it blindable, so the
 * arguments and config that would blind it are REFUSED rather than tolerated. Each
 * route below was measured here, against an untyped pack, with `--profile node16`
 * in place: `--quiet`, `-q`, `--format json`, `-f json`, and a `.attw.json` setting
 * `quiet` or `format` (which `readConfig()` applies after argv) each removed the
 * sentence from the output and still exited 0. `--config-path` pointing at a file
 * that sets `quiet` did the same, and additionally moves the config file out of
 * this script's own view, so it is refused on a measurement here rather than on the
 * inference the sibling recorded.
 *
 * The refusal is by option name and not by value, so `--format table-flipped` still
 * prints the sentence, blinds nothing, and is refused anyway. That is the
 * deliberate trade: value-parsing these would be a third moving part in the guard.
 *
 * DISCLOSED LIMIT, MEASURED HERE, AND DELIBERATELY NOT CLOSED. The match is on an
 * EXACT ARGV TOKEN (or the part before an `=`), which does not see commander's
 * attached and clustered short forms. Measured against an untyped pack: `-fjson`
 * and `-Pf json` both reach `attw` and hand back exit 0 with the sentence gone.
 * `-qP` does not get through, because the empty-transcript net below catches it.
 * This is written down as a hole rather than papered over, and it is not grown into
 * a short-option parser because the invocation this replaced exited 0 on that same
 * pack with NO arguments at all, so the gate is strictly better off either way, and
 * nobody passes these to a repo's own publish gate.
 *
 * A SECOND DISCLOSED LIMIT, inherited from the script this was ported from: the
 * preflight only considers declared paths that start with `.`. npm accepts
 * `main: "dist/index.js"`, and a path in that form is skipped rather than checked.
 * Inert on this manifest, where every declared path is `./`-prefixed. Recorded, not
 * fixed.
 *
 * WHAT THE VENDORED `file:` DEPENDENCIES DO TO THIS GATE: nothing, and that was
 * checked rather than assumed. This package's manifest carries `file:vendor/*.tgz`
 * specifiers for its `@cosyte/*` siblings. `npm pack --dry-run` on a clean build of
 * this tree lists 30 entries and zero of them come from `vendor/`, because `files`
 * is `dist`/`README.md`/`LICENSE`/`CHANGELOG.md`. So the vendored tarballs are not
 * part of what `--pack .` analyses, and none of this package's emitted declarations
 * carries a `@cosyte/*` module specifier. The published manifest being uninstallable
 * is a real and separate condition; it does not change this gate's inputs or its
 * verdict, and this script does not try to address it.
 *
 * `test/scripts/attw-gate.test.ts` pins both nets against the real binary,
 * including the upstream exit-0 itself, so an `attw` upgrade that reworks the
 * wording or fixes the exit code reds the suite rather than letting the net go
 * quietly slack.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ATTW_BIN = fileURLToPath(new URL("../node_modules/.bin/attw", import.meta.url));
const UNTYPED = "This package does not contain types.";
const DECLARATION = /\.d\.[cm]?ts$/;
const args = process.argv.slice(2);

const die = (msg) => {
  process.stderr.write(`\n[x] attw gate: ${msg}\n`);
  process.exit(1);
};

// ---- Refuse what would blind the post-check --------------------------------
const BLINDING = new Set(["-q", "--quiet", "-f", "--format", "--config-path"]);
const blinding = args.filter((a) => BLINDING.has(a.split("=")[0]));
if (blinding.length > 0) {
  die(
    `${blinding.join(", ")} is refused by option name and not by value, matching the\n` +
      `  exact argv token. This gate reads attw's printed output, attw exits 0 on an\n` +
      `  untyped package, and some values of these options hide that output. Run it\n` +
      `  without them.`,
  );
}
try {
  const config = JSON.parse(readFileSync(".attw.json", "utf8"));
  const set = ["quiet", "format"].filter((k) => k in config);
  if (set.length > 0) {
    die(
      `.attw.json sets ${set.join(", ")}. These keys are refused wholesale, by name and\n` +
        `  not by value: readConfig() applies them after argv, this gate reads attw's\n` +
        `  printed output, and attw exits 0 on an untyped package.`,
    );
  }
} catch {
  // No .attw.json, or unreadable/invalid. attw itself reports the latter.
}

/** Every relative path `package.json` promises to ship, deduped. */
function declaredArtifacts(pkg) {
  const found = new Set();
  const add = (v) => {
    if (typeof v !== "string") return;
    // Skip wildcard subpath patterns (they name a set, not a file) and the
    // manifest itself, which is always in the tarball by definition.
    if (!v.startsWith(".") || v.includes("*") || v === "./package.json") return;
    found.add(v);
  };
  for (const key of ["main", "module", "types", "typings"]) add(pkg[key]);
  const walk = (node) => {
    if (typeof node === "string") add(node);
    else if (node && typeof node === "object") for (const v of Object.values(node)) walk(v);
  };
  walk(pkg.exports);
  // `bin` is a flat map of command name to path, or a bare string. attw never
  // looks at it; for a bin package it is the primary promise.
  walk(pkg.bin);
  return [...found];
}

let pkg;
try {
  pkg = JSON.parse(readFileSync("package.json", "utf8"));
} catch (err) {
  die(`cannot read ./package.json from ${process.cwd()}: ${err.message}`);
}

// ---- Net 1: preflight -------------------------------------------------------
const broken = [];
for (const rel of declaredArtifacts(pkg)) {
  let size;
  try {
    size = statSync(rel).size;
  } catch {
    broken.push({ rel, why: "missing" });
    continue;
  }
  if (size === 0) broken.push({ rel, why: "empty" });
}
if (broken.length > 0) {
  // Say only what was measured. With the declarations intact, attw exits 0 and
  // prints no untyped sentence: deleting `dist/index.mjs` leaves every subpath
  // green here, and so does deleting `dist/bin/cosyte.mjs`. With declarations
  // among the casualties attw's verdict depends on whether ANY declaration
  // survives in the tarball, declared or not, so do not promise the exit 0. See
  // the packed-but-undeclared note in this file's header.
  const declarationsHit = broken.some(({ rel }) => DECLARATION.test(rel));
  die(
    `package.json promises files the build has not produced:\n` +
      broken.map(({ rel, why }) => `    ${rel} (${why})\n`).join("") +
      `\n  Run the build first. If you DID build, something removed or truncated the\n` +
      `  output underneath this run: a concurrent build or \`clean\` in the same working\n` +
      `  tree will do it, and \`tsup\` writes JS before declarations, so there is a\n` +
      `  window in every build where the .d.ts files do not exist yet.\n` +
      (declarationsHit
        ? `  A declaration is among them, and attw's own verdict on such a tree depends on\n` +
          `  whether ANY declaration is still in the tarball, declared here or not: with\n` +
          `  some left it reports "No types" problems, and with none at all it prints\n` +
          `  "${UNTYPED}" and EXITS 0.\n` +
          `  Neither one names the missing file.\n`
        : `  attw does not gate these: it analyses types, and exits 0 here.\n`),
  );
}

// ---- Run attw ---------------------------------------------------------------
const res = spawnSync(ATTW_BIN, ["--pack", ".", ...args], {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "pipe"],
});
if (res.error) die(`could not run ${ATTW_BIN}: ${res.error.message}`);
const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
process.stdout.write(res.stdout ?? "");
process.stderr.write(res.stderr ?? "");
if (res.status !== 0) process.exit(res.status ?? 1);

// ---- Net 2: post-check ------------------------------------------------------
// An empty transcript means the post-check read nothing, by some route not listed
// under BLINDING above. Treat that as a failure rather than as a pass: this gate is
// only as good as the output it got to see.
if (output.trim() === "") {
  die(`attw exited 0 but printed nothing, so nothing was checked.`);
}
if (output.includes(UNTYPED)) {
  die(
    `attw reported "${UNTYPED}" and exited 0.\n` +
      `  This package ships types, so that means the tarball did not carry them:\n` +
      `  check the "files" field and .npmignore. Reported as a failure here because\n` +
      `  attw's own exit code cannot: getExitCode() returns 0 whenever the analysis\n` +
      `  found no types at all, before it ever looks at the problem list.`,
  );
}
