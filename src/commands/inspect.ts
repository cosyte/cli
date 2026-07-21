/**
 * `cosyte inspect <file|-> [--format …] [--json] [--quiet] [--no-color]`
 *
 * A human-readable, **value-free-by-default** structural summary of a message: its type, segment /
 * resource counts, and a warning count — the "what shape is this?" answer, without ever printing a
 * field value (cli roadmap §2, §7). Unlike `parse`, whose stdout is the parsed model (the data
 * channel), `inspect`'s stdout is a *structural* summary composed only of counts and structural type
 * codes (an HL7 message type like `ADT^A01`, a FHIR `resourceType` like `Patient`) — classification,
 * never PHI. `--json` emits the same value-free summary as machine JSON.
 *
 * @packageDocumentation
 */

import { parseArgs } from "node:util";

import { CLI_CODES, CliError, errorResult } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import { resolveInput } from "../core/input.js";
import type { RunDeps } from "../core/io.js";
import { VALUE_FREE, type PhiPosture } from "../core/phi.js";
import type { RunResult } from "../core/result.js";
import { parseFailureResult } from "../core/wrap.js";

/** The flags `inspect` understands. */
const INSPECT_OPTIONS = {
  format: { type: "string" },
  json: { type: "boolean", default: false },
  quiet: { type: "boolean", default: false },
  "no-color": { type: "boolean", default: false },
} as const;

/** The value-free structural summary of an HL7 message. */
interface Hl7Summary {
  readonly format: "hl7";
  /** MSH-9 message type code, e.g. `"ADT^A01"` (structural classification, not PHI). `null` if absent. */
  readonly messageType: string | null;
  /** MSH-12 HL7 version, e.g. `"2.5"`. `null` if absent. */
  readonly version: string | null;
  /** Total number of segments. */
  readonly segmentCount: number;
  /** Count of each segment type, e.g. `{ MSH: 1, PID: 1, OBX: 3 }`. */
  readonly segments: Readonly<Record<string, number>>;
  /** Number of value-free parse warnings the parser recovered. */
  readonly warningCount: number;
}

/** The value-free structural summary of a FHIR resource. */
interface FhirSummary {
  readonly format: "fhir";
  /** The resource's `resourceType`, e.g. `"Patient"` or `"Bundle"`. `null` if absent. */
  readonly resourceType: string | null;
  /** `Bundle.type`, only when the resource is a Bundle. */
  readonly bundleType?: string | null;
  /** Number of `Bundle.entry` items, only when the resource is a Bundle. */
  readonly entryCount?: number;
  /** Count of each entry `resourceType`, only when the resource is a Bundle. */
  readonly entryResourceTypes?: Readonly<Record<string, number>>;
  /** Number of value-free read issues gathered during parse. */
  readonly issueCount: number;
}

/** The discriminated structural summary `inspect` renders. */
type InspectSummary = Hl7Summary | FhirSummary;

/**
 * Run the `inspect` command.
 *
 * @param args - The arguments after the `inspect` subcommand token.
 * @param deps - Injected input readers ({@link RunDeps}).
 * @param posture - The resolved {@link PhiPosture} (governs only the opt-in unsafe excerpt on a
 *   parse-failure diagnostic; the summary itself is always value-free).
 * @returns A {@link RunResult}: the value-free structural summary on `stdout` (human, or JSON under
 *   `--json`), exit `0`; a parse failure is a data error (`65`), an unreadable file `66`, a bad flag
 *   `2`.
 * @throws Never {@link CliError}; may propagate a truly unexpected error for the dispatcher to map.
 * @example
 * ```ts
 * import { inspectCommand } from "@cosyte/cli";
 *
 * const deps = {
 *   readFile: async () => new TextEncoder().encode('{"resourceType":"Patient"}'),
 *   readStdin: async () => new Uint8Array(),
 * };
 * (await inspectCommand(["patient.json", "--json"], deps)).exit; // => 0
 * ```
 */
