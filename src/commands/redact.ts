/**
 * `cosyte redact <file|-> [--format …]` (alias `cosyte deid …`): the command whose *job* is to strip
 * identifiers, emitting a de-identified copy of the message on the data channel.
 *
 * **It delegates; it never approximates.** The whole policy belongs to **`@cosyte/deid`** (the seam in
 * `core/deid.ts`): the CLI adds no locus map, no transform and no fallback scrub, because a partial
 * pass over only the obvious PHI loci would leave PHI behind and present a **false-safety
 * impression**, the cardinal hazard this command exists to avoid. So anything short of a clean,
 * fully-handled pass is a non-zero exit with **empty stdout**:
 *
 * - the delegate ships no adapter for the resolved format: `CLI_NOT_IMPLEMENTED`, exit `69`;
 * - the delegate covers it but the CLI cannot carry the result on a text stdout (DICOM's Part 10
 *   bytes): `CLI_FORMAT_UNSUPPORTED`, exit `65`, the CLI's own limit rather than the delegate's;
 * - the delegate reports it could not handle an element: `CLI_DEID_INCOMPLETE`, exit `1`;
 * - the library is absent from the install: `CLI_PARSER_UNAVAILABLE`, exit `69`, decided **before any
 *   input is read**.
 *
 * The diagnostic channel carries the delegate's own value-free manifest (category, transform, the
 * structural locus, count, disposition code) and the delegate's own published label and version. The
 * CLI claims no de-identification standard of its own, and never echoes an input value here: not even
 * under `--unsafe-show-values`, whose bounded excerpt is deliberately not honoured by *this* command,
 * because an excerpt of the un-stripped input is exactly what `redact` exists to prevent.
 *
 * @packageDocumentation
 */

import { parseArgs } from "node:util";

import {
  DEID_BLOCKED,
  DEID_PACKAGE,
  deidCoverage,
  isDeidCovered,
  loadDeidDelegate,
  type DeidDelegate,
  type DeidManifestRecord,
  type RedactOutcome,
} from "../core/deid.js";
import { CLI_CODES, CliError, errorResult } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import type { CosyteFormat } from "../core/format.js";
import { resolveInput } from "../core/input.js";
import type { RunDeps } from "../core/io.js";
import type { RunResult } from "../core/result.js";

/** The flags `redact`/`deid` honours: the positional `<file|->` plus the shared `--format` override. */
const REDACT_OPTIONS = {
  format: { type: "string" },
} as const;

/**
 * Render one manifest entry as a value-free stderr line. Every field is the delegate's own: the
 * `locus` is a structural path by its contract, never an input value.
 */
function manifestLine(entry: DeidManifestRecord): string {
  return (
    `cosyte: redact: ${entry.category} ${entry.transform} ${entry.locus} ` +
    `x${String(entry.count)} ${entry.disposition} ${entry.code}\n`
  );
}

/** The delegate's attribution: its own package, version and published label, quoted, nothing added. */
function attribution(delegate: DeidDelegate): string {
  return `cosyte: redact: delegated to ${DEID_PACKAGE} ${delegate.version}: ${delegate.label}\n`;
}

/** The whole manifest, one value-free line per entry, in the delegate's own locus order. */
function manifestLines(outcome: RedactOutcome): string {
  return outcome.manifest.map(manifestLine).join("");
}

/** Count the entries of one disposition. */
function countOf(outcome: RedactOutcome, disposition: string): number {
  return outcome.manifest.filter((e) => e.disposition === disposition).length;
}

/** The value-free tally line: how many loci were acted on, and how. */
function tally(format: CosyteFormat, outcome: RedactOutcome): string {
  const transformed = countOf(outcome, "transformed");
  const removed = countOf(outcome, "removed");
  const blocked = countOf(outcome, DEID_BLOCKED);
  return (
    `cosyte: redact: ${format}: ${String(outcome.manifest.length)} loci acted on ` +
    `(${String(transformed)} transformed, ${String(removed)} removed, ${String(blocked)} blocked)\n`
  );
}

/**
 * The ephemeral-key disclosure. The delegate's default policy pseudonymizes MRN / account /
 * beneficiary identifiers with the caller's key; the CLI holds no key material and offers no key
 * surface, so it keys each invocation with a fresh random value. Stated rather than left to be
 * discovered, because "the same identifier maps to the same surrogate" is true *within* one output
 * and deliberately false *across* runs.
 */
const EPHEMERAL_KEY_NOTE =
  "cosyte: redact: identifier surrogates are keyed with a per-invocation ephemeral key: " +
  "consistent within this output, not stable across runs\n";

