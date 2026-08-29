/**
 * The shared **input + format resolution** every file-consuming command runs before it touches a
 * wrapped parser: resolve the `<file|->` argument, read its bytes (a file, or stdin for `-`), reject
 * empty input, then resolve the format: an explicit `--format` override (validated) or conservative
 * content autodetection, and confirm the format is actually wired in this build. Factored out of the
 * commands so `parse`/`validate`/`inspect`/`fmt` share one identical, value-free front door and the
 * exit-code contract is applied in exactly one place.
 *
 * Every failure is a value-free {@link CliError} rendered to a {@link RunResult}: a missing argument
 * is a usage error (`2`), an unreadable file a no-input error (`66`), empty/undetected/unwired input a
 * data error (`65`), an input past the documented size limit a data error too (`65`, never the
 * internal-error code). None ever echoes an input byte.
 *
 * Two front doors, one contract: {@link resolveInput} hands back the whole input as one buffer, and
 * {@link resolveInputStream} hands back a chunk stream for a command that emits output before the
 * input has finished arriving. They share the format-resolution and exit-code decisions, so a bad
 * `--format`, an undetectable input and an unwired (format, op) resolve identically either way.
 *
 * @packageDocumentation
 */

import {
  asCosyteFormat,
  detectFormat,
  detectionError,
  DETECT_PREFIX_BYTES,
  type CosyteFormat,
} from "./format.js";
import { CLI_CODES, CliError, errorResult } from "./diagnostics.js";
import { EXIT } from "./exit-codes.js";
import type { RunDeps } from "./io.js";
import { MAX_INPUT_BYTES } from "./limits.js";
import { formatsSupporting, supportsOp, type Op } from "./parsers.js";
import { oneChunk, withinLimit, type ByteChunks } from "./records.js";
import type { RunResult } from "./result.js";

/** A successfully-resolved input: the format (guaranteed to support the requested op) and the bytes. */
export interface ResolvedInput {
  /** The resolved format: guaranteed to satisfy `supportsOp(format, op)` for the requested op. */
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
 *   it (else a value-free `CLI_FORMAT_UNSUPPORTED` naming the supporting formats). Pass `null` when
 *   the caller answers for capability itself: `redact` delegates to `@cosyte/deid`, whose per-format
 *   coverage is a different matrix with its own two distinct refusals, so applying the parser
 *   registry's matrix first would answer with the wrong code.
 * @returns `{ ok: true, input }` when the bytes read and the format resolved to a parser supporting
 *   `op`; else `{ ok: false, result }` with a value-free usage/no-input/data-error {@link RunResult}.
 * @throws Propagates a **non-`CliError`** read failure unchanged, so the dispatcher maps it to
 *   `CLI_INTERNAL` (a `CliError` read failure, e.g. a missing file, is caught and returned).
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
  op: Op | null,
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

  const format = resolveFormat(bytes, formatOverride, op);
  if (format instanceof CliError) return fail(format);

  return { ok: true, input: { format, bytes } };
}

/**
 * A successfully-resolved **streaming** input: the format, plus the input as a stream of chunks with
 * the leading bytes detection consumed put back in front, so the consumer still sees the whole input
 * in order.
 */
export interface ResolvedInputStream {
  /** The resolved format: guaranteed to satisfy `supportsOp(format, op)` for the requested op. */
  readonly format: CosyteFormat;
  /** The whole input as chunks, size-limited: reading past the limit raises `CLI_INPUT_TOO_LARGE`. */
  readonly chunks: ByteChunks;
}

/**
 * The outcome of {@link resolveInputStream}: the resolved streaming input, or a ready-to-return
 * value-free {@link RunResult}. The same discriminated-union shape as {@link InputResolution}.
 */
export type InputStreamResolution =
  | { readonly ok: true; readonly input: ResolvedInputStream }
  | { readonly ok: false; readonly result: RunResult };

/**
 * Resolve the input as a **stream of chunks** rather than one buffer, for a command that can act on a
 * record before the whole input has arrived.
 *
 * It reads only as far as the detection window ({@link DETECT_PREFIX_BYTES}) before deciding the
 * format, then hands back those bytes followed by the rest of the stream, unread. The size limit is
 * applied to the running total from the first chunk, so an over-limit input is refused while it is
 * still arriving and never assembled.
 *
 * When the caller's {@link RunDeps} carry no chunk readers, the whole-input readers are wrapped as a
 * single chunk: the same code path, the same output, only the granularity differs.
 *
 * @param source - The positional `<file|->` argument (or `undefined` when it was omitted).
 * @param formatOverride - The raw `--format` value, or `undefined` to autodetect by content.
 * @param deps - Injected readers ({@link RunDeps}); the chunk readers are used when present.
 * @param op - The wrapping operation the caller will run; the resolved format is confirmed to support it.
 * @param limit - The maximum number of input bytes to accept. Defaults to {@link MAX_INPUT_BYTES}.
 * @returns `{ ok: true, input }` with the format and the chunk stream, else `{ ok: false, result }`
 *   carrying the value-free usage / no-input / data-error {@link RunResult}.
 * @throws Propagates a **non-`CliError`** read failure unchanged, so the dispatcher maps it to
 *   `CLI_INTERNAL`.
 * @example
 * ```ts
 * import { resolveInputStream } from "@cosyte/cli";
 *
 * const deps = {
 *   readFile: async () => new TextEncoder().encode('{"resourceType":"Patient"}'),
 *   readStdin: async () => new Uint8Array(),
 * };
 * const r = await resolveInputStream("patient.json", undefined, deps, "parse");
 * if (r.ok) r.input.format; // => "fhir"
 * ```
 */
