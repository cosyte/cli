/**
 * Input I/O for the CLI: read the bytes to operate on from a **file argument** or from **stdin**
 * (`-`), with a value-free failure mode. The CLI never writes a temp file and never logs to a file
 * (cli roadmap §7); this module only *reads*.
 *
 * The reader functions are injected into the command layer as {@link RunDeps} so the whole dispatch
 * path is testable without touching `process` — the real `process.stdin` wiring lives in the thin
 * `bin` entry.
 *
 * @packageDocumentation
 */

import { readFile } from "node:fs/promises";
import type { Readable } from "node:stream";

import { CLI_CODES, CliError } from "./diagnostics.js";
import { EXIT } from "./exit-codes.js";

/**
 * The injectable input side-effects the dispatcher needs. Kept tiny and pure-ish so tests drive the
 * CLI end to end with in-memory fakes and no real filesystem or stdin.
 */
export interface RunDeps {
  /** Read a file's bytes, or raise a `CLI_NO_INPUT` {@link CliError} if it cannot be read. */
  readonly readFile: (path: string) => Promise<Uint8Array>;
  /** Read all of stdin's bytes. */
  readonly readStdin: () => Promise<Uint8Array>;
}

/**
 * Read a file into bytes, mapping any read failure to a **value-free** `CLI_NO_INPUT` /
 * {@link EXIT.NOINPUT} error. The path is structural context (the user supplied it), so it may appear
 * in the message; the file *contents* never do.
 *
 * @param path - The file path to read.
 * @returns The file bytes.
 * @throws {CliError} `CLI_NO_INPUT` (exit `66`) when the file is missing, a directory, or unreadable.
 * @example
 * ```ts throws
 * import { readFileBytes } from "@cosyte/cli";
 *
 * await readFileBytes("/no/such/file"); // throws CliError CLI_NO_INPUT
 * ```
 */
export async function readFileBytes(path: string): Promise<Uint8Array> {
  try {
    return await readFile(path);
  } catch {
    throw new CliError(
      CLI_CODES.CLI_NO_INPUT,
      EXIT.NOINPUT,
      `cannot read input file: ${path} (does it exist and is it readable?)`,
    );
  }
}

/**
 * Drain a readable stream (e.g. `process.stdin`) into a single byte buffer.
 *
 * @param stream - The readable stream to drain.
 * @returns The concatenated bytes.
 * @example
 * ```ts
 * import { Readable } from "node:stream";
 * import { readStreamBytes } from "@cosyte/cli";
 *
 * const bytes = await readStreamBytes(Readable.from([Buffer.from("MSH|")]));
 * bytes.length; // => 4
 * ```
 */
export async function readStreamBytes(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf-8") : chunk);
  }
  return Buffer.concat(chunks);
}
