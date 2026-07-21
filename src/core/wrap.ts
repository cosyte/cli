/**
 * The **wrapped-parser failure boundary** — the single, value-free way every command turns a thrown
 * parser/codec exception into a {@link RunResult}. A wrapped library raises a fatal on genuinely
 * unparseable input; its message (and, for HL7, its `snippet`) can embed the offending bytes, so the
 * CLI **never** surfaces that message. It surfaces only a stable, PHI-free code token (via
 * {@link extractStableCode}) plus the format name — the parsers' "warning = code + position, never a
 * value" rule at the CLI edge (cli roadmap §7).
 *
 * The one, opt-in exception is `--unsafe-show-values`, whose bounded excerpt is appended through the
 * lone chokepoint in `core/phi.ts` ({@link unsafeInputSuffix}) — so the "a value appears on a
 * secondary surface **iff** the flag is set" property stays provable in one place, uniformly across
 * `parse`/`validate`/`inspect`/`fmt`.
 *
 * @packageDocumentation
 */

import { CLI_CODES } from "./diagnostics.js";
import { EXIT } from "./exit-codes.js";
import type { CosyteFormat } from "./format.js";
import { unsafeInputSuffix, type PhiPosture } from "./phi.js";
import type { RunResult } from "./result.js";

/**
 * Pull a `code` off a thrown value **only** when it is a PHI-free constant token
 * (`^[A-Z][A-Z0-9_]*$` — a letter-led UPPER_SNAKE code like `MALFORMED_JSON`) — e.g. a wrapped
 * parser's stable fatal code. Anything else (no `code`, a non-string, a non-token, or a **pure-digit**
 * value that could be a raw identifier) yields `null`, so a parser exception that embedded input bytes
 * in a `code`-shaped field can never reach a diagnostic.
 *
 * @param e - A caught value.
 * @returns The stable code token, or `null`.
 * @example
 * ```ts
 * import { extractStableCode } from "@cosyte/cli";
 *
 * extractStableCode({ code: "MALFORMED_JSON" }); // => "MALFORMED_JSON"
 * extractStableCode(new Error("boom")); // => null
 * ```
 */
export function extractStableCode(e: unknown): string | null {
  if (typeof e === "object" && e !== null && "code" in e) {
    const raw: unknown = e.code;
    if (typeof raw === "string" && /^[A-Z][A-Z0-9_]*$/.test(raw)) return raw;
  }
  return null;
}

/**
 * Build the value-free {@link RunResult} for a **wrapped-parser rejection** — a `CLI_PARSE_FAILED`
 * data error (exit `65`). The stderr line names the format and, when the thrown value carried one, a
 * stable code token in parentheses; it **never** echoes the parser's message or the input bytes. Under
 * `--unsafe-show-values` (and only then) a bounded excerpt of the offending input is appended via the
 * single {@link unsafeInputSuffix} chokepoint.
 *
 * @param format - The format whose parser rejected the input.
 * @param bytes - The offending input (only consulted for the opt-in unsafe excerpt).
 * @param posture - The resolved {@link PhiPosture}; the excerpt is appended only when it opts in.
 * @param e - The caught exception (its `code`, if a stable token, is surfaced — nothing else).
 * @returns A value-free `CLI_PARSE_FAILED` / exit-`65` {@link RunResult}.
 * @example
 * ```ts
 * import { parseFailureResult, VALUE_FREE } from "@cosyte/cli";
 *
 * const bytes = new TextEncoder().encode("not hl7");
 * parseFailureResult("hl7", bytes, VALUE_FREE, { code: "MISSING_MSH" }).exit; // => 65
 * ```
 */
export function parseFailureResult(
  format: CosyteFormat,
  bytes: Uint8Array,
  posture: PhiPosture,
  e: unknown,
): RunResult {
  const code = extractStableCode(e);
  const detail = code === null ? "" : ` (${code})`;
  const suffix = unsafeInputSuffix(bytes, posture);
  return {
    stdout: "",
    stderr: `cosyte: ${CLI_CODES.CLI_PARSE_FAILED}: the ${format} parser rejected the input${detail}${suffix}\n`,
    exit: EXIT.DATAERR,
  };
}
