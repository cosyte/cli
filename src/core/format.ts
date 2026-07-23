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
 * All eight cosyte formats now carry a signature (CLI-6): **hl7** (`MSH` + field separator), **mllp**
 * (a leading `0x0B` VT frame byte — an MLLP-framed stream, de-framed to its enclosed HL7), **fhir** (a
 * JSON object declaring `resourceType`), **x12** (a leading `ISA` interchange header), **astm** (a
 * leading `H` record whose second byte is the field delimiter), **ccda** (a `<ClinicalDocument>` root),
 * **ncpdp** (a `<Message>` root in the NCPDP SCRIPT namespace), and **dicom** (the `DICM` magic at byte
 * 128). The signatures are **conservative and, on realistic inputs, mutually exclusive** — the
 * distinctive-lead formats (`MSH`, `ISA`, `H`+delimiter, `<ClinicalDocument>`, `<Message>`+ncpdp, the
 * `DICM` magic, `0x0B` VT, `{…"resourceType"`) don't overlap on a real message of any one type. They
 * are **not** disjoint in the absolute sense — a pathological input could satisfy two (an MLLP frame
 * enclosing a `<ClinicalDocument>` payload matches both `mllp` and `ccda`; a text file whose byte 128
 * is `DICM` matches both) — which is exactly why the **`ambiguous` branch is load-bearing, not dead
 * code**: any co-match is a *detected* ambiguity (a value-free data error asking for `--format`),
 * **never a silent mis-route**.
 *
 * @packageDocumentation
 */

import { CLI_CODES, CliError } from "./diagnostics.js";
import { EXIT } from "./exit-codes.js";

/**
 * The set of formats the `cosyte` command names. Detection currently recognises **hl7** and **fhir**;
 * the others are accepted by `--format` but reported as not-yet-wired (never faked) until their phase.
 */
export type CosyteFormat = "hl7" | "fhir" | "dicom" | "x12" | "ccda" | "ncpdp" | "astm" | "mllp";

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

/** Strip a leading UTF-8 BOM and any leading ASCII whitespace for a tolerant sniff. Deliberately does
 * **not** strip the MLLP `0x0B` VT frame byte (`\v`) — that byte is the mllp signature, so consuming it
 * here would collide the hl7 and mllp signatures on a framed message. */
