/**
 * The **de-identification seam**: the single, documented plug-in point where the `redact` / `deid`
 * command delegates to **`@cosyte/deid`**. Everything the CLI knows about de-identification lives
 * here, and it is deliberately little: which formats the delegate covers, how to reach it, and how to
 * turn its result into the CLI's own value-free shapes.
 *
 * ## The CLI ships no redactor of its own (the boundary decision)
 *
 * A "minimal built-in Safe-Harbor pass over the obvious PHI loci" (the HL7 `PID` segment,
 * `Patient.name`/`Patient.address` in FHIR) is **deliberately rejected**. Real messages carry PHI far
 * beyond those loci: HL7 `NK1`/`GT1`/`IN1`/`OBX`/`NTE`, FHIR extensions and contained resources,
 * free-text notes. A redactor that scrubs the obvious fields and emits output that *looks*
 * de-identified while silently leaving PHI behind is a **false-safety impression**. A `redact` that
 * under-redacts is worse than no `redact`. So the CLI adds no policy, no locus map, no transform and
 * no fallback scrub: it delegates, or it refuses.
 *
 * ## What "covered" means, per format
 *
 * A format is covered when the delegate ships an adapter for the standard this CLI actually resolves
 * **and** the CLI can carry the de-identified result on its text data channel. Both halves bite:
 *
 * - `ncpdp`: the delegate's adapter is NCPDP **Telecom**, while this CLI resolves NCPDP **SCRIPT**.
 *   The subpath exists; the coverage does not.
 * - `dicom`: the delegate covers it, but its result is a Part 10 **byte** stream and this CLI's data
 *   channel is a `string`. That is the CLI's own limit, so it is reported as the CLI's own
 *   unsupported (format, operation) cell rather than blamed on the delegate.
 * - `astm`, `mllp`: no adapter at all.
 *
 * ## The key context, and why it is ephemeral
 *
 * The delegate's default policy pseudonymizes MRN / account / beneficiary identifiers, and a keyed
 * transform with no key context is a fatal, never an unkeyed fallback. The CLI holds no key material
 * and offers no key surface, so it creates a **per-invocation ephemeral key**: surrogates are
 * consistent within one output and deliberately **not** stable across runs (no cross-run linkage).
 * That property is disclosed on the diagnostic channel rather than left to be discovered.
 *
 * @packageDocumentation
 */

import { randomBytes } from "node:crypto";

// TYPE-ONLY, and the word `type` is load-bearing: dropping it turns this into an eager load of an
// optional package, which would break every command in an install that does not have it.
import type * as CosyteDeid from "@cosyte/deid";

import { CLI_CODES, CliError } from "./diagnostics.js";
import { EXIT } from "./exit-codes.js";
import type { CosyteFormat } from "./format.js";
import { loadFhir, loadOptional, loadOptionalPackage } from "./parsers.js";
import { extractStableCode } from "./wrap.js";

/** The npm package the whole de-identification capability is delegated to. */
export const DEID_PACKAGE = "@cosyte/deid";

/** The delegate's root module, as this file consumes it (kept off the published surface). */
type DeidCore = typeof CosyteDeid;

/**
 * What the delegate can do for one format, from this CLI's point of view:
 *
 * - `covered`: an adapter for the standard this CLI resolves, serializable onto the text channel.
 * - `no-adapter`: the delegate does not de-identify this format (`CLI_NOT_IMPLEMENTED`, exit `69`).
 * - `unserializable`: the delegate covers it, but the result cannot ride a text stdout
 *   (`CLI_FORMAT_UNSUPPORTED`, exit `65`: the CLI's own limit, not the delegate's).
 */
export type DeidCoverage = "covered" | "no-adapter" | "unserializable";

/** A format the delegate de-identifies and the CLI can serialize. */
export type DeidCoveredFormat = "hl7" | "fhir" | "x12" | "ccda";

/**
 * The honest per-format de-identification matrix, the `redact` analogue of the parser registry's
 * operation matrix. Every one of the eight formats has an entry, so a new format cannot be added
 * without answering for it here.
 *
 * @example
 * ```ts
 * import { DEID_COVERAGE } from "@cosyte/cli";
 *
 * DEID_COVERAGE.hl7; // => "covered"
 * DEID_COVERAGE.dicom; // => "unserializable"
 * ```
 */
