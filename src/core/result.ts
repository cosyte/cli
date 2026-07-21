/**
 * The result of running a CLI invocation, as data — decoupled from `process` so the whole command
 * tree is testable. The thin `bin` entry writes {@link RunResult.stdout} to `process.stdout`,
 * {@link RunResult.stderr} to `process.stderr`, and exits with {@link RunResult.exit}.
 *
 * The two channels carry the CLI's PHI posture (cli roadmap §7): **stdout is the data channel** (the
 * user's explicit request — the parsed model), while **stderr is value-free** — codes and positions
 * only, never an input value.
 *
 * @packageDocumentation
 */

import type { ExitCode } from "./exit-codes.js";

/**
 * A fully-resolved CLI invocation.
 *
 * @example
 * ```ts
 * import { EXIT, type RunResult } from "@cosyte/cli";
 *
 * const r: RunResult = { stdout: "{}\n", stderr: "", exit: EXIT.OK };
 * r.exit; // => 0
 * ```
 */
export interface RunResult {
  /** The data channel — the parsed model or requested output. May contain the user's data by design. */
  readonly stdout: string;
  /** The diagnostic channel — **value-free**: codes, positions, file paths, format names only. */
  readonly stderr: string;
  /** The exit code the invocation resolves to. */
  readonly exit: ExitCode;
}
