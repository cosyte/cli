/**
 * The `cosyte` CLI **exit-code contract** — a designed, documented surface that CI pipelines and
 * shell scripts branch on. Grounded in the Unix `sysexits.h` conventions (see the cli roadmap §4.3).
 *
 * The load-bearing rule: **the CLI never prints a reassuring line and exits `0` on input it could not
 * handle.** An undetectable format, an unreadable file, or a parser that throws each map to a
 * distinct, stable non-zero code — never a silent success.
 *
 * | Code | Name       | Meaning                                                              |
 * |------|------------|----------------------------------------------------------------------|
 * | `0`  | `OK`       | success — the operation completed                                    |
 * | `2`  | `USAGE`    | usage error — unknown command, bad flag, missing argument (EX_USAGE) |
 * | `65` | `DATAERR`  | data error — input could not be parsed / format not detected (EX_DATAERR) |
 * | `66` | `NOINPUT`  | no input — the file does not exist or is unreadable (EX_NOINPUT)     |
 * | `70` | `SOFTWARE` | internal error — an unexpected exception, i.e. a bug (EX_SOFTWARE)   |
 *
 * `validate`'s "invalid ⇒ exit 1" verdict code lands with the `validate` command in a later phase;
 * Phase 1 (`parse`) uses the five codes above.
 *
 * @packageDocumentation
 */

/**
 * The stable exit-code map. Adding a code is a documented, tested change to the CLI's contract;
 * renaming or repurposing one is a breaking change.
 *
 * @example
 * ```ts
 * import { EXIT } from "@cosyte/cli";
 *
 * process.exitCode = EXIT.OK; // => 0
 * ```
 */
export const EXIT = {
  /** Success — the operation completed. */
  OK: 0,
  /** Usage error — unknown command, bad flag, missing argument (`EX_USAGE`). */
  USAGE: 2,
  /** Data error — input could not be parsed or its format could not be detected (`EX_DATAERR`). */
  DATAERR: 65,
  /** No input — the named file does not exist or is unreadable (`EX_NOINPUT`). */
  NOINPUT: 66,
  /** Internal error — an unexpected exception (a bug), distinct from a handled bad input (`EX_SOFTWARE`). */
  SOFTWARE: 70,
} as const;

/**
 * A value from {@link EXIT} — the exit code a CLI invocation resolves to.
 */
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
