/**
 * The shared **input + format resolution** every file-consuming command runs before it touches a
 * wrapped parser: resolve the `<file|->` argument, read its bytes (a file, or stdin for `-`), reject
 * empty input, then resolve the format — an explicit `--format` override (validated) or conservative
 * content autodetection — and confirm the format is actually wired in this build. Factored out of the
 * commands so `parse`/`validate`/`inspect`/`fmt` share one identical, value-free front door and the
 * exit-code contract is applied in exactly one place (cli roadmap §3, §4.3, §5).
 *
 * Every failure is a value-free {@link CliError} rendered to a {@link RunResult} — a missing argument
 * is a usage error (`2`), an unreadable file a no-input error (`66`), empty/undetected/unwired input a
 * data error (`65`). None ever echoes an input byte.
 *
 * @packageDocumentation
 */

import { asCosyteFormat, detectFormat, detectionError, type CosyteFormat } from "./format.js";
import { CLI_CODES, CliError, errorResult } from "./diagnostics.js";
import { EXIT } from "./exit-codes.js";
import type { RunDeps } from "./io.js";
import { formatsSupporting, supportsOp, type Op } from "./parsers.js";
import type { RunResult } from "./result.js";

/** A successfully-resolved input: the format (guaranteed to support the requested op) and the bytes. */
export interface ResolvedInput {
  /** The resolved format — guaranteed to satisfy `supportsOp(format, op)` for the requested op. */
  readonly format: CosyteFormat;
  /** The input bytes (a whole file or a drained stdin buffer); guaranteed non-empty. */
  readonly bytes: Uint8Array;
}

/**
 * The outcome of {@link resolveInput}: either the resolved input, or a ready-to-return value-free
 * {@link RunResult} carrying the diagnostic + exit code for whatever went wrong. A discriminated union
 * so a command reads `if (!r.ok) return r.result;` and then works with `r.input`.
 */
export type InputResolution =
  | { readonly ok: true; readonly input: ResolvedInput }
  | { readonly ok: false; readonly result: RunResult };

/**
 * Resolve and read the input, and resolve its format, for a file-consuming command.
 *
 * @param source - The positional `<file|->` argument (or `undefined` when it was omitted).
 * @param formatOverride - The raw `--format` value, or `undefined` to autodetect by content.
 * @param deps - Injected input readers ({@link RunDeps}).
 * @param op - The wrapping operation the caller will run; the resolved format is confirmed to support
 *   it (else a value-free `CLI_FORMAT_UNSUPPORTED` naming the supporting formats).
 * @returns `{ ok: true, input }` when the bytes read and the format resolved to a parser supporting
 *   `op`; else `{ ok: false, result }` with a value-free usage/no-input/data-error {@link RunResult}.
 * @throws Propagates a **non-`CliError`** read failure unchanged, so the dispatcher maps it to
 *   `CLI_INTERNAL` (a `CliError` read failure — e.g. a missing file — is caught and returned).
 * @example
 * ```ts
 * import { resolveInput } from "@cosyte/cli";
 *
 * const deps = {
 *   readFile: async () => new TextEncoder().encode('{"resourceType":"Patient"}'),
 *   readStdin: async () => new Uint8Array(),
 * };
 * const r = await resolveInput("patient.json", undefined, deps, "parse");
 * if (r.ok) r.input.format; // => "fhir"
 * ```
 */
export async function resolveInput(
  source: string | undefined,
  formatOverride: string | undefined,
  deps: RunDeps,
  op: Op,
): Promise<InputResolution> {
  if (source === undefined) {
    return fail(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        "missing <file> argument; pass a path or `-` to read stdin",
      ),
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = source === "-" ? await deps.readStdin() : await deps.readFile(source);
  } catch (e) {
    if (e instanceof CliError) return fail(e);
    throw e;
  }

  if (bytes.length === 0) {
    return fail(new CliError(CLI_CODES.CLI_EMPTY_INPUT, EXIT.DATAERR, "input is empty"));
  }

  // Resolve the format: an explicit --format override (validated), else content autodetection.
  let format: CosyteFormat;
  if (formatOverride !== undefined) {
    const narrowed = asCosyteFormat(formatOverride);
    if (narrowed === null) {
      return fail(
        new CliError(
          CLI_CODES.CLI_USAGE,
          EXIT.USAGE,
          "unknown --format value; expected one of hl7, fhir, dicom, x12, ccda, ncpdp, astm, mllp",
        ),
      );
    }
    format = narrowed;
  } else {
    const detected = detectFormat(bytes);
    // `format` is non-null iff detection is `certain`; `none`/`ambiguous` become a value-free data error.
    if (detected.format === null) return fail(detectionError(detected));
    format = detected.format;
  }

  if (!supportsOp(format, op)) {
    return fail(
      new CliError(
        CLI_CODES.CLI_FORMAT_UNSUPPORTED,
        EXIT.DATAERR,
        `format '${format}' does not support \`${op}\` in this CLI build ` +
          `(${op} supports: ${formatsSupporting(op).join(", ")})`,
      ),
    );
  }

  return { ok: true, input: { format, bytes } };
}

/** Wrap a {@link CliError} as a failed {@link InputResolution}. */
function fail(e: CliError): InputResolution {
  return { ok: false, result: errorResult(e) };
}