export const DEID_COVERAGE: Readonly<Record<CosyteFormat, DeidCoverage>> = {
  hl7: "covered",
  fhir: "covered",
  x12: "covered",
  ccda: "covered",
  // The delegate's NCPDP adapter is Telecom; this CLI resolves SCRIPT.
  ncpdp: "no-adapter",
  astm: "no-adapter",
  mllp: "no-adapter",
  // Covered by the delegate, but its result is Part 10 bytes and stdout here is text.
  dicom: "unserializable",
};

/**
 * What the delegate can do for `format`.
 *
 * @param format - The resolved format.
 * @returns That format's {@link DeidCoverage}.
 * @example
 * ```ts
 * import { deidCoverage } from "@cosyte/cli";
 *
 * deidCoverage("ncpdp"); // => "no-adapter"
 * ```
 */
export function deidCoverage(format: CosyteFormat): DeidCoverage {
  return DEID_COVERAGE[format];
}

/**
 * Whether `format` is one the delegate de-identifies and the CLI can serialize.
 *
 * @param format - The resolved format.
 * @returns `true` iff `redact` produces output for it.
 * @example
 * ```ts
 * import { isDeidCovered } from "@cosyte/cli";
 *
 * isDeidCovered("x12"); // => true
 * ```
 */
export function isDeidCovered(format: CosyteFormat): format is DeidCoveredFormat {
  return DEID_COVERAGE[format] === "covered";
}

/**
 * The formats `redact` produces output for, sorted: the single source the help text, the published
 * documentation and the tests all read, so the three cannot drift.
 *
 * @returns The covered format names, sorted.
 * @example
 * ```ts
 * import { deidCoveredFormats } from "@cosyte/cli";
 *
 * deidCoveredFormats(); // => ["ccda", "fhir", "hl7", "x12"]
 * ```
 */
export function deidCoveredFormats(): readonly CosyteFormat[] {
  return (Object.keys(DEID_COVERAGE) as CosyteFormat[]).filter(isDeidCovered).sort();
}

/**
 * One entry of the delegate's value-free manifest, narrowed to the fields the CLI renders. The
 * `locus` is a **path, never a value**, by the delegate's own contract; nothing here carries an input
 * value, which is what lets the manifest go on the diagnostic channel at all.
 */
export interface DeidManifestRecord {
  /** The identifier category acted on. */
  readonly category: string;
  /** The transform applied. */
  readonly transform: string;
  /** The structural path acted on: never a value. */
  readonly locus: string;
  /** How many values at this locus were acted on. */
  readonly count: number;
  /** What happened: `transformed`, `removed`, or the fail-closed `blocked`. */
  readonly disposition: string;
  /** The delegate's stable disposition code. */
  readonly code: string;
}

/** The fail-closed disposition: the delegate reports it could not handle the element. */
export const DEID_BLOCKED = "blocked";

/** A completed de-identification pass: the serialized document plus the delegate's manifest. */
export interface RedactOutcome {
  /** The de-identified document, serialized exactly as this format's wrapped serializer emits it. */
  readonly output: string;
  /** The delegate's value-free manifest, in locus order. */
  readonly manifest: readonly DeidManifestRecord[];
}

/**
 * The delegate, reduced to what the command needs: its own published honesty label and version, and
 * one call that de-identifies an input. Deliberately CLI-owned shapes, so the delegate's types never
 * reach this package's published surface.
 */
export interface DeidDelegate {
  /** The delegate's own output label, quoted verbatim; the CLI asserts no standard of its own. */
  readonly label: string;
  /** The delegate's own version string. */
  readonly version: string;
  /**
   * De-identify one input under the delegate's default policy.
   *
   * @param format - A covered format.
   * @param bytes - The input bytes.
   * @returns The serialized de-identified document and the value-free manifest.
   */
  readonly redact: (format: DeidCoveredFormat, bytes: Uint8Array) => Promise<RedactOutcome>;
}

/**
 * The value-free reason `redact`/`deid` reports when the de-identification library is absent from the
 * install. It is an `optionalDependency`, so a copy without it degrades rather than crashing.
 */
export const DEID_UNAVAILABLE_REASON =
  `the ${DEID_PACKAGE} de-identification library is not installed; install it to use ` +
  `redact/deid (it is an optional dependency). The CLI ships no built-in redactor: a partial ` +
  `Safe-Harbor scrub over only the obvious PHI loci would leave PHI behind and present a ` +
  `false-safety impression, so nothing is emitted`;

