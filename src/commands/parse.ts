/**
 * `cosyte parse <file|-> [--format …] [--ndjson] [--json] [--quiet] [--no-color]`
 *
 * Read a file (or stdin via `-`), **autodetect the format by content** (or honour `--format`), route to
 * the wrapped parser via the lazy per-format registry (`core/parsers.ts`) (so `cosyte parse msg.hl7`
 * never loads the DICOM or X12 code) and emit the parsed model as **typed JSON on stdout**. Every
 * failure is a value-free diagnostic on stderr with a stable `CLI_*` code and the documented exit code.
 *
 * **Multi-message / streaming.** A single message emits one pretty (or compact under `--json`)
 * JSON envelope, exactly as before. A **multi-record** input emits **NDJSON** (one compact envelope
 * per line) with per-record isolation: a record that fails to parse becomes a value-free
 * `{ record, error }` line and the stream continues, and the overall exit is a data error (`65`) if any
 * record failed. Two inputs are multi-record: an **MLLP** stream (each VT-framed frame is an enclosed
 * HL7 message) and any input under **`--ndjson`** (each non-empty line is a record: the FHIR bulk-data
 * convention). Multi-record output is emitted **record by record, as each is parsed**, so the first
 * line reaches the data channel long before the last byte of input has been read.
 *
 * **The size limit.** One invocation reads at most the documented number of input bytes (see
 * `core/limits.ts`), counted against the running total as the input arrives. A larger input is a
 * value-free `CLI_INPUT_TOO_LARGE` **data error**, never the internal-error code, and never a partial
 * record stream presented as a complete one: whatever reached stdout before the refusal stands, and
 * the invocation still resolves to the failure's own non-zero exit code.
 *
 * The CLI adds **no** parsing of its own: it routes, reads, and shapes output; `cosyte parse` equals the
 * wrapped library's programmatic parse.
 *
 * @packageDocumentation
 */

import { parseArgs } from "node:util";

import { CLI_CODES, CliError, errorResult, formatDiagnostic } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import type { CosyteFormat } from "../core/format.js";
import { resolveInputStream } from "../core/input.js";
import type { RunDeps } from "../core/io.js";
import { parseFormat, type ParseWarning } from "../core/parsers.js";
import { VALUE_FREE, type PhiPosture } from "../core/phi.js";
import { collectChunks, mllpFrames, ndjsonRecords, type ByteChunks } from "../core/records.js";
import type { RunResult } from "../core/result.js";
import { extractStableCode, parseFailureResult } from "../core/wrap.js";

// Re-exported from the shared wrapper boundary so the historical `@cosyte/cli` import path stays stable.
export { extractStableCode } from "../core/wrap.js";

/** The typed JSON envelope a single `parse` emits on stdout: the format, the parsed model, warnings. */
interface ParseEnvelope {
  readonly format: CosyteFormat;
  readonly model: unknown;
  readonly warnings: readonly ParseWarning[];
}

/** One line of NDJSON multi-record output: a parsed record, or a value-free per-record parse error. */
type RecordLine =
  | {
      readonly record: number;
      readonly format: CosyteFormat;
      readonly model: unknown;
      readonly warnings: readonly ParseWarning[];
    }
  | { readonly record: number; readonly format: CosyteFormat; readonly error: string };

/** The flags `parse` understands, parsed by {@link parseArgs}. */
const PARSE_OPTIONS = {
  format: { type: "string" },
  ndjson: { type: "boolean", default: false },
  json: { type: "boolean", default: false },
  quiet: { type: "boolean", default: false },
  "no-color": { type: "boolean", default: false },
} as const;

/**
 * Run the `parse` command.
 *
 * @param args - The arguments after the `parse` subcommand token.
 * @param deps - Injected I/O ({@link RunDeps}). When it carries the chunk readers and the output
 *   sink, a multi-record input is read and emitted incrementally; when it does not, the same path
 *   runs over one chunk and the output comes back on `stdout` instead.
 * @param posture - The resolved {@link PhiPosture}. Defaults to {@link VALUE_FREE}; under
 *   `--unsafe-show-values` a bounded excerpt of the offending input is appended to a `CLI_PARSE_FAILED`
 *   diagnostic (the single, opt-in value-echoing surface): single-record mode only.
 * @returns A {@link RunResult}: the typed-JSON model (or NDJSON records) on `stdout`, a value-free note
 *   (or nothing) on `stderr`, and the resolved exit code. An input past the documented size limit is a
 *   value-free data error naming the limit. Never throws a {@link CliError}: it resolves it to a
 *   result; unexpected exceptions are caught by the dispatcher and mapped to `CLI_INTERNAL`.
 * @throws Never {@link CliError}; may propagate a truly unexpected error for the dispatcher to map.
 * @example
 * ```ts
 * import { parseCommand } from "@cosyte/cli";
 *
 * const enc = new TextEncoder();
 * const deps = {
 *   readFile: async () => enc.encode('{"resourceType":"Patient","id":"x"}'),
 *   readStdin: async () => new Uint8Array(),
 * };
 * (await parseCommand(["patient.json"], deps)).exit; // => 0
 * ```
 */
