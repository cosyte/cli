/**
 * Shared by the examples (the runner skips a file whose name starts with `_`): find the built
 * `cosyte` executable through this package's own manifest, the way a consumer's
 * `node_modules/.bin/cosyte` points at it, and run it the way a shell would.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

// `@cosyte/cli/package.json` resolves through the package's own `exports`; its `bin` names the file.
const manifestPath = require.resolve("@cosyte/cli/package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { bin: { cosyte: string } };

/** The built `cosyte` executable this package declares. */
export const COSYTE = join(dirname(manifestPath), manifest.bin.cosyte);

/** What one `cosyte` invocation left behind: its exit code and its two output streams. */
export interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run `cosyte` with these arguments, feeding `input` on stdin when it is given. */
export function cosyte(args: readonly string[], input = ""): Run {
  const run = spawnSync(process.execPath, [COSYTE, ...args], { encoding: "utf8", input });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** The path of one of this repository's committed synthetic test fixtures. */
export function fixture(name: string): string {
  return fileURLToPath(new URL(`../test/__fixtures__/${name}`, import.meta.url));
}