function leadingText(bytes: Uint8Array): string {
  const slice = bytes.subarray(0, SNIFF_BYTES);
  let text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

/** Trim only regular leading whitespace (space/tab/CR/LF/FF) — never the `0x0B` VT MLLP frame byte. */
function trimLeading(prefix: string): string {
  return prefix.replace(/^[ \t\r\n\f]+/, "");
}

/** True iff `ch` is a single printable, non-alphanumeric byte usable as a wire delimiter (e.g. `|`, `*`). */
function isDelimiter(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  const code = ch.charCodeAt(0);
  return code > 0x20 && code < 0x7f && !/[A-Za-z0-9]/.test(ch);
}

/**
 * HL7 v2: the message begins with an `MSH` segment whose 4th character is the field separator
 * (conventionally `|`) followed by the encoding characters. Conservative: requires `MSH` + a
 * non-alphanumeric single-char field separator. An MLLP-framed message (leading `0x0B`) is **not**
 * claimed here — it is the `mllp` signature — because {@link trimLeading} preserves the VT byte.
 */
function looksLikeHl7(prefix: string): boolean {
  const s = trimLeading(prefix);
  return s.startsWith("MSH") && isDelimiter(s[3]);
}

/**
 * MLLP: a Minimal Lower Layer Protocol frame opens with the `0x0B` VT byte. This is a **transport
 * framing**, not a document format — the CLI de-frames it and parses the enclosed HL7 v2 payload(s).
 * The check is on the **raw first byte**, so it is disjoint from every text signature.
 */
function looksLikeMllp(_prefix: string, bytes: Uint8Array): boolean {
  return bytes[0] === 0x0b;
}

/**
 * FHIR: a JSON object whose first non-whitespace byte is `{` and which declares a string-valued
 * top-level `resourceType` member near the top. Conservative: both the object framing and the
 * `resourceType` key must be present, so a bare JSON object without it is not claimed as FHIR.
 */
function looksLikeFhir(prefix: string): boolean {
  const s = trimLeading(prefix);
  if (!s.startsWith("{")) return false;
  return /"resourceType"\s*:\s*"/.test(s);
}

/**
 * X12 EDI: an interchange opens with the fixed 3-byte `ISA` segment id immediately followed by the
 * element separator (a non-alphanumeric byte — `*` conventionally, but delimiter-agnostic).
 */
function looksLikeX12(prefix: string): boolean {
  const s = trimLeading(prefix);
  return s.startsWith("ISA") && isDelimiter(s[3]);
}

/**
 * ASTM E1394/E1381 records: the first record is an `H` (header) whose second byte is the field
 * delimiter and whose next three bytes are the repeat / component / escape **delimiter declarations**
 * (all punctuation — classically `\^&`). Requiring the full 4-delimiter block, not just `H` + one
 * delimiter, keeps a mundane `H:...`/`H!...` text line from being confidently mis-routed to ASTM (it
 * would instead be a value-free `CLI_FORMAT_UNDETECTED`). Distinct from HL7 (`MSH`) and X12 (`ISA`).
 */
function looksLikeAstm(prefix: string): boolean {
  const s = trimLeading(prefix);
  if (!s.startsWith("H") || s.length < 5) return false;
  // s[1] = field delimiter; s[2..4] = the repeat/component/escape delimiter declarations.
  return isDelimiter(s[1]) && isDelimiter(s[2]) && isDelimiter(s[3]) && isDelimiter(s[4]);
}

/** C-CDA: an HL7 v3 CDA document rooted at `<ClinicalDocument>` (XML). */
function looksLikeCcda(prefix: string): boolean {
  return /<ClinicalDocument[\s>]/.test(prefix);
}

/**
 * NCPDP SCRIPT: an ePrescribing message rooted at `<Message>` in the NCPDP SCRIPT namespace.
 * Requires **both** the `<Message>` root and the `ncpdp` namespace marker so a generic `<Message>`
 * XML is not mis-claimed (conservative — disjoint from C-CDA's `<ClinicalDocument>`).
 */
function looksLikeNcpdp(prefix: string): boolean {
  return /<Message[\s>]/.test(prefix) && /ncpdp/i.test(prefix);
}

/** DICOM Part 10: the `DICM` magic sits at byte offset 128, after the 128-byte preamble. */
function looksLikeDicom(_prefix: string, bytes: Uint8Array): boolean {
  if (bytes.length < 132) return false;
  return (
    bytes[128] === 0x44 && bytes[129] === 0x49 && bytes[130] === 0x43 && bytes[131] === 0x4d // "DICM"
  );
}

/** The signature registry — disjoint by construction across all eight cosyte formats (CLI-6). */
const SIGNATURES: readonly Signature[] = [
  { format: "hl7", match: (prefix) => looksLikeHl7(prefix) },
  { format: "mllp", match: (prefix, bytes) => looksLikeMllp(prefix, bytes) },
  { format: "fhir", match: (prefix) => looksLikeFhir(prefix) },
  { format: "x12", match: (prefix) => looksLikeX12(prefix) },
  { format: "astm", match: (prefix) => looksLikeAstm(prefix) },
  { format: "ccda", match: (prefix) => looksLikeCcda(prefix) },
  { format: "ncpdp", match: (prefix) => looksLikeNcpdp(prefix) },
  { format: "dicom", match: (prefix, bytes) => looksLikeDicom(prefix, bytes) },
];

/** The formats content-autodetection can recognise (every format now carries a signature). */
export const DETECTABLE_FORMATS: readonly CosyteFormat[] = SIGNATURES.map((s) => s.format);

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
    `could not detect the input format; re-run with --format (detectable: ${DETECTABLE_FORMATS.join(", ")})`,
  );
}

/** The full set of format names `--format` accepts as syntactically valid (a bad value is a usage error). */
export const KNOWN_FORMATS: readonly CosyteFormat[] = [
  "hl7",
  "fhir",
  "dicom",
  "x12",
  "ccda",
  "ncpdp",
  "astm",
  "mllp",
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