/**
 * Run the `redact` / `deid` command.
 *
 * @param args - The arguments after the `redact`/`deid` subcommand token.
 * @param deps - Injected input readers ({@link RunDeps}).
 * @param loadDelegate - The de-identification delegate loader; injectable so a test can drive the
 *   library-absent path without uninstalling it.
 * @returns A {@link RunResult}. A clean pass over a covered format: the de-identified document on
 *   `stdout`, the delegate's attribution and value-free manifest on `stderr`, exit `0`. Otherwise
 *   empty `stdout` and a typed non-zero exit: `1` when the delegate could not handle an element, `69`
 *   when it has no adapter for the format or is absent, `65` when the format cannot ride a text
 *   stdout or the input did not parse, `66` for an unreadable file, `2` for a bad flag.
 * @throws Never {@link CliError}; may propagate a truly unexpected error for the dispatcher to map.
 * @example
 * ```ts
 * import { redactCommand } from "@cosyte/cli";
 *
 * const deps = {
 *   readFile: async () => new TextEncoder().encode('{"resourceType":"Patient","id":"x"}'),
 *   readStdin: async () => new Uint8Array(),
 * };
 * (await redactCommand(["patient.json"], deps)).exit; // => 0
 * ```
 */
export async function redactCommand(
  args: string[],
  deps: RunDeps,
  loadDelegate: () => Promise<DeidDelegate> = loadDeidDelegate,
): Promise<RunResult> {
  let values: { format?: string };
  let positionals: string[];
  try {
    const parsed = parseArgs({ args, options: REDACT_OPTIONS, allowPositionals: true });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch {
    return errorResult(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        "invalid arguments to `redact` (see `cosyte --help`)",
      ),
    );
  }

  // The ground layer FIRST, before a byte is read: an install without the library must never touch
  // the input it cannot strip. An absent package is a value-free CLI_PARSER_UNAVAILABLE (69).
  let delegate: DeidDelegate;
  try {
    delegate = await loadDelegate();
  } catch (e) {
    if (e instanceof CliError) return errorResult(e);
    throw e;
  }

  // No operation gate here: `redact`'s capability matrix is the delegate's, applied below, and it
  // answers an uncovered format with a different code than the parser registry would.
  const resolved = await resolveInput(positionals[0], values.format, deps, null);
  if (!resolved.ok) return resolved.result;
  const { format, bytes } = resolved.input;

  if (!isDeidCovered(format)) return errorResult(uncovered(format));

  let outcome: RedactOutcome;
  try {
    outcome = await delegate.redact(format, bytes);
  } catch (e) {
    if (e instanceof CliError) return errorResult(e);
    throw e;
  }

  const blocked = outcome.manifest.filter((e) => e.disposition === DEID_BLOCKED);
  if (blocked.length > 0) {
    // Fail closed. The loci and their codes are reported so the gap is visible, and nothing is
    // offered as a de-identified copy: no output at all.
    const incomplete = new CliError(
      CLI_CODES.CLI_DEID_INCOMPLETE,
      EXIT.INVALID,
      `${DEID_PACKAGE} blocked ${String(blocked.length)} of ` +
        `${String(outcome.manifest.length)} loci in this ${format} input; no output was emitted`,
    );
    return {
      stdout: "",
      stderr:
        attribution(delegate) +
        manifestLines(outcome) +
        tally(format, outcome) +
        `cosyte: ${incomplete.code}: ${incomplete.message}\n`,
      exit: incomplete.exit,
    };
  }

  return {
    stdout: `${outcome.output}\n`,
    stderr:
      attribution(delegate) + manifestLines(outcome) + tally(format, outcome) + EPHEMERAL_KEY_NOTE,
    exit: EXIT.OK,
  };
}

/**
 * The value-free refusal for a format `redact` produces no output for. Two distinct facts get two
 * distinct codes: the delegate having no adapter for the standard this CLI resolves is an
 * unavailable capability (`69`), while DICOM is covered by the delegate and refused by the **CLI**,
 * whose data channel is text and cannot carry a Part 10 byte stream (`65`, the same answer `parse`
 * and `fmt` already give for the same reason). Blaming the delegate for the CLI's own channel would
 * be a false attribution.
 */
function uncovered(format: CosyteFormat): CliError {
  if (deidCoverage(format) === "unserializable") {
    return new CliError(
      CLI_CODES.CLI_FORMAT_UNSUPPORTED,
      EXIT.DATAERR,
      `format '${format}' cannot be redacted onto this CLI's text output channel ` +
        `(its de-identified form is a binary stream, so \`parse\` and \`fmt\` are unwired too)`,
    );
  }
  return new CliError(
    CLI_CODES.CLI_NOT_IMPLEMENTED,
    EXIT.UNAVAILABLE,
    `${DEID_PACKAGE} does not de-identify the ${format} standard this CLI resolves, and the CLI ` +
      `ships no redactor of its own, so nothing is emitted`,
  );
}
