/**
 * `cosyte inspect <file|-> [--format …] [--json] [--quiet] [--no-color]`
 *
 * A human-readable, **value-free-by-default** structural summary of a message: its type, structural
 * counts, and a warning count — the "what shape is this?" answer, without ever printing a field value
 * (cli roadmap §2, §7). Unlike `parse`, whose stdout is the parsed model (the data channel), `inspect`'s
 * stdout is a *structural* summary composed only of counts and structural type **codes** (an HL7 message
 * type like `ADT^A01`, a FHIR `resourceType` like `Patient`, an X12 transaction-set id like `834`, a
 * DICOM SOP Class UID, an NCPDP `NewRx`) — classification, never PHI. `--json` emits the same value-free
 * summary as machine JSON. The per-format summaries are built by the shared registry (`core/parsers.ts`).
 *
 * @packageDocumentation
 */

import { parseArgs } from "node:util";

import { CLI_CODES, CliError, errorResult } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import { resolveInput } from "../core/input.js";
import type { RunDeps } from "../core/io.js";
import { inspectFormat, type InspectSummary } from "../core/parsers.js";
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

/**
 * Run the `inspect` command.
 *
 * @param args - The arguments after the `inspect` subcommand token.
 * @param deps - Injected input readers ({@link RunDeps}).
 * @param posture - The resolved {@link PhiPosture} (governs only the opt-in unsafe excerpt on a
 *   parse-failure diagnostic; the summary itself is always value-free).
 * @returns A {@link RunResult}: the value-free structural summary on `stdout` (human, or JSON under
 *   `--json`), exit `0`; a parse failure is a data error (`65`), an unreadable file `66`, a bad flag `2`.
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

  const resolved = await resolveInput(positionals[0], values.format, deps, "inspect");
  if (!resolved.ok) return resolved.result;
  const { format, bytes } = resolved.input;

  let summary: InspectSummary;
  try {
    summary = await inspectFormat(format, bytes);
  } catch (e) {
    if (e instanceof CliError) return errorResult(e); // e.g. an absent optional parser (69)
    return parseFailureResult(format, bytes, posture, e);
  }

  const stdout = values.json === true ? `${JSON.stringify(summary)}\n` : renderSummary(summary);
  return { stdout, stderr: "", exit: EXIT.OK };
}

/**
 * Render a value-free human structural summary. Only counts and structural type codes — never a value.
 * Exported for direct branch testing of the per-format render (not re-exported from the package root).
 *
 * @param summary - The value-free {@link InspectSummary} to render.
 * @returns The human-readable, value-free summary text.
 * @example
 * ```ts
 * import { renderSummary } from "@cosyte/cli/dist/commands/inspect.js";
 *
 * renderSummary({ format: "mllp", frameCount: 2, warningCount: 0 }).includes("frames"); // => true
 * ```
 */
export function renderSummary(summary: InspectSummary): string {
  const lines: string[] = [];
  const countLines = (label: string, counts: Readonly<Record<string, number>>): void => {
    if (label.length > 0) lines.push(label);
    for (const key of Object.keys(counts).sort()) lines.push(`  ${key}: ${String(counts[key])}`);
  };

  switch (summary.format) {
    case "hl7":
      lines.push(`format:       hl7`);
      lines.push(`message type: ${summary.messageType ?? "(unknown)"}`);
      lines.push(`version:      ${summary.version ?? "(unknown)"}`);
      lines.push(`segments:     ${String(summary.segmentCount)}`);
      countLines("", summary.segments);
      lines.push(`warnings:     ${String(summary.warningCount)}`);
      break;
    case "fhir":
      lines.push(`format:        fhir`);
      lines.push(`resource type: ${summary.resourceType ?? "(unknown)"}`);
      if (summary.entryCount !== undefined) {
        lines.push(`bundle type:   ${summary.bundleType ?? "(unknown)"}`);
        lines.push(`entries:       ${String(summary.entryCount)}`);
        countLines("", summary.entryResourceTypes ?? {});
      }
      lines.push(`issues:        ${String(summary.issueCount)}`);
      break;
    case "x12":
      lines.push(`format:       x12`);
      lines.push(`groups:       ${String(summary.groupCount)}`);
      lines.push(`transactions: ${String(summary.transactionCount)}`);
      countLines("transaction sets:", summary.transactionSetIds);
      lines.push(`segments:     ${String(summary.segmentCount)}`);
      lines.push(`warnings:     ${String(summary.warningCount)}`);
      break;
    case "astm":
      lines.push(`format:       astm`);
      lines.push(`message kind: ${summary.messageKind}`);
      lines.push(`records:      ${String(summary.recordCount)}`);
      countLines("", summary.recordTypes);
      lines.push(`warnings:     ${String(summary.warningCount)}`);
      break;
    case "ccda":
      lines.push(`format:        ccda`);
      lines.push(`document type: ${summary.documentType ?? "(unknown)"}`);
      lines.push(`sections:      ${String(summary.sectionCount)}`);
      if (summary.sectionCodes.length > 0) {
        lines.push(`section codes: ${summary.sectionCodes.join(", ")}`);
      }
      lines.push(`warnings:      ${String(summary.warningCount)}`);
      break;
    case "dicom":
      lines.push(`format:         dicom`);
      lines.push(`sop class uid:  ${summary.sopClassUid ?? "(unknown)"}`);
      lines.push(`transfer syntax:${summary.transferSyntaxUid ?? " (unknown)"}`);
      lines.push(`elements:       ${String(summary.elementCount)}`);
      lines.push(`warnings:       ${String(summary.warningCount)}`);
      break;
    case "ncpdp":
      lines.push(`format:       ncpdp`);
      lines.push(`standard:     SCRIPT`);
      lines.push(`message type: ${summary.messageType ?? "(unknown)"}`);
      lines.push(`version:      ${summary.version ?? "(unknown)"}`);
      lines.push(`warnings:     ${String(summary.warningCount)}`);
      break;
    case "mllp":
      lines.push(`format:  mllp`);
      lines.push(`frames:  ${String(summary.frameCount)}`);
      lines.push(`warnings:${String(summary.warningCount)}`);
      break;
  }
  return lines.join("\n") + "\n";
}
