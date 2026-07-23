/**
 * `cosyte fmt <file|-> [--format …] [--quiet] [--no-color]`
 *
 * **Canonical re-serialization.** Parse the input and emit it back through the wrapped library's
 * **conservative, spec-clean serializer** — HL7 via `Hl7Message.toString()` (CR-separated, spec-clean
 * HL7), FHIR via `serializeResource` (canonical JSON, decimals byte-exact). The CLI **never
 * re-canonicalizes on its own** (cli roadmap §5): the output is exactly the wrapped serializer's, so
 * `fmt` round-trips a spec-clean input through the parser.
 *
 * `fmt`'s stdout **is** the data channel — a re-serialization of the message, values included, going to
 * the sink the user chose. Every *secondary* surface stays value-free: a warning-count note on stderr
 * (suppressible with `--quiet`), and an unparseable input is a data error (`65`) with **no partial
 * emit** — never a half-serialized message.
 *
 * @packageDocumentation
 */

import { parseArgs } from "node:util";

import { CLI_CODES, CliError, errorResult } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import { resolveInput } from "../core/input.js";
import type { RunDeps } from "../core/io.js";
import { fmtFormat, type FmtResult } from "../core/parsers.js";
import { VALUE_FREE, type PhiPosture } from "../core/phi.js";
import type { RunResult } from "../core/result.js";
import { parseFailureResult } from "../core/wrap.js";

/** The flags `fmt` understands. `fmt`'s output shape is the library serializer's, so there is no `--json`. */
const FMT_OPTIONS = {
  format: { type: "string" },
  quiet: { type: "boolean", default: false },
  "no-color": { type: "boolean", default: false },
} as const;

/**
 * Run the `fmt` command.
 *
 * @param args - The arguments after the `fmt` subcommand token.
 * @param deps - Injected input readers ({@link RunDeps}).
 * @param posture - The resolved {@link PhiPosture} (governs only the opt-in unsafe excerpt on a
 *   parse-failure diagnostic).
 * @returns A {@link RunResult}: the canonical re-serialization on `stdout` (exit `0`), a value-free
 *   warning-count note on `stderr` unless `--quiet`; an unparseable input is a data error (`65`) with
 *   no partial emit, an unreadable file `66`, a bad flag `2`.
 * @throws Never {@link CliError}; may propagate a truly unexpected error for the dispatcher to map.
 * @example
 * ```ts
 * import { fmtCommand } from "@cosyte/cli";
 *
 * const deps = {
 *   readFile: async () => new TextEncoder().encode('{ "resourceType":"Patient" , "id":"x" }'),
 *   readStdin: async () => new Uint8Array(),
 * };
 * (await fmtCommand(["patient.json"], deps)).exit; // => 0
 * ```
 */
export async function fmtCommand(
  args: string[],
  deps: RunDeps,
  posture: PhiPosture = VALUE_FREE,
): Promise<RunResult> {
  let values: { format?: string; quiet?: boolean; "no-color"?: boolean };
  let positionals: string[];
  try {
    const parsed = parseArgs({ args, options: FMT_OPTIONS, allowPositionals: true });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch {
    return errorResult(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        "invalid arguments to `fmt` (see `cosyte fmt --help`)",
      ),
    );
  }

  const resolved = await resolveInput(positionals[0], values.format, deps, "fmt");
  if (!resolved.ok) return resolved.result;
  const { format, bytes } = resolved.input;

  let result: FmtResult;
  try {
    result = await fmtFormat(format, bytes);
  } catch (e) {
    if (e instanceof CliError) return errorResult(e); // e.g. an absent optional parser (69)
    // No partial emit: an unparseable input yields a value-free data error, never half a message.
    return parseFailureResult(format, bytes, posture, e);
  }

  const stderr =
    result.warningCount > 0 && values.quiet !== true
      ? `cosyte: fmt: re-serialized ${format} with ${String(result.warningCount)} parse warning(s)\n`
      : "";
  return { stdout: `${result.output}\n`, stderr, exit: EXIT.OK };
}
