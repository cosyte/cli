/**
 * `cosyte parse <file|-> [--format …] [--ndjson] [--json] [--quiet] [--no-color]`
 *
 * Read a file (or stdin via `-`), **autodetect the format by content** (or honour `--format`), route to
 * the wrapped parser via the lazy per-format registry (`core/parsers.ts`) — so `cosyte parse msg.hl7`
 * never loads the DICOM or X12 code — and emit the parsed model as **typed JSON on stdout**. Every
 * failure is a value-free diagnostic on stderr with a stable `CLI_*` code and the documented exit code
 * (cli roadmap §4.3, §7).
 *
 * **Multi-message / streaming (CLI-6).** A single message emits one pretty (or compact under `--json`)
 * JSON envelope, exactly as before. A **multi-record** input emits **NDJSON** — one compact envelope
 * per line — with per-record isolation: a record that fails to parse becomes a value-free
 * `{ record, error }` line and the stream continues, and the overall exit is a data error (`65`) if any
 * record failed. Two inputs are multi-record: an **MLLP** stream (each VT-framed frame is an enclosed
 * HL7 message) and any input under **`--ndjson`** (each non-empty line is a record — the FHIR bulk-data
 * convention).
 *
 * The CLI adds **no** parsing of its own: it routes, reads, and shapes output; `cosyte parse` equals the
 * wrapped library's programmatic parse.
 *
 * @packageDocumentation
 */

import { parseArgs } from "node:util";

import { CLI_CODES, CliError, errorResult } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import type { CosyteFormat } from "../core/format.js";
import { resolveInput } from "../core/input.js";
import type { RunDeps } from "../core/io.js";
import { deframeMllp, parseFormat, type ParseWarning } from "../core/parsers.js";
import { VALUE_FREE, type PhiPosture } from "../core/phi.js";
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
 * @param deps - Injected input readers ({@link RunDeps}).
 * @param posture - The resolved {@link PhiPosture}. Defaults to {@link VALUE_FREE}; under
 *   `--unsafe-show-values` a bounded excerpt of the offending input is appended to a `CLI_PARSE_FAILED`
 *   diagnostic (the single, opt-in value-echoing surface) — single-record mode only.
 * @returns A {@link RunResult}: the typed-JSON model (or NDJSON records) on `stdout`, a value-free note
 *   (or nothing) on `stderr`, and the resolved exit code. Never throws a {@link CliError} — it resolves
 *   it to a result; unexpected exceptions are caught by the dispatcher and mapped to `CLI_INTERNAL`.
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

  const resolved = await resolveInput(positionals[0], values.format, deps, "parse");
  if (!resolved.ok) return resolved.result;
  const { format, bytes } = resolved.input;

  // MLLP is a transport container and `--ndjson` is explicit batch mode: both are multi-record.
  if (format === "mllp" || values.ndjson === true) {
    return await parseMulti(format, bytes, values.ndjson === true, values.quiet === true);
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

/** Parse a multi-record input (MLLP frames, or `--ndjson` lines) → NDJSON, with per-record isolation. */
async function parseMulti(
  format: CosyteFormat,
  bytes: Uint8Array,
  ndjson: boolean,
  quiet: boolean,
): Promise<RunResult> {
  // Resolve the records + the format each record is parsed as. MLLP de-frames to enclosed HL7 payloads.
  let records: Uint8Array[];
  let recordFormat: CosyteFormat;
  try {
    if (format === "mllp") {
      const { payloads } = await deframeMllp(bytes);
      records = payloads;
      recordFormat = "hl7";
    } else {
      records = splitLines(bytes);
      recordFormat = format;
    }
  } catch (e) {
    if (e instanceof CliError) return errorResult(e);
    return parseFailureResult(format, bytes, VALUE_FREE, e);
  }

  if (records.length === 0) {
    // A framed/ndjson input that yielded no record is a data error, never a silent success.
    return errorResult(
      new CliError(
        CLI_CODES.CLI_PARSE_FAILED,
        EXIT.DATAERR,
        `no ${format === "mllp" ? "MLLP frame" : "record"} found in the input`,
      ),
    );
  }

  const lines: RecordLine[] = [];
  let failed = 0;
  let warnings = 0;
  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i] as Uint8Array;
    try {
      const { model, warnings: ws } = await parseFormat(recordFormat, rec);
      warnings += ws.length;
      lines.push({ record: i, format: recordFormat, model, warnings: ws });
    } catch (e) {
      if (e instanceof CliError) return errorResult(e); // a parser-unavailable is fatal for the stream
      failed += 1;
      // Value-free per-record error: a stable code (if the throw carried one), never the bytes.
      lines.push({
        record: i,
        format: recordFormat,
        error: extractStableCode(e) ?? "CLI_PARSE_FAILED",
      });
    }
  }

  const stdout = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  const exit = failed > 0 ? EXIT.DATAERR : EXIT.OK;
  const stderr = quiet
    ? ""
    : `cosyte: parsed ${String(records.length)} ${recordFormat} record(s)` +
      ` (${String(warnings)} warning(s), ${String(failed)} failed)` +
      (ndjson ? " [ndjson]" : format === "mllp" ? " [mllp]" : "") +
      "\n";
  return { stdout, stderr, exit };
}

/** Split input bytes into non-empty, whitespace-trimmed newline-delimited records (NDJSON input). */
function splitLines(bytes: Uint8Array): Uint8Array[] {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const enc = new TextEncoder();
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => enc.encode(line));
}
