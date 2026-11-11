import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { jsonChunks } from "../src/core/json-text.js";

/**
 * `jsonChunks` writes a value as JSON a piece at a time, so a large parse result reaches stdout
 * without first being built as one string. Its contract is that the pieces joined are exactly what
 * `JSON.stringify` writes, compact and indented, and that no piece is much larger than the size it
 * was asked for, however large the value or any one string in it.
 */

const join = (value: unknown, space?: number, size?: number): string =>
  [...jsonChunks(value, space, size)].join("");

/** Any JSON-shaped value, with the awkward strings (lone surrogates, controls, quotes) included. */
const valueArb = fc.jsonValue();
const anyStringArb = fc.string({ unit: "binary", maxLength: 64 });

describe("jsonChunks writes what JSON.stringify writes", () => {
  it("compact, for any JSON value", () => {
    fc.assert(
      fc.property(valueArb, (v) => {
        expect(join(v)).toBe(JSON.stringify(v));
      }),
    );
  });

  it("indented by two, for any JSON value", () => {
    fc.assert(
      fc.property(valueArb, (v) => {
        expect(join(v, 2)).toBe(JSON.stringify(v, null, 2));
      }),
    );
  });

  it("for any string, at any piece size", () => {
    fc.assert(
      fc.property(anyStringArb, fc.integer({ min: 1, max: 16 }), (s, size) => {
        expect(join(s, 2, size)).toBe(JSON.stringify(s));
        expect(join({ [s]: [s, { k: s }] }, 2, size)).toBe(
          JSON.stringify({ [s]: [s, { k: s }] }, null, 2),
        );
      }),
    );
  });

  it("the cases JSON.stringify drops, replaces or unwraps", () => {
    const tricky = {
      skipped: undefined,
      fn: () => 1,
      sym: Symbol("x"),
      inArray: [undefined, () => 1, Symbol("y"), Number.NaN, Infinity, -0],
      date: new Date(Date.UTC(2026, 0, 2)),
      boxed: [Object(1), Object("s"), Object(true)],
      custom: { toJSON: (key: string) => `key:${key}` },
      nested: { toJSON: () => ({ inner: [1, { deeper: true }] }) },
      empty: { o: {}, a: [] },
      bytes: new Uint8Array([1, 2]),
      map: new Map([["a", 1]]),
      nul: null,
    };
    for (const space of [undefined, 0, 2, 4]) {
      expect(join(tricky, space)).toBe(JSON.stringify(tricky, null, space));
    }
    // A value JSON.stringify writes as `undefined` has no text at all: no piece.
    expect([...jsonChunks(undefined)]).toEqual([]);
    expect([...jsonChunks(() => 1)]).toEqual([]);
    expect(join([undefined])).toBe("[null]");
    expect(join({ a: undefined })).toBe("{}");
    expect(join({ a: undefined }, 2)).toBe("{}");
  });

  it("refuses what JSON.stringify refuses: a cycle and a BigInt", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic["self"] = cyclic;
    expect(() => join(cyclic)).toThrow(TypeError);
    expect(() => join({ n: 1n })).toThrow(TypeError);
  });

  it("writes a shared, non-cyclic object every time it appears", () => {
    const shared = { id: "ZZSHARED" };
    const v = { a: shared, b: [shared, shared] };
    expect(join(v, 2)).toBe(JSON.stringify(v, null, 2));
  });
});

describe("jsonChunks writes in bounded pieces", () => {
  it("no piece passes twice the size asked for, on a wide value", () => {
    const wide = Array.from({ length: 5_000 }, (_, i) => ({ id: `ZZ-${String(i)}`, n: i }));
    const pieces = [...jsonChunks(wide, 2, 1_024)];
    expect(pieces.length).toBeGreaterThan(10);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(2 * 1_024);
    expect(pieces.join("")).toBe(JSON.stringify(wide, null, 2));
  });

  it("a string longer than the piece size is written in slices, never as one piece", () => {
    const long = "QUJD".repeat(50_000); // a base64 payload, 200,000 characters
    const pieces = [...jsonChunks({ resourceType: "Binary", data: long }, 2, 4_096)];
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(2 * 4_096);
    expect(pieces.join("")).toBe(JSON.stringify({ resourceType: "Binary", data: long }, null, 2));
  });

  it("never splits a surrogate pair across slices", () => {
    // Each slice is escaped on its own, so a split pair would come out as two \ud... escapes.
    const s = "a" + "\u{1F600}".repeat(100);
    for (let size = 1; size <= 8; size++) {
      expect(join(s, undefined, size)).toBe(JSON.stringify(s));
    }
  });
});
