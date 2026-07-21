import { cosyteVitest } from "@cosyte/vitest-config";

/**
 * Vitest config for @cosyte/cli from the shared @cosyte/vitest-config standard.
 *
 * `@cosyte/cli` is a `bin` package organised as a command tree: `core` (dispatch, format
 * autodetection, exit codes, diagnostics, I/O) and `commands` (the command handlers). Both get the
 * per-directory >= 90 coverage gate on top of the global gate. The thin `bin/` process adapter is
 * coverage-excluded at the source (a `/* v8 ignore *​/` block) — it is glue over the covered core.
 */
export default cosyteVitest({
  coverageDirs: ["core", "commands"],
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
