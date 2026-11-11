import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The `@cosyte/*` packages the command wraps are asked for at their current releases, not at the
 * first one: a range of `^0.1.0` lets an install keep a parser that is many times slower or heavier
 * than the one we test against. The floors below are the releases this package is tested with. The
 * one with a measured reason is `@cosyte/fhir`: before 0.1.10 its reader took a large base64 string
 * a character at a time, and parsing a FHIR Binary held 33 to 40 times the input in memory. Before
 * 0.2.0, `@cosyte/transform` dropped six valued PID fields (race, primary language, SSN, ethnic
 * group, death date and time, death indicator) with no issue, so `convert` could not report them.
 */
const FLOORS: Readonly<Record<string, string>> = {
  "@cosyte/hl7": "0.1.10",
  "@cosyte/terminology": "0.1.6",
  "@cosyte/astm": "0.1.7",
  "@cosyte/ccda": "0.1.6",
  "@cosyte/dicom": "0.1.13",
  "@cosyte/fhir": "0.1.11",
  "@cosyte/mllp": "0.1.9",
  "@cosyte/ncpdp": "0.1.7",
  "@cosyte/x12": "0.1.12",
  "@cosyte/transform": "0.2.2",
  "@cosyte/deid": "0.2.4",
};

interface Manifest {
  readonly dependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
}

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as Manifest;
const declared = { ...manifest.dependencies, ...manifest.optionalDependencies };

/** Compare two `major.minor.patch` versions: negative, zero or positive. */
function compare(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

describe("the wrapped parsers are asked for at their current releases", () => {
  for (const [name, floor] of Object.entries(FLOORS)) {
    it(`${name} is declared at ^${floor} or later`, () => {
      const range = declared[name];
      expect(range, `${name} is not declared`).toBeDefined();
      expect(range).toMatch(/^\^\d+\.\d+\.\d+$/);
      expect(compare((range ?? "").slice(1), floor)).toBeGreaterThanOrEqual(0);
    });

    it(`${name} is installed at ${floor} or later`, () => {
      const installed = (
        JSON.parse(
          readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), "utf8"),
        ) as { version: string }
      ).version;
      expect(compare(installed, floor)).toBeGreaterThanOrEqual(0);
    });
  }
});
