/**
 * `cosyte parse <file|-> [--format …] [--json] [--quiet] [--no-color]`
 *
 * Read a file (or stdin via `-`), **autodetect the format by content** (or honour `--format`), route
 * to the wrapped parser — **lazy-loaded** so `cosyte parse msg.hl7` never loads the FHIR code and vice
 * versa — and emit the parsed model as **typed JSON on stdout**. Every failure is a value-free
 * diagnostic on stderr with a stable `CLI_*` code and the documented exit code (cli roadmap §4.3, §7).
 *
 * The CLI adds **no** parsing of its own: it routes, reads, and shapes output; the format guarantees
 * are the wrapped library's, graded by *its* gate. `cosyte parse` equals the library's programmatic
 * parse.
 *
 * @packageDocumentation
 */

import { parseArgs } from "node:util";

import {
  asCosyteFormat,
  detectFormat,
  detectionError,
  WIRED_FORMATS,
  type CosyteFormat,
} from "../core/format.js";
import { CLI_CODES, CliError } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import type { RunDeps } from "../core/io.js";
import { unsafeInputSuffix, VALUE_FREE, type PhiPosture } from "../core/phi.js";
import type { RunResult } from "../core/result.js";

/** A value-free warning entry in the parse envelope — a stable code plus structural position only. */
interface ParseWarning {
  readonly code: string;
  readonly [key: string]: unknown;
}

/** The typed JSON envelope `parse` emits on stdout: the format, the parsed model, and its warnings. */
interface ParseEnvelope {
  readonly format: CosyteFormat;
  readonly model: unknown;
  readonly warnings: readonly ParseWarning[];
}

