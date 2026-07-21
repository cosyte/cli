/**
 * The **de-identification seam** — the single, documented plug-in point where the `redact` / `deid`
 * command will delegate to **`@cosyte/deid`** once that library ships and is vetted.
 *
 * ## Why the CLI ships no built-in redactor (the boundary decision)
 *
 * `@cosyte/deid` is **unpublished** (its first slice, `DEID-1`, is in flight), and the wrapped
 * parsers (`@cosyte/hl7`, `@cosyte/fhir`) expose **no de-identification API** — they redact only
 * their own *diagnostics*, not the parsed model. So there is nothing to delegate to today, and adding
 * `@cosyte/deid` would breach the CLI's runtime-dep cap (2) and depend on unbuilt code.
 *
 * A tempting alternative — a "minimal built-in Safe-Harbor pass over the obvious PHI loci" (e.g. the
 * HL7 `PID` segment, `Patient.name`/`Patient.address` in FHIR) — is **deliberately rejected**. Real
 * messages carry PHI far beyond those loci: HL7 `NK1`/`GT1`/`IN1`/`OBX`/`NTE`, FHIR extensions and
 * contained resources, free-text notes. A redactor that scrubs the obvious fields and emits output
 * that *looks* de-identified while silently leaving PHI behind is a **false-safety impression** — the
 * cardinal hazard the deid roadmap and cli roadmap §7 forbid. A `redact` that under-redacts is worse
 * than no `redact`.
 *
 * So `redact` is an **honest, typed `CLI_NOT_IMPLEMENTED`** (never a fake success, never a partial
 * scrub presented as de-identified — ADR 0018: never invent a capability the ground layer lacks),
 * gated on `@cosyte/deid`, with this seam as its one drop-in point. When `@cosyte/deid` lands and is
 * conformance-graded, {@link deidStatus} flips to `available` and the command reads the input, calls
 * the delegated de-identifier, and emits the de-identified model — the command surface (`redact`,
 * `deid`, `<file|->`, `--format`) already exists so that change is additive.
 *
 * @packageDocumentation
 */

/** The value-free reason `redact`/`deid` reports while the ground-layer library is unavailable. */
export const DEID_UNAVAILABLE_REASON =
  "redact/deid is not yet available — it delegates to @cosyte/deid, which is unpublished (DEID-1 in " +
  "flight). The CLI ships no built-in redactor: a partial Safe-Harbor scrub over only the obvious PHI " +
  "loci would leave PHI behind and present a false-safety impression, so nothing is emitted. This " +
  "command will produce a de-identified copy once @cosyte/deid ships and is vetted.";

/**
 * Whether de-identification is available, and — while it is not — the value-free reason why. The one
 * function the `redact` command consults **before reading any input**, so a `redact` invocation never
 * touches the PHI it cannot yet safely strip.
 */
export interface DeidAvailability {
  /** `true` once `@cosyte/deid` is wired; `false` today. */
  readonly available: boolean;
  /** A value-free explanation shown when {@link DeidAvailability.available} is `false`. */
  readonly reason: string;
}

/**
 * Report the current de-identification availability. Today it is always unavailable (see the module
 * docs); this is the single line that flips when `@cosyte/deid` is wired in a later phase.
 *
 * @returns The {@link DeidAvailability} — `{ available: false, reason }` until `@cosyte/deid` ships.
 * @example
 * ```ts
 * import { deidStatus } from "@cosyte/cli";
 *
 * deidStatus().available; // => false
 * ```
 */
export function deidStatus(): DeidAvailability {
  return { available: false, reason: DEID_UNAVAILABLE_REASON };
}
