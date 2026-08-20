/**
 * The CLI's **own input-size ceiling**, and the value-free refusal it raises.
 *
 * Node has two hard allocation ceilings a byte pipeline can walk into: a single `Buffer` cannot
 * exceed `buffer.constants.MAX_LENGTH` and a single string cannot exceed
 * `buffer.constants.MAX_STRING_LENGTH`. Crossing either raises a *platform* exception, which is
 * indistinguishable, at the CLI edge, from a bug: it would be reported as an internal error even
 * though the input was merely large. That is a lie about whose fault it is, and it is the reason this
 * module exists.
 *
 * So the CLI declares a limit of its **own**, far below both ceilings, checks it against the
 * **running total as input is read** (never after a whole oversized input has been assembled), and
 * refuses an over-limit invocation with a stable, value-free diagnostic and the **data-error** exit
 * code. The number is a documented part of the command surface: it is stated in `cosyte --help` and
 * in the command reference, and both are rendered from {@link MAX_INPUT_BYTES} so they cannot drift.
 *
 * @packageDocumentation
 */

import { CLI_CODES, CliError } from "./diagnostics.js";
import { EXIT } from "./exit-codes.js";

/** Bytes in one mebibyte: the unit the human half of the limit text is expressed in. */
const BYTES_PER_MIB = 1024 * 1024;

/**
 * The maximum number of input bytes `cosyte parse` reads in one invocation: **67108864 bytes
 * (64 MiB)**.
 *
 * Chosen to sit far below the smaller of Node's two allocation ceilings
 * (`buffer.constants.MAX_STRING_LENGTH`, 536870888 characters), because the bytes read are not the
 * peak: a parsed model rendered as JSON is routinely several times the size of the input that
 * produced it, so the limit has to leave room for the output as well as the input. A power of two, so
 * the byte count and its mebibyte rendering are both exact.
 *
 * @example
 * ```ts
 * import { MAX_INPUT_BYTES } from "@cosyte/cli";
 *
 * MAX_INPUT_BYTES; // => 67108864
 * ```
 */
export const MAX_INPUT_BYTES = 64 * BYTES_PER_MIB;

/**
 * Render a byte limit as a **concrete number with an explicit byte-based unit**: `"67108864 bytes
 * (64 MiB)"`. Every surface that states the limit (the refusal diagnostic, `cosyte --help`, the
 * command reference) renders it through here, so the number a user reads is always the number the
 * code enforces, and never a vague description of one.
 *
 * @param limit - The limit in bytes. Defaults to {@link MAX_INPUT_BYTES}.
 * @returns The limit as bytes, plus a mebibyte rendering when it is a whole number of mebibytes.
 * @example
 * ```ts
 * import { describeByteLimit } from "@cosyte/cli";
 *
 * describeByteLimit(67108864); // => "67108864 bytes (64 MiB)"
 * describeByteLimit(1000); // => "1000 bytes"
 * ```
 */
export function describeByteLimit(limit: number = MAX_INPUT_BYTES): string {
  const mib = limit / BYTES_PER_MIB;
  return Number.isInteger(mib)
    ? `${String(limit)} bytes (${String(mib)} MiB)`
    : `${String(limit)} bytes`;
}

/**
 * Build the value-free over-limit refusal: a stable `CLI_INPUT_TOO_LARGE` code, the **data-error**
 * exit (`65`, never the internal-error `70`), and a message that names the limit and nothing else.
 * The offending input's own size is deliberately not reported either: the limit is the actionable
 * fact, and a size read off the input is a property of the input.
 *
 * @param limit - The limit that was exceeded, in bytes. Defaults to {@link MAX_INPUT_BYTES}.
 * @returns The value-free {@link CliError} to resolve the invocation with.
 * @example
 * ```ts
 * import { inputTooLargeError } from "@cosyte/cli";
 *
 * inputTooLargeError().exit; // => 65
 * inputTooLargeError().code; // => "CLI_INPUT_TOO_LARGE"
 * ```
 */
export function inputTooLargeError(limit: number = MAX_INPUT_BYTES): CliError {
  return new CliError(
    CLI_CODES.CLI_INPUT_TOO_LARGE,
    EXIT.DATAERR,
    `input is larger than the ${describeByteLimit(limit)} this command reads in one ` +
      `invocation; split the input and re-run`,
  );
}
