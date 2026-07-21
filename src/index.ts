/**
 * Public programmatic entry point for `@cosyte/cli` (the `.` subpath export).
 *
 * `@cosyte/cli` is a **`bin` package** — its primary artifact is the `cosyte` command on your `PATH`
 * (`npx @cosyte/cli parse …`), not an import surface. This module is the small, honest **programmatic
 * API** over the same `core` the CLI uses: the format autodetector, the exit-code contract, the
 * value-free diagnostic types, and the dispatcher — so a future adapter (e.g. the Phase-5 MCP server,
 * or a web playground) can drive the same logic without shelling out.
 *
 * The CLI is a **thin, PHI-safe skin** over the wrapped `@cosyte/*` parsers: it routes, reads, shapes
 * output, and owns the exit-code + value-free-diagnostic disciplines; it re-implements no wire-format
 * parsing. See the meta-repo `operations/roadmaps/cli.md` for the full contract.
 *
 * @packageDocumentation
 */

export { VERSION } from "./core/version.js";

export { EXIT, type ExitCode } from "./core/exit-codes.js";

export {
  detectFormat,
  classifyCandidates,
  detectionError,
  asCosyteFormat,
  WIRED_FORMATS,
  KNOWN_FORMATS,
  type CosyteFormat,
  type DetectResult,
} from "./core/format.js";

export {
  CLI_CODES,
  CliError,
  formatDiagnostic,
  toCliError,
  type CliCode,
} from "./core/diagnostics.js";

export { readFileBytes, readStreamBytes, type RunDeps } from "./core/io.js";

export type { RunResult } from "./core/result.js";

export { run } from "./core/run.js";

export { parseCommand, extractStableCode } from "./commands/parse.js";
