import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { EXIT } from "../src/core/exit-codes.js";
import type { RunDeps } from "../src/core/io.js";
import { run } from "../src/core/run.js";

/**
 * De-identification-library isolation, the sibling of the MCP SDK's. `@cosyte/deid` is an
 * `optionalDependency` reached by exactly one command; a developer who only ever runs `cosyte parse`
 * must not pay for it in their startup path, and an install without it must not break anything but
 * `redact`. Two complementary guards, because neither alone is enough:
 *
 * 1. The **static** boundary: `src/core/deid.ts` is the only module in the tree that names the
 *    package at all, and every one of its imports is dynamic and wrapped in the loader that maps an
 *    absent package to a value-free diagnostic.
 * 2. The **runtime** observation: with every `@cosyte/deid` entry point intercepted, a `parse` over
 *    each fixture never touches one, while a `redact` does. The positive control is the load-bearing
 *    half: an interception that never fires would make the negative assertion vacuous.
 */

const SRC = join(import.meta.dirname, "..", "src");
const FIXTURES = join(import.meta.dirname, "__fixtures__");
const DEID = "@cosyte/deid";

/**
 * Every `@cosyte/deid` entry point, intercepted: each records the load and then fails exactly as an
 * absent package does, so nothing is left half-mocked. Hoisted (with the recorder) because
 * `vi.mock` runs before the module graph is imported.
 */
const probe = vi.hoisted(() => {
  const loaded: string[] = [];
  return {
    loaded,
    intercept: (specifier: string) => (): never => {
      loaded.push(specifier);
      const e = new Error(`Cannot find package '${specifier}' imported from /app/dist/index.mjs`);
      (e as NodeJS.ErrnoException).code = "ERR_MODULE_NOT_FOUND";
      throw e;
    },
  };
});

vi.mock("@cosyte/deid", probe.intercept("@cosyte/deid"));
vi.mock("@cosyte/deid/hl7", probe.intercept("@cosyte/deid/hl7"));
vi.mock("@cosyte/deid/fhir", probe.intercept("@cosyte/deid/fhir"));
vi.mock("@cosyte/deid/x12", probe.intercept("@cosyte/deid/x12"));
vi.mock("@cosyte/deid/ccda", probe.intercept("@cosyte/deid/ccda"));

/** Every `.ts` file under `src/`, walked so a new command cannot slip past this. */
function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(full);
    return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
  });
}

