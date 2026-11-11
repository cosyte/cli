/**
 * **JSON written a piece at a time.** `JSON.stringify` builds a value's whole text as one string
 * before any of it can be written, so a large parse result is held twice over: once as the model and
 * once as its text, and a third time as the bytes the platform encodes from that text. This module
 * writes the same text in pieces of a bounded size, so the output can go to stdout while it is being
 * produced and a slow consumer can hold the producer back.
 *
 * The text is exactly what `JSON.stringify(value, null, space)` writes: the same `toJSON` calls,
 * the same dropped and `null`ed values, the same escapes and the same indentation. A string longer
 * than one piece is escaped in slices, never as one copy, and a slice never ends between the two
 * halves of a surrogate pair.
 *
 * @packageDocumentation
 */

/** The piece size {@link jsonChunks} aims for: 64 Ki characters, a pipe buffer's worth or so. */
export const JSON_CHUNK_CHARS = 64 * 1024;

/** What {@link flatText} allows a member for its key, its punctuation and a non-string value. */
const FLAT_MEMBER_CHARS = 48;

/**
 * How deep the walk goes before it looks for a cycle. A cycle makes the walk descend for ever, so it
 * always reaches this depth; a tree as deep as this is rare, and is only checked, never refused.
 */
const CYCLE_CHECK_DEPTH = 128;

/** One open array or object on the way down. */
interface Frame {
  /** The array or object being written. */
  readonly value: object;
  /** The keys to write (an object), or `null` for an array. */
  readonly keys: readonly string[] | null;
  /** How many elements or keys are done. */
  index: number;
  /** Whether a member has been written yet (an object can skip every key it has). */
  wrote: boolean;
  /** How deep the container is: 0 for the value itself. */
  readonly depth: number;
}

/**
 * The value `JSON.stringify` writes for `holder[key]`: `toJSON` applied, boxed primitives opened.
 * The key is passed as `toJSON` receives it, a string, and made one only when `toJSON` is called.
 */
function prepare(value: unknown, key: string | number): unknown {
  let v = value;
  if (v !== null && (typeof v === "object" || typeof v === "bigint")) {
    const toJSON = (v as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === "function") v = (toJSON as (k: string) => unknown).call(v, String(key));
  }
  if (v instanceof Number) return Number(v);
  if (v instanceof String) return String(v);
  if (v instanceof Boolean) return v.valueOf();
  return v;
}

/** True for what `JSON.stringify` leaves out of an object and writes as `null` in an array. */
function isAbsent(v: unknown): boolean {
  return v === undefined || typeof v === "function" || typeof v === "symbol";
}

