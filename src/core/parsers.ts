/**
 * The **per-format parser adapter registry** — the single place the CLI routes a resolved format to
 * its wrapped `@cosyte/*` parser, for each of the four wrapping operations (`parse` / `inspect` /
 * `fmt` / `validate`). Before CLI-6 each command carried its own `format === "hl7" ? … : …` branch;
 * as the format count grew to eight that ceased to scale and scattered the wrapper boundary. This
 * module collapses them into one lazy, value-free registry so the wrapper boundary (cli roadmap §5)
 * lives in exactly one file the `gate-refuter` can read whole.
 *
 * **Capability is per (format, operation).** Not every parser faithfully supports every operation —
 * DICOM's model is binary (no faithful JSON `parse`, no text `fmt`), C-CDA's canonical form is XML (no
 * library-blessed JSON `parse`), MLLP is a transport container (de-framed to HL7, `parse`/`inspect`
 * only). {@link OP_SUPPORT} is the honest matrix; an unsupported (format, op) is a value-free
 * `CLI_FORMAT_UNSUPPORTED`, **never** a faked result (ADR 0018).
 *
 * **Lazy + optional.** Every parser is imported dynamically inside its branch, so `cosyte parse msg.hl7`
 * never loads the DICOM or X12 code. The six breadth parsers are `optionalDependencies` (ADR 0025): if
 * one is absent the dynamic import is caught and degrades to a value-free `CLI_PARSER_UNAVAILABLE`
 * (exit `69`) rather than an unhandled crash — the CLI core still works with any of them missing.
 *
 * @packageDocumentation
 */

import { CLI_CODES, CliError } from "./diagnostics.js";
import { EXIT } from "./exit-codes.js";
import { formatHl7Position, type Finding } from "./findings.js";
import type { CosyteFormat } from "./format.js";

/** The four wrapping operations a command can ask a format's adapter to perform. */
export type Op = "parse" | "inspect" | "fmt" | "validate";

/** A value-free parse warning: a stable code plus the parser's positional (index-only) context. */
export type ParseWarning = { readonly code: string } & Readonly<Record<string, unknown>>;

/** The result of wrapping a parser's `parse`: the library's parsed model + its value-free warnings. */
export interface ParseResult {
  /** The wrapped library's parsed model — emitted verbatim as JSON on the data channel. */
  readonly model: unknown;
  /** The parser's value-free warnings (code + position). */
  readonly warnings: readonly ParseWarning[];
}

/** The result of a canonical re-serialization (`fmt`): the spec-clean text + a value-free warning count. */
export interface FmtResult {
  /** The wrapped serializer's output text. */
  readonly output: string;
  /** How many parse warnings the round-trip surfaced (value-free count only). */
  readonly warningCount: number;
}

/** The verdict of running a format's validation surface: value-free findings + the validity boolean. */
export interface Verdict {
  /** The value-free findings (code + severity + positional locator). */
  readonly findings: readonly Finding[];
  /** `true` iff the input is valid (no error/fatal-severity finding). */
  readonly valid: boolean;
}

/* ── value-free structural summaries (one variant per format) ─────────────────────────────────── */

/** Value-free structural summary of an HL7 v2 message. */
export interface Hl7Summary {
  readonly format: "hl7";
  readonly messageType: string | null;
  readonly version: string | null;
  readonly segmentCount: number;
  readonly segments: Readonly<Record<string, number>>;
  readonly warningCount: number;
}

/** Value-free structural summary of a FHIR resource. */
export interface FhirSummary {
  readonly format: "fhir";
  readonly resourceType: string | null;
  readonly bundleType?: string | null;
  readonly entryCount?: number;
  readonly entryResourceTypes?: Readonly<Record<string, number>>;
  readonly issueCount: number;
}

/** Value-free structural summary of an X12 interchange (envelope counts + transaction-set ids). */
export interface X12Summary {
  readonly format: "x12";
  readonly groupCount: number;
  readonly transactionCount: number;
  /** Count of each transaction-set identifier code (ST-01), e.g. `{ "834": 1 }` — value-free codes. */
  readonly transactionSetIds: Readonly<Record<string, number>>;
  readonly segmentCount: number;
  readonly warningCount: number;
}

