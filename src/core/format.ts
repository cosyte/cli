/**
 * **Content-based format autodetection** — the feature that makes `cosyte parse <file>` feel magic,
 * and the one that must **fail safe**. Detection sniffs the leading bytes' *content*, never the file
 * extension: a `.txt` full of `MSH|^~\&…` is HL7; a `.json` with a `resourceType` is FHIR.
 *
 * The hazard is a wrong sniff routing bytes to the wrong parser and yielding confident garbage. So
 * detection is **conservative**: a single confident signature match parses; **zero or more than one**
 * match is *not* a guess — it is a typed `none`/`ambiguous` result the caller turns into a data-error
 * exit asking for `--format`. This is the parsers' "never a confident wrong value" rule at the routing
 * layer (cli roadmap §3).
 *
 * Phase 1 wires signatures for the two deepest parsers, **hl7** and **fhir**; the remaining formats'
 * signatures land as their wiring does. Because the signatures are disjoint by construction, a
 * genuine `ambiguous` cannot occur yet — the branch exists so a future overlapping signature is a
 * *detected* ambiguity, never a silent mis-route.
 *
 * @packageDocumentation
 */

import { CLI_CODES, CliError } from "./diagnostics.js";
import { EXIT } from "./exit-codes.js";

/**
 * The set of formats the `cosyte` command names. Detection currently recognises **hl7** and **fhir**;
 * the others are accepted by `--format` but reported as not-yet-wired (never faked) until their phase.
 */
export type CosyteFormat = "hl7" | "fhir" | "dicom" | "x12" | "ccda" | "ncpdp" | "astm";

/**
 * How confident autodetection is:
 * - `certain` — exactly one signature matched (`format` names it);
 * - `ambiguous` — more than one matched (`format` is `null`; `candidates` names them);
 * - `none` — nothing matched (`format` is `null`; `candidates` is empty).
 *
 * This refines the roadmap's `{ format; confidence }` sketch: `format` is `null` unless `confidence`
 * is `certain`, so a non-certain result can never be mistaken for a routable format.
 */
export interface DetectResult {
  /** The detected format, or `null` when `confidence` is not `certain`. */
  readonly format: CosyteFormat | null;
  /** The detection confidence. */
  readonly confidence: "certain" | "ambiguous" | "none";
  /** The matching candidate formats (0 for `none`, 1 for `certain`, ≥2 for `ambiguous`). Value-free. */
  readonly candidates: readonly CosyteFormat[];
}

/** A single format signature: a value-free predicate over the input's decoded prefix + raw bytes. */
interface Signature {
  readonly format: CosyteFormat;
  readonly match: (prefix: string, bytes: Uint8Array) => boolean;
}

/** How many leading bytes to decode for text sniffing. Small — signatures live in the first line. */
const SNIFF_BYTES = 512;