/** True for a value `JSON.stringify` writes as it is, with nothing to call, open or drop. */
function isPlainScalar(v: unknown): boolean {
  return v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/**
 * The text of a **flat** container, written by `JSON.stringify` itself: a plain array or object whose
 * every value is a string, a number, a boolean or `null`, and whose text is at most about `size`
 * characters (its strings, plus a generous allowance a member for the rest). Such a container has
 * nothing for `toJSON` to change and nothing to drop, so the native writer's text is the text, and
 * it is much faster than a walk. Anything else (a nested container, a value to drop, a class
 * instance, a long string) returns `undefined` and is walked.
 */
function flatText(
  obj: object,
  keys: readonly string[] | null,
  gap: string,
  size: number,
): string | undefined {
  const proto: unknown = Object.getPrototypeOf(obj);
  if (proto !== (keys === null ? Array.prototype : Object.prototype)) return undefined;
  const n = keys === null ? (obj as readonly unknown[]).length : keys.length;
  let chars = n * FLAT_MEMBER_CHARS;
  for (let i = 0; i < n; i++) {
    const v =
      keys === null
        ? (obj as readonly unknown[])[i]
        : (obj as Record<string, unknown>)[keys[i] as string];
    if (!isPlainScalar(v)) return undefined;
    if (typeof v === "string") chars += v.length;
    if (chars > size) return undefined;
  }
  return JSON.stringify(obj, null, gap);
}

/** True for the first half of a surrogate pair. */
function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/**
 * Write `value` as JSON, a piece at a time: the pieces joined are exactly
 * `JSON.stringify(value, null, space)`.
 *
 * Each piece is at least `size` characters (but the last) and rarely much more: one escaped slice of
 * a long string, or one short scalar, past it. A piece is handed out as soon as it is full, so a
 * consumer that writes each one before asking for the next never holds more than a piece of the
 * text at once.
 *
 * @param value - The value to write. A value `JSON.stringify` would write as `undefined` writes
 *   nothing.
 * @param space - The indentation, as `JSON.stringify` takes it: a number of spaces (at most 10), or
 *   none for compact output.
 * @param size - The piece size to aim for. Defaults to {@link JSON_CHUNK_CHARS}.
 * @returns The text's pieces, in order.
 * @throws {TypeError} Where `JSON.stringify` throws: a cycle, or a `BigInt`.
 * @example
 * ```ts
 * import { jsonChunks } from "@cosyte/cli";
 *
 * [...jsonChunks({ resourceType: "Patient", active: true })].join("");
 * // => '{"resourceType":"Patient","active":true}'
 * ```
 */
export function* jsonChunks(
  value: unknown,
  space?: number,
  size: number = JSON_CHUNK_CHARS,
): Generator<string> {
  const gap = " ".repeat(Math.max(0, Math.min(10, Math.floor(space ?? 0))));
  const colon = gap === "" ? ":" : ": ";
  const stack: Frame[] = [];
  let out = "";
  // A long string can fill several pieces at once; they wait here for the generator to hand them out.
  const pieces: string[] = [];
  // The line break and indentation in front of a member at each depth, made once per depth.
  const leads: string[] = [];
  const leadAt = (depth: number): string => {
    let lead = leads[depth];
    if (lead === undefined) {
      lead = gap === "" ? "" : `\n${gap.repeat(depth)}`;
      leads[depth] = lead;
    }
    return lead;
  };
  // Each key's quoted form and colon, made once per distinct key: a model repeats its keys.
  const quoted = new Map<string, string>();
  const keyText = (key: string): string => {
    let text = quoted.get(key);
    if (text === undefined) {
      text = JSON.stringify(key) + colon;
      quoted.set(key, text);
    }
    return text;
  };

  /** Write a string's JSON form, in slices when it is longer than a piece. */
  const writeString = (s: string): void => {
    if (s.length <= size) {
      out += JSON.stringify(s);
      return;
    }
    out += '"';
    let at = 0;
    while (at < s.length) {
      let end = Math.min(at + size, s.length);
      // Keep a surrogate pair in one slice: end the slice before it, or past it when it is all the
      // slice would hold.
      if (end < s.length && isHighSurrogate(s.charCodeAt(end - 1))) end += end - at > 1 ? -1 : 1;
      out += JSON.stringify(s.slice(at, end)).slice(1, -1);
      at = end;
      if (out.length >= size) {
        pieces.push(out);
        out = "";
      }
    }
    out += '"';
  };

  /** Write one value that is not absent: a scalar in place, or the opening of a container. */
  const writeValue = (v: unknown, depth: number): void => {
    if (v === null) out += "null";
    else if (typeof v === "string") writeString(v);
    else if (typeof v === "number") out += Number.isFinite(v) ? String(v) : "null";
    else if (typeof v === "boolean") out += v ? "true" : "false";
    else if (typeof v === "bigint") throw new TypeError("Do not know how to serialize a BigInt");
    else {
      const obj = v as object;
      const keys = Array.isArray(obj) ? null : Object.keys(obj);
      const flat = flatText(obj, keys, gap, size);
      if (flat !== undefined) {
        // The native writer indents from column zero; each of its line breaks moves to this depth.
        out += depth === 0 || gap === "" ? flat : flat.replaceAll("\n", leadAt(depth));
        return;
      }
      if (depth >= CYCLE_CHECK_DEPTH && stack.some((f) => f.value === obj)) {
        throw new TypeError("Converting circular structure to JSON");
      }
      out += keys === null ? "[" : "{";
      stack.push({ value: obj, keys, index: 0, wrote: false, depth });
    }
  };

  const top = prepare(value, "");
  if (isAbsent(top)) return;
  writeValue(top, 0);

  for (;;) {
    for (const piece of pieces) yield piece;
    pieces.length = 0;
    if (out.length >= size) {
      yield out;
      out = "";
    }

    const frame = stack[stack.length - 1];
    if (frame === undefined) break;
    const inner = frame.depth + 1;

    if (frame.keys === null) {
      const arr = frame.value as readonly unknown[];
      if (frame.index < arr.length) {
        const i = frame.index;
        frame.index += 1;
        if (i > 0) out += ",";
        out += leadAt(inner);
        const v = prepare(arr[i], i);
        if (isAbsent(v)) out += "null";
        else writeValue(v, inner);
        continue;
      }
      out += arr.length > 0 ? `${leadAt(frame.depth)}]` : "]";
    } else {
      if (frame.index < frame.keys.length) {
        const key = frame.keys[frame.index] as string;
        frame.index += 1;
        const v = prepare((frame.value as Record<string, unknown>)[key], key);
        if (isAbsent(v)) continue;
        if (frame.wrote) out += ",";
        out += leadAt(inner) + keyText(key);
        frame.wrote = true;
        writeValue(v, inner);
        continue;
      }
      out += frame.wrote ? `${leadAt(frame.depth)}}` : "}";
    }
    stack.pop();
  }

  if (out !== "") yield out;
}