/** Value-free structural summary of an ASTM record message. */
export interface AstmSummary {
  readonly format: "astm";
  /** The host-query classification kind (`results` | `orders` | `host-query` | `indeterminate`). */
  readonly messageKind: string;
  readonly recordCount: number;
  /** Count of each single-letter record type, e.g. `{ H: 1, P: 1, O: 2, R: 4, L: 1 }`. */
  readonly recordTypes: Readonly<Record<string, number>>;
  readonly warningCount: number;
}

/** Value-free structural summary of a C-CDA document (document type + section LOINC codes). */
export interface CcdaSummary {
  readonly format: "ccda";
  readonly documentType: string | null;
  readonly sectionCount: number;
  /** The LOINC `code` of each top-level section (value-free classification codes). */
  readonly sectionCodes: readonly string[];
  readonly warningCount: number;
}

/** Value-free structural summary of a DICOM dataset (classification UIDs + element count). */
export interface DicomSummary {
  readonly format: "dicom";
  /** The SOP Class UID (a standard OID identifying the object type — value-free classification). */
  readonly sopClassUid: string | null;
  /** The Transfer Syntax UID (encoding classification — value-free). */
  readonly transferSyntaxUid: string | null;
  readonly elementCount: number;
  readonly warningCount: number;
}

/** Value-free structural summary of an NCPDP SCRIPT message. */
export interface NcpdpSummary {
  readonly format: "ncpdp";
  readonly standard: "SCRIPT";
  /** The SCRIPT message type (e.g. `NewRx`, `CancelRx` — a value-free classification). */
  readonly messageType: string | null;
  /** The SCRIPT version (e.g. `2017071` — value-free). */
  readonly version: string | null;
  readonly warningCount: number;
}

/** Value-free structural summary of an MLLP stream (frame count only — the payloads are HL7). */
export interface MllpSummary {
  readonly format: "mllp";
  readonly frameCount: number;
  readonly warningCount: number;
}

/** The discriminated value-free structural summary `inspect` renders. */
export type InspectSummary =
  | Hl7Summary
  | FhirSummary
  | X12Summary
  | AstmSummary
  | CcdaSummary
  | DicomSummary
  | NcpdpSummary
  | MllpSummary;

/* ── the capability matrix ───────────────────────────────────────────────────────────────────── */

/**
 * The honest per-format operation matrix (CLI-6). A (format, op) pair absent here is a value-free
 * `CLI_FORMAT_UNSUPPORTED`, never a faked result. Deferred cells and why:
 * - **dicom** `parse`/`fmt` — the model is binary (no faithful JSON view; `serializeDicom` emits a
 *   Part-10 byte stream, not text). `inspect`/`validate` are supported.
 * - **ccda** `parse` — the canonical form is XML; there is no library-blessed JSON model, so `fmt`
 *   (XML re-serialize) is the faithful surface. `inspect`/`fmt`/`validate` are supported.
 * - **mllp** `fmt`/`validate` — MLLP is a transport container the CLI de-frames to HL7; `parse` yields
 *   the enclosed HL7 message(s) and `inspect` reports the frame count.
 *
 * @example
 * ```ts
 * import { OP_SUPPORT } from "@cosyte/cli";
 *
 * OP_SUPPORT.dicom.has("parse"); // => false
 * OP_SUPPORT.hl7.has("validate"); // => true
 * ```
 */
export const OP_SUPPORT: Readonly<Record<CosyteFormat, ReadonlySet<Op>>> = {
  hl7: new Set<Op>(["parse", "inspect", "fmt", "validate"]),
  fhir: new Set<Op>(["parse", "inspect", "fmt", "validate"]),
  x12: new Set<Op>(["parse", "inspect", "fmt", "validate"]),
  astm: new Set<Op>(["parse", "inspect", "fmt", "validate"]),
  ncpdp: new Set<Op>(["parse", "inspect", "fmt", "validate"]),
  ccda: new Set<Op>(["inspect", "fmt", "validate"]),
  dicom: new Set<Op>(["inspect", "validate"]),
  mllp: new Set<Op>(["parse", "inspect"]),
};

/**
 * True iff `format`'s wrapped parser supports `op` in this build (see {@link OP_SUPPORT}).
 *
 * @param format - The resolved format.
 * @param op - The wrapping operation.
 * @returns Whether the (format, op) pair is wired.
 * @example
 * ```ts
 * import { supportsOp } from "@cosyte/cli";
 *
 * supportsOp("x12", "fmt"); // => true
 * supportsOp("dicom", "parse"); // => false
 * ```
 */
