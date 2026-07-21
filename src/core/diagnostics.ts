/**
 * The CLI's **value-free diagnostic channel**. Every error the CLI raises on its own behalf carries a
 * stable `CLI_*` code, a fixed exit code, and a **PHI-safe** message built only from positional /
 * structural context — a segment or field index, a byte offset, a file path, a format name, a warning
 * code. **A diagnostic never echoes an input value** (a name, a DOB, an MRN, a result). This is the
 * parsers' "warning = code + position, never a value" rule applied at the CLI edge (cli roadmap §7).
 *
 * @packageDocumentation
 */

import { EXIT, type ExitCode } from "./exit-codes.js";
import type { RunResult } from "./result.js";

/**
 * Stable **CLI diagnostic code** registry — errors the CLI owns (routing, I/O, argument handling),
 * distinct from the wrapped library's own warning/issue codes which are passed through unchanged.
 * Each code is its own value (`key === value`) so the set survives `Object.values(...)`; renaming or
 * removing one is a **breaking change** because scripts branch on the stderr text.
 *
 * @example
 * ```ts
 * import { CLI_CODES } from "@cosyte/cli";
 *
 * if (diagnostic.code === CLI_CODES.CLI_FORMAT_UNDETECTED) {
 *   // ask the user for --format
 * }
 * ```
 */
export const CLI_CODES = {
  /** A required argument was missing or a flag was invalid. Exit `2`. */
  CLI_USAGE: "CLI_USAGE",
  /** The named file does not exist or could not be read. Exit `66`. */
  CLI_NO_INPUT: "CLI_NO_INPUT",
  /** The input was empty — no bytes to detect or parse. Exit `65`. */
  CLI_EMPTY_INPUT: "CLI_EMPTY_INPUT",
  /** No format signature matched; the CLI will not guess. Names the candidates, never the bytes. Exit `65`. */
  CLI_FORMAT_UNDETECTED: "CLI_FORMAT_UNDETECTED",
  /** More than one format signature matched; the CLI will not guess. Names the candidates, never the bytes. Exit `65`. */
  CLI_FORMAT_AMBIGUOUS: "CLI_FORMAT_AMBIGUOUS",
  /** A recognised format that this CLI build does not yet wire (deferred to a later phase). Exit `65`. */
  CLI_FORMAT_UNSUPPORTED: "CLI_FORMAT_UNSUPPORTED",
  /** The wrapped parser rejected the input. Positional context only — never the offending bytes. Exit `65`. */
  CLI_PARSE_FAILED: "CLI_PARSE_FAILED",
  /** A command whose ground-layer library is not yet built (e.g. `redact` before `@cosyte/deid`
   * ships). Never a fake success — a distinct, value-free "unavailable" signal. Exit `69`. */
  CLI_NOT_IMPLEMENTED: "CLI_NOT_IMPLEMENTED",
  /** An unexpected internal error (a bug). Exit `70`. */
  CLI_INTERNAL: "CLI_INTERNAL",
} as const;

/**
 * A value from {@link CLI_CODES} — the stable code carried by a {@link CliError}.
 */
export type CliCode = (typeof CLI_CODES)[keyof typeof CLI_CODES];

/**
 * A typed, PHI-safe CLI error. Its {@link CliError.message | message} is **value-free by
 * construction** — callers must build it from codes, indices, offsets, format names, and file paths,
 * never from an input value. It carries the {@link ExitCode} the invocation resolves to.
 *
 * @example
 * ```ts
 * import { CliError, CLI_CODES, EXIT } from "@cosyte/cli";
 *
 * throw new CliError(CLI_CODES.CLI_NO_INPUT, EXIT.NOINPUT, "cannot read the named file");
 * ```
 */
export class CliError extends Error {
  /** The stable diagnostic code. */
  public readonly code: CliCode;
  /** The exit code this error resolves the invocation to. */
  public readonly exit: ExitCode;

  /**
   * @param code - A stable {@link CliCode}.
   * @param exit - The {@link ExitCode} to resolve to.
   * @param message - A **value-free** explanation (positional/structural context only, never PHI).
   */
  public constructor(code: CliCode, exit: ExitCode, message: string) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exit = exit;
  }
}

/**
 * Render a {@link CliError} as a single value-free `stderr` line: `cosyte: <CODE>: <message>`. The
 * message is already value-free by the {@link CliError} contract; this only prefixes the tool name
 * and the code so scripts and humans can branch on a stable token.
 *
 * @param err - The CLI error to render.
 * @returns The stderr line (no trailing newline).
 * @example
 * ```ts
 * import { CliError, CLI_CODES, EXIT, formatDiagnostic } from "@cosyte/cli";
 *
 * formatDiagnostic(new CliError(CLI_CODES.CLI_USAGE, EXIT.USAGE, "missing <file> argument"));
 * // => "cosyte: CLI_USAGE: missing <file> argument"
 * ```
 */
export function formatDiagnostic(err: CliError): string {
  return `cosyte: ${err.code}: ${err.message}`;
}

/**
 * Resolve a {@link CliError} into a value-free {@link RunResult}: empty `stdout` (nothing reaches the
 * data channel on an error), the rendered diagnostic on `stderr`, and the error's exit code. The
 * single place the CLI turns an owned error into a result, so every command and the dispatcher render
 * errors identically.
 *
 * @param err - The CLI error to resolve.
 * @returns The value-free {@link RunResult}.
 * @example
 * ```ts
 * import { CliError, CLI_CODES, EXIT, errorResult } from "@cosyte/cli";
 *
 * errorResult(new CliError(CLI_CODES.CLI_USAGE, EXIT.USAGE, "missing <file>")).exit; // => 2
 * ```
 */
export function errorResult(err: CliError): RunResult {
  return { stdout: "", stderr: `${formatDiagnostic(err)}\n`, exit: err.exit };
}

/**
 * Coerce an unknown thrown value into a {@link CliError}. A {@link CliError} passes through; anything
 * else becomes a `CLI_INTERNAL` / {@link EXIT.SOFTWARE} error whose message is a **fixed, value-free
 * string** — the original message is deliberately discarded so a parser exception that embedded input
 * bytes can never reach stderr.
 *
 * @param err - The caught value.
 * @returns A {@link CliError} safe to render to stderr.
 * @example
 * ```ts
 * import { toCliError } from "@cosyte/cli";
 *
 * toCliError(new Error("boom")).code; // => "CLI_INTERNAL"
 * ```
 */
export function toCliError(err: unknown): CliError {
  if (err instanceof CliError) return err;
  return new CliError(
    CLI_CODES.CLI_INTERNAL,
    EXIT.SOFTWARE,
    "an unexpected internal error occurred (no input is echoed)",
  );
}
