/**
 * `cosyte redact <file|-> [--format …]` (alias `cosyte deid …`) — the command whose *job* is to strip
 * PHI, emitting a de-identified copy of the parsed model.
 *
 * **It is deliberately not implemented yet.** De-identification belongs to **`@cosyte/deid`**, which
 * is unpublished (`DEID-1` in flight), and the wrapped parsers expose no de-id API to delegate to. A
 * built-in "minimal Safe-Harbor" pass over only the obvious PHI loci would leave PHI behind and
 * present a **false-safety impression** — the cardinal hazard `redact` exists to avoid. So this
 * command is an **honest, typed `CLI_NOT_IMPLEMENTED`** (never a fake success, never a partial scrub
 * dressed up as de-identified), gated on the de-identification seam in `core/deid.ts`.
 *
 * To keep that guarantee airtight, the command **never reads the input**: it consults
 * {@link deidStatus} first, and — while de-id is unavailable — reports the value-free reason and exits
 * `EX_UNAVAILABLE` (`69`) without ever touching the file's bytes. The command surface (positional
 * `<file|->`, `--format`) already exists so wiring `@cosyte/deid` later is additive.
 *
 * @packageDocumentation
 */

import { parseArgs } from "node:util";

import { CLI_CODES } from "../core/diagnostics.js";
import { deidStatus } from "../core/deid.js";
import { EXIT } from "../core/exit-codes.js";
import type { RunResult } from "../core/result.js";

/** The flags `redact`/`deid` will honour once de-id is wired; parsed now for a stable command surface. */
const REDACT_OPTIONS = {
  format: { type: "string" },
} as const;

/**
 * Run the `redact` / `deid` command.
 *
 * @param args - The arguments after the `redact`/`deid` subcommand token.
 * @returns A {@link RunResult}. While `@cosyte/deid` is unavailable: empty `stdout`, a value-free
 *   `CLI_NOT_IMPLEMENTED` diagnostic on `stderr`, and exit `EX_UNAVAILABLE` (`69`). A malformed
 *   invocation (an unknown flag) is a usage error (exit `2`). The input is **never read**.
 * @example
 * ```ts
 * import { redactCommand } from "@cosyte/cli";
 *
 * const r = redactCommand(["message.hl7"]);
 * r.exit; // => 69
 * ```
 */
export function redactCommand(args: string[]): RunResult {
  // Validate the invocation for a stable surface (a bad flag is a usage error), but do NOT read the
  // input: while de-identification is unavailable there is nothing safe to do with the bytes.
  try {
    parseArgs({ args, options: REDACT_OPTIONS, allowPositionals: true });
  } catch {
    return {
      stdout: "",
      stderr: `cosyte: ${CLI_CODES.CLI_USAGE}: invalid arguments to \`redact\` (see \`cosyte --help\`)\n`,
      exit: EXIT.USAGE,
    };
  }

  const status = deidStatus();
  // `available` is `false` until `@cosyte/deid` is wired (the only reachable branch today). Report the
  // value-free reason and a distinct non-zero exit — never a fake success, never a partial scrub.
  return {
    stdout: "",
    stderr: `cosyte: ${CLI_CODES.CLI_NOT_IMPLEMENTED}: ${status.reason}\n`,
    exit: EXIT.UNAVAILABLE,
  };
}
