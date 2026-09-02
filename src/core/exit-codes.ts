/**
 * The `cosyte` CLI **exit-code contract**: a designed, documented surface that CI pipelines and
 * shell scripts branch on. `0` is the conventional success status; the codes from `65` up are the
 * values the Unix `sysexits.h` header assigns to the constants named beside them; `1` and `2` are
 * this CLI's own, because that header defines no constant for either.
 *
 * The load-bearing rule: **the CLI never prints a reassuring line and exits `0` on input it could not
 * handle.** An undetectable format, an unreadable file, a parser that throws, or a consumer that
 * closed the output stream before the output arrived each map to a distinct, stable non-zero code,
 * never a silent success.
 *
 * | Code | Name       | Meaning                                                              |
 * |------|------------|----------------------------------------------------------------------|
 * | `0`  | `OK`       | success: the operation completed; `validate` found the input **valid** |
 * | `1`  | `INVALID`  | operation-level failure: `validate` found the input **invalid**, or `redact` could not de-identify every locus (this CLI's own value; a real, expected CI signal: the tool worked, the operation did not complete) |
 * | `2`  | `USAGE`    | usage error: unknown command, bad flag, missing argument (this CLI's own value) |
 * | `65` | `DATAERR`  | data error: input could not be parsed / format not detected (EX_DATAERR) |
 * | `66` | `NOINPUT`  | no input: the file does not exist or is unreadable (EX_NOINPUT)     |
 * | `69` | `UNAVAILABLE` | a required capability is not wired for this input: e.g. `redact` on a format `@cosyte/deid` has no adapter for (EX_UNAVAILABLE) |
 * | `70` | `SOFTWARE` | internal error: an unexpected exception, i.e. a bug (EX_SOFTWARE)   |
 * | `74` | `IOERR`    | output error: the output stream closed before the CLI had finished writing to it, the shape a downstream consumer that exits early produces (EX_IOERR) |
 *
 * The load-bearing `validate` rule: a **parseable-but-invalid** message is exit `1`, never exit `0`.
 * The CLI must never print a reassuring line and exit green on a bad message. Exit `65` is reserved
 * for input that could not be **parsed** at all (a distinct signal from "parsed, but does not
 * conform").
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
  /** Success: the operation completed; `validate` found the input **valid**. */
  OK: 0,
  /** Operation-level failure: `validate` found the input **invalid** (parseable but non-conformant),
   * or `redact` could not de-identify every locus: a real, expected CI signal that the tool worked
   * and the operation did not complete. Never emitted for unparseable input (that is `DATAERR`). */
  INVALID: 1,
  /** Usage error: unknown command, bad flag, missing argument. A value specific to this CLI, not a
   * `sysexits.h` constant. */
  USAGE: 2,
  /** Data error: input could not be parsed or its format could not be detected (`EX_DATAERR`). */
  DATAERR: 65,
  /** No input: the named file does not exist or is unreadable (`EX_NOINPUT`). */
  NOINPUT: 66,
  /** Unavailable: a required capability is not wired for this input (e.g. `redact` on a format
   * `@cosyte/deid` has no adapter for, or with that optional library absent), a distinct non-zero
   * signal that is never a fake success (`EX_UNAVAILABLE`). */
  UNAVAILABLE: 69,
  /** Internal error: an unexpected exception (a bug), distinct from a handled bad input (`EX_SOFTWARE`). */
  SOFTWARE: 70,
  /** Output error: the stream the CLI was writing to closed before the output had been delivered, so
   * the consumer holds nothing or holds only part of the answer. The shape a downstream consumer
   * that exits early produces (a pager quit, a `head` that has seen enough). A handled condition the
   * consumer owns, never a defect in the CLI, so it is deliberately distinct from `SOFTWARE`
   * (`EX_IOERR`). */
  IOERR: 74,
} as const;

/**
 * A value from {@link EXIT}: the exit code a CLI invocation resolves to.
 */
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
