import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { docSnippetSuite } from "@cosyte/vitest-config/snippets";

import { DEID_COVERAGE, deidCoveredFormats } from "../src/core/deid.js";
import { helpText } from "../src/core/run.js";

/**
 * Doc/code-agreement gate. Every ```` ```ts runnable ```` block in `docs-content/` is extracted,
 * compiled, and executed, and its inline `// =>` assertions are checked, so a documented example can
 * never silently drift from the shipped code (the documentation analog of the conformance runners).
 *
 * Snippets import the package the way a consumer does: against the **built** ESM artifact, not the
 * source tree. The harness executes each block as a standalone ES module, so it can't resolve the
 * source's internal `.js`→`.ts` imports; the bundled `dist/index.mjs` is self-contained and is also
 * exactly what an installer loads. The shared CI gate runs `test` before `build`, so we provision
 * `dist/` on demand here rather than assuming build order.
 */
const root = join(import.meta.dirname, "..");
const distEntry = join(root, "dist", "index.mjs");

beforeAll(() => {
  execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
}, 120_000);

docSnippetSuite({
  docsDir: join(root, "docs-content"),
  resolve: (specifier) => (specifier === "@cosyte/cli" ? distEntry : undefined),
});

/**
 * The published surface must describe the `redact` the code actually has. The covered-format list is
 * **derived from the code** and asserted against every page that states it, so adding or dropping a
 * format reds every page that has not been updated: the docs cannot drift into promising a coverage
 * the command does not have, or into still calling a shipped capability unimplemented.
 */
describe("redact: the documented capability matches the shipped one", () => {
  /** The covered set as the docs render it, built from the code that answers for it. */
  const coveredList = deidCoveredFormats()
    .map((f) => `\`${f}\``)
    .join(", ");
  const uncovered = (Object.keys(DEID_COVERAGE) as (keyof typeof DEID_COVERAGE)[]).filter(
    (f) => DEID_COVERAGE[f] !== "covered",
  );

  const PAGES = [
    "README.md",
    join("docs-content", "reference-commands.md"),
    join("docs-content", "limitations.md"),
    join("docs-content", "troubleshooting.md"),
    join("docs-content", "concepts-archetype.md"),
    join("docs-content", "guides-overview.md"),
  ];

  const read = (page: string): string => readFileSync(join(root, page), "utf8");

  it("the derived list is the real one (this test is not asserting an empty set)", () => {
    expect(coveredList).toBe("`ccda`, `fhir`, `hl7`, `x12`");
    expect(uncovered.sort()).toStrictEqual(["astm", "dicom", "mllp", "ncpdp"]);
  });

  for (const page of PAGES) {
    it(`${page} states the covered set the code answers for`, () => {
      expect(read(page)).toContain(coveredList);
    });

    it(`${page} no longer calls redact unimplemented or unread`, () => {
      const text = read(page);
      // The page may still explain the OTHER gated capability (`validate --profile`), so the
      // assertions are scoped to lines that talk about redact/deid.
      const redactLines = text.split("\n").filter((l) => /redact|deid\b/i.test(l));
      expect(redactLines.length).toBeGreaterThan(0);
      for (const line of redactLines) {
        expect(line, `${page}: ${line}`).not.toMatch(/not yet wired|does not wire|gated stub/i);
        expect(line, `${page}: ${line}`).not.toMatch(/never reads (your |the )?input/i);
        expect(line, `${page}: ${line}`).not.toMatch(/not implemented yet|is deliberately gated/i);
      }
    });
  }

  it("every uncovered format's refusal is documented where the matrix is stated", () => {
    for (const page of [
      join("docs-content", "reference-commands.md"),
      join("docs-content", "limitations.md"),
      join("docs-content", "troubleshooting.md"),
      join("docs-content", "concepts-archetype.md"),
      "README.md",
    ]) {
      const text = read(page);
      for (const format of uncovered) {
        expect(text, `${page} must name ${format}`).toContain(`\`${format}\``);
      }
      expect(text).toContain("CLI_NOT_IMPLEMENTED");
      expect(text).toContain("CLI_FORMAT_UNSUPPORTED");
    }
  });

  it("`cosyte --help` states the same covered set, rendered from the same code", () => {
    const help = helpText();
    expect(help).toContain(deidCoveredFormats().join(", "));
    expect(help).not.toMatch(/not yet wired|gated on @cosyte\/deid/i);
  });
});