export function supportsOp(format: CosyteFormat, op: Op): boolean {
  return OP_SUPPORT[format].has(op);
}

/**
 * The formats that support `op`, as a sorted, value-free list — used to build the "does not support"
 * diagnostic so the user is told which formats *do* support the operation they asked for.
 *
 * @param op - The wrapping operation.
 * @returns The supporting format names, sorted.
 * @example
 * ```ts
 * import { formatsSupporting } from "@cosyte/cli";
 *
 * formatsSupporting("fmt"); // => ["astm", "ccda", "fhir", "hl7", "ncpdp", "x12"]
 * ```
 */
export function formatsSupporting(op: Op): readonly CosyteFormat[] {
  return (Object.keys(OP_SUPPORT) as CosyteFormat[]).filter((f) => OP_SUPPORT[f].has(op)).sort();
}

/* ── value-free helpers ──────────────────────────────────────────────────────────────────────── */

/**
 * Render an arbitrary parser **position** object as a value-free locator string, keeping **only**
 * number-valued own properties (the parsers' positions are index-only) — e.g. `{ segmentIndex: 3,
 * elementIndex: 2 }` → `segmentIndex[3].elementIndex[2]`. A non-number field (which a position should
 * never carry) is dropped, so a stray value can never reach a diagnostic. Falls back to `"?"` when no
 * numeric index is present.
 *
 * @param pos - A parser position object (index-only by the parser's contract).
 * @returns A value-free locator built solely from numeric indices.
 * @example
 * ```ts
 * import { valueFreeLocator } from "@cosyte/cli";
 *
 * valueFreeLocator({ segmentIndex: 3, elementIndex: 2 }); // => "segmentIndex[3].elementIndex[2]"
 * valueFreeLocator({}); // => "?"
 * ```
 */
export function valueFreeLocator(pos: unknown): string {
  if (typeof pos !== "object" || pos === null) return "?";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(pos)) {
    if (typeof v === "number") parts.push(`${k}[${String(v)}]`);
  }
  return parts.length > 0 ? parts.join(".") : "?";
}

/** Severities that make an input **invalid** (exit `1`). Recovered warnings never fail a verdict. */
const ERROR_SEVERITIES: ReadonlySet<string> = new Set(["error", "fatal"]);

/** Whether any finding is error/fatal severity (i.e. the input is invalid). */
function anyError(findings: readonly Finding[]): boolean {
  return findings.some((f) => ERROR_SEVERITIES.has(f.severity));
}

/**
 * Lazy-import an **optional** parser package, mapping an *absent* package to a value-free
 * `CLI_PARSER_UNAVAILABLE` (exit `69`) — the graceful-degradation path for the `optionalDependencies`
 * breadth parsers (ADR 0025). A genuine import that succeeds passes straight through; any error whose
 * shape is "module not found" becomes the value-free CLI error. Other errors propagate unchanged.
 *
 * @template T - The imported module's type.
 * @param format - The format whose optional parser is being loaded (named in the diagnostic).
 * @param load - A thunk performing the dynamic import.
 * @returns The imported module.
 * @throws {CliError} `CLI_PARSER_UNAVAILABLE` (exit `69`) when the package is absent; any other error
 *   propagates unchanged.
 * @example
 * ```ts
 * import { loadOptional } from "@cosyte/cli";
 *
 * // a present parser resolves; an absent one throws CLI_PARSER_UNAVAILABLE
 * await loadOptional("x12", () => import("@cosyte/x12"));
 * ```
 */
export async function loadOptional<T>(format: CosyteFormat, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    if (isModuleNotFound(e)) {
      throw new CliError(
        CLI_CODES.CLI_PARSER_UNAVAILABLE,
        EXIT.UNAVAILABLE,
        `the @cosyte/${format} parser is not installed; install it to use this format ` +
          `(it is an optional dependency — see ADR 0025)`,
      );
    }
    throw e;
  }
}

/** True iff `e` is a "module not found" failure — by Node's `code`, or the standard resolver message. */
function isModuleNotFound(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const code = "code" in e ? e.code : undefined;
  if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") return true;
  const message = "message" in e && typeof e.message === "string" ? e.message : "";
  return /Cannot find (package|module)|Failed to (load|resolve)/i.test(message);
}

