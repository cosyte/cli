/**
 * Input I/O for the CLI: read the bytes to operate on from a **file argument** or from **stdin**
 * (`-`), with a value-free failure mode. The CLI never writes a temp file and never logs to a file;
 * this module only *reads*.
 *
 * Reading comes in two shapes. The **whole-input** readers ({@link readFileBytes},
 * {@link readStreamBytes}) hand a command one buffer, which is what a single-message command wants.
 * The **chunk** readers ({@link fileChunks}, {@link streamChunks}) hand it an async stream of chunks,
 * which is what a multi-record command wants: it can emit a record's output before the rest of the
 * input has arrived, and the CLI's own size limit can be enforced against the **running total**
 * rather than after an oversized input has already been assembled.
 *
 * The reader functions are injected into the command layer as {@link RunDeps} so the whole dispatch
 * path is testable without touching `process`: the real `process.stdin` wiring lives in the thin
 * `bin` entry, and so does the one function in {@link RunDeps} that writes rather than reads.
 *
 * @packageDocumentation
 */

import { open } from "node:fs/promises";
import type { Readable } from "node:stream";

import { CLI_CODES, CliError } from "./diagnostics.js";
import { EXIT } from "./exit-codes.js";
import { inputTooLargeError, MAX_INPUT_BYTES } from "./limits.js";

/**
 * The injectable I/O side-effects the dispatcher needs. Kept tiny and pure-ish so tests drive the
 * CLI end to end with in-memory fakes and no real filesystem, stdin or stdout.
 *
 * The two whole-input readers are required; the chunk readers and the output sink are **optional**,
 * and a caller that omits them still gets identical output. They are the difference between reading
 * a stream as it arrives and being handed one buffer: with them, a multi-record `parse` emits each
 * record as it is produced and refuses an over-limit input while it is still arriving; without them,
 * the same code path runs over a single chunk and returns its output on the result's `stdout` as
 * before.
 */
export interface RunDeps {
  /** Read a file's bytes, or raise a `CLI_NO_INPUT` {@link CliError} if it cannot be read. */
  readonly readFile: (path: string) => Promise<Uint8Array>;
  /** Read all of stdin's bytes. */
  readonly readStdin: () => Promise<Uint8Array>;
  /** Optional: open a file as a stream of byte chunks (see {@link fileChunks}). */
  readonly openFile?: (path: string) => AsyncIterable<Uint8Array>;
  /** Optional: open stdin as a stream of byte chunks (see {@link streamChunks}). */
  readonly openStdin?: () => AsyncIterable<Uint8Array>;
  /**
   * Optional: write one piece of the data channel **as it is produced**. When present, a multi-record
   * `parse` writes each record's NDJSON line through here instead of accumulating them, and the
   * returned result's `stdout` is empty because the output has already been delivered. May throw (a
   * consumer that closed the pipe); the caller turns that into a value-free
   * `CLI_OUTPUT_WRITE_FAILED`.
   */
  readonly writeStdout?: (chunk: string) => void;
}

/** The value-free failure for a file that is missing, a directory, or otherwise unreadable. */
function noInputError(path: string): CliError {
  return new CliError(
    CLI_CODES.CLI_NO_INPUT,
    EXIT.NOINPUT,
    `cannot read input file: ${path} (does it exist and is it readable?)`,
  );
}

/**
 * Read a file into bytes, mapping any read failure to a **value-free** `CLI_NO_INPUT` /
 * {@link EXIT.NOINPUT} error. The path is structural context (the user supplied it), so it may appear
 * in the message; the file *contents* never do.
 *
 * A file whose size already exceeds `limit` is refused **before it is read**, with the value-free
 * over-limit data error, so an oversized file is never allocated in the first place. The size is read
 * from the **open descriptor** rather than from the path, so what is measured and what is read are the
 * same file even if the path is replaced in between.
 *
 * @param path - The file path to read.
 * @param limit - The maximum number of bytes to accept. Defaults to {@link MAX_INPUT_BYTES}.
 * @returns The file bytes.
 * @throws {CliError} `CLI_NO_INPUT` (exit `66`) when the file is missing, a directory, or unreadable;
 *   `CLI_INPUT_TOO_LARGE` (exit `65`) when it is larger than `limit`.
 * @example
 * ```ts throws
 * import { readFileBytes } from "@cosyte/cli";
 *
 * await readFileBytes("/no/such/file"); // throws CliError CLI_NO_INPUT
 * ```
 */