/** The value-free reason a covered format's own de-identification adapter could not be loaded. */
function adapterUnavailable(format: DeidCoveredFormat): string {
  return (
    `the ${DEID_PACKAGE}/${format} de-identification adapter could not be loaded; it needs both ` +
    `${DEID_PACKAGE} and the @cosyte/${format} parser to be installed`
  );
}

/**
 * Run the wrapped parser, mapping a rejection to a **value-free** `CLI_PARSE_FAILED` (exit `65`):
 * the format name and, when the thrown value carried one, a stable code token. The parser's own
 * message is discarded, because it can embed the offending bytes.
 *
 * Unlike the other commands' parse boundary this appends **no** `--unsafe-show-values` excerpt: on
 * `redact` an excerpt of the input a user asked to have stripped is precisely the leak the command
 * exists to prevent.
 *
 * @param format - The format whose parser is running.
 * @param parse - The parse call.
 * @returns Whatever `parse` returned.
 * @throws {CliError} `CLI_PARSE_FAILED` (exit `65`) when `parse` rejects the input.
 * @example
 * ```ts
 * const msg = parseOrFail("hl7", () => parseHL7(bytes));
 * ```
 */
export function parseOrFail<T>(format: DeidCoveredFormat, parse: () => T): T {
  try {
    return parse();
  } catch (e) {
    const code = extractStableCode(e);
    throw new CliError(
      CLI_CODES.CLI_PARSE_FAILED,
      EXIT.DATAERR,
      `the ${format} parser rejected the input${code === null ? "" : ` (${code})`}`,
    );
  }
}

/**
 * Run the delegate, mapping a fatal it reports to a **value-free** `CLI_DEID_INCOMPLETE` (exit `1`):
 * its own stable code and nothing else, the exception's message discarded exactly as a parser's is.
 * An error carrying **no** stable code is not the delegate reporting a condition it recognises, so
 * it propagates untouched to the dispatcher's internal-error boundary: a bug stays a bug (`70`)
 * rather than being dressed up as an operation-level failure.
 *
 * @param run - The de-identification call.
 * @returns The completed {@link RedactOutcome}.
 * @throws {CliError} `CLI_DEID_INCOMPLETE` (exit `1`) on a fatal the delegate names; anything else
 *   propagates unchanged.
 * @example
 * ```ts
 * const outcome = deidentifyOrFail(() => ({ output, manifest }));
 * ```
 */
export function deidentifyOrFail(run: () => RedactOutcome): RedactOutcome {
  try {
    return run();
  } catch (e) {
    const code = extractStableCode(e);
    if (code === null) throw e;
    throw new CliError(
      CLI_CODES.CLI_DEID_INCOMPLETE,
      EXIT.INVALID,
      `the ${DEID_PACKAGE} de-identifier could not complete this input (${code}); no output was emitted`,
    );
  }
}

/** Decode input bytes as tolerant UTF-8 (the text parsers accept a string). */
function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** Narrow the delegate's manifest to the CLI's own record shape (no delegate type escapes). */
function toRecords(
  manifest: readonly {
    category: string;
    transform: string;
    locus: string;
    count: number;
    disposition: string;
    code: string;
  }[],
): readonly DeidManifestRecord[] {
  return manifest.map((e) => ({
    category: e.category,
    transform: e.transform,
    locus: e.locus,
    count: e.count,
    disposition: e.disposition,
    code: e.code,
  }));
}

/**
 * Load the delegate and bind it to a **per-invocation ephemeral key**, returning the small surface
 * the command uses. The root import is the availability probe: the command calls this **before it
 * reads any input**, so an install without `@cosyte/deid` never touches the bytes it cannot strip.
 *
 * Every import here is dynamic and per-format, so no other command loads the delegate, and each one
 * degrades to a value-free `CLI_PARSER_UNAVAILABLE` (exit `69`) when the package is absent.
 *
 * @param importCore - The root-module import thunk; injectable so a test can force a resolver failure.
 * @returns The bound {@link DeidDelegate}.
 * @throws {CliError} `CLI_PARSER_UNAVAILABLE` (exit `69`) when the library is absent.
 * @example
 * ```ts
 * const delegate = await loadDeidDelegate();
 * delegate.label; // the delegate's own output label
 * ```
 */
