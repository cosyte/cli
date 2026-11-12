import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * The docs-content standard's structure check (`cosyte-docs-content`, from @cosyte/script-utils)
 * holds `docs-content/` to the page kinds, the one limitations page in Reference, page ids that name
 * their subject, and the rule that no sample prints a value identifying a person. It holds this
 * library at the counts its ratchet records, which only fall.
 *
 * A check nobody runs holds nothing, so this file asserts the wiring as well as the result: the
 * script, the step in the required `documents` job, the gate in AGENTS.md and CLAUDE.md, and the
 * config file that makes the print rule fail rather than advise. Then it runs the check on this
 * tree, and on a copy given one sample that prints a name, to show the rule can still fail.
 */

const ROOT = join(import.meta.dirname, "..");
const BIN = join(ROOT, "node_modules", ".bin", "cosyte-docs-content");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** The first fenced `sh` block after `heading` in a Markdown file: a gate. */
function gateBlock(rel: string, heading: string): string {
  const text = read(rel);
  const at = text.indexOf(`\n${heading}\n`);
  expect(at, `${rel} has a "${heading}" section`).toBeGreaterThanOrEqual(0);
  const block = /```sh\n([\s\S]*?)```/.exec(text.slice(at));
  expect(block, `${rel} has a sh block under "${heading}"`).not.toBeNull();
  return block?.[1] ?? "";
}

/** Run the check over a repository root; stdout and stderr together. */
function check(dir: string): { status: number | null; out: string } {
  const r = spawnSync(BIN, ["--dir", dir], { cwd: ROOT, encoding: "utf8", timeout: 60_000 });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

describe("the docs-content structure check", () => {
  it("is a package script", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["check:docs-content"]).toBe("cosyte-docs-content");
    expect(existsSync(BIN), "the bin is installed").toBe(true);
  });

  it("runs in the required documents job", () => {
    const ci = read(".github/workflows/ci.yml");
    const job = ci.slice(ci.indexOf("\n  documents:\n"));
    expect(ci.includes("\n  documents:\n"), "ci.yml has a documents job").toBe(true);
    expect(job).toMatch(/\n\s+run: pnpm check:docs-content\n/);
  });

  it("is in the gate AGENTS.md and CLAUDE.md give", () => {
    expect(gateBlock("AGENTS.md", "## The gate")).toMatch(/pnpm check:docs-content/);
    expect(gateBlock("CLAUDE.md", "## Gate")).toMatch(/pnpm check:docs-content/);
  });

  it("fails, rather than advises, on a sample that prints an identifying value", () => {
    const config = JSON.parse(read("cosyte-docs-content.config.json")) as {
      examplePrint?: { required?: boolean };
    };
    expect(config.examplePrint?.required).toBe(true);
  });

  it("passes on this tree", () => {
    const r = check(ROOT);
    expect(r.out).toMatch(/docs-content: OK/);
    expect(r.status).toBe(0);
  }, 60_000);

  it("fails a copy whose README prints a person's name", () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-docs-standard-"));
    scratch.push(dir);
    for (const rel of [
      "package.json",
      "README.md",
      "cosyte-docs-content.config.json",
      "docs-content",
      "examples",
    ]) {
      cpSync(join(ROOT, rel), join(dir, rel), { recursive: true });
    }
    const sample = [
      "",
      "```ts",
      'import { parse } from "@cosyte/cli";',
      "",
      'const result = parse("MSH|^~\\\\&|TEST");',
      "console.log(result.patient.name);",
      "```",
      "",
    ].join("\n");
    writeFileSync(join(dir, "README.md"), `${read("README.md")}${sample}`);
    const r = check(dir);
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/README\.md:\d+ \[example-print\] .*patient\.name/);
  }, 60_000);
});