export async function inspectCommand(
  args: string[],
  deps: RunDeps,
  posture: PhiPosture = VALUE_FREE,
): Promise<RunResult> {
  let values: { format?: string; json?: boolean; quiet?: boolean; "no-color"?: boolean };
  let positionals: string[];
  try {
    const parsed = parseArgs({ args, options: INSPECT_OPTIONS, allowPositionals: true });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch {
    return errorResult(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        "invalid arguments to `inspect` (see `cosyte inspect --help`)",
      ),
    );
  }

  const resolved = await resolveInput(positionals[0], values.format, deps);
  if (!resolved.ok) return resolved.result;
  const { format, bytes } = resolved.input;

  let summary: InspectSummary;
  try {
    summary = format === "hl7" ? await inspectHl7(bytes) : await inspectFhir(bytes);
  } catch (e) {
    return parseFailureResult(format, bytes, posture, e);
  }

  const stdout = values.json === true ? `${JSON.stringify(summary)}\n` : renderSummary(summary);
  return { stdout, stderr: "", exit: EXIT.OK };
}

/** Build the value-free HL7 structural summary (segment counts + message type + warning count). */
async function inspectHl7(bytes: Uint8Array): Promise<Hl7Summary> {
  const { parseHL7 } = await import("@cosyte/hl7");
  const msg = parseHL7(Buffer.from(bytes));
  const segments: Record<string, number> = {};
  const all = msg.allSegments();
  for (const seg of all) segments[seg.type] = (segments[seg.type] ?? 0) + 1;
  return {
    format: "hl7",
    messageType: msg.meta.type ?? null,
    version: msg.meta.version ?? null,
    segmentCount: all.length,
    segments,
    warningCount: msg.warnings.length,
  };
}

/** Build the value-free FHIR structural summary (resourceType, Bundle entry counts, issue count). */
async function inspectFhir(bytes: Uint8Array): Promise<FhirSummary> {
  const { parseResource, resourceType, readBundle } = await import("@cosyte/fhir");
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const { resource, issues } = parseResource(text);
  const rt = resourceType(resource) ?? null;
  if (rt === "Bundle") {
    const bundle = readBundle(resource);
    const entryResourceTypes: Record<string, number> = {};
    for (const e of bundle.entries) {
      const t = e.resourceType ?? "(none)";
      entryResourceTypes[t] = (entryResourceTypes[t] ?? 0) + 1;
    }
    return {
      format: "fhir",
      resourceType: rt,
      bundleType: bundle.type ?? null,
      entryCount: bundle.entries.length,
      entryResourceTypes,
      issueCount: issues.length,
    };
  }
  return { format: "fhir", resourceType: rt, issueCount: issues.length };
}

/** Render a value-free human structural summary. Only counts and structural type codes — never a value. */
function renderSummary(summary: InspectSummary): string {
  const lines: string[] = [];
  if (summary.format === "hl7") {
    lines.push(`format:       hl7`);
    lines.push(`message type: ${summary.messageType ?? "(unknown)"}`);
    lines.push(`version:      ${summary.version ?? "(unknown)"}`);
    lines.push(`segments:     ${String(summary.segmentCount)}`);
    for (const type of Object.keys(summary.segments).sort()) {
      lines.push(`  ${type}: ${String(summary.segments[type])}`);
    }
    lines.push(`warnings:     ${String(summary.warningCount)}`);
  } else {
    lines.push(`format:        fhir`);
    lines.push(`resource type: ${summary.resourceType ?? "(unknown)"}`);
    if (summary.entryCount !== undefined) {
      lines.push(`bundle type:   ${summary.bundleType ?? "(unknown)"}`);
      lines.push(`entries:       ${String(summary.entryCount)}`);
      const types = summary.entryResourceTypes ?? {};
      for (const type of Object.keys(types).sort()) {
        lines.push(`  ${type}: ${String(types[type])}`);
      }
    }
    lines.push(`issues:        ${String(summary.issueCount)}`);
  }
  return lines.join("\n") + "\n";
}
