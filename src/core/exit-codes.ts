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
 * | `0`  | `OK`       | success — the operation completed; `validate` found the input **valid** |
 * | `1`  | `INVALID`  | operation-level failure — `validate` found the input **invalid** (a real, expected CI signal: the message is bad, the tool worked) |
 * | `2`  | `USAGE`    | usage error — unknown command, bad flag, missing argument (EX_USAGE) |
 * | `65` | `DATAERR`  | data error — input could not be parsed / format not detected (EX_DATAERR) |
 * | `66` | `NOINPUT`  | no input — the file does not exist or is unreadable (EX_NOINPUT)     |
 * | `69` | `UNAVAILABLE` | a required capability is not yet available — e.g. `redact` before `@cosyte/deid` ships (EX_UNAVAILABLE) |
 * | `70` | `SOFTWARE` | internal error — an unexpected exception, i.e. a bug (EX_SOFTWARE)   |
 *
 * The load-bearing `validate` rule (cli roadmap §4.3, §Phase 3): a **parseable-but-invalid** message
 * is exit `1`, never exit `0` — the CLI must never print a reassuring line and exit green on a bad
 * message. Exit `65` is reserved for input that could not be **parsed** at all (a distinct signal from
 * "parsed, but does not conform"). Phase 1 (`parse`) used the non-`1`/`69` codes; Phase 2 added `69`
 * for the ground-layer-gated `redact`/`deid`; Phase 3 (`validate`) adds `1` for the invalid verdict.
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
  /** Success — the operation completed; `validate` found the input **valid**. */
  OK: 0,
  /** Operation-level failure — `validate` found the input **invalid** (parseable but non-conformant):
   * a real, expected CI signal that the message is bad and the tool worked. Never emitted for
   * unparseable input (that is `DATAERR`). */
  INVALID: 1,
  /** Usage error — unknown command, bad flag, missing argument (`EX_USAGE`). */
  USAGE: 2,
  /** Data error — input could not be parsed or its format could not be detected (`EX_DATAERR`). */
  DATAERR: 65,
  /** No input — the named file does not exist or is unreadable (`EX_NOINPUT`). */
  NOINPUT: 66,
  /** Unavailable — a required capability is not yet built (e.g. `redact` before `@cosyte/deid`), a
   * distinct non-zero signal that is never a fake success (`EX_UNAVAILABLE`). */
  UNAVAILABLE: 69,
  /** Internal error — an unexpected exception (a bug), distinct from a handled bad input (`EX_SOFTWARE`). */
  SOFTWARE: 70,
} as const;

/**
 * A value from {@link EXIT} — the exit code a CLI invocation resolves to.
 */
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