export async function resolveInputStream(
  source: string | undefined,
  formatOverride: string | undefined,
  deps: RunDeps,
  op: Op,
  limit: number = MAX_INPUT_BYTES,
): Promise<InputStreamResolution> {
  if (source === undefined) {
    return fail(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        "missing <file> argument; pass a path or `-` to read stdin",
      ),
    );
  }

  const iterator = withinLimit(openChunks(source, deps), limit)[Symbol.asyncIterator]();

  // Read just far enough to decide the format, and no further: the detection window when the format
  // is autodetected, a single byte (the empty-input check) when `--format` already decided it. Those
  // chunks are put back in front below, so nothing is consumed twice.
  const need = formatOverride === undefined ? DETECT_PREFIX_BYTES : 1;
  const head: Uint8Array[] = [];
  let headBytes = 0;
  try {
    while (headBytes < need) {
      const step = await iterator.next();
      if (step.done === true) break;
      head.push(step.value);
      headBytes += step.value.length;
    }
  } catch (e) {
    if (e instanceof CliError) return fail(e);
    throw e;
  }

  if (headBytes === 0) {
    return fail(new CliError(CLI_CODES.CLI_EMPTY_INPUT, EXIT.DATAERR, "input is empty"));
  }

  const prefix = Buffer.concat(
    head.map((c) => Buffer.from(c.buffer, c.byteOffset, c.length)),
    Math.min(headBytes, DETECT_PREFIX_BYTES),
  );
  const format = resolveFormat(prefix, formatOverride, op);
  if (format instanceof CliError) {
    await iterator.return(undefined);
    return fail(format);
  }

  return { ok: true, input: { format, chunks: rejoin(head, iterator) } };
}

/** The chunk stream for `<file|->`: the injected chunk reader, or the whole-input reader as one chunk. */
function openChunks(source: string, deps: RunDeps): ByteChunks {
  if (source === "-") {
    return deps.openStdin === undefined ? readerAsChunks(() => deps.readStdin()) : deps.openStdin();
  }
  return deps.openFile === undefined
    ? readerAsChunks(() => deps.readFile(source))
    : deps.openFile(source);
}

/** Adapt a whole-input reader to the chunk-stream shape (one chunk, or none when it is empty). */
async function* readerAsChunks(read: () => Promise<Uint8Array>): AsyncGenerator<Uint8Array> {
  yield* oneChunk(await read());
}

/** Re-attach the chunks detection consumed to the front of the unread remainder. */
async function* rejoin(
  head: readonly Uint8Array[],
  rest: AsyncIterator<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  for (const chunk of head) yield chunk;
  for (;;) {
    const step = await rest.next();
    if (step.done === true) return;
    yield step.value;
  }
}

/**
 * Resolve the format for an input from its **leading bytes**: an explicit `--format` override
 * (validated), else conservative content autodetection, then a check that the format supports the
 * requested operation. Shared by the buffered and streaming resolvers so the exit-code contract for a
 * bad `--format`, an undetectable input and an unwired (format, op) is applied in exactly one place.
 * A `null` op skips only that last check: the caller has its own capability matrix (see
 * {@link resolveInput}), and the read, the empty-input refusal and the `--format` validation are
 * unchanged.
 */
function resolveFormat(
  prefix: Uint8Array,
  formatOverride: string | undefined,
  op: Op | null,
): CosyteFormat | CliError {
  let format: CosyteFormat;
  if (formatOverride !== undefined) {
    const narrowed = asCosyteFormat(formatOverride);
    if (narrowed === null) {
      return new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        "unknown --format value; expected one of hl7, fhir, dicom, x12, ccda, ncpdp, astm, mllp",
      );
    }
    format = narrowed;
  } else {
    const detected = detectFormat(prefix);
    // `format` is non-null iff detection is `certain`; `none`/`ambiguous` become a value-free data error.
    if (detected.format === null) return detectionError(detected);
    format = detected.format;
  }

  if (op !== null && !supportsOp(format, op)) {
    return new CliError(
      CLI_CODES.CLI_FORMAT_UNSUPPORTED,
      EXIT.DATAERR,
      `format '${format}' does not support \`${op}\` in this CLI build ` +
        `(${op} supports: ${formatsSupporting(op).join(", ")})`,
    );
  }
  return format;
}

/** Wrap a {@link CliError} as a failed resolution (either shape). */
function fail(e: CliError): { readonly ok: false; readonly result: RunResult } {
  return { ok: false, result: errorResult(e) };
}