export async function readFileBytes(
  path: string,
  limit: number = MAX_INPUT_BYTES,
): Promise<Uint8Array> {
  let handle;
  try {
    handle = await open(path, "r");
  } catch {
    throw noInputError(path);
  }
  try {
    const info = await handle.stat();
    if (info.isFile() && info.size > limit) throw inputTooLargeError(limit);
    return await handle.readFile();
  } catch (e) {
    // The over-limit refusal is final; anything else is an unreadable input, reported value-free.
    if (e instanceof CliError) throw e;
    throw noInputError(path);
  } finally {
    await handle.close();
  }
}

/**
 * Drain a readable stream (e.g. `process.stdin`) into a single byte buffer, refusing an over-limit
 * stream against the **running total**: the read is abandoned the moment the accumulated size passes
 * `limit`, so the bytes past it are never allocated and no platform allocation ceiling is ever
 * reached.
 *
 * @param stream - The readable stream to drain.
 * @param limit - The maximum number of bytes to accept. Defaults to {@link MAX_INPUT_BYTES}.
 * @returns The concatenated bytes.
 * @throws {CliError} `CLI_INPUT_TOO_LARGE` (exit `65`) as soon as the running total passes `limit`.
 * @example
 * ```ts
 * import { Readable } from "node:stream";
 * import { readStreamBytes } from "@cosyte/cli";
 *
 * const bytes = await readStreamBytes(Readable.from([Buffer.from("MSH|")]));
 * bytes.length; // => 4
 * ```
 */
export async function readStreamBytes(
  stream: Readable,
  limit: number = MAX_INPUT_BYTES,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk, "utf-8") : chunk;
    total += buf.length;
    if (total > limit) throw inputTooLargeError(limit);
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/**
 * Open a readable stream (e.g. `process.stdin`) as a stream of byte **chunks**, in arrival order.
 * Unlike {@link readStreamBytes} this never concatenates: the consumer decides what to keep, which is
 * what lets a multi-record command emit a record before the rest of the input has been read.
 *
 * @param stream - The readable stream to iterate.
 * @returns An async iterable of the stream's chunks, string chunks encoded as UTF-8.
 * @example
 * ```ts
 * import { Readable } from "node:stream";
 * import { streamChunks } from "@cosyte/cli";
 *
 * const seen: number[] = [];
 * for await (const c of streamChunks(Readable.from([Buffer.from("MS"), Buffer.from("H|")]))) {
 *   seen.push(c.length);
 * }
 * seen.length; // => 2
 * ```
 */
export async function* streamChunks(stream: Readable): AsyncGenerator<Uint8Array> {
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    yield typeof chunk === "string" ? Buffer.from(chunk, "utf-8") : chunk;
  }
}

/**
 * Open a file as a stream of byte **chunks**, with the same value-free failure mode as
 * {@link readFileBytes}: a missing, unreadable or non-file path is a `CLI_NO_INPUT` error, never a
 * raw filesystem exception.
 *
 * @param path - The file path to read.
 * @returns An async iterable of the file's chunks.
 * @throws {CliError} `CLI_NO_INPUT` (exit `66`) when the file cannot be opened or read.
 * @example
 * ```ts throws
 * import { fileChunks } from "@cosyte/cli";
 *
 * for await (const chunk of fileChunks("/no/such/file")) chunk.length; // throws CLI_NO_INPUT
 * ```
 */
export async function* fileChunks(path: string): AsyncGenerator<Uint8Array> {
  let handle;
  try {
    handle = await open(path, "r");
  } catch {
    throw noInputError(path);
  }
  try {
    const stream = handle.createReadStream();
    try {
      for await (const chunk of stream as AsyncIterable<Buffer>) yield chunk;
    } catch {
      throw noInputError(path);
    }
  } finally {
    await handle.close();
  }
}
