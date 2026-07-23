/**
 * `cosyte validate <file|-> [--format …] [--json] [--quiet] [--no-color]`
 *
 * Parse the input, run the **wrapped parser's own validation/conformance surface**, and let the
 * **exit code carry the verdict** so `cosyte validate` is usable as a CI gate: **`0` valid, `1`
 * invalid** (parseable but non-conformant), `65` unparseable, `66` no input, `2` usage (cli roadmap
 * §4.3, §Phase 3). The load-bearing rule — the CLI never prints a reassuring line and exits `0` on an
 * invalid message.
 *
 * Findings are **value-free**: a stable code, a severity, and a positional locator (a FHIRPath, or an
 * HL7 segment/field index) — never a field value. By default they render on **stderr**; `--json`
 * emits the same value-free verdict + findings as machine JSON on stdout. The CLI invents **no**
 * verdict of its own: FHIR validity is `@cosyte/fhir`'s `validateResource().valid` (plus any
 * error-severity read issue); HL7 validity is "parseable" — its parser is Postel's-Law lenient and its
 * warnings are, by the library's design, non-fatal deviations (surfaced, never failing).
 *
 * @packageDocumentation
 */

import { parseArgs } from "node:util";

import type { CosyteFormat } from "../core/format.js";
import { CLI_CODES, CliError, errorResult } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import { resolveInput } from "../core/input.js";
import type { RunDeps } from "../core/io.js";
import { validateFormat, type Verdict } from "../core/parsers.js";
import { VALUE_FREE, type PhiPosture } from "../core/phi.js";
import type { RunResult } from "../core/result.js";
import { parseFailureResult } from "../core/wrap.js";

/** The flags `validate` understands. */
const VALIDATE_OPTIONS = {
  format: { type: "string" },
  profile: { type: "string" },
  json: { type: "boolean", default: false },
  quiet: { type: "boolean", default: false },
  "no-color": { type: "boolean", default: false },
} as const;

/** Severities that make a resource **invalid** (exit `1`). Warnings/information never fail a verdict. */
const ERROR_SEVERITIES: ReadonlySet<string> = new Set(["error", "fatal"]);

/**
 * Run the `validate` command.
 *
 * @param args - The arguments after the `validate` subcommand token.
 * @param deps - Injected input readers ({@link RunDeps}).
 * @param posture - The resolved {@link PhiPosture} (governs only the opt-in unsafe excerpt on a
 *   parse-failure diagnostic; a validation verdict is always value-free).
 * @returns A {@link RunResult} whose **exit code carries the verdict** (`0` valid / `1` invalid /
 *   `65` unparseable / `66` no input / `2` usage). Value-free findings on `stderr`, or value-free
 *   JSON on stdout under `--json`.
 * @throws Never {@link CliError}; may propagate a truly unexpected error for the dispatcher to map.
 * @example
 * ```ts
 * import { validateCommand } from "@cosyte/cli";
 *
 * const deps = {
 *   readFile: async () => new TextEncoder().encode('{"resourceType":"Patient","gender":"male"}'),
 *   readStdin: async () => new Uint8Array(),
 * };
 * (await validateCommand(["patient.json"], deps)).exit; // => 0
 * ```
 */
export async function validateCommand(
  args: string[],
  deps: RunDeps,
  posture: PhiPosture = VALUE_FREE,
): Promise<RunResult> {
  let values: {
    format?: string;
    profile?: string;
    json?: boolean;
    quiet?: boolean;
    "no-color"?: boolean;
  };
  let positionals: string[];
  try {
    const parsed = parseArgs({ args, options: VALIDATE_OPTIONS, allowPositionals: true });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch {
    return errorResult(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        "invalid arguments to `validate` (see `cosyte validate --help`)",
      ),
    );
  }

  // Profile-based validation is a pass-through to the wrapped library's profile surface, but the CLI
  // bundles no profiles and cannot yet load one — so honouring `--profile` today would either fake a
  // verdict or silently ignore the flag (falsely implying a profile was applied). Both are forbidden
  // (ADR 0018): report a value-free "unavailable" and exit 69, without reading the input.
  if (values.profile !== undefined) {
    return errorResult(
      new CliError(
        CLI_CODES.CLI_NOT_IMPLEMENTED,
        EXIT.UNAVAILABLE,
        "profile-based validation is not yet available — the CLI bundles no profiles and cannot yet " +
          "load one; validating against `--profile` is gated on that surface. Re-run without --profile " +
          "for base validation.",
      ),
    );
  }

  const resolved = await resolveInput(positionals[0], values.format, deps, "validate");
  if (!resolved.ok) return resolved.result;
  const { format, bytes } = resolved.input;

  let verdict: Verdict;
  try {
    verdict = await validateFormat(format, bytes);
  } catch (e) {
    if (e instanceof CliError) return errorResult(e); // e.g. an absent optional parser (69)
    // Unparseable input is a data error (65), NOT an invalid verdict (1): the tool could not run the
    // check at all. Value-free; the opt-in excerpt flows through the single core/wrap chokepoint.
    return parseFailureResult(format, bytes, posture, e);
  }

  const exit = verdict.valid ? EXIT.OK : EXIT.INVALID;

  if (values.json === true) {
    // Machine output on the data channel — value-free (codes/severities/locations only).
    const body = { format, valid: verdict.valid, findings: verdict.findings };
    return { stdout: `${JSON.stringify(body)}\n`, stderr: "", exit };
  }

  if (values.quiet === true) {
    // CI mode: the exit code is the whole signal. No stderr noise.
    return { stdout: "", stderr: "", exit };
  }

  return { stdout: "", stderr: renderReport(format, verdict), exit };
}

/** Render the value-free human report: one line per finding + a verdict summary line. */
function renderReport(format: CosyteFormat, verdict: Verdict): string {
  const lines = verdict.findings.map(
    (f) => `cosyte: validate: ${f.severity} ${f.code} at ${f.location}\n`,
  );
  const errors = verdict.findings.filter((f) => ERROR_SEVERITIES.has(f.severity)).length;
  const others = verdict.findings.length - errors;
  const summary = verdict.valid
    ? `cosyte: validate: ${format} is valid (${String(verdict.findings.length)} finding(s))\n`
    : `cosyte: validate: ${format} is INVALID (${String(errors)} error(s), ${String(others)} other finding(s))\n`;
  return lines.join("") + summary;
}
