/**
 * **Record streaming**: turning a stream of input byte chunks into a stream of whole records, so a
 * multi-record command can emit a record's output *before* the rest of its input has been read.
 *
 * Two input shapes are multi-record, and both arrive here as chunks rather than as one buffer: an
 * **MLLP** stream (each VT-framed frame encloses one HL7 v2 message) and any input under
 * **`--ndjson`** (each non-empty line is a record). Neither splitter re-implements a wire format: the
 * MLLP one drives `@cosyte/mllp`'s own streaming `FrameReader`, and the NDJSON one splits on the line
 * terminator, which is the bulk-data convention's own framing, not a parse of the records inside it.
 *
 * The size limit is enforced here too, as {@link withinLimit}: a running byte count over the chunk
 * stream, so an over-limit input is refused **while it is arriving** rather than after it has been
 * assembled.
 *
 * @packageDocumentation
 */

import { inputTooLargeError, MAX_INPUT_BYTES } from "./limits.js";
import { loadOptional, truncatedMllpError } from "./parsers.js";

/** A stream of input byte chunks, in arrival order: what every function here consumes. */
export type ByteChunks = AsyncIterable<Uint8Array>;

/** The NDJSON record terminator (`\n`); a preceding `\r` is part of the terminator, not the record. */
const LINE_FEED = 0x0a;
/** The carriage return that may precede a line feed on a CRLF stream. */
const CARRIAGE_RETURN = 0x0d;
/** The MLLP start-of-block byte: a frame opens with it. */
const VERTICAL_TAB = 0x0b;
/** The MLLP end-of-block byte: a frame closes with it (followed by a carriage return). */
const FILE_SEPARATOR = 0x1c;

/** View a chunk as a `Buffer` without copying it. */
function asBuffer(chunk: Uint8Array): Buffer {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.length);
}

/**
 * Wrap `bytes` as a one-chunk stream, so the streaming record path can also serve a caller that
 * hands the CLI a whole buffer (an injected reader, or the programmatic API). The path is the same;
 * only the granularity the input arrives at differs.
 *
 * @param bytes - The whole input.
 * @returns A stream yielding exactly one chunk (or none, when `bytes` is empty).
 * @example
 * ```ts
 * import { oneChunk } from "@cosyte/cli";
 *
 * let n = 0;
 * for await (const c of oneChunk(new Uint8Array([1, 2, 3]))) n += c.length;
 * n; // => 3
 * ```
 */
export async function* oneChunk(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  // A one-element stream still has to be a real async iterable, so the tick is deliberate: every
  // consumer here is written against a source that arrives over time.
  await Promise.resolve();
  if (bytes.length > 0) yield bytes;
}

/**
 * Pass chunks through while counting them against the CLI's own size limit, and **refuse the moment
 * the running total passes it**: the chunk that crosses the limit is never yielded, the source is
 * never pulled again, and nothing downstream ever allocates memory proportional to an oversized
 * input. This is why the refusal a caller sees is the CLI's own data error rather than a platform
 * allocation failure reported as an internal error.
 *
 * @param chunks - The input chunk stream.
 * @param limit - The maximum number of bytes to accept. Defaults to {@link MAX_INPUT_BYTES}.
 * @returns The same chunks, up to the limit.
 * @throws {CliError} `CLI_INPUT_TOO_LARGE` (exit `65`) as soon as the running total passes `limit`.
 * @example
 * ```ts
 * import { oneChunk, withinLimit } from "@cosyte/cli";
 *
 * const src = withinLimit(oneChunk(new Uint8Array(10)), 4);
 * await src.next().catch((e: unknown) => (e as { code: string }).code); // => "CLI_INPUT_TOO_LARGE"
 * ```
 */
export async function* withinLimit(
  chunks: ByteChunks,
  limit: number = MAX_INPUT_BYTES,
): AsyncGenerator<Uint8Array> {
  let total = 0;
  for await (const chunk of chunks) {
    total += chunk.length;
    if (total > limit) throw inputTooLargeError(limit);
    yield chunk;
  }
}

/**
 * Drain a chunk stream into one buffer: the single-message path, where the parser needs the whole
 * message anyway. The size limit is already applied by {@link withinLimit} upstream, so this cannot
 * accumulate more than the limit allows.
 *
 * @param chunks - The input chunk stream.
 * @returns The concatenated bytes.
 * @example
 * ```ts
 * import { collectChunks, oneChunk } from "@cosyte/cli";
 *
 * (await collectChunks(oneChunk(new TextEncoder().encode("MSH|")))).length; // => 4
 * ```
 */
export async function collectChunks(chunks: ByteChunks): Promise<Uint8Array> {
  const parts: Buffer[] = [];
  for await (const chunk of chunks) parts.push(asBuffer(chunk));
  return Buffer.concat(parts);
}

/** True iff every byte of `line` is whitespace (so the line carries no record). */
function isBlank(line: Uint8Array): boolean {
  return new TextDecoder("utf-8", { fatal: false }).decode(line).trim().length === 0;
}

