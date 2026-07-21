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

import type { CosyteFormat } from "../core/format.js";
import { CLI_CODES, CliError, errorResult } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import { resolveInput } from "../core/input.js";
import type { RunDeps } from "../core/io.js";
import { VALUE_FREE, type PhiPosture } from "../core/phi.js";
import type { RunResult } from "../core/result.js";
import { parseFailureResult } from "../core/wrap.js";

// Re-exported from the shared wrapper boundary so the historical `@cosyte/cli` import path stays
// stable; the implementation now lives in `core/wrap.ts` where every command shares it.
export { extractStableCode } from "../core/wrap.js";

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
    return errorResult(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        "invalid arguments to `parse` (see `cosyte parse --help`)",
      ),
    );
  }

  const resolved = await resolveInput(positionals[0], values.format, deps);
  if (!resolved.ok) return resolved.result;
  const { format, bytes } = resolved.input;

  let envelope: ParseEnvelope;
  try {
    envelope = await runParser(format, bytes);
  } catch (e) {
    // A wrapped-parser rejection resolves to a value-free CLI_PARSE_FAILED; the only value-echoing
    // surface in the whole CLI (a bounded excerpt, under --unsafe-show-values) lives in core/wrap.ts.
    return parseFailureResult(format, bytes, posture, e);
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
