import { cosyteVitest } from "@cosyte/vitest-config";

/**
 * Vitest config for @cosyte/cli from the shared @cosyte/vitest-config standard.
 *
 * `@cosyte/cli` is a `bin` package organised as a command tree: `core` (dispatch, format
 * autodetection, exit codes, diagnostics, I/O) and `commands` (the command handlers). Both get the
 * per-directory >= 90 coverage gate on top of the global gate. The thin `bin/` process adapter is
 * coverage-excluded at the source (a `/* v8 ignore *​/` block). It is glue over the covered core.
 *
 * Coverage is gated at 100% for lines, branches, functions and statements across every file in
 * `src/` (barrels excepted, per the shared standard), enforced by `pnpm test:coverage`. A threshold
 * only rises: a line that truly cannot be reached carries an inline `v8 ignore` comment naming its
 * reason, never a lowered number here.
 */
export default cosyteVitest({
  coverageDirs: ["core", "commands"],
  coverageThresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
