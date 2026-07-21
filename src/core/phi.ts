/**
 * The CLI's **global PHI display posture** — the single mechanism that gates whether *any* input
 * value may appear on a **secondary surface** (stderr, a diagnostic, a warning, a log line). The CLI
 * is **value-free by default**: every secondary surface carries only positional/structural context
 * (a stable code, a segment/field index, a byte offset, a file path, a format name) — never a name, a
 * DOB, an MRN, or a field value (cli roadmap §7). `stdout` is the **data channel** (the user's
 * explicit request) and is exempt — the posture governs everything *but* stdout.
 *
 * `--unsafe-show-values` is the **single, explicit, loud door** to a value on a secondary surface. It
 * is off by default, PHI-exposing by design, and its effect flows through exactly one chokepoint here
 * ({@link unsafeInputSuffix}) so the "a value appears on a secondary surface **iff** the flag is set"
 * property is provable in one place rather than scattered across commands.
 *
 * @packageDocumentation
 */

/**
 * The resolved PHI display posture for one invocation. `showValues` is `true` **only** when the user
 * passed `--unsafe-show-values`; every value-echoing decision reads this one flag.
 */
export interface PhiPosture {
  /** `true` iff `--unsafe-show-values` was given: a value may appear on a secondary surface. */
  readonly showValues: boolean;
}

/** The default, safe posture: no value ever reaches a secondary surface. */
export const VALUE_FREE: PhiPosture = { showValues: false };

/** The opted-in, PHI-exposing posture selected by `--unsafe-show-values`. */
export const SHOW_VALUES: PhiPosture = { showValues: true };

/** The single global flag token that opts into showing values on secondary surfaces. */
export const UNSAFE_SHOW_VALUES_FLAG = "--unsafe-show-values";

/**
 * The maximum number of leading input bytes an `--unsafe-show-values` diagnostic may echo. Bounded so
 * an unsafe excerpt stays a single, readable diagnostic line rather than dumping a whole message.
 */
export const UNSAFE_EXCERPT_MAX = 200;

/**
 * Resolve the global `--unsafe-show-values` flag out of an argument vector, **order-independently**
 * (it may appear before or after the subcommand), and return the posture plus the argv with every
 * occurrence of the flag removed — so each command's own `parseArgs` never sees it and cannot reject
 * it as unknown. This is the one place the flag is recognised.
 *
 * @param argv - The raw arguments (after the program name).
 * @returns The resolved {@link PhiPosture} and the flag-stripped argv.
 * @example
 * ```ts
 * import { extractPhiPosture } from "@cosyte/cli";
 *
 * extractPhiPosture(["parse", "x.hl7"]).posture.showValues; // => false
 * extractPhiPosture(["--unsafe-show-values", "parse", "x.hl7"]).posture.showValues; // => true
 * extractPhiPosture(["parse", "x.hl7", "--unsafe-show-values"]).argv; // => ["parse", "x.hl7"]
 * ```
 */
export function extractPhiPosture(argv: readonly string[]): {
  posture: PhiPosture;
  argv: string[];
} {
  const showValues = argv.includes(UNSAFE_SHOW_VALUES_FLAG);
  const cleaned = argv.filter((a) => a !== UNSAFE_SHOW_VALUES_FLAG);
  return { posture: showValues ? SHOW_VALUES : VALUE_FREE, argv: cleaned };
}

/**
 * Build the **only** value-bearing addition the CLI ever appends to a secondary (stderr) surface: a
 * bounded, single-line excerpt of the offending input, shown **iff** `--unsafe-show-values` is set.
 * Under the default value-free posture it returns the empty string, so a diagnostic stays value-free
 * unless the user explicitly opted in. This is the single chokepoint the PHI-leak matrix pins.
 *
 * @param bytes - The input the CLI is operating on (only the leading {@link UNSAFE_EXCERPT_MAX} bytes
 *   are considered).
 * @param posture - The resolved {@link PhiPosture}.
 * @returns `""` under the value-free default; otherwise a ` [unsafe-show-values] …` suffix carrying a
 *   bounded, newline-flattened prefix of `bytes`.
 * @example
 * ```ts
 * import { unsafeInputSuffix, VALUE_FREE, SHOW_VALUES } from "@cosyte/cli";
 *
 * const bytes = new TextEncoder().encode("bad message");
 * unsafeInputSuffix(bytes, VALUE_FREE); // => ""
 * unsafeInputSuffix(bytes, SHOW_VALUES); // => " [unsafe-show-values] offending input …: bad message"
 * ```
 */
export function unsafeInputSuffix(bytes: Uint8Array, posture: PhiPosture): string {
  if (!posture.showValues) return "";
  const text = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, UNSAFE_EXCERPT_MAX))
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  if (text.length === 0) return "";
  return ` [unsafe-show-values] offending input (first ${String(UNSAFE_EXCERPT_MAX)} bytes): ${text}`;
}