/** Drop the `\r` of a CRLF terminator, which belongs to the terminator rather than to the record. */
function stripCarriageReturn(line: Buffer): Buffer {
  return line.length > 0 && line[line.length - 1] === CARRIAGE_RETURN
    ? line.subarray(0, line.length - 1)
    : line;
}

/**
 * Split a chunk stream into **NDJSON records**: each non-empty, newline-terminated line, yielded as
 * soon as its terminator arrives. A record split across two chunks is carried over; a final record
 * with no trailing newline is yielded at end of stream; a blank line carries no record and is
 * skipped.
 *
 * @param chunks - The input chunk stream.
 * @returns A stream of record bytes, in input order.
 * @example
 * ```ts
 * import { ndjsonRecords, oneChunk } from "@cosyte/cli";
 *
 * const src = oneChunk(new TextEncoder().encode('{"a":1}\n\n{"b":2}\n'));
 * const out: string[] = [];
 * for await (const r of ndjsonRecords(src)) out.push(new TextDecoder().decode(r));
 * out.length; // => 2
 * ```
 */
export async function* ndjsonRecords(chunks: ByteChunks): AsyncGenerator<Uint8Array> {
  let carry: Buffer = Buffer.alloc(0);
  for await (const chunk of chunks) {
    const buf = carry.length > 0 ? Buffer.concat([carry, asBuffer(chunk)]) : asBuffer(chunk);
    let start = 0;
    for (;;) {
      const end = buf.indexOf(LINE_FEED, start);
      if (end < 0) break;
      const line = stripCarriageReturn(buf.subarray(start, end));
      if (!isBlank(line)) yield line;
      start = end + 1;
    }
    // Copy the tail so the chunk it came from can be released while we wait for the next one.
    carry = start === 0 ? asBuffer(buf) : Buffer.from(buf.subarray(start));
  }
  const last = stripCarriageReturn(carry);
  if (!isBlank(last)) yield last;
}

/**
 * De-frame a chunk stream into **MLLP frame payloads** (each an enclosed HL7 v2 message), yielded as
 * each frame completes. The framing is `@cosyte/mllp`'s own streaming `FrameReader`, fed chunk by
 * chunk; the CLI only tracks where the frame bytes fell so it can tell a **truncated** stream from a
 * complete one.
 *
 * **Truncation is a data error, never a silent drop.** An unterminated trailing frame (a start-of-block
 * byte after the last end-of-block byte) is delivered by no callback, so it would otherwise vanish
 * with a green exit. It is detected at end of stream and raised, after the frames that did complete
 * have already been yielded: their output stands, and the invocation still resolves to the data error.
 *
 * @param chunks - The input chunk stream.
 * @returns A stream of enclosed HL7 payloads, in frame order.
 * @throws {CliError} `CLI_PARSER_UNAVAILABLE` (exit `69`) if `@cosyte/mllp` is absent;
 *   `CLI_PARSE_FAILED` (exit `65`) at end of stream on a truncated final frame.
 * @example
 * ```ts
 * import { mllpFrames, oneChunk } from "@cosyte/cli";
 *
 * const framed = new Uint8Array([0x0b, 0x4d, 0x53, 0x48, 0x1c, 0x0d]);
 * const seen: number[] = [];
 * for await (const p of mllpFrames(oneChunk(framed))) seen.push(p.length);
 * seen.length; // => 1
 * ```
 */
export async function* mllpFrames(chunks: ByteChunks): AsyncGenerator<Uint8Array> {
  const { FrameReader } = await loadOptional("mllp", () => import("@cosyte/mllp"));
  const ready: Buffer[] = [];
  const reader = new FrameReader({
    onFrame: (payload) => ready.push(Buffer.from(payload)),
    onWarning: () => undefined,
    // The CLI's own documented input limit is the binding one, so the reader's smaller default frame
    // ceiling is raised to it: an over-limit MLLP stream is refused by the limit the help output and
    // the command reference state, not by an undocumented one underneath it.
    maxFrameSizeBytes: MAX_INPUT_BYTES,
  });

  // Offsets of the last start-of-block and end-of-block bytes seen anywhere in the stream: an
  // enclosed HL7 v2 payload never carries either byte, so their order at end of stream is the same
  // truncation test the whole-buffer de-framer applies.
  let lastStart = -1;
  let lastEnd = -1;
  let offset = 0;

  for await (const chunk of chunks) {
    const buf = asBuffer(chunk);
    const start = buf.lastIndexOf(VERTICAL_TAB);
    if (start >= 0) lastStart = offset + start;
    const end = buf.lastIndexOf(FILE_SEPARATOR);
    if (end >= 0) lastEnd = offset + end;
    offset += buf.length;

    reader.push(buf);
    while (ready.length > 0) {
      const frame = ready.shift();
      if (frame !== undefined) yield frame;
    }
  }

  if (lastStart > lastEnd) throw truncatedMllpError();
}