/* ── parse ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * Parse one record of `format` into the wrapped library's model + its value-free warnings. The model
 * is emitted verbatim on the data channel; the CLI adds no parsing of its own.
 *
 * @param format - A format for which `supportsOp(format, "parse")` is true.
 * @param bytes - The single record's bytes (already de-framed for MLLP — callers pass `"hl7"` there).
 * @returns The parsed model + value-free warnings.
 * @throws {CliError} `CLI_PARSER_UNAVAILABLE` if the optional parser is absent; the wrapped parser's
 *   own rejection propagates for the command's value-free failure boundary to catch.
 * @example
 * ```ts
 * import { parseFormat } from "@cosyte/cli";
 *
 * const bytes = new TextEncoder().encode('{"resourceType":"Patient","id":"x"}');
 * (await parseFormat("fhir", bytes)).warnings.length; // => 0
 * ```
 */
export async function parseFormat(format: CosyteFormat, bytes: Uint8Array): Promise<ParseResult> {
  switch (format) {
    case "hl7": {
      const { parseHL7 } = await import("@cosyte/hl7");
      const msg = parseHL7(Buffer.from(bytes));
      return {
        model: msg.toJSON(),
        warnings: msg.warnings.map((w) => ({ code: w.code, position: w.position })),
      };
    }
    case "fhir": {
      const { parseResource, serializeResource } = await import("@cosyte/fhir");
      const text = decode(bytes);
      const { resource, issues } = parseResource(text);
      const model: unknown = JSON.parse(serializeResource(resource));
      return {
        model,
        warnings: issues.map((i) => ({
          code: i.code,
          severity: i.severity,
          expression: i.expression,
        })),
      };
    }
    case "x12": {
      const { parseX12 } = await loadOptional("x12", () => import("@cosyte/x12"));
      const ix = parseX12(Buffer.from(bytes));
      return {
        model: ix,
        warnings: ix.warnings.map((w) => ({ code: w.code, position: w.position })),
      };
    }
    case "astm": {
      const { parseAstmRecords } = await loadOptional("astm", () => import("@cosyte/astm"));
      const msg = parseAstmRecords(decode(bytes));
      return {
        model: msg,
        warnings: msg.warnings.map((w) => ({ code: w.code, position: w.position })),
      };
    }
    case "ncpdp": {
      const { parseScript } = await loadOptional("ncpdp", () => import("@cosyte/ncpdp"));
      const msg = parseScript(decode(bytes));
      return {
        model: msg,
        warnings: msg.warnings.map((w) => ({ code: w.code, position: w.position })),
      };
    }
    case "dicom":
    case "ccda":
    case "mllp":
      // Guarded upstream by supportsOp; a direct call for an unsupported (format, op) is value-free.
      throw unsupportedInternal(format, "parse");
  }
}

/* ── inspect ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * Build the value-free structural summary of one input of `format` — counts and structural type codes
 * only, never a field value (cli roadmap §7).
 *
 * @param format - A format for which `supportsOp(format, "inspect")` is true.
 * @param bytes - The input bytes.
 * @returns A {@link InspectSummary} variant for the format.
 * @throws {CliError} `CLI_PARSER_UNAVAILABLE` if the optional parser is absent; the wrapped parser's
 *   rejection propagates for the command's value-free failure boundary.
 * @example
 * ```ts
 * import { inspectFormat } from "@cosyte/cli";
 *
 * const bytes = new TextEncoder().encode('{"resourceType":"Patient"}');
 * (await inspectFormat("fhir", bytes)).format; // => "fhir"
 * ```
 */
