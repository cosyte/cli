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
  errorResult,
  toCliError,
  type CliCode,
} from "./core/diagnostics.js";

export { resolveInput, type ResolvedInput, type InputResolution } from "./core/input.js";

export { extractStableCode, parseFailureResult } from "./core/wrap.js";

export { formatHl7Position, type Finding } from "./core/findings.js";

export { readFileBytes, readStreamBytes, type RunDeps } from "./core/io.js";

export {
  VALUE_FREE,
  SHOW_VALUES,
  UNSAFE_SHOW_VALUES_FLAG,
  UNSAFE_EXCERPT_MAX,
  extractPhiPosture,
  unsafeInputSuffix,
  type PhiPosture,
} from "./core/phi.js";

export { deidStatus, DEID_UNAVAILABLE_REASON, type DeidAvailability } from "./core/deid.js";

export type { RunResult } from "./core/result.js";

export { run } from "./core/run.js";

export { parseCommand } from "./commands/parse.js";

export { validateCommand } from "./commands/validate.js";

export { inspectCommand } from "./commands/inspect.js";

export { fmtCommand } from "./commands/fmt.js";

export { convertCommand, convertOutcome } from "./commands/convert.js";

export { mapCodesCommand } from "./commands/map-codes.js";

export { redactCommand } from "./commands/redact.js";
