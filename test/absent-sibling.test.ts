import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CliError, errorResult } from "../src/core/diagnostics.js";
import { EXIT } from "../src/core/exit-codes.js";
import { loadFhir, loadOptionalPackage } from "../src/core/parsers.js";

/**
 * `@cosyte/fhir` and `@cosyte/transform` are both `optionalDependencies` (fhir is also transform's
 * peer). A default `npm install @cosyte/cli` has both, and so does an npm install with
 * `--legacy-peer-deps`, but an install with `--omit=optional` leaves both out, and a removed copy
 * leaves either out. Every code path that reaches for them has to degrade to a
 * value-free `CLI_PARSER_UNAVAILABLE` (exit `69`) instead of surfacing a raw module-resolution error
 * and a stack frame.
 *
 * Before this suite existed those two packages were loaded with a bare `await import(...)`, so an
 * install without them crashed. Two complementary guards, because neither alone is enough:
 *
 * 1. The **mapping**: a realistic resolver error becomes the value-free CLI error, with wording that
 *    tells the truth about *why* each package is missing and what installs it.
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

  it("says how @cosyte/fhir reaches an install and what to install, so the message is actionable", async () => {
    // fhir is an optional dependency of this package, so the install that leaves it out is one made
    // with --omit=optional. It is on the registry, so the message must not claim otherwise (an
    // earlier wording did), and it names the package to install.
    const err = (await loadFhirWithAbsentPackage().catch((e: unknown) => e)) as CliError;
    expect(err.message).toContain("it is an optional dependency");
    expect(err.message).toContain("--omit=optional");
    expect(err.message).toContain("install @cosyte/fhir alongside @cosyte/cli");
    expect(err.message).not.toContain("peer dependency of @cosyte/transform");
    expect(err.message).not.toMatch(/registry/);
  });

  it("is declared as an optional dependency, at the same kind of range as transform", () => {
    // Declared, so an install that skips peers (npm's --legacy-peer-deps) no longer leaves it out.
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
    ) as {
      optionalDependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(manifest.optionalDependencies["@cosyte/fhir"]).toBe(
      manifest.optionalDependencies["@cosyte/transform"],
    );
    expect(manifest.devDependencies["@cosyte/fhir"]).toBeUndefined();
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
  // The `;?` is load-bearing: the LAST line of the concatenation ends `";`, so without it the final
  // segment never matches and this silently returns a truncated string while still reading like the
  // whole thing. A refuter caught exactly that: the negative assertions below were blind to the last
  // line, which is where an appended sentence would land. The `endsWith` guards below pin it.
  const match = /const FHIR_UNAVAILABLE =\n((?:\s+"[^"]*"(?: \+)?;?\n)+)/.exec(source);
  if (match?.[1] === undefined) throw new Error("could not read FHIR_UNAVAILABLE from parsers.ts");
  return [...match[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("");
}

describe("an absent @cosyte/transform degrades, and is named as a conversion library", () => {
  /** The shipped diagnostic, read out of the source so this asserts the real text, not a copy. */
  function transformDetail(): string {
    const source = readFileSync(new URL("../src/commands/convert.ts", import.meta.url), "utf8");
    // `;?` as in fhirDetailFromSource: without it the final segment is dropped silently.
    const match = /const TRANSFORM_UNAVAILABLE =\n((?:\s+"[^"]*"(?: \+)?;?\n)+)/.exec(source);
    if (match?.[1] === undefined) throw new Error("could not read TRANSFORM_UNAVAILABLE");
    return [...match[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("");
  }

  it("does not call transform a 'parser': loadOptional's wording would be wrong for it", () => {
    expect(transformDetail()).toContain("@cosyte/transform conversion library");
    expect(transformDetail()).not.toContain("parser");
  });

  it("names both packages, because the import fails when either one is missing", () => {
    // A removed fhir copy leaves transform installed without its peer, and the resolver error then
    // comes from transform's own import of fhir. So "transform is not installed" would be false
    // there: the message names both and tells the user to install both.
    const detail = transformDetail();
    expect(detail).not.toContain("transform conversion library is not installed");
    expect(detail).toContain("peer dependency @cosyte/fhir");
    expect(detail).toContain("install both alongside @cosyte/cli");
  });

  it("neither unavailable-sibling diagnostic claims a package is missing from the registry", () => {
    // Both are published; an earlier wording said they were not, which sent users away from an
    // install that works.
    for (const detail of [transformDetail(), fhirDetailFromSource()]) {
      expect(detail).not.toMatch(/registry/);
      expect(detail).toMatch(/alongside @cosyte\/cli$/);
    }
  });

  it("the source extraction reads the WHOLE constant, not a truncated prefix", () => {
    // Without this the negative assertions above have a last-line blind spot: the extraction regex
    // silently drops the final segment (the one ending `";`), which is where an appended sentence
    // would land, so a re-introduced "install it" tail would pass unnoticed. Pinned by the last
    // words of each shipped string, so a truncation of any length fails here.
    expect(transformDetail()).toMatch(/install both alongside @cosyte\/cli$/);
    expect(fhirDetailFromSource()).toMatch(/install @cosyte\/fhir alongside @cosyte\/cli$/);
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

  /** The `@cosyte/*` packages an install can lack: the optional ones, fhir among them. */
  function absentable(): string[] {
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
    ) as { optionalDependencies: Record<string, string> };
    const optional = Object.keys(manifest.optionalDependencies);
    return optional.filter((name) => name.startsWith("@cosyte/"));
  }

  /** The specifier of every top-level import in `source` that is not an `import type`. */
  function valueImports(source: string): string[] {
    const imports = source.matchAll(/^import\s+(?!type\s)[^;]*?["']([^"']+)["']/gm);
    return [...imports].map((m) => m[1] ?? "");
  }

  it("a package an install can lack is imported statically only as `import type`", () => {
    // A value import loads the package with the module, so an install without it breaks every
    // command, and the dynamic-import guard above cannot see one. `import type` is erased at build.
    const names = absentable();
    expect(names).toContain("@cosyte/deid");
    expect(names).toContain("@cosyte/fhir");
    const parsers = readFileSync(join(SRC, "core", "parsers.ts"), "utf8");
    expect(parsers).toContain('import type * as CosyteFhir from "@cosyte/fhir";');
    expect(valueImports(parsers)).toContain("./diagnostics.js");
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      for (const spec of valueImports(readFileSync(file, "utf8"))) {
        if (names.some((name) => spec === name || spec.startsWith(`${name}/`))) {
          offenders.push(`${file}: ${spec}`);
        }
      }
    }
    expect(offenders).toStrictEqual([]);
  });

  it("the value-import detector has teeth", () => {
    expect(valueImports('import { parseResource } from "@cosyte/fhir";')).toStrictEqual([
      "@cosyte/fhir",
    ]);
    expect(valueImports('import {\n  a,\n  b,\n} from "@cosyte/deid/hl7";')).toStrictEqual([
      "@cosyte/deid/hl7",
    ]);
    expect(valueImports('import "@cosyte/x12";')).toStrictEqual(["@cosyte/x12"]);
    expect(valueImports('import type * as CosyteFhir from "@cosyte/fhir";')).toStrictEqual([]);
  });
});