export async function inspectFormat(
  format: CosyteFormat,
  bytes: Uint8Array,
): Promise<InspectSummary> {
  switch (format) {
    case "hl7": {
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
    case "fhir": {
      const { parseResource, resourceType, readBundle } = await import("@cosyte/fhir");
      const { resource, issues } = parseResource(decode(bytes));
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
    case "x12": {
      const { parseX12 } = await loadOptional("x12", () => import("@cosyte/x12"));
      const ix = parseX12(Buffer.from(bytes));
      const transactionSetIds: Record<string, number> = {};
      let transactionCount = 0;
      let segmentCount = 0;
      for (const g of ix.groups) {
        for (const t of g.transactions) {
          transactionCount += 1;
          segmentCount += t.segments.length;
          const id = t.st.elements[1] ?? "(unknown)";
          transactionSetIds[id] = (transactionSetIds[id] ?? 0) + 1;
        }
      }
      return {
        format: "x12",
        groupCount: ix.groups.length,
        transactionCount,
        transactionSetIds,
        segmentCount,
        warningCount: ix.warnings.length,
      };
    }
    case "astm": {
      const { parseAstmRecords } = await loadOptional("astm", () => import("@cosyte/astm"));
      const msg = parseAstmRecords(decode(bytes));
      const recordTypes: Record<string, number> = {};
      for (const r of msg.records) recordTypes[r.type] = (recordTypes[r.type] ?? 0) + 1;
      return {
        format: "astm",
        messageKind: msg.classification.kind,
        recordCount: msg.records.length,
        recordTypes,
        warningCount: msg.warnings.length,
      };
    }
    case "ccda": {
      const { parseCcda } = await loadOptional("ccda", () => import("@cosyte/ccda"));
      const doc = parseCcda(decode(bytes));
      const sectionCodes: string[] = [];
      for (const s of doc.sections) {
        const code = s.code?.code;
        if (typeof code === "string") sectionCodes.push(code);
      }
      return {
        format: "ccda",
        documentType: doc.documentType ?? null,
        sectionCount: doc.sections.length,
        sectionCodes,
        warningCount: doc.warnings.length,
      };
    }
    case "dicom": {
      const { parseDicom } = await loadOptional("dicom", () => import("@cosyte/dicom"));
      let warningCount = 0;
      const ds = parseDicom(Buffer.from(bytes), { onWarning: () => (warningCount += 1) });
      return {
        format: "dicom",
        sopClassUid: ds.fileMeta?.mediaStorageSOPClassUID ?? null,
        transferSyntaxUid: ds.fileMeta?.transferSyntaxUID ?? null,
        elementCount: ds.elements().length,
        warningCount,
      };
    }
    case "ncpdp": {
      const { parseScript } = await loadOptional("ncpdp", () => import("@cosyte/ncpdp"));
      const msg = parseScript(decode(bytes));
      return {
        format: "ncpdp",
        standard: "SCRIPT",
        messageType: msg.body.kind ?? null,
        version: msg.header.version ?? null,
        warningCount: msg.warnings.length,
      };
    }
    case "mllp": {
      const { payloads, warningCount } = await deframeMllp(bytes);
      return { format: "mllp", frameCount: payloads.length, warningCount };
    }
  }
}

/* ── fmt ─────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Canonically re-serialize one input of `format` via the wrapped library's spec-clean serializer. The
 * CLI never re-canonicalizes on its own (cli roadmap §5); the output is exactly the serializer's.
 *
 * @param format - A format for which `supportsOp(format, "fmt")` is true.
 * @param bytes - The input bytes.
 * @returns The serialized text + a value-free warning count.
 * @throws {CliError} `CLI_PARSER_UNAVAILABLE` if the optional parser is absent; the wrapped parser's
 *   rejection propagates for the command's value-free failure boundary (no partial emit).
 * @example
 * ```ts
 * import { fmtFormat } from "@cosyte/cli";
 *
 * const bytes = new TextEncoder().encode('{ "resourceType":"Patient" , "id":"x" }');
 * (await fmtFormat("fhir", bytes)).output.startsWith("{"); // => true
 * ```
 */
export async function fmtFormat(format: CosyteFormat, bytes: Uint8Array): Promise<FmtResult> {
  switch (format) {
    case "hl7": {
      const { parseHL7 } = await import("@cosyte/hl7");
      const msg = parseHL7(Buffer.from(bytes));
      return { output: msg.toString(), warningCount: msg.warnings.length };
    }
    case "fhir": {
      const { parseResource, serializeResource } = await import("@cosyte/fhir");
      const { resource, issues } = parseResource(decode(bytes));
      return { output: serializeResource(resource), warningCount: issues.length };
    }
    case "x12": {
      const { parseX12, serializeX12 } = await loadOptional("x12", () => import("@cosyte/x12"));
      const ix = parseX12(Buffer.from(bytes));
      return { output: serializeX12(ix), warningCount: ix.warnings.length };
    }
    case "astm": {
      const { parseAstmRecords, serializeAstmRecords } = await loadOptional(
        "astm",
        () => import("@cosyte/astm"),
      );
      const msg = parseAstmRecords(decode(bytes));
      return { output: serializeAstmRecords(msg), warningCount: msg.warnings.length };
    }
    case "ccda": {
      const { parseCcda, serializeCcda } = await loadOptional("ccda", () => import("@cosyte/ccda"));
      const doc = parseCcda(decode(bytes));
      return { output: serializeCcda(doc), warningCount: doc.warnings.length };
    }
    case "ncpdp": {
      const { parseScript, serializeScript } = await loadOptional(
        "ncpdp",
        () => import("@cosyte/ncpdp"),
      );
      const msg = parseScript(decode(bytes));
      return { output: serializeScript(msg), warningCount: msg.warnings.length };
    }
    case "dicom":
    case "mllp":
      throw unsupportedInternal(format, "fmt");
  }
}

/* ── validate ────────────────────────────────────────────────────────────────────────────────── */

/**
 * Run the format's validation surface and return a value-free {@link Verdict}. For the Postel's-Law
 * lenient parsers, a **parseable** input is valid — recovered deviations are non-fatal warnings the
 * library surfaces, never a stricter verdict the CLI invents. FHIR additionally runs `validateResource`
 * and is invalid on any error/fatal-severity issue.
 *
 * @param format - A format for which `supportsOp(format, "validate")` is true.
 * @param bytes - The input bytes.
 * @returns The value-free verdict (findings + validity).
 * @throws {CliError} `CLI_PARSER_UNAVAILABLE` if the optional parser is absent; an unparseable input
 *   propagates as the wrapped parser's throw for the command to map to a data error (`65`).
 * @example
 * ```ts
 * import { validateFormat } from "@cosyte/cli";
 *
 * const bytes = new TextEncoder().encode('{"resourceType":"Patient","gender":"male"}');
 * (await validateFormat("fhir", bytes)).valid; // => true
 * ```
 */
export async function validateFormat(format: CosyteFormat, bytes: Uint8Array): Promise<Verdict> {
  switch (format) {
    case "fhir": {
      const { parseResource, validateResource } = await import("@cosyte/fhir");
      const { resource, issues } = parseResource(decode(bytes));
      const validation = validateResource(resource);
      const findings: Finding[] = [
        ...issues.map((i) => finding(i.code, i.severity, i.expression)),
        ...validation.issues.map((i) => finding(i.code, i.severity, i.expression, i.constraint)),
      ];
      return { findings, valid: !anyError(findings) };
    }
    case "hl7": {
      const { parseHL7 } = await import("@cosyte/hl7");
      const msg = parseHL7(Buffer.from(bytes));
      const findings = msg.warnings.map((w) =>
        finding(w.code, "warning", formatHl7Position(w.position)),
      );
      return { findings, valid: !anyError(findings) };
    }
    case "x12": {
      const { parseX12 } = await loadOptional("x12", () => import("@cosyte/x12"));
      const ix = parseX12(Buffer.from(bytes));
      const findings = ix.warnings.map((w) =>
        finding(w.code, "warning", valueFreeLocator(w.position)),
      );
      return { findings, valid: !anyError(findings) };
    }
    case "astm": {
      const { parseAstmRecords } = await loadOptional("astm", () => import("@cosyte/astm"));
      const msg = parseAstmRecords(decode(bytes));
      const findings = msg.warnings.map((w) =>
        finding(w.code, "warning", valueFreeLocator(w.position)),
      );
      return { findings, valid: !anyError(findings) };
    }
    case "ccda": {
      const { parseCcda } = await loadOptional("ccda", () => import("@cosyte/ccda"));
      const doc = parseCcda(decode(bytes));
      const findings = doc.warnings.map((w) =>
        finding(w.code, "warning", valueFreeLocator(w.position)),
      );
      return { findings, valid: !anyError(findings) };
    }
    case "dicom": {
      const { parseDicom } = await loadOptional("dicom", () => import("@cosyte/dicom"));
      const findings: Finding[] = [];
      parseDicom(Buffer.from(bytes), {
        onWarning: (w) => findings.push(finding(w.code, "warning", valueFreeLocator(w.position))),
      });
      return { findings, valid: !anyError(findings) };
    }
    case "ncpdp": {
      const { parseScript } = await loadOptional("ncpdp", () => import("@cosyte/ncpdp"));
      const msg = parseScript(decode(bytes));
      const findings = msg.warnings.map((w) =>
        finding(w.code, "warning", valueFreeLocator(w.position)),
      );
      return { findings, valid: !anyError(findings) };
    }
    case "mllp":
      throw unsupportedInternal(format, "validate");
  }
}

/* ── MLLP de-framing (transport → HL7 payloads) ──────────────────────────────────────────────── */

/**
 * De-frame an MLLP byte stream into its enclosed HL7 payloads via `@cosyte/mllp`'s `FrameReader`. MLLP
 * is a transport container, not a document format — each frame's payload is an HL7 v2 message the CLI
 * then parses/inspects with the `hl7` adapter. Multi-frame streams are the CLI's multi-message surface.
 *
 * @param bytes - The MLLP-framed input.
 * @returns The de-framed HL7 payloads (in stream order) + a value-free framing-warning count.
 * **Truncation is a data error, never a silent drop.** The `FrameReader` is a streaming decoder: an
 * unterminated trailing frame (a VT opened with no closing FS/CR) is left buffered and delivered by
 * *no* callback — so feeding a whole file and reading only `onFrame` would silently lose the partial
 * message with a green exit (the "partial silent success" the roadmap §Phase 6 forbids). We therefore
 * detect an open trailing frame at the byte level (the last VT sits after the last FS — MLLP payloads
 * are HL7 v2 text and never carry the `0x0B`/`0x1C` framing bytes) and reject the whole stream as a
 * value-free `CLI_PARSE_FAILED` data error.
 *
 * @throws {CliError} `CLI_PARSER_UNAVAILABLE` if `@cosyte/mllp` is absent; `CLI_PARSE_FAILED` (exit
 *   `65`) on a truncated stream; a hard framing error propagates for the caller's value-free boundary.
 * @example
 * ```ts
 * import { deframeMllp } from "@cosyte/cli";
 *
 * // a VT-framed "MSH|..." message → one payload
 * (await deframeMllp(new Uint8Array([0x0b, 0x4d, 0x53, 0x48, 0x1c, 0x0d]))).payloads.length; // => 1
 * ```
 */
export async function deframeMllp(
  bytes: Uint8Array,
): Promise<{ payloads: Buffer[]; warningCount: number }> {
  // Reject an unterminated trailing frame BEFORE de-framing: a VT after the last FS is an open frame
  // the streaming reader would buffer and silently drop. (MLLP payloads never contain 0x0B/0x1C.)
  if (bytes.lastIndexOf(0x0b) > bytes.lastIndexOf(0x1c)) {
    throw new CliError(
      CLI_CODES.CLI_PARSE_FAILED,
      EXIT.DATAERR,
      "truncated MLLP stream: an unterminated frame at the end of input (no closing FS/CR)",
    );
  }
  const { FrameReader } = await loadOptional("mllp", () => import("@cosyte/mllp"));
  const payloads: Buffer[] = [];
  let warningCount = 0;
  const reader = new FrameReader({
    onFrame: (payload) => payloads.push(Buffer.from(payload)),
    onWarning: () => (warningCount += 1),
  });
  reader.push(Buffer.from(bytes));
  return { payloads, warningCount };
}

/* ── shared internals ────────────────────────────────────────────────────────────────────────── */

/** Decode input bytes as tolerant UTF-8 (the text parsers accept a string). */
function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** Build one value-free {@link Finding}; a FHIR `constraint` (a public spec id) is appended if present. */
function finding(code: string, severity: string, location: string, constraint?: string): Finding {
  const loc = constraint !== undefined ? `${location} (${constraint})` : location;
  return { code, severity, location: loc };
}

/** The value-free error for an internal (guarded-upstream) unsupported (format, op) — a programming bug. */
function unsupportedInternal(format: CosyteFormat, op: Op): CliError {
  return new CliError(
    CLI_CODES.CLI_FORMAT_UNSUPPORTED,
    EXIT.DATAERR,
    `format '${format}' does not support \`${op}\``,
  );
}
