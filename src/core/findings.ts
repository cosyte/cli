/**
 * The CLI's **value-free finding** shape and the positional locators that populate it. A finding says
 * *what kind* of thing was observed (a stable code + severity) and *where* (a positional locator) —
 * **never** the offending value (cli roadmap §7). Shared by `validate` (conformance findings) and
 * `inspect` (structural summary) so both render locations identically and value-free.
 *
 * @packageDocumentation
 */

/**
 * A single value-free finding: a stable code, a severity, and a positional locator. Every field is
 * safe to print, log, or serialize — none carries a name, DOB, MRN, or field value.
 */
export interface Finding {
  /** The stable diagnostic/warning code (the wrapped library's or the CLI's). */
  readonly code: string;
  /** The R4-style severity (`fatal` | `error` | `warning` | `information`), or `warning` for HL7. */
  readonly severity: string;
  /** A value-free positional locator — a FHIRPath expression, or an HL7 segment/field index path. */
  readonly location: string;
}

/** The minimal, value-free positional shape shared by HL7 warnings (indices only — never a value). */
interface Hl7PositionLike {
  readonly segmentIndex: number;
  readonly fieldIndex?: number;
  readonly repetitionIndex?: number;
  readonly componentIndex?: number;
  readonly subcomponentIndex?: number;
}

/**
 * Render an HL7 warning position as a **value-free** locator string built only from its numeric
 * indices — e.g. `seg[3].field[5].comp[1]`. No segment content, no field value, ever appears; only the
 * structural coordinates the parser reported.
 *
 * @param pos - The HL7 position (segment/field/repetition/component/subcomponent indices).
 * @returns A value-free locator, e.g. `"seg[3].field[5]"`.
 * @example
 * ```ts
 * import { formatHl7Position } from "@cosyte/cli";
 *
 * formatHl7Position({ segmentIndex: 3, fieldIndex: 5 }); // => "seg[3].field[5]"
 * formatHl7Position({ segmentIndex: 0 }); // => "seg[0]"
 * ```
 */
export function formatHl7Position(pos: Hl7PositionLike): string {
  let out = `seg[${String(pos.segmentIndex)}]`;
  if (pos.fieldIndex !== undefined) out += `.field[${String(pos.fieldIndex)}]`;
  if (pos.repetitionIndex !== undefined) out += `.rep[${String(pos.repetitionIndex)}]`;
  if (pos.componentIndex !== undefined) out += `.comp[${String(pos.componentIndex)}]`;
  if (pos.subcomponentIndex !== undefined) out += `.sub[${String(pos.subcomponentIndex)}]`;
  return out;
}
