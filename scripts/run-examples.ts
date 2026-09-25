/**
 * Runs every example under `examples/` against the BUILT package and exits non-zero if any fails.
 *
 * Each `examples/*.ts` file (depth 1; a name starting with `_` is a shared helper and is skipped)
 * runs the built `cosyte` executable, which it finds through `@cosyte/cli/package.json` resolved
 * by the package's own `exports`, the file a consumer's `node_modules/.bin/cosyte` points at. So
 * the examples exercise what a consumer installs, and `pnpm build` has to run first.
 *
 * Each example asserts its own key output and exits non-zero on a mismatch. This runner also
 * requires the `<name>: ok` line each one prints last, so an example that stopped early without an
 * error still fails, and it refuses to pass when it found nothing to run, because a runner that ran
 * nothing proves nothing.
 *
 * File names are passed to `spawnSync` as argv, never through a shell.
 *
 *     pnpm build && pnpm examples
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES_DIR = join(REPO_ROOT, "examples");
/** What `bin.cosyte` in package.json points at. */
const BUILT_BIN = join(REPO_ROOT, "dist", "bin", "cosyte.mjs");

if (!existsSync(BUILT_BIN)) {
  console.error("dist/bin/cosyte.mjs is missing: run `pnpm build` before `pnpm examples`.");
  process.exit(1);
}

const examples = readdirSync(EXAMPLES_DIR, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith(".ts") && !d.name.startsWith("_"))
  .map((d) => d.name)
  .sort();

if (examples.length === 0) {
  console.error("No examples found under examples/: refusing to report a pass.");
  process.exit(1);
}

let failed = 0;
for (const file of examples) {
  const marker = `${basename(file, ".ts")}: ok`;
  const run = spawnSync(process.execPath, ["--import", "tsx", join("examples", file)], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const markerSeen = run.stdout.split("\n").includes(marker);
  if (run.status === 0 && markerSeen) {
    console.log(`ok    ${file}`);
    continue;
  }
  failed += 1;
  console.error(
    `FAIL  ${file} (exit ${String(run.status ?? run.signal)}, "${marker}" printed: ${String(markerSeen)})`,
  );
  console.error(run.stdout);
  console.error(run.stderr);
}

console.log(`${String(examples.length - failed)} of ${String(examples.length)} examples passed`);
process.exit(failed === 0 ? 0 : 1);