/** Strip a leading UTF-8 BOM and any leading ASCII whitespace/control bytes for a tolerant sniff. */
function leadingText(bytes: Uint8Array): string {
  const slice = bytes.subarray(0, SNIFF_BYTES);
  let text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

/**
 * HL7 v2: the message begins with an `MSH` segment whose 4th character is the field separator
 * (conventionally `|`) followed by the encoding characters. Tolerates leading whitespace and MLLP
 * `0x0B` framing. Conservative: requires `MSH` + a non-alphanumeric single-char field separator.
 */
function looksLikeHl7(prefix: string): boolean {
  const s = prefix.replace(/^\s+/, "");
  if (!s.startsWith("MSH")) return false;
  const ch = s[3];
  if (ch === undefined) return false; // "MSH" with no following field separator
  // A field separator is a single printable non-alphanumeric byte (e.g. "|"). Reject letters/digits.
  const code = ch.charCodeAt(0);
  return code > 0x20 && code < 0x7f && !/[A-Za-z0-9]/.test(ch);
}

/**
 * FHIR: a JSON object whose first non-whitespace byte is `{` and which declares a string-valued
 * top-level `resourceType` member near the top. Conservative: both the object framing and the
 * `resourceType` key must be present, so a bare JSON object without it is not claimed as FHIR.
 */
function looksLikeFhir(prefix: string): boolean {
  const s = prefix.replace(/^\s+/, "");
  if (!s.startsWith("{")) return false;
  return /"resourceType"\s*:\s*"/.test(s);
}

/** The signature registry. Disjoint by construction in Phase 1 (HL7 starts `MSH`, FHIR starts `{`). */
const SIGNATURES: readonly Signature[] = [
  { format: "hl7", match: (prefix) => looksLikeHl7(prefix) },
  { format: "fhir", match: (prefix) => looksLikeFhir(prefix) },
];

/**
 * Detect the healthcare format of `bytes` by content, conservatively.
 *
 * @param bytes - The input bytes (a whole file or a stdin buffer). Only the leading prefix is sniffed.
 * @returns A {@link DetectResult}: `certain` + a `format` on a single match, else `ambiguous`/`none`
 *   with `format: null` and the value-free `candidates` list. **Never guesses.**
 * @example
 * ```ts
 * import { detectFormat } from "@cosyte/cli";
 *
 * const enc = new TextEncoder();
 * detectFormat(enc.encode("MSH|^~\\&|A|B\r")).format;            // => "hl7"
 * detectFormat(enc.encode('{"resourceType":"Patient"}')).format; // => "fhir"
 * detectFormat(enc.encode("hello")).confidence;                  // => "none"
 * ```
 */
export function detectFormat(bytes: Uint8Array): DetectResult {
  if (bytes.length === 0) return classifyCandidates([]);
  const prefix = leadingText(bytes);
  const candidates = SIGNATURES.filter((sig) => sig.match(prefix, bytes)).map((sig) => sig.format);
  return classifyCandidates(candidates);
}

/**
 * Classify a list of matched candidate formats into a {@link DetectResult}: exactly one → `certain`,
 * zero → `none`, two-or-more → `ambiguous` (all with `format` `null` unless certain). Split out and
 * exported so the **ambiguity** contract is directly testable — it is otherwise unreachable while
 * every signature is disjoint (Phase 1), and it must stay a *detected* ambiguity, never a mis-route.
 *
 * @param candidates - The formats whose signatures matched the input.
 * @returns The classified {@link DetectResult}.
 * @example
 * ```ts
 * import { classifyCandidates } from "@cosyte/cli";
 *
 * classifyCandidates(["hl7"]).confidence; // => "certain"
 * classifyCandidates([]).confidence; // => "none"
 * classifyCandidates(["hl7", "fhir"]).confidence; // => "ambiguous"
 * ```
 */
export function classifyCandidates(candidates: readonly CosyteFormat[]): DetectResult {
  const [first, second] = candidates;
  if (second !== undefined) return { format: null, confidence: "ambiguous", candidates };
  if (first !== undefined) return { format: first, confidence: "certain", candidates };
  return { format: null, confidence: "none", candidates: [] };
}

/**
 * Build the value-free {@link CliError} for a **non-certain** detection — the data error the caller
 * returns instead of guessing a parser. `ambiguous` names the matching candidates (a value-free code
 * list); `none` asks for `--format`. Both map to the data-error exit (`65`). Never echoes input bytes.
 *
 * @param detected - A {@link DetectResult} whose `format` is `null` (i.e. not `certain`).
 * @returns A value-free `CLI_FORMAT_AMBIGUOUS` or `CLI_FORMAT_UNDETECTED` error.
 * @example
 * ```ts
 * import { classifyCandidates, detectionError } from "@cosyte/cli";
 *
 * detectionError(classifyCandidates([])).code; // => "CLI_FORMAT_UNDETECTED"
 * detectionError(classifyCandidates(["hl7", "fhir"])).code; // => "CLI_FORMAT_AMBIGUOUS"
 * ```
 */
export function detectionError(detected: DetectResult): CliError {
  if (detected.confidence === "ambiguous") {
    return new CliError(
      CLI_CODES.CLI_FORMAT_AMBIGUOUS,
      EXIT.DATAERR,
      `input matched multiple formats (${detected.candidates.join(", ")}); disambiguate with --format`,
    );
  }
  return new CliError(
    CLI_CODES.CLI_FORMAT_UNDETECTED,
    EXIT.DATAERR,
    "could not detect the input format; re-run with --format (wired: hl7, fhir)",
  );
}

/** The formats this CLI build actually wires to a parser. `--format` values outside this set, and any
 * future detected format not in it, produce a value-free `CLI_FORMAT_UNSUPPORTED` — never a fake parse. */
export const WIRED_FORMATS: ReadonlySet<CosyteFormat> = new Set<CosyteFormat>(["hl7", "fhir"]);

/** The full set of format names `--format` accepts as syntactically valid (a bad value is a usage error). */
export const KNOWN_FORMATS: readonly CosyteFormat[] = [
  "hl7",
  "fhir",
  "dicom",
  "x12",
  "ccda",
  "ncpdp",
  "astm",
];

/**
 * Narrow an arbitrary `--format` string to a {@link CosyteFormat}, or `null` if it is not a known
 * format name (which the caller turns into a usage error, exit `2`).
 *
 * @param value - The raw `--format` argument.
 * @returns The narrowed format, or `null`.
 * @example
 * ```ts
 * import { asCosyteFormat } from "@cosyte/cli";
 *
 * asCosyteFormat("hl7"); // => "hl7"
 * asCosyteFormat("nope"); // => null
 * ```
 */
export function asCosyteFormat(value: string): CosyteFormat | null {
  return (KNOWN_FORMATS as readonly string[]).includes(value) ? (value as CosyteFormat) : null;
}
