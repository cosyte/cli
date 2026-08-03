#!/usr/bin/env node
/**
 * Sync the `VERSION` constant in `src/core/version.ts` with `package.json`'s `version`, and the
 * asserted literal in the `docs-content/installation.md` smoke test along with it.
 *
 * Why this exists: `VERSION` is a public export AND the value `cosyte --version` prints AND the
 * version the MCP server advertises in `SERVER_INFO`, but the bump is owned by Changesets, which
 * only rewrites `package.json`. Without this step the package publishes a `VERSION` that *lies*.
 * That is not hypothetical here: `@cosyte/cli@0.0.1` and `@cosyte/cli@0.0.2` are on the registry
 * today exporting `VERSION === "0.0.0"`, verified in the published tarball. The constant's own doc
 * comment already claimed it was "synced with `package.json#version` on release by the Changesets
 * `version` script" while no such step existed. The `version` script (which the shared release
 * workflow invokes as `pnpm run version`) runs `changeset version` and then this, so the bump and
 * the constant always land in the same "Version Packages" commit.
 *
 * The guard against drift is `test/sanity.test.ts`, which compares the export against `package.json`
 * at test time and separately pins the declaration's shape. Skipping this script makes that test go
 * red: deliberately.
 *
 * TWO targets, because a type-only smoke test asserts nothing. `docs-content/installation.md`'s
 * runnable block previously read `typeof VERSION; // => "string"`, which is true of every wrong
 * value and green-lit both bad releases. It now asserts the exact version, so the doc/code agreement
 * gate (`test/docs-content.test.ts`, which executes those blocks against the built `dist/`) is a real
 * check rather than a tautology. That only stays true if this script keeps both in step.
 *
 * Idempotent; exits non-zero if either declaration is missing or ambiguous: a rename must not
 * silently no-op, and a decoy declaration must not be rewritten ahead of the real one.
 */
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);

const { version } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
if (typeof version !== "string" || version.length === 0) {
  console.error("sync-version: package.json has no usable `version`");
  process.exit(1);
}

/**
 * One rewrite target: a file, the pattern locating its single version-bearing line, and a builder
 * producing the replacement. `hint` is what a human is told when the pattern stops matching.
 */
const targets = [
  {
    path: "src/core/version.ts",
    // Column-anchored, and the `: string` annotation is part of the match on purpose: it is the
    // shape test/sanity.test.ts pins, so the two cannot drift apart silently.
    pattern: /^export const VERSION: string = "[^"]*";$/gm,
    build: () => `export const VERSION: string = "${version}";`,
    hint: 'could not find `export const VERSION: string = "...";`',
  },
  {
    path: "docs-content/installation.md",
    // The asserted literal inside the runnable smoke-test block.
    pattern: /^VERSION; \/\/ => "[^"]*"$/gm,
    build: () => `VERSION; // => "${version}"`,
    hint: 'could not find the runnable assertion `VERSION; // => "..."`',
  },
];

let wrote = false;

for (const { path, pattern, build, hint } of targets) {
  const url = new URL(path, root);
  const source = readFileSync(url, "utf8");
  const matches = source.match(pattern);

  if (matches === null) {
    console.error(
      `sync-version: ${hint} in ${path}.\n` +
        "The declaration was renamed or reformatted: update this script alongside it.",
    );
    process.exit(1);
  }

  if (matches.length !== 1) {
    console.error(
      `sync-version: found ${matches.length} version declarations in ${path}; expected exactly one.\n` +
        "A column-0 decoy (e.g. in a comment) is ambiguous: remove it so the real one is unmistakable.",
    );
    process.exit(1);
  }

  // Pass a replacer *function*, not a replacement string: `String.prototype.replace` interprets
  // `$&`, `$1`, `` $` ``, etc. in a replacement string, so a version like `1.2.3-$&x` would inject
  // the matched text and corrupt the constant. A function's return value is inserted literally.
  const updated = source.replace(pattern, build);

  if (updated === source) {
    console.log(`sync-version: ${path} already ${version}`);
  } else {
    writeFileSync(url, updated);
    console.log(`sync-version: ${path} -> ${version}`);
    wrote = true;
  }
}

if (!wrote) console.log(`sync-version: nothing to do; everything already ${version}`);