/** The flags `parse` understands, parsed by {@link parseArgs}. */
const PARSE_OPTIONS = {
  format: { type: "string" },
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
 *   `--unsafe-show-values` a bounded excerpt of the offending input is appended to a
 *   `CLI_PARSE_FAILED` diagnostic (the single, opt-in value-echoing surface).
 * @returns A {@link RunResult}: the typed-JSON model on `stdout`, a value-free note (or nothing) on
 *   `stderr`, and the resolved exit code. Never throws a {@link CliError} — it resolves it to a
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
 * const result = await parseCommand(["patient.json"], deps);
 * result.exit; // => 0
 * ```
 */
export async function parseCommand(
  args: string[],
  deps: RunDeps,
  posture: PhiPosture = VALUE_FREE,
): Promise<RunResult> {
  let values: { format?: string; json?: boolean; quiet?: boolean; "no-color"?: boolean };
  let positionals: string[];
  try {
    const parsed = parseArgs({ args, options: PARSE_OPTIONS, allowPositionals: true });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch {
    return err(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        "invalid arguments to `parse` (see `cosyte parse --help`)",
      ),
    );
  }

  const source = positionals[0];
  if (source === undefined) {
    return err(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        "missing <file> argument; pass a path or `-` to read stdin",
      ),
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = source === "-" ? await deps.readStdin() : await deps.readFile(source);
  } catch (e) {
    if (e instanceof CliError) return err(e);
    throw e;
  }

  if (bytes.length === 0) {
    return err(new CliError(CLI_CODES.CLI_EMPTY_INPUT, EXIT.DATAERR, "input is empty"));
  }

  // Resolve the format: an explicit --format override (validated), else content autodetection.
  let format: CosyteFormat;
  if (values.format !== undefined) {
    const narrowed = asCosyteFormat(values.format);
    if (narrowed === null) {
      return err(
        new CliError(
          CLI_CODES.CLI_USAGE,
          EXIT.USAGE,
          `unknown --format value; expected one of hl7, fhir, dicom, x12, ccda, ncpdp, astm`,
        ),
      );
    }
    format = narrowed;
  } else {
    const detected = detectFormat(bytes);
    // `format` is non-null iff detection is `certain`; `none`/`ambiguous` become a value-free data error.
    if (detected.format === null) return err(detectionError(detected));
    format = detected.format;
  }

  if (!WIRED_FORMATS.has(format)) {
    return err(
      new CliError(
        CLI_CODES.CLI_FORMAT_UNSUPPORTED,
        EXIT.DATAERR,
        `format '${format}' is recognised but not yet wired in this CLI build (wired: hl7, fhir)`,
      ),
    );
  }

  let envelope: ParseEnvelope;
  try {
    envelope = await runParser(format, bytes);
  } catch (e) {
    // The value-free diagnostic is built from a stable code only. The **single** value-echoing
    // surface in the whole CLI — a bounded excerpt of the offending input — is appended here, and
    // only when `--unsafe-show-values` is set (empty string otherwise); see core/phi.ts.
    const base = parseFailure(format, e);
    const suffix = unsafeInputSuffix(bytes, posture);
    return {
      stdout: "",
      stderr: `cosyte: ${base.code}: ${base.message}${suffix}\n`,
      exit: base.exit,
    };
  }

  const stdout =
    (values.json === true ? JSON.stringify(envelope) : JSON.stringify(envelope, null, 2)) + "\n";

  // Success stderr is value-free: a warning COUNT only (the warnings themselves, with their codes and
  // positions, live in the stdout envelope). Suppressed by --quiet.
  const n = envelope.warnings.length;
  const stderr =
    n > 0 && values.quiet !== true
      ? `cosyte: parsed ${format} with ${String(n)} warning(s) (see .warnings in output)\n`
      : "";

  return { stdout, stderr, exit: EXIT.OK };
}

/** Route to the lazily-imported parser for `format` and build the value-free envelope. */
async function runParser(format: CosyteFormat, bytes: Uint8Array): Promise<ParseEnvelope> {
  if (format === "hl7") {
    const { parseHL7 } = await import("@cosyte/hl7");
    const msg = parseHL7(Buffer.from(bytes));
    return {
      format,
      model: msg.toJSON(),
      warnings: msg.warnings.map((w) => ({ code: w.code, position: w.position })),
    };
  }
  // fhir
  const { parseResource, serializeResource } = await import("@cosyte/fhir");
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const { resource, issues } = parseResource(text);
  const model: unknown = JSON.parse(serializeResource(resource));
  return {
    format,
    model,
    warnings: issues.map((i) => ({
      code: i.code,
      severity: i.severity,
      expression: i.expression,
    })),
  };
}

/** Map a thrown parser error to a value-free `CLI_PARSE_FAILED`. Only a stable code token — never the
 * error's message, which could embed input bytes — is surfaced. */
function parseFailure(format: CosyteFormat, e: unknown): CliError {
  const code = extractStableCode(e);
  const detail = code === null ? "" : ` (${code})`;
  return new CliError(
    CLI_CODES.CLI_PARSE_FAILED,
    EXIT.DATAERR,
    `the ${format} parser rejected the input${detail}`,
  );
}

/**
 * Pull a `code` off a thrown value **only** when it is a PHI-free constant token
 * (`^[A-Z][A-Z0-9_]*$` — a letter-led UPPER_SNAKE code like `MALFORMED_JSON`) — e.g. a wrapped
 * parser's stable fatal code. Anything else (no `code`, a non-string, a non-token, or a **pure-digit**
 * value that could be a raw identifier) yields `null`, so a parser exception that embedded input bytes
 * in a `code`-shaped field can never reach a diagnostic. Exported for direct branch testing.
 *
 * @param e - A caught value.
 * @returns The stable code token, or `null`.
 * @example
 * ```ts
 * import { extractStableCode } from "@cosyte/cli";
 *
 * extractStableCode({ code: "MALFORMED_JSON" }); // => "MALFORMED_JSON"
 * extractStableCode(new Error("boom")); // => null
 * ```
 */
export function extractStableCode(e: unknown): string | null {
  if (typeof e === "object" && e !== null && "code" in e) {
    const raw: unknown = e.code;
    if (typeof raw === "string" && /^[A-Z][A-Z0-9_]*$/.test(raw)) return raw;
  }
  return null;
}

/** Resolve a {@link CliError} into a value-free {@link RunResult} (empty stdout, diagnostic on stderr). */
function err(e: CliError): RunResult {
  return { stdout: "", stderr: `cosyte: ${e.code}: ${e.message}\n`, exit: e.exit };
}
