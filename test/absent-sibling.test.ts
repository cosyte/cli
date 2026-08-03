import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CliError, errorResult } from "../src/core/diagnostics.js";
import { EXIT } from "../src/core/exit-codes.js";
import { loadFhir, loadOptionalPackage } from "../src/core/parsers.js";

/**
 * The published manifest cannot declare `@cosyte/fhir` at all (it is not on the npm registry), and
 * `@cosyte/transform` is an `optionalDependency` npm skips today because its own `@cosyte/fhir` peer
 * cannot resolve. So in a real `npm install @cosyte/cli` **both are absent**, and every code path that
 * reaches for them has to degrade to a value-free `CLI_PARSER_UNAVAILABLE` (exit `69`) instead of
 * surfacing a raw module-resolution error and a stack frame.
 *
 * Before this suite existed those two packages were loaded with a bare `await import(...)`, so an
 * install without them crashed. Two complementary guards, because neither alone is enough:
 *
 * 1. The **mapping**: a realistic resolver error becomes the value-free CLI error, with wording that
 *    tells the truth about *why* each package is missing.
 * 2. The **static guard**: no bare `import("@cosyte/fhir")` or `import("@cosyte/transform")` survives
 *    anywhere in `src/` outside the one loader that catches it. This is the regression that matters,
 *    and it is the one a behavioural test cannot see: a newly added call site is simply a code path
 *    no test happens to exercise.
 *
 * The end-to-end proof is the clean-room install in `RELEASING.md`: pack the tarball, install it in a
 * directory outside this repo (where neither package resolves), and run both bins.
 */

/** The error Node's ESM resolver actually raises for a package that is not installed. */
function moduleNotFound(specifier: string): Error {
  const e = new Error(`Cannot find package '${specifier}' imported from /app/dist/index.mjs`);
  (e as NodeJS.ErrnoException).code = "ERR_MODULE_NOT_FOUND";
  return e;
}

describe("an absent @cosyte/fhir degrades to a value-free CLI_PARSER_UNAVAILABLE", () => {
  it("maps the resolver error to CLI_PARSER_UNAVAILABLE / 69", async () => {
    const mapped = await loadOptionalPackage("detail", () =>
      Promise.reject(moduleNotFound("@cosyte/fhir")),
    ).catch((e: unknown) => e);
    expect(mapped).toBeInstanceOf(CliError);
    expect((mapped as CliError).code).toBe("CLI_PARSER_UNAVAILABLE");
    expect((mapped as CliError).exit).toBe(EXIT.UNAVAILABLE);
  });

  it("resolves the real package when it IS present (the dev tree vendors it)", async () => {
    const mod = await loadFhir();
    expect(mod.parseResource).toBeTypeOf("function");
  });

  it("renders as exit 69 with no stack frame and no input value on stderr", () => {
    const r = errorResult(
      new CliError("CLI_PARSER_UNAVAILABLE", EXIT.UNAVAILABLE, "the @cosyte/fhir parser is absent"),
    );
    expect(r.exit).toBe(EXIT.UNAVAILABLE);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("CLI_PARSER_UNAVAILABLE");
    expect(r.stderr).not.toMatch(/\s+at\s+\S+:\d+/);
  });

  it("says @cosyte/fhir is not on the registry, so the message is actionable", async () => {
    // `loadOptional("fhir", ...)` would say "install it (it is an optional dependency)", which is
    // false: it cannot be installed from npm at all. The dedicated wording is the point.
    const err = (await loadFhirWithAbsentPackage().catch((e: unknown) => e)) as CliError;
    expect(err.message).toContain("not currently on the npm registry");
    expect(err.message).not.toContain("it is an optional dependency");
  });

  it("propagates an unrelated error unchanged (not every failure is 'unavailable')", async () => {
    await expect(
      loadOptionalPackage("detail", () => Promise.reject(new Error("a real library bug"))),
    ).rejects.toThrow("a real library bug");
  });

  it("passes a successful import straight through", async () => {
    expect(await loadOptionalPackage("detail", () => Promise.resolve({ ok: true }))).toStrictEqual({
      ok: true,
    });
  });
});