export async function loadDeidDelegate(
  importCore: () => Promise<DeidCore> = () => import("@cosyte/deid"),
): Promise<DeidDelegate> {
  const core = await loadOptionalPackage(DEID_UNAVAILABLE_REASON, importCore);
  // The key never leaves this scope, is never written anywhere, and is discarded when the process
  // exits: within one output the surrogates are consistent, across runs they are unlinkable.
  const context = core.createDeidContext({ key: randomBytes(32) });

  return {
    label: core.OUTPUT_LABEL,
    version: core.VERSION,
    redact: async (format, bytes) => {
      switch (format) {
        case "hl7": {
          const { parseHL7 } = await import("@cosyte/hl7");
          const { deidentifyHl7 } = await loadOptionalPackage(
            adapterUnavailable("hl7"),
            () => import("@cosyte/deid/hl7"),
          );
          const msg = parseOrFail("hl7", () => parseHL7(Buffer.from(bytes)));
          return deidentifyOrFail(() => {
            const { document, manifest } = deidentifyHl7(msg, { context });
            return { output: document.toString(), manifest: toRecords(manifest) };
          });
        }
        case "fhir": {
          const { parseResource, serializeResource } = await loadFhir();
          const { deidentifyFhir } = await loadOptionalPackage(
            adapterUnavailable("fhir"),
            () => import("@cosyte/deid/fhir"),
          );
          const resource = parseOrFail("fhir", () => parseResource(decode(bytes)).resource);
          return deidentifyOrFail(() => {
            const { document, manifest } = deidentifyFhir(resource, { context });
            return { output: serializeResource(document), manifest: toRecords(manifest) };
          });
        }
        case "x12": {
          const { parseX12 } = await loadOptional("x12", () => import("@cosyte/x12"));
          const { deidentifyX12 } = await loadOptionalPackage(
            adapterUnavailable("x12"),
            () => import("@cosyte/deid/x12"),
          );
          const interchange = parseOrFail("x12", () => parseX12(Buffer.from(bytes)));
          return deidentifyOrFail(() => {
            const { x12, manifest } = deidentifyX12(interchange, { context });
            return { output: x12, manifest: toRecords(manifest) };
          });
        }
        case "ccda": {
          const { parseCcda, serializeCcda } = await loadOptional(
            "ccda",
            () => import("@cosyte/ccda"),
          );
          const { deidentifyCcda } = await loadOptionalPackage(
            adapterUnavailable("ccda"),
            () => import("@cosyte/deid/ccda"),
          );
          const doc = parseOrFail("ccda", () => parseCcda(decode(bytes)));
          return deidentifyOrFail(() => {
            const { document, manifest } = deidentifyCcda(doc, { context });
            return { output: serializeCcda(document), manifest: toRecords(manifest) };
          });
        }
      }
    },
  };
}

/**
 * Whether de-identification is available, and (while it is not) the value-free reason why. The one
 * function that answers "is the ground layer here?", consulted **before any input is read** so a
 * `redact` invocation never touches PHI it cannot strip.
 */
export interface DeidAvailability {
  /** `true` when `@cosyte/deid` resolves in this install. */
  readonly available: boolean;
  /** A value-free explanation: the delegate's own label and version, or why it is unavailable. */
  readonly reason: string;
}

/**
 * Report the current de-identification availability. This is the single documented flip point: it
 * resolves the delegated library rather than asserting anything about it.
 *
 * @param load - The delegate loader; injectable so a test can drive the unavailable branch.
 * @returns `{ available: true }` with the delegate's own label and version, else `{ available: false }`
 *   with the value-free {@link DEID_UNAVAILABLE_REASON}.
 * @example
 * ```ts
 * import { deidStatus } from "@cosyte/cli";
 *
 * (await deidStatus()).available; // => true when @cosyte/deid is installed
 * ```
 */
export async function deidStatus(
  load: () => Promise<DeidDelegate> = loadDeidDelegate,
): Promise<DeidAvailability> {
  try {
    const delegate = await load();
    return {
      available: true,
      reason: `${DEID_PACKAGE} ${delegate.version}: ${delegate.label}`,
    };
  } catch (e) {
    if (e instanceof CliError) return { available: false, reason: DEID_UNAVAILABLE_REASON };
    throw e;
  }
}
