/**
 * The knobs of the fuzz layer.
 *
 * `pnpm test` runs each fuzz target at its committed base count, so a pull request stays fast. The
 * scheduled nightly run (`.github/workflows/nightly-fuzz.yml`, which calls the shared
 * `nightly-fuzz.yml`) runs `pnpm fuzz` with these set, so each night explores a different slice of
 * the input space:
 *
 * - `CLI_FUZZ_SEED`: the fast-check seed, an integer. The nightly passes its run id, so the run
 *   that found something names the seed that replays it.
 * - `CLI_FUZZ_SECONDS`: a time budget per target. When set, a target generates inputs until the
 *   budget is spent instead of stopping at its run count.
 * - `CLI_FUZZ_RUNS`: a multiplier on each target's base run count, for a run of a fixed size.
 *
 * A value that is not a whole number is ignored, so a malformed variable can never make a run
 * smaller than the committed one or silently change the seed.
 *
 * Replaying a finding: the failure prints the counterexample, the seed and the path. Re-run
 * `CLI_FUZZ_SEED=<seed> pnpm fuzz`, or pass `{ seed, path, endOnFailure: true }` to the failing
 * `fc.assert` to step straight to the shrunk case.
 *
 * @module
 */

import type fc from "fast-check";

/** A whole number from the environment, or `undefined` when it is unset or not one. */
function integerFromEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

/** A positive whole number from the environment, or `undefined`. */
function positiveFromEnv(name: string): number | undefined {
  const value = integerFromEnv(name);
  return value !== undefined && value > 0 ? value : undefined;
}

/**
 * The seed override, when the environment names one. Any whole number: fast-check folds a seed
 * to 32 bits and prints the folded value, which can be negative, and that value replays too.
 */
export const FUZZ_SEED: number | undefined = integerFromEnv("CLI_FUZZ_SEED");

const FUZZ_SECONDS: number | undefined = positiveFromEnv("CLI_FUZZ_SECONDS");

const FUZZ_MULTIPLIER: number = positiveFromEnv("CLI_FUZZ_RUNS") ?? 1;

/** How many cases a target runs: its base count times the multiplier, or the time budget. */
function runSize<T>(baseRuns: number): fc.Parameters<T> {
  return FUZZ_SECONDS === undefined
    ? { numRuns: baseRuns * FUZZ_MULTIPLIER }
    : { numRuns: Number.MAX_SAFE_INTEGER, interruptAfterTimeLimit: FUZZ_SECONDS * 1000 };
}

/**
 * The `fc.assert` parameters for a fuzz target: its run size, with the seed override applied when
 * one is given. Without one, the target keeps the seed it had (fast-check's own, or a pinned
 * global one).
 */
export function amplified<T>(baseRuns: number): fc.Parameters<T> {
  return FUZZ_SEED === undefined
    ? runSize<T>(baseRuns)
    : { ...runSize<T>(baseRuns), seed: FUZZ_SEED };
}

/**
 * The Vitest timeout for one fuzz target, sized to the run: its base timeout times the
 * multiplier, or the time budget plus room for the case in flight and the teardown.
 */
export function fuzzTimeout(baseMs: number): number {
  if (FUZZ_SECONDS !== undefined) return FUZZ_SECONDS * 1000 + 120_000;
  return baseMs * FUZZ_MULTIPLIER;
}