/** Re-run `loadFhir`'s own diagnostic through the loader, with the import forced to fail. */
function loadFhirWithAbsentPackage(): Promise<never> {
  const detail = fhirDetailFromSource();
  return loadOptionalPackage(detail, () => Promise.reject(moduleNotFound("@cosyte/fhir")));
}

/**
 * Read the exact diagnostic `loadFhir` uses out of the source, so this test asserts the shipped
 * wording rather than a copy of it that could drift.
 */
function fhirDetailFromSource(): string {
  const source = readFileSync(new URL("../src/core/parsers.ts", import.meta.url), "utf8");
  const match = /const FHIR_UNAVAILABLE =\n((?:\s+"[^"]*"(?: \+)?\n)+)/.exec(source);
  if (match?.[1] === undefined) throw new Error("could not read FHIR_UNAVAILABLE from parsers.ts");
  return [...match[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("");
}

describe("an absent @cosyte/transform degrades, and is named as a conversion library", () => {
  it("does not call transform a 'parser': loadOptional's wording would be wrong for it", () => {
    const source = readFileSync(new URL("../src/commands/convert.ts", import.meta.url), "utf8");
    expect(source).toContain("conversion library is not installed");
  });
});

describe("no sibling that can be absent is imported outside the optional-loader boundary", () => {
  /**
   * `@cosyte/hl7` and `@cosyte/terminology` are hard `dependencies` at real registry ranges, so a bare
   * dynamic import of those is correct. `@cosyte/fhir` and `@cosyte/transform` cannot be relied on in
   * an installed copy, so every one of their import sites must sit inside a loader that catches the
   * resolver error. `src/core/parsers.ts` holds the only two permitted call sites.
   */
  const MUST_BE_GUARDED = ["@cosyte/fhir", "@cosyte/transform"];

  /** True iff the line is inside a comment (a JSDoc `@example` is documentation, not a call site). */
  function isComment(line: string): boolean {
    const t = line.trim();
    return t.startsWith("*") || t.startsWith("//") || t.startsWith("/*");
  }

  /** True iff the import on this line is wrapped by one of the loaders that catches an absent package. */
  function isGuarded(line: string): boolean {
    return (
      /loadFhir\(\)|loadOptionalPackage\(|loadOptional\(/.test(line) ||
      line.trim().startsWith("() =>") ||
      line.includes("() => import(")
    );
  }

  /** Every tracked `.ts` file under `src/`, walked so a new command cannot slip past this. */
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
    });
  }

  const SRC = join(import.meta.dirname, "..", "src");

  for (const pkg of MUST_BE_GUARDED) {
    it(`every dynamic import of ${pkg} goes through the optional-loader boundary`, () => {
      const offenders: string[] = [];
      for (const file of sourceFiles(SRC)) {
        const source = readFileSync(file, "utf8");
        // A bare `await import("<pkg>")` - i.e. one NOT preceded on the same line by a loader call.
        for (const line of source.split("\n")) {
          if (!line.includes(`import("${pkg}")`)) continue;
          if (isComment(line)) continue; // a JSDoc @example is documentation, not a call site
          if (!isGuarded(line)) offenders.push(`${file}: ${line.trim()}`);
        }
      }
      expect(offenders).toStrictEqual([]);
    });
  }

  it("the guard has teeth: a bare import of a guarded package is detected", () => {
    // Negative controls on the detector itself, so a rule that matches nothing cannot pass silently.
    expect(isGuarded('  const { parseResource } = await import("@cosyte/fhir");')).toBe(false);
    expect(isGuarded('    loadFhir(), // () => import("@cosyte/fhir")')).toBe(true);
    expect(isGuarded('      loadOptionalPackage(DETAIL, () => import("@cosyte/transform")),')).toBe(
      true,
    );
    expect(isComment(' *   import("@cosyte/transform"),')).toBe(true);
    expect(isComment('  await import("@cosyte/transform");')).toBe(false);
  });
});
