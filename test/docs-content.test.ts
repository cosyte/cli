import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { docSnippetSuite } from "@cosyte/vitest-config/snippets";

import { DEID_COVERAGE, deidCoveredFormats } from "../src/core/deid.js";
import { CLI_CODES } from "../src/core/diagnostics.js";
import { EXIT } from "../src/core/exit-codes.js";
import { DETECTABLE_FORMATS, type CosyteFormat } from "../src/core/format.js";
import { describeByteLimit, MAX_INPUT_BYTES } from "../src/core/limits.js";
import { OP_SUPPORT, type Op } from "../src/core/parsers.js";
import { helpText } from "../src/core/run.js";
import { TOOL_DEFS } from "../src/mcp/tools.js";

/**
 * The docs.cosyte.com pages in `docs-content/`, held to the code they describe.
 *
 * - Every TypeScript sample on a hand-written page runs, through the shared sample runner, against
 *   the BUILT package (`dist/*.mjs`, what an installer loads), and compiles against the published
 *   type declarations with the repository's strict settings, since the runner strips types without
 *   checking them.
 * - Every shell sample runs against the built `cosyte` command, in a fresh directory per page, in
 *   page order, so an earlier block can write a file a later one reads. The directory starts with
 *   the synthetic files in `test/__fixtures__/docs-workspace/`, the names the how-to guides use. A
 *   shell block followed directly by a `text` block must print exactly that text (stdout and stderr
 *   together); any other shell block must exit 0 under `set -eo pipefail`. A block that cannot run
 *   says why in its fence: `bash no-run <reason>`.
 * - Every link between pages resolves, heading anchor included, and so does every link into the
 *   generated reference under `docs-content/api/`, with anchors computed by the site's slug rule.
 * - No page carries a value shaped like real contact or identity data: `pnpm phi-scan` does not read
 *   Markdown.
 * - The reference pages list exactly what the source defines: the diagnostic codes and their exit
 *   codes, the format support table, the detection order, the `redact` coverage, and the MCP tools.
 *
 * The generated `api/` pages are not passed to the runner: their `@example` blocks are fragments
 * written for an editor's tooltip, and `cosyte-docs-reference --check` holds them to the source.
 */
const root = join(import.meta.dirname, "..");
const docsDir = join(root, "docs-content");
const apiDir = join(docsDir, "api");
const workspace = join(root, "test", "__fixtures__", "docs-workspace");

/** Each import specifier a sample may use, mapped to the built entry point an installer loads. */
const ENTRY_POINTS: Readonly<Record<string, string>> = {
  "@cosyte/cli": join(root, "dist", "index.mjs"),
  "@cosyte/cli/mcp": join(root, "dist", "mcp.mjs"),
};
const resolve = (specifier: string): string | undefined => ENTRY_POINTS[specifier];

beforeAll(() => {
  execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
}, 120_000);

/** The hand-written pages: every `.md` file at the top of `docs-content/`, not the generated `api/`. */
const pages = readdirSync(docsDir)
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => join(docsDir, name));

/** A page's text, by its file name. */
const page = (name: string): string => readFileSync(join(docsDir, name), "utf8");

/** A page's name relative to `docs-content/`, for a failure message. */
const shortName = (path: string): string => path.slice(docsDir.length + 1);

/**
 * `every` runs each TypeScript and JavaScript sample whether or not it is tagged `runnable`, and
 * lists a `no-run` sample as skipped with its reason. It reaches the runner through a variable
 * rather than a literal so the line compiles against a `@cosyte/vitest-config` that predates the
 * option; such a runner ignores it and runs the `runnable` blocks, which is every sample here that
 * can run, as the test below holds.
 */
const suiteOptions = { files: pages, every: true, resolve };
docSnippetSuite(suiteOptions);

/** One fenced block of a page: its language, the words after it, its body, and where it sits. */
interface Fence {
  readonly lang: string;
  readonly tags: readonly string[];
  readonly body: string;
  /** 1-based line of the opening fence. */
  readonly line: number;
  /** 1-based line of the closing fence. */
  readonly end: number;
}