export async function parseCommand(
  args: string[],
  deps: RunDeps,
  posture: PhiPosture = VALUE_FREE,
): Promise<RunResult> {
  let values: {
    format?: string;
    ndjson?: boolean;
    json?: boolean;
    quiet?: boolean;
    "no-color"?: boolean;
  };
  let positionals: string[];
  try {
    const parsed = parseArgs({ args, options: PARSE_OPTIONS, allowPositionals: true });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch {
    return errorResult(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        "invalid arguments to `parse` (see `cosyte parse --help`)",
      ),
    );
  }

  const resolved = await resolveInputStream(positionals[0], values.format, deps, "parse");
  if (!resolved.ok) return resolved.result;
  const { format, chunks } = resolved.input;

  // MLLP is a transport container and `--ndjson` is explicit batch mode: both are multi-record.
  if (format === "mllp" || values.ndjson === true) {
    return await parseMulti(
      format,
      chunks,
      values.ndjson === true,
      values.quiet === true,
      deps.writeStdout,
    );
  }

  // A single message is parsed whole, so the rest of the input is drained here (still size-limited).
  let bytes: Uint8Array;
  try {
    bytes = await collectChunks(chunks);
  } catch (e) {
    if (e instanceof CliError) return errorResult(e);
    throw e;
  }
  return await parseSingle(format, bytes, values.json === true, values.quiet === true, posture);
}

/** Parse a single message → one JSON envelope (pretty, or compact under `--json`). Preserves the
 * value-free failure boundary and the opt-in `--unsafe-show-values` excerpt. */
async function parseSingle(
  format: CosyteFormat,
  bytes: Uint8Array,
  json: boolean,
  quiet: boolean,
  posture: PhiPosture,
): Promise<RunResult> {
  let result: { model: unknown; warnings: readonly ParseWarning[] };
  try {
    result = await parseFormat(format, bytes);
  } catch (e) {
    if (e instanceof CliError) return errorResult(e);
    return parseFailureResult(format, bytes, posture, e);
  }
  const envelope: ParseEnvelope = { format, model: result.model, warnings: result.warnings };
  const stdout = (json ? JSON.stringify(envelope) : JSON.stringify(envelope, null, 2)) + "\n";

  const n = envelope.warnings.length;
  const stderr =
    n > 0 && !quiet
      ? `cosyte: parsed ${format} with ${String(n)} warning(s) (see .warnings in output)\n`
      : "";
  return { stdout, stderr, exit: EXIT.OK };
}

/**
 * Parse a multi-record input (MLLP frames, or `--ndjson` lines) → NDJSON, with per-record isolation
 * and **per-record emission**: each line reaches the data channel as soon as its record is parsed,
 * while the rest of the input is still arriving.
 *
 * Failure isolation is unchanged by that move: a record the parser rejects becomes a value-free
 * `{ record, error }` line, the stream continues, and any failed record resolves the invocation to
 * the data-error exit. A **fatal** condition (the over-limit refusal, a truncated MLLP stream, a
 * parser that is not installed, a downstream consumer closing the pipe) ends the stream and resolves
 * to that failure's own non-zero code, **keeping** whatever already reached stdout: a partial record
 * stream is never dressed up as a complete one, and never reported as a success.
 */
async function parseMulti(
  format: CosyteFormat,
  chunks: ByteChunks,
  ndjson: boolean,
  quiet: boolean,
  writeStdout: ((chunk: string) => void) | undefined,
): Promise<RunResult> {
  // MLLP de-frames to enclosed HL7 payloads; every other multi-record input is one record per line.
  const recordFormat: CosyteFormat = format === "mllp" ? "hl7" : format;
  const records = format === "mllp" ? mllpFrames(chunks) : ndjsonRecords(chunks);

  const held: string[] = [];
  const emit = (line: string): void => {
    if (writeStdout === undefined) {
      held.push(line);
      return;
    }
    try {
      writeStdout(line);
    } catch {
      // The consumer went away part way through the stream (a closed pipe). Value-free, and never
      // an unhandled platform error reaching the terminal.
      throw new CliError(
        CLI_CODES.CLI_OUTPUT_WRITE_FAILED,
        EXIT.SOFTWARE,
        "could not write to the output stream; it closed before the record stream finished",
      );
    }
  };
  const written = (): string => held.join("");

  let total = 0;
  let failed = 0;
  let warnings = 0;

  try {
    for await (const record of records) {
      let line: RecordLine;
      try {
        const { model, warnings: ws } = await parseFormat(recordFormat, record);
        warnings += ws.length;
        line = { record: total, format: recordFormat, model, warnings: ws };
      } catch (e) {
        if (e instanceof CliError) throw e; // a parser-unavailable is fatal for the whole stream
        failed += 1;
        // Value-free per-record error: a stable code (if the throw carried one), never the bytes.
        line = {
          record: total,
          format: recordFormat,
          error: extractStableCode(e) ?? "CLI_PARSE_FAILED",
        };
      }
      total += 1;
      emit(JSON.stringify(line) + "\n");
    }
  } catch (e) {
    // Fatal, part way through: the exit code is the failure's own, and the lines already emitted stay.
    if (e instanceof CliError) {
      return { stdout: written(), stderr: `${formatDiagnostic(e)}\n`, exit: e.exit };
    }
    const rejected = parseFailureResult(format, new Uint8Array(), VALUE_FREE, e);
    return { stdout: written(), stderr: rejected.stderr, exit: rejected.exit };
  }

  if (total === 0) {
    // A framed/ndjson input that yielded no record is a data error, never a silent success.
    return errorResult(
      new CliError(
        CLI_CODES.CLI_PARSE_FAILED,
        EXIT.DATAERR,
        `no ${format === "mllp" ? "MLLP frame" : "record"} found in the input`,
      ),
    );
  }

  const exit = failed > 0 ? EXIT.DATAERR : EXIT.OK;
  const stderr = quiet
    ? ""
    : `cosyte: parsed ${String(total)} ${recordFormat} record(s)` +
      ` (${String(warnings)} warning(s), ${String(failed)} failed)` +
      (ndjson ? " [ndjson]" : format === "mllp" ? " [mllp]" : "") +
      "\n";
  return { stdout: written(), stderr, exit };
}
