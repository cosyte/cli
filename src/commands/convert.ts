/**
 * `cosyte convert <file|-> --to fhir [--json] [--quiet] [--no-color]`
 *
 * Convert an **HL7 v2** message to **FHIR R4** via **`@cosyte/transform`** — the consumer-of-consumers
 * command (cli roadmap §Phase 4). The CLI adds **no** mapping logic of its own: it parses the input
 * with `@cosyte/hl7`, hands the parsed message to `transform`'s `toFhir`, and serializes the resulting
 * FHIR `Bundle` with `@cosyte/fhir`. The mapping guarantees are the library's, graded by *its* gate;
 * `cosyte convert` equals `transform`'s programmatic output.
 *
 * The converted FHIR `Bundle` is the user's explicit request, so it goes to **stdout** (the data
 * channel). Every conversion problem is one of `transform`'s value-free {@link TransformIssue}s — a
 * stable code, a severity, and a positional locator (a v2 index and an optional FHIRPath), **never** a
 * field value — surfaced on stderr (or as value-free JSON under `--json`). The load-bearing rule
 * (mirroring `validate`): a conversion that produces an **error-severity** issue exits **`1`**, never
 * `0` — the tool worked, but the conversion has a real problem a CI gate must see.
 *
 * `--to fhir` is required and is the only supported target (HL7 v2 → FHIR R4). The source must be
 * HL7 v2: a recognised-but-non-HL7 input (e.g. a FHIR document) is a value-free
 * `CLI_FORMAT_UNSUPPORTED` data error (`65`), never a fake conversion.
 *
 * @packageDocumentation
 */

import { parseArgs } from "node:util";

import { CLI_CODES, CliError, errorResult } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import type { Finding } from "../core/findings.js";
import { resolveInput } from "../core/input.js";
import type { RunDeps } from "../core/io.js";
import { VALUE_FREE, type PhiPosture } from "../core/phi.js";
import type { RunResult } from "../core/result.js";
import { parseFailureResult } from "../core/wrap.js";

/** The flags `convert` understands. */
const CONVERT_OPTIONS = {
  to: { type: "string" },
  format: { type: "string" },
  json: { type: "boolean", default: false },
  quiet: { type: "boolean", default: false },
  "no-color": { type: "boolean", default: false },
} as const;

/** The only conversion target this build supports (HL7 v2 → FHIR R4). */
const SUPPORTED_TARGET = "fhir";

/** Transform severities that make a conversion a **failure** (exit `1`). `transform` has no `fatal`. */
const ERROR_SEVERITIES: ReadonlySet<string> = new Set(["error", "fatal"]);

/** The value-free result of a conversion: the serialized FHIR bundle text + the library's findings. */
interface Conversion {
  readonly bundleText: string;
  readonly findings: readonly Finding[];
}

/**
 * Run the `convert` command.
 *
 * @param args - The arguments after the `convert` subcommand token.
 * @param deps - Injected input readers ({@link RunDeps}).
 * @param posture - The resolved {@link PhiPosture} (governs only the opt-in unsafe excerpt on an HL7
 *   parse-failure diagnostic; the converted bundle and the value-free findings are unaffected).
 * @returns A {@link RunResult}: the converted FHIR `Bundle` on `stdout` (the data channel), value-free
 *   findings on `stderr` (or JSON under `--json`), and an exit code that carries the outcome — `0`
 *   clean · `1` an error-severity conversion issue · `65` the HL7 input could not be parsed or is not
 *   an HL7 v2 source · `66` no input · `2` usage.
 * @throws Never {@link CliError}; may propagate a truly unexpected error for the dispatcher to map to
 *   `CLI_INTERNAL`.
 * @example
 * ```ts
 * import { convertCommand } from "@cosyte/cli";
 *
 * const deps = {
 *   readFile: async () => new TextEncoder().encode("MSH|^~\\&|A|B|C|D|20240101||ADT^A01|1|P|2.5\r"),
 *   readStdin: async () => new Uint8Array(),
 * };
 * (await convertCommand(["adt.hl7", "--to", "fhir"], deps)).exit; // => 0
 * ```
 */