describe("static boundary: one file names the de-identification library", () => {
  /** Any line that would actually LOAD the package (prose and JSDoc naming it are welcome). */
  const IMPORTS_DEID = /import\(["']@cosyte\/deid|from\s+["']@cosyte\/deid/;

  it("no module outside the seam imports @cosyte/deid or any of its subpaths", () => {
    const seam = join(SRC, "core", "deid.ts");
    const offenders = tsFiles(SRC)
      .filter((f) => f !== seam)
      .flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .filter((line) => IMPORTS_DEID.test(line) && !line.trim().startsWith("*"))
          .map((line) => `${f}: ${line.trim()}`),
      );
    expect(offenders).toStrictEqual([]);
  });

  it("the guard has teeth: it detects an import, and ignores prose about one", () => {
    expect(IMPORTS_DEID.test('  const m = await import("@cosyte/deid/hl7");')).toBe(true);
    expect(IMPORTS_DEID.test('import { deidentifyHl7 } from "@cosyte/deid/hl7";')).toBe(true);
    expect(IMPORTS_DEID.test(" * delegates to @cosyte/deid, which the CLI wires here")).toBe(false);
  });

  it("the seam is real: it does reach the library, and only dynamically", () => {
    const source = readFileSync(join(SRC, "core", "deid.ts"), "utf8");
    expect(source).toContain(DEID);
    // The one static import is TYPE-ONLY and is erased at build: dropping the word `type` would
    // turn it into an eager load of an optional package and break every command in an install
    // without it, unseen. Pinned here in both directions.
    expect(source).toMatch(/^import type \* as \w+ from "@cosyte\/deid";$/m);
    expect(source).not.toMatch(/^import(?!\s+type)[^\n]*from\s+["']@cosyte\/deid/m);

    // The formatter wraps a long loader call, so the import can land alone on its own line: read
    // the PRECEDING line too. A single-line-only check would silently pass over the wrapped shape,
    // which is the blind spot the sibling guard for the other optional packages still carries.
    const lines = source.split("\n");
    let checked = 0;
    for (const [i, line] of lines.entries()) {
      if (!/\bimport\(["']@cosyte\/deid/.test(line)) continue;
      if (line.trim().startsWith("*")) continue; // a JSDoc example is documentation
      if (line.includes("typeof import(")) continue; // a type position: erased, never loaded
      checked += 1;
      const context = `${lines[i - 1] ?? ""}\n${line}`;
      expect(context, `${line.trim()} must sit inside the optional-package loader`).toMatch(
        /loadOptionalPackage\([\s\S]*\(\) =>|\(\) => import\(/,
      );
    }
    // Non-vacuity: the loop really did inspect the library's entry points.
    expect(checked).toBeGreaterThanOrEqual(5);
  });

  it("the command tree reaches de-identification only through the seam", () => {
    const redact = readFileSync(join(SRC, "commands", "redact.ts"), "utf8");
    expect(redact).not.toContain(DEID.concat('"'));
    expect(redact).toContain('from "../core/deid.js"');
  });
});

describe("runtime: a terminal command other than redact never loads the library", () => {
  const cases: { name: string; argv: string[]; file: string }[] = [
    { name: "hl7", argv: ["parse", "m.hl7"], file: "adt-a01.hl7" },
    { name: "fhir", argv: ["parse", "p.json"], file: "patient.fhir.json" },
    { name: "x12", argv: ["parse", "f.edi"], file: "834.edi" },
    { name: "astm", argv: ["parse", "r.astm"], file: "patient.astm" },
    { name: "ncpdp", argv: ["parse", "rx.xml"], file: "newrx.xml" },
    { name: "ccda", argv: ["inspect", "c.xml"], file: "ccd.xml" },
    { name: "dicom", argv: ["inspect", "s.dcm"], file: "sample.dcm" },
  ];

  function deps(file: string): RunDeps {
    const bytes = readFileSync(join(FIXTURES, file));
    return { readFile: () => Promise.resolve(bytes), readStdin: () => Promise.resolve(bytes) };
  }

  for (const c of cases) {
    it(`${c.name}: the command runs and no @cosyte/deid entry point is loaded`, async () => {
      probe.loaded.length = 0;
      const r = await run(c.argv, deps(c.file));
      expect(r.exit).toBe(EXIT.OK);
      expect(probe.loaded).toStrictEqual([]);
    });
  }

  it("`cosyte --help` and `--version` load nothing either", async () => {
    probe.loaded.length = 0;
    const nothing: RunDeps = {
      readFile: () => Promise.resolve(new Uint8Array()),
      readStdin: () => Promise.resolve(new Uint8Array()),
    };
    expect((await run(["--help"], nothing)).exit).toBe(EXIT.OK);
    expect((await run(["--version"], nothing)).exit).toBe(EXIT.OK);
    expect(probe.loaded).toStrictEqual([]);
  });

  it("the interception has teeth: redact DOES reach the library (and degrades when it cannot)", async () => {
    probe.loaded.length = 0;
    const r = await run(["redact", "m.hl7"], deps("adt-a01.hl7"));
    expect(probe.loaded).toContain("@cosyte/deid");
    // With the library unreachable there is no de-identified copy, so nothing is emitted and the
    // exit is non-zero. (The exact 69 degradation is pinned in redact.test.ts against the real
    // loader: a mocked module's rejection is the test runner's error, not Node's resolver's.)
    expect(r.stdout).toBe("");
    expect(r.exit).not.toBe(EXIT.OK);
  });
});
