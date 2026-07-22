/**
 * `cosyte map-codes <conceptmap|-> --code <code> [--system <uri>] [--version <v>] [--display <d>]
 *   [--json] [--quiet]`
 *
 * Translate a single source coding through a **BYO FHIR R4 ConceptMap** via **`@cosyte/terminology`**
 * (cli roadmap §Phase 4). The positional argument is the ConceptMap document (a file, or `-` for
 * stdin); `--system` + `--code` (and optional `--version`/`--display`) name the source coding to
 * translate. The CLI adds **no** mapping content of its own — `terminology` is content-free and
 * never fabricates a target; the CLI loads the user's map and forwards the translation faithfully.
 *
 * A ConceptMap and a terminology code are **reference data, not PHI** — so the translation result
 * (the matched target coding(s), or the value-free "unmapped" signal) is the user's explicit request
 * and goes to **stdout**. The exit code carries the outcome so it is usable as a gate: **`0`** at
 * least one match · **`1`** no mapping found (the never-fabricate `TERM_TRANSLATE_UNMAPPED` outcome) ·
 * `65` the supplied ConceptMap is not valid JSON / not a loadable ConceptMap · `66` no input · `2`
 * usage. stderr stays value-free (stable codes and counts only).
 *
 * @packageDocumentation
 */

import { parseArgs } from "node:util";

import type { Coding, TranslateResult } from "@cosyte/terminology";

import { CLI_CODES, CliError, errorResult } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import type { RunDeps } from "../core/io.js";
import type { RunResult } from "../core/result.js";
import { extractStableCode } from "../core/wrap.js";

/** The flags `map-codes` understands. */
const MAP_CODES_OPTIONS = {
  code: { type: "string" },
  system: { type: "string" },
  version: { type: "string" },
  display: { type: "string" },
  json: { type: "boolean", default: false },
  quiet: { type: "boolean", default: false },
  "no-color": { type: "boolean", default: false },
} as const;

/**
 * Run the `map-codes` command.
 *
 * @param args - The arguments after the `map-codes` subcommand token.
 * @param deps - Injected input readers ({@link RunDeps}); the positional argument (or `-`) is the BYO
 *   ConceptMap document.
 * @returns A {@link RunResult}: the translation result on `stdout` (matched target coding(s) or the
 *   value-free unmapped signal), a value-free note on `stderr` (unless `--quiet`), and an exit code
 *   carrying the outcome — `0` mapped · `1` unmapped · `65` unloadable ConceptMap · `66` no input ·
 *   `2` usage.
 * @throws Never {@link CliError}; may propagate a truly unexpected error for the dispatcher to map to
 *   `CLI_INTERNAL`.
 * @example
 * ```ts
 * import { mapCodesCommand } from "@cosyte/cli";
 *
 * const cm = JSON.stringify({
 *   resourceType: "ConceptMap",
 *   group: [
 *     {
 *       source: "http://hl7.org/fhir/administrative-gender",
 *       target: "http://terminology.hl7.org/CodeSystem/v2-0001",
 *       element: [{ code: "male", target: [{ code: "M", equivalence: "equivalent" }] }],
 *     },
 *   ],
 * });
 * const deps = {
 *   readFile: async () => new TextEncoder().encode(cm),
 *   readStdin: async () => new Uint8Array(),
 * };
 * const r = await mapCodesCommand(
 *   ["gender.json", "--system", "http://hl7.org/fhir/administrative-gender", "--code", "male"],
 *   deps,
 * );
 * r.exit; // => 0
 * ```
 */
export async function mapCodesCommand(args: string[], deps: RunDeps): Promise<RunResult> {
  let values: {
    code?: string;
    system?: string;
    version?: string;
    display?: string;
    json?: boolean;
    quiet?: boolean;
    "no-color"?: boolean;
  };
  let positionals: string[];
  try {
    const parsed = parseArgs({ args, options: MAP_CODES_OPTIONS, allowPositionals: true });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch {
    return errorResult(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        "invalid arguments to `map-codes` (see `cosyte map-codes --help`)",
      ),
    );
  }

  const source = positionals[0];
  if (source === undefined) {
    return errorResult(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        "missing <conceptmap> argument; pass a FHIR ConceptMap path or `-` to read stdin",
      ),
    );
  }
  if (values.code === undefined) {
    return errorResult(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        "map-codes requires --code (the source code to translate)",
      ),
    );
  }

  // Read the ConceptMap bytes (a missing/unreadable file is a value-free no-input error, 66).
  let bytes: Uint8Array;
  try {
    bytes = source === "-" ? await deps.readStdin() : await deps.readFile(source);
  } catch (e) {
    if (e instanceof CliError) return errorResult(e);
    throw e;
  }
  if (bytes.length === 0) {
    return errorResult(new CliError(CLI_CODES.CLI_EMPTY_INPUT, EXIT.DATAERR, "input is empty"));
  }

  const coding: Coding = {
    code: values.code,
    ...(values.system !== undefined ? { system: values.system } : {}),
    ...(values.version !== undefined ? { version: values.version } : {}),
    ...(values.display !== undefined ? { display: values.display } : {}),
  };

  const outcome = await translateVia(bytes, coding);
  if (!outcome.ok) return outcome.result;
  const { result } = outcome;

  const exit = result.unmapped ? EXIT.INVALID : EXIT.OK;
  const body = { source: coding, result };

  if (values.json === true) {
    return { stdout: `${JSON.stringify(body)}\n`, stderr: "", exit };
  }
  const stderr = values.quiet === true ? "" : renderNote(result);
  return { stdout: `${JSON.stringify(body, null, 2)}\n`, stderr, exit };
}

/** The result of loading + translating: either the translate result, or a ready value-free error. */
type TranslateOutcome =
  | { readonly ok: true; readonly result: TranslateResult }
  | { readonly ok: false; readonly result: RunResult };

/**
 * Load the BYO ConceptMap (lazy-loading `@cosyte/terminology`) and translate the source coding.
 * Malformed JSON and an unloadable ConceptMap both resolve to a value-free `CLI_MAP_INVALID` data
 * error — the map's bytes are never echoed, only the stable terminology-loader code (when the thrown
 * value carried one, e.g. `TERM_CONCEPTMAP_MALFORMED`).
 */
async function translateVia(bytes: Uint8Array, coding: Coding): Promise<TranslateOutcome> {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return mapInvalid("the ConceptMap input is not valid JSON");
  }

  const { loadConceptMap, translate } = await import("@cosyte/terminology");
  let map: ReturnType<typeof loadConceptMap>;
  try {
    map = loadConceptMap(json);
  } catch (e) {
    const code = extractStableCode(e);
    const detail = code === null ? "" : ` (${code})`;
    return mapInvalid(`the supplied ConceptMap could not be loaded${detail}`);
  }
  return { ok: true, result: translate(coding, map) };
}

/** Build a value-free `CLI_MAP_INVALID` (exit `65`) failure outcome. */
function mapInvalid(message: string): TranslateOutcome {
  return {
    ok: false,
    result: errorResult(new CliError(CLI_CODES.CLI_MAP_INVALID, EXIT.DATAERR, message)),
  };
}

/** Render the value-free stderr note: a mapped count, or the stable unmapped code + fallback mode. */
function renderNote(result: TranslateResult): string {
  if (result.unmapped) {
    return `cosyte: map-codes: ${result.code} (fallback mode: ${result.mode})\n`;
  }
  return `cosyte: map-codes: ${String(result.matches.length)} match(es)\n`;
}