export async function convertCommand(
  args: string[],
  deps: RunDeps,
  posture: PhiPosture = VALUE_FREE,
): Promise<RunResult> {
  let values: {
    to?: string;
    format?: string;
    json?: boolean;
    quiet?: boolean;
    "no-color"?: boolean;
  };
  let positionals: string[];
  try {
    const parsed = parseArgs({ args, options: CONVERT_OPTIONS, allowPositionals: true });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch {
    return errorResult(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        "invalid arguments to `convert` (see `cosyte convert --help`)",
      ),
    );
  }

  // `--to` is required and names the conversion target. Only `fhir` is supported today; requiring it
  // (rather than defaulting) keeps the surface explicit and future-proof for other targets.
  if (values.to === undefined) {
    return errorResult(
      new CliError(CLI_CODES.CLI_USAGE, EXIT.USAGE, "convert requires --to fhir (the only target)"),
    );
  }
  if (values.to !== SUPPORTED_TARGET) {
    return errorResult(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        `unsupported --to '${values.to}'; only --to fhir is supported (HL7 v2 → FHIR R4)`,
      ),
    );
  }

  const resolved = await resolveInput(positionals[0], values.format, deps, "parse");
  if (!resolved.ok) return resolved.result;
  const { format, bytes } = resolved.input;

  // convert reads HL7 v2 and writes FHIR R4. A recognised-but-non-HL7 source (e.g. a FHIR document) is
  // not a convertible input — a value-free data error, never a fake or identity "conversion".
  if (format !== "hl7") {
    return errorResult(
      new CliError(
        CLI_CODES.CLI_FORMAT_UNSUPPORTED,
        EXIT.DATAERR,
        `convert reads HL7 v2 and writes FHIR R4; the input is '${format}', not an HL7 v2 source`,
      ),
    );
  }

  const outcome = await runConvert(bytes, posture);
  if (!outcome.ok) return outcome.result;
  const conversion = outcome.conversion;

  const { hasError, report } = convertOutcome(conversion.findings);
  const exit = hasError ? EXIT.INVALID : EXIT.OK;

  if (values.json === true) {
    // Machine output on the data channel: the converted bundle plus the value-free findings.
    const body = {
      format: SUPPORTED_TARGET,
      bundle: JSON.parse(conversion.bundleText) as unknown,
      findings: conversion.findings,
    };
    return { stdout: `${JSON.stringify(body)}\n`, stderr: "", exit };
  }

  // Default: the converted FHIR Bundle (the library's canonical serialization) IS the stdout data
  // channel; the value-free findings + a summary go to stderr unless suppressed by --quiet.
  const stderr = values.quiet === true ? "" : report;
  return { stdout: `${conversion.bundleText}\n`, stderr, exit };
}

/** Either a completed conversion, or a ready value-free parse-failure {@link RunResult}. */
type ConvertOutcome =
  | { readonly ok: true; readonly conversion: Conversion }
  | { readonly ok: false; readonly result: RunResult };

/**
 * Parse the HL7 v2 bytes and convert to FHIR — every library **lazy-loaded** so this code loads only
 * when `convert` runs. Only the `parseHL7` call is inside the failure boundary: a genuine parser
 * rejection becomes a value-free `CLI_PARSE_FAILED` (65), with the single opt-in excerpt (under
 * `--unsafe-show-values`) flowing through the shared core/wrap chokepoint. The `toFhir` + serialize
 * step is deliberately outside it — `toFhir` never throws for a well-formed message, so any throw there
 * is an unexpected bug the dispatcher maps to `CLI_INTERNAL` (70), never mislabelled as a rejection.
 */
async function runConvert(bytes: Uint8Array, posture: PhiPosture): Promise<ConvertOutcome> {
  const [{ parseHL7 }, { toFhir }, { serializeResource }] = await Promise.all([
    import("@cosyte/hl7"),
    import("@cosyte/transform"),
    import("@cosyte/fhir"),
  ]);

  let msg: ReturnType<typeof parseHL7>;
  try {
    msg = parseHL7(Buffer.from(bytes));
  } catch (e) {
    return { ok: false, result: parseFailureResult("hl7", bytes, posture, e) };
  }

  const { bundle, issues } = toFhir(msg);
  return {
    ok: true,
    conversion: {
      bundleText: serializeResource(bundle),
      findings: issues.map((i) => toFinding(i.code, i.severity, i.v2Location, i.fhirPath)),
    },
  };
}

/** Build one value-free {@link Finding} from a transform issue: v2 locator, and the FHIRPath if any. */
function toFinding(code: string, severity: string, v2Location: string, fhirPath?: string): Finding {
  const location = fhirPath !== undefined ? `${v2Location} → ${fhirPath}` : v2Location;
  return { code, severity, location };
}

/**
 * Decide the conversion outcome from the library's value-free findings: whether any is
 * **error-severity** (which drives a non-zero exit — the load-bearing "a conversion error is never
 * exit 0" rule, cli roadmap §Phase 4) and the value-free human report. The severity classification is
 * the library's — `@cosyte/transform` fixes each issue's severity; the CLI only reads it. Exported so
 * the exit-verdict and report logic is unit-testable with synthetic findings, independent of which HL7
 * message happens to produce an error.
 *
 * @param findings - The value-free {@link Finding}s the conversion produced.
 * @returns `hasError` (true iff any finding is error/fatal severity) and the rendered value-free
 *   `report` (one line per finding + a summary line).
 * @example
 * ```ts
 * import { convertOutcome } from "@cosyte/cli";
 *
 * convertOutcome([{ code: "TRANSFORM_RESOURCE_INVALID", severity: "error", location: "PID" }])
 *   .hasError; // => true
 * convertOutcome([{ code: "TRANSFORM_ELEMENT_DROPPED", severity: "information", location: "PID.13" }])
 *   .hasError; // => false
 * ```
 */
export function convertOutcome(findings: readonly Finding[]): {
  readonly hasError: boolean;
  readonly report: string;
} {
  const lines = findings.map((f) => `cosyte: convert: ${f.severity} ${f.code} at ${f.location}\n`);
  const errors = findings.filter((f) => ERROR_SEVERITIES.has(f.severity)).length;
  const others = findings.length - errors;
  const summary =
    errors > 0
      ? `cosyte: convert: hl7 → fhir produced ${String(errors)} error(s), ${String(others)} other finding(s)\n`
      : `cosyte: convert: hl7 → fhir OK (${String(findings.length)} finding(s))\n`;
  return { hasError: errors > 0, report: lines.join("") + summary };
}