/** Every fenced block in a page, in order. */
function fences(markdown: string): Fence[] {
  const lines = markdown.split(/\r?\n/);
  const found: Fence[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const open = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(lines[i] ?? "");
    if (open === null) continue;
    const [, indent = "", marker = "", info = ""] = open;
    const words = info.trim().split(/\s+/).filter(Boolean);
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const line = lines[j] ?? "";
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
      if (close !== null && (close[1] ?? "").startsWith(marker[0] ?? "`")) break;
      body.push(line.startsWith(indent) ? line.slice(indent.length) : line);
    }
    found.push({
      lang: words[0] ?? "",
      tags: words.slice(1),
      body: body.join("\n"),
      line: i + 1,
      end: j + 1,
    });
    i = j;
  }
  return found;
}

/** A page with its fenced blocks blanked out, so prose checks do not read code. */
function prose(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  return lines
    .map((line) => {
      if (/^\s*(`{3,}|~{3,})/.test(line)) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
}

/** The reason a block gives for not running, `""` when it names none, or `null` when it runs. */
function noRunReason(fence: Fence): string | null {
  const at = fence.tags.indexOf("no-run");
  return at === -1 ? null : fence.tags.slice(at + 1).join(" ");
}

/** The fence languages that make a block a code sample, as the docs-content standard names them. */
const SAMPLE_LANGS: ReadonlySet<string> = new Set([
  "ts",
  "typescript",
  "tsx",
  "js",
  "javascript",
  "mjs",
]);

/** The fence languages that make a block a shell sample. */
const SHELL_LANGS: ReadonlySet<string> = new Set(["bash", "sh", "shell"]);

/** Every code sample on every hand-written page. */
const samples = pages.flatMap((path) =>
  fences(readFileSync(path, "utf8"))
    .filter((fence) => SAMPLE_LANGS.has(fence.lang))
    .map((fence) => ({ ...fence, page: shortName(path) })),
);

describe("every TypeScript sample on a hand-written page", () => {
  it("runs, or names in its fence why it cannot", () => {
    const unaccounted: string[] = [];
    for (const sample of samples) {
      const reason = noRunReason(sample);
      if (sample.tags.includes("runnable") ? reason !== null : reason === null || reason === "") {
        unaccounted.push(`${sample.page}:${String(sample.line)}`);
      }
    }
    expect(samples.length).toBeGreaterThan(5);
    expect(unaccounted).toEqual([]);
  });

  it(
    "compiles against the published types, with the repository's strict settings",
    { timeout: 120_000 },
    () => {
      // Inside the repository, so `@cosyte/cli` resolves through the package's own `exports` to the
      // declarations in `dist/`, exactly as a consumer's import does; the directory is gitignored.
      const dir = join(root, ".cosyte-doc-snippets-tsc");
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      try {
        writeFileSync(
          join(dir, "tsconfig.json"),
          JSON.stringify({
            extends: "../examples/tsconfig.json",
            compilerOptions: { moduleDetection: "force" },
            include: ["./*.ts"],
          }),
        );
        for (const sample of samples) {
          const name = `${sample.page.replace(/\.md$/, "")}-${String(sample.line)}.ts`;
          writeFileSync(join(dir, name), sample.body);
        }
        const tsc = spawnSync(
          process.execPath,
          [join(root, "scripts", "process-tool.mjs"), "tsc", "-p", join(dir, "tsconfig.json")],
          { cwd: root, encoding: "utf8" },
        );
        expect(`${tsc.stdout}${tsc.stderr}`).toBe("");
        expect(tsc.status).toBe(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

/** One shell sample, with the output the page shows for it when there is one. */
interface ShellSample extends Fence {
  readonly page: string;
  readonly expected: string | null;
}

/** Every shell block on a page, each paired with the `text` block directly after it, if any. */
function shellSamples(path: string): ShellSample[] {
  const markdown = readFileSync(path, "utf8");
  const lines = markdown.split(/\r?\n/);
  const all = fences(markdown);
  return all.flatMap((fence, index) => {
    if (!SHELL_LANGS.has(fence.lang)) return [];
    const next = all[index + 1];
    const between = next === undefined ? [] : lines.slice(fence.end, next.line - 1);
    const adjacent =
      next !== undefined && next.lang === "text" && between.every((l) => l.trim() === "");
    return [{ ...fence, page: shortName(path), expected: adjacent ? next.body : null }];
  });
}

/** Trailing spaces on each line and trailing blank lines dropped, for an output comparison. */
const normalize = (text: string): string =>
  text
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trimEnd();

describe("every shell sample on a hand-written page", () => {
  /** A directory holding `cosyte` and `cosyte-mcp`, each running the built command. */
  let bin = "";
  beforeAll(() => {
    bin = mkdtempSync(join(tmpdir(), "cosyte-docs-bin-"));
    for (const [name, file] of [
      ["cosyte", "cosyte.mjs"],
      ["cosyte-mcp", "cosyte-mcp.mjs"],
    ] as const) {
      const shim = join(bin, name);
      writeFileSync(
        shim,
        `#!/bin/sh\nexec "${process.execPath}" "${join(root, "dist", "bin", file)}" "$@"\n`,
      );
      chmodSync(shim, 0o755);
    }
  });
  afterAll(() => {
    rmSync(bin, { recursive: true, force: true });
  });

  const byPage = pages.map((path) => ({ name: shortName(path), blocks: shellSamples(path) }));
  const all = byPage.flatMap((p) => p.blocks);

  it("runs, or names in its fence why it cannot", () => {
    const unaccounted = all
      .filter((b) => noRunReason(b) === "")
      .map((b) => `${b.page}:${String(b.line)}`);
    expect(all.length).toBeGreaterThan(40);
    expect(all.filter((b) => b.expected !== null).length).toBeGreaterThan(25);
    expect(unaccounted).toEqual([]);
  });

  it("can reach jq, which several samples use", () => {
    expect(spawnSync("jq", ["--version"]).status).toBe(0);
  });

  for (const { name, blocks } of byPage) {
    const runnable = blocks.filter((b) => noRunReason(b) === null);
    if (runnable.length === 0) continue;
    it(`${name}: each block runs as written`, { timeout: 120_000 }, () => {
      const cwd = mkdtempSync(join(tmpdir(), "cosyte-docs-page-"));
      try {
        cpSync(workspace, cwd, { recursive: true });
        const env = { ...process.env, PATH: `${bin}:${process.env["PATH"] ?? ""}` };
        for (const block of runnable) {
          const where = `${name}:${String(block.line)}`;
          const script =
            block.expected === null
              ? `set -eo pipefail\n${block.body}\n`
              : `exec 2>&1\n${block.body}\n`;
          const r = spawnSync("bash", ["-c", script], {
            cwd,
            env,
            input: "",
            encoding: "utf8",
            timeout: 60_000,
          });
          if (block.expected === null) {
            expect(r.status, `${where} exited non-zero:\n${r.stdout}${r.stderr}`).toBe(0);
          } else {
            expect(normalize(r.stdout), where).toBe(normalize(block.expected));
          }
        }
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  }
});

/**
 * The anchor the docs site gives a heading, as github-slugger computes it: lower-cased, every
 * character that is not a letter, a digit, `_`, a space or a hyphen dropped (code ticks and
 * parentheses included), and each space made a hyphen. A repeated one is numbered from `-1`.
 */
function anchors(markdown: string): Set<string> {
  const seen = new Map<string, number>();
  const result = new Set<string>();
  for (const line of prose(markdown).split("\n")) {
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading === null) continue;
    const base = (heading[1] ?? "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_ -]/gu, "")
      .replace(/ /g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    result.add(count === 0 ? base : `${base}-${String(count)}`);
  }
  return result;
}

/** What is wrong with one link target on a page, or null when it resolves. */
function linkFault(from: string, target: string): string | null {
  if (/^https:\/\//.test(target)) return null;
  if (target.startsWith("#")) {
    return anchors(page(from)).has(target.slice(1)) ? null : "names no heading on this page";
  }
  const shaped = /^\.\/((?:api\/(?:[^/#.][^/#]*\/)*)?[^/#]+\.md)(?:#(.+))?$/.exec(target);
  if (shaped === null) return "is not written as ./<page>.md, ./api/<page>.md or #<anchor>";
  const file = join(docsDir, shaped[1] ?? "");
  if (!existsSync(file)) return "resolves to no page";
  const anchor = shaped[2];
  if (anchor !== undefined && !anchors(readFileSync(file, "utf8")).has(anchor)) {
    return "names no heading on that page";
  }
  return null;
}

describe("every link on a hand-written page", () => {
  it("resolves to a page, and to a heading on it when it names one", () => {
    const broken: string[] = [];
    let checked = 0;
    for (const path of pages) {
      const name = shortName(path);
      for (const match of prose(readFileSync(path, "utf8")).matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = match[1] ?? "";
        checked += 1;
        const fault = linkFault(name, target);
        if (fault !== null) broken.push(`${name}: ${target} ${fault}`);
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(broken).toEqual([]);
  });

  it("would refuse a link that does not resolve", () => {
    expect(existsSync(join(apiDir, "README.md"))).toBe(true);
    expect(linkFault("intro.md", "./api/src.md#detectformat")).toBeNull();
    expect(linkFault("intro.md", "./api/src/mcp.md#dispatchtool")).toBeNull();
    expect(linkFault("intro.md", "./api/src.md#no-such-export")).not.toBeNull();
    expect(linkFault("intro.md", "./diagnostic-codes.md#cli_usage")).toBeNull();
    expect(linkFault("intro.md", "./no-such-page.md")).not.toBeNull();
    expect(linkFault("intro.md", "./quickstart")).not.toBeNull();
  });
});

/** A dashed SSN; only the 900 series is invalid, so any other area could be a real number. */
const SSN = /\b(\d{3})-\d{2}-\d{4}\b/g;
/** A full NANP phone number; only `555-0100` to `555-0199` is reserved for fiction. */
const PHONE = /(?:\(\d{3}\)\s?|\b\d{3}-)(\d{3})-(\d{4})\b/g;
/** An email address. */
const EMAIL = /[\w.+-]+@((?:[\w-]+\.)+[a-z]{2,})\b/gi;
/** The domains reserved for examples and testing (RFC 2606, RFC 6761). */
const RESERVED_DOMAIN = /^(?:example\.(?:com|net|org)|.*\.(?:test|example|invalid|localhost))$/i;

/** Every value on a page shaped like real contact or identity data. */
function sampleDataFindings(name: string, text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(SSN)) {
    if (!(m[1] ?? "").startsWith("9")) found.push(`${name}: SSN ${m[0]}`);
  }
  for (const m of text.matchAll(PHONE)) {
    if (m[1] !== "555" || !(m[2] ?? "").startsWith("01")) found.push(`${name}: phone ${m[0]}`);
  }
  for (const m of text.matchAll(EMAIL)) {
    if (!RESERVED_DOMAIN.test(m[1] ?? "")) found.push(`${name}: email ${m[0]}`);
  }
  return found;
}

describe("the sample data on the pages", () => {
  it("holds no SSN, phone number or email address outside the reserved ranges", () => {
    const found = pages.flatMap((path) =>
      sampleDataFindings(shortName(path), readFileSync(path, "utf8")),
    );
    expect(found).toEqual([]);
  });

  it("would refuse a value outside them", () => {
    // The refused values are assembled at run time so this file holds no literal the repository's
    // own PHI scan would flag; each is shaped like real data on purpose, and none is anyone's.
    const dash = (...parts: string[]): string => parts.join("-");
    expect(sampleDataFindings("x", dash("123", "45", "6789"))).toHaveLength(1);
    expect(sampleDataFindings("x", "(212) 555-1212")).toHaveLength(1);
    expect(sampleDataFindings("x", "212-867-0100")).toHaveLength(1);
    expect(sampleDataFindings("x", ["someone", "mail.invalid-domain.org"].join("@"))).toHaveLength(
      1,
    );
    expect(
      sampleDataFindings("x", `${dash("987", "00", "4320")} (528) 555-0105 a@example.org`),
    ).toEqual([]);
  });
});

/** The text of one `## ` section of a page, up to the next `## ` heading. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start === -1) throw new Error(`no "## ${heading}" section`);
  const end = text.indexOf("\n## ", start + 1);
  return text.slice(start, end === -1 ? undefined : end);
}

/** The rows of the first table in a text, as trimmed cells, header and divider dropped. */
function tableRows(text: string): string[][] {
  const rows = text
    .split("\n")
    .filter((l) => l.startsWith("|"))
    .map((l) =>
      l
        .slice(1, l.trimEnd().endsWith("|") ? l.trimEnd().length - 1 : undefined)
        .split("|")
        .map((c) => c.trim()),
    );
  return rows.slice(2);
}

describe("the diagnostic codes page", () => {
  const text = page("diagnostic-codes.md");

  /** Each code's exit code as its doc comment in the source states it ("Exit `65`."). */
  const sourceExits = (() => {
    const source = readFileSync(join(root, "src", "core", "diagnostics.ts"), "utf8");
    const found = new Map<string, number>();
    for (const m of source.matchAll(
      /\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*(CLI_[A-Z_]+): "CLI_[A-Z_]+"/g,
    )) {
      const exit = /Exit `(\d+)`/.exec(m[1] ?? "");
      if (exit !== null) found.set(m[2] ?? "", Number(exit[1]));
    }
    return found;
  })();

  it("reads an exit code for every code from the source (this test is not comparing nothing)", () => {
    expect([...sourceExits.keys()].sort()).toEqual(Object.keys(CLI_CODES).sort());
    for (const exit of sourceExits.values()) expect(Object.values(EXIT)).toContain(exit);
  });

  it("has a section for every code and no other, each opening with its exit code", () => {
    const headed = [...text.matchAll(/^## `(CLI_[A-Z_]+)`$/gm)].map((m) => m[1] ?? "");
    expect([...headed].sort()).toEqual(Object.keys(CLI_CODES).sort());
    for (const [code, exit] of sourceExits) {
      expect(section(text, `\`${code}\``).trimStart().split("\n")[2], code).toMatch(
        new RegExp(`^Exit \`${String(exit)}\`\\.`),
      );
    }
  });

  it("lists every code with the same exit code in its table", () => {
    const rows = new Map(
      tableRows(text).map(([code = "", exit = ""]) => [
        /`(CLI_[A-Z_]+)`/.exec(code)?.[1] ?? "",
        Number(/`(\d+)`/.exec(exit)?.[1]),
      ]),
    );
    expect(rows).toEqual(sourceExits);
  });
});

describe("the format support page", () => {
  const text = page("format-support.md");
  const OPS: readonly Op[] = ["parse", "inspect", "fmt", "validate"];

  it("states exactly the operations each format supports", () => {
    const rows = tableRows(section(text, "Operations"));
    const table = new Map(rows.map(([f = "", ...cells]) => [f.replace(/`/g, ""), cells]));
    expect([...table.keys()].sort()).toEqual(Object.keys(OP_SUPPORT).sort());
    for (const [format, cells] of table) {
      const supported = OP_SUPPORT[format as CosyteFormat];
      expect(cells, format).toEqual(OPS.map((op) => (supported.has(op) ? "yes" : "no")));
    }
  });

  it("lists the detectable formats in the order the undetected diagnostic names them", () => {
    const rows = tableRows(section(text, "Detection"));
    expect(rows.map(([f = ""]) => f.replace(/`/g, ""))).toEqual([...DETECTABLE_FORMATS]);
  });

  it("states the redact coverage the code answers for", () => {
    const row = tableRows(section(text, "Other commands")).find(([c]) => c === "`redact`");
    const cell = row?.[1] ?? "";
    const covered = deidCoveredFormats()
      .map((f) => `\`${f}\``)
      .join(", ");
    expect(cell.startsWith(`${covered}.`)).toBe(true);
    for (const [format, coverage] of Object.entries(DEID_COVERAGE)) {
      if (coverage === "no-adapter")
        expect(cell).toMatch(new RegExp(`\`${format}\`.*CLI_NOT_IMPLEMENTED`));
      if (coverage === "unserializable")
        expect(cell).toContain(`\`${format}\` is \`CLI_FORMAT_UNSUPPORTED\``);
    }
  });
});

describe("the MCP tools page", () => {
  it("lists exactly the tools the server offers, with each title and input property", () => {
    const rows = tableRows(section(page("mcp-tools.md"), "Tools"));
    expect(rows.map(([name = ""]) => name.replace(/`/g, ""))).toEqual(TOOL_DEFS.map((t) => t.name));
    for (const tool of TOOL_DEFS) {
      const row = rows.find(([name]) => name === `\`${tool.name}\``) ?? [];
      expect(row[1]).toBe(tool.title);
      const inputs = [...(row[2] ?? "").matchAll(/`([a-z]+)`/g)].map((m) => m[1]);
      expect(inputs.sort()).toEqual(Object.keys(tool.inputSchema.properties).sort());
      for (const required of tool.inputSchema.required ?? []) {
        expect(row[2]).toContain(`\`${required}\` (required)`);
      }
    }
  });
});

describe("the size limit", () => {
  const COMMANDS: readonly (readonly string[])[] = [
    ["parse"],
    ["validate"],
    ["inspect"],
    ["fmt"],
    ["convert", "--to", "fhir"],
    ["map-codes", "--code", "x"],
    ["redact"],
  ];

  it("is named on the command reference with each command it applies to", () => {
    const limit = section(page("reference-commands.md"), "Input size limit");
    expect(limit).toContain(describeByteLimit());
    for (const [command] of COMMANDS) expect(limit).toContain(`\`${command ?? ""}\``);
  });

  it(
    "refuses a larger input on each of those commands, as CLI_INPUT_TOO_LARGE and exit 65",
    { timeout: 60_000 },
    () => {
      const dir = mkdtempSync(join(tmpdir(), "cosyte-docs-limit-"));
      try {
        const big = join(dir, "big.txt");
        // An HL7 v2 header first: `parse` reads a stream and detects the format from its first
        // bytes before the running count reaches the limit.
        const header = Buffer.from("MSH|^~\\&|SENDINGAPP|SENDINGFAC\r");
        writeFileSync(big, Buffer.concat([header, Buffer.alloc(MAX_INPUT_BYTES, 0x61)]));
        for (const [command = "", ...rest] of COMMANDS) {
          const r = spawnSync(
            process.execPath,
            [join(root, "dist", "bin", "cosyte.mjs"), command, big, ...rest],
            { encoding: "utf8" },
          );
          expect(r.status, command).toBe(EXIT.DATAERR);
          expect(r.stderr, command).toContain(`cosyte: ${CLI_CODES.CLI_INPUT_TOO_LARGE}: `);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

/**
 * The README's usage block is what a reader runs from npm, and the Quickstart is what the same
 * reader runs from the docs site, so the Quickstart's first runnable shell block is the README's,
 * byte for byte; the shell sweep above runs it.
 */
describe("the Quickstart opens with the README's usage block", () => {
  it("carries the README's first shell block after ## Usage as its first runnable one", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const usage = readme.slice(readme.indexOf("\n## Usage\n"));
    const readmeFirst = fences(usage).find((f) => SHELL_LANGS.has(f.lang))?.body;
    const pageFirst = shellSamples(join(docsDir, "quickstart.md")).find(
      (b) => noRunReason(b) === null,
    )?.body;
    expect(readmeFirst).toBeDefined();
    expect(pageFirst).toBe(readmeFirst);
  });
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
    join("docs-content", "de-identify-a-message.md"),
    join("docs-content", "limitations.md"),
    join("docs-content", "troubleshooting.md"),
  ];

  const read = (rel: string): string => readFileSync(join(root, rel), "utf8");

  it("the derived list is the real one (this test is not asserting an empty set)", () => {
    expect(coveredList).toBe("`ccda`, `fhir`, `hl7`, `x12`");
    expect(uncovered.sort()).toStrictEqual(["astm", "dicom", "mllp", "ncpdp"]);
  });

  for (const rel of PAGES) {
    it(`${rel} states the covered set the code answers for`, () => {
      expect(read(rel)).toContain(coveredList);
    });

    it(`${rel} no longer calls redact unimplemented or unread`, () => {
      const text = read(rel);
      // The page may still explain the OTHER gated capability (`validate --profile`), so the
      // assertions are scoped to lines that talk about redact/deid.
      const redactLines = text.split("\n").filter((l) => /redact|deid\b/i.test(l));
      expect(redactLines.length).toBeGreaterThan(0);
      for (const line of redactLines) {
        expect(line, `${rel}: ${line}`).not.toMatch(/not yet wired|does not wire|gated stub/i);
        expect(line, `${rel}: ${line}`).not.toMatch(/never reads (your |the )?input/i);
        expect(line, `${rel}: ${line}`).not.toMatch(/not implemented yet|is deliberately gated/i);
      }
    });
  }

  it("every uncovered format's refusal is documented where the coverage is stated", () => {
    for (const rel of [
      join("docs-content", "reference-commands.md"),
      join("docs-content", "de-identify-a-message.md"),
      join("docs-content", "format-support.md"),
      join("docs-content", "troubleshooting.md"),
      "README.md",
    ]) {
      const text = read(rel);
      for (const format of uncovered) {
        expect(text, `${rel} must name ${format}`).toContain(`\`${format}\``);
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
