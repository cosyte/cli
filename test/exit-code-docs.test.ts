import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EXIT } from "../src/core/exit-codes.js";

/**
 * THE EXIT-CODE DOCUMENTATION GUARD.
 *
 * The CLI publishes an exit-code contract and grounds part of it in the Unix `sysexits.h` header.
 * That is a claim about a published standard, and it was wrong: exit `2` was labelled `EX_USAGE` in
 * two places while the header assigns `EX_USAGE` the value `64`, so a developer aligning their own
 * tooling to the header learned a false fact from our documentation. Nothing in this suite could
 * see it. The golden matrix pins the numbers and says nothing about the names beside them.
 *
 * WHAT THIS GUARD ASSERTS, in the order it matters:
 *
 *   1. EVERY sysexits constant written on a shipped surface sits beside the value the header
 *      actually assigns it. The table below is transcribed from the man-pages rendering of
 *      `sysexits.h` and is the authority here; a constant that table does not carry is itself a
 *      finding, so widening the vocabulary is a deliberate act rather than an accident.
 *   2. Exit `1` and exit `2` carry NO sysexits constant, because the header defines neither, and
 *      each is documented as this CLI's own value rather than left to inherit the framing of the
 *      codes around it.
 *   3. The exported `EXIT` map still holds exactly the seven member/value pairs it publishes, and
 *      each documentation surface still describes exactly those seven numbers.
 *
 * ASSERT THE PREMISE, NOT ONLY THE REMEDY. Two vacuity traps have already sprung in this
 * repository's suite (a fixture whose setup refused, so every later assertion held over an empty
 * result, and a loop that asserted only one side of a switch), so a green here is worth nothing
 * unless a reader can see that the checker opened something and can still fail. Three things are
 * therefore asserted directly rather than assumed: the sweep opens a known-positive population of
 * files, the extractor really does bind the four correct labels on `src/core/exit-codes.ts` to
 * 65/66/69/70 through BOTH of its association rules, and THE EXACT TEXT THAT SHIPPED BEFORE THIS
 * CORRECTION is replayed as a negative control and must be reported, naming the surface and the
 * offending code. The negative control has its own control: the same shapes carrying the value the
 * header assigns must stay silent, or the checker is merely always red.
 *
 * HOW A CONSTANT IS BOUND TO A NUMBER. A constant and the number it labels are often not on the
 * same line, so three association rules run in order of specificity:
 *
 *   (a) MEMBER. In a `.ts` file, a doc comment immediately followed by `NAME: <int>,` binds every
 *       constant inside the comment to that member's value. This is the rule that sees the original
 *       defect, where the label sat in the JSDoc and the value on the next line.
 *   (b) ROW. A markdown table row (including one written inside a doc comment) whose first cell is
 *       an integer binds every constant in the row to that integer. The first cell IS the code, so
 *       it wins over any other number in the row's prose.
 *   (c) LINE. Otherwise the constant binds to the nearest number BEFORE it on its own line, or,
 *       when nothing precedes it, to the nearest one after. Preceding wins because that is the
 *       order every surface here writes: the code first, its label in a trailing parenthetical.
 *       Plain proximity gets this wrong on a prose list, where the NEXT item's code can sit closer
 *       to the label than the code the label belongs to. A constant on a line holding no number at
 *       all is UNBOUND: it makes no claim about a value, so it is counted and not reported. Both
 *       process entry points carry `EX_SOFTWARE` in a line comment with no number, and that is the
 *       shape.
 *
 * This test reads files and imports the map. It spawns nothing, so it needs no timeout budget of
 * its own.
 */

/**
 * `sysexits.h`, transcribed from the man-pages rendering of the header. `EX__BASE` and `EX__MAX`
 * are markers rather than conditions and are deliberately absent, which is also why the recogniser
 * below requires a letter after the underscore.
 */
const SYSEXITS: Readonly<Record<string, number>> = {
  EX_OK: 0,
  EX_USAGE: 64,
  EX_DATAERR: 65,
  EX_NOINPUT: 66,
  EX_NOUSER: 67,
  EX_NOHOST: 68,
  EX_UNAVAILABLE: 69,
  EX_SOFTWARE: 70,
  EX_OSERR: 71,
  EX_OSFILE: 72,
  EX_CANTCREAT: 73,
  EX_IOERR: 74,
  EX_TEMPFAIL: 75,
  EX_PROTOCOL: 76,
  EX_NOPERM: 77,
  EX_CONFIG: 78,
};

/** The codes this CLI publishes that `sysexits.h` assigns to no constant at all. */
const CLI_SPECIFIC_CODES: readonly number[] = [1, 2];

/** The phrase each surface uses to say a code is ours rather than the header's. */
const CLI_SPECIFIC_CLAIM = /this CLI's own/;

/** A sysexits-shaped constant. */
const NAME_RE = /\bEX_[A-Z][A-Z0-9_]*\b/g;

/** A standalone one-to-three digit run: a number a reader would take for an exit code. */
const NUM_RE = /(?<!\d)\d{1,3}(?!\d)/g;

/** A table row whose first cell is a code, with or without backticks, with or without a ` * ` lead. */
const ROW_RE = /^\s*(?:\*\s?)?\|\s*`?(\d{1,3})`?\s*\|/;

/** A doc comment immediately followed by an upper-case member bound to an integer. */
const MEMBER_RE = /\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*([A-Z][A-Z0-9_]*)\s*:\s*(\d+)\s*,/g;

const ROOT = join(import.meta.dirname, "..");

const EXIT_CODES_TS = "src/core/exit-codes.ts";
const README = "README.md";
const CONCEPTS = "docs-content/concepts-archetype.md";

/** The surfaces that carry a prose exit-code contract under their own heading. */
const CONTRACT_PAGES: readonly string[] = [README, CONCEPTS];

interface Surface {
  readonly name: string;
  readonly text: string;
}

interface Attribution {
  readonly surface: string;
  readonly line: number;
  readonly name: string;
  /** The code this surface binds the constant to, or `null` when it names no number. */
  readonly code: number | null;
  readonly rule: "member" | "row" | "line";
}

interface Finding {
  readonly surface: string;
  readonly line: number;
  readonly code: number | null;
  readonly message: string;
}

function group(m: RegExpExecArray, i: number): string {
  const g = m[i];
  if (g === undefined) throw new Error(`capture group ${String(i)} did not participate`);
  return g;
}

function surfaceOf(rel: string): Surface {
  return { name: rel, text: readFileSync(join(ROOT, rel), "utf-8") };
}

/** Every shipped surface: the README, every source file, every published docs page. */
function sweep(): Surface[] {
  const out: Surface[] = [surfaceOf(README)];
  for (const rel of readdirSync(join(ROOT, "src"), { recursive: true, encoding: "utf-8" })) {
    if (rel.endsWith(".ts")) out.push(surfaceOf(join("src", rel)));
  }
  for (const rel of readdirSync(join(ROOT, "docs-content"), { encoding: "utf-8" })) {
    if (rel.endsWith(".md")) out.push(surfaceOf(join("docs-content", rel)));
  }
  return out;
}

const SURFACES = sweep();

function surfaceText(rel: string): string {
  const s = SURFACES.find((x) => x.name === rel);
  if (!s) throw new Error(`${rel} is not on the swept tree`);
  return s.text;
}

/** The doc-comment-plus-member spans of a source file, each with the value it is attached to. */
function memberSpans(text: string): { start: number; end: number; code: number }[] {
  const out: { start: number; end: number; code: number }[] = [];
  for (const m of text.matchAll(MEMBER_RE)) {
    out.push({ start: m.index, end: m.index + m[0].length, code: Number(group(m, 3)) });
  }
  return out;
}

function lineAt(text: string, index: number): { number: number; start: number; content: string } {
  const before = text.slice(0, index);
  const start = before.lastIndexOf("\n") + 1;
  const nl = text.indexOf("\n", index);
  return {
    number: before.split("\n").length,
    start,
    content: text.slice(start, nl === -1 ? text.length : nl),
  };
}

/**
 * The number this line labels with a constant spanning `[start, end)`: the nearest one BEFORE the
 * constant, falling back to the nearest one after it when nothing precedes it.
 *
 * Preceding wins because that is the order every surface here writes: the code first, its label in
 * a trailing parenthetical. Plain proximity gets this wrong on a list, where the next item's code
 * sits closer to the label than the code the label belongs to. The fallback covers the other real
 * shape, a sentence that names the constant before quoting its value.
 */
function labelledNumber(content: string, start: number, end: number): number | null {
  let before: number | null = null;
  for (const m of content.matchAll(NUM_RE)) {
    if (m.index + m[0].length <= start) before = Number(m[0]);
    else if (m.index >= end) return before ?? Number(m[0]);
  }
  return before;
}

/** Every sysexits constant on a surface, each bound to the number that surface attributes it to. */
function attributions(surface: Surface): Attribution[] {
  const spans = surface.name.endsWith(".ts") ? memberSpans(surface.text) : [];
  const out: Attribution[] = [];
  for (const m of surface.text.matchAll(NAME_RE)) {
    const index = m.index;
    const name = m[0];
    const line = lineAt(surface.text, index);
    const base = { surface: surface.name, line: line.number, name };

    const span = spans.find((s) => index >= s.start && index < s.end);
    if (span) {
      out.push({ ...base, code: span.code, rule: "member" });
      continue;
    }
    const row = ROW_RE.exec(line.content);
    if (row) {
      out.push({ ...base, code: Number(group(row, 1)), rule: "row" });
      continue;
    }
    const offset = index - line.start;
    out.push({
      ...base,
      code: labelledNumber(line.content, offset, offset + name.length),
      rule: "line",
    });
  }
  return out;
}

/** Every constant a surface attributes to a number the header does not give it. */
function audit(surfaces: readonly Surface[]): Finding[] {
  const findings: Finding[] = [];
  for (const surface of surfaces) {
    for (const a of attributions(surface)) {
      const where = `${a.surface}:${String(a.line)}`;
      const expected = SYSEXITS[a.name];
      if (expected === undefined) {
        findings.push({
          surface: a.surface,
          line: a.line,
          code: a.code,
          message: `${where}: ${a.name} is not a constant the carried sysexits.h table defines`,
        });
        continue;
      }
      if (a.code !== null && a.code !== expected) {
        findings.push({
          surface: a.surface,
          line: a.line,
          code: a.code,
          message: `${where}: ${a.name} is attributed to exit ${String(a.code)}, but sysexits.h assigns it ${String(expected)}`,
        });
      }
    }
  }
  return findings;
}

/** The body of a page's `## The exit-code contract` section. Throws rather than return nothing. */
function exitCodeSection(rel: string): string {
  const text = surfaceText(rel);
  const heading = "## The exit-code contract";
  const start = text.indexOf(heading);
  if (start === -1) throw new Error(`${rel}: no "${heading}" section to read`);
  const rest = text.slice(start + heading.length);
  const next = rest.indexOf("\n## ");
  return next === -1 ? rest : rest.slice(0, next);
}

/** The leading doc comment of a source file. */
function moduleDocblock(rel: string): string {
  const text = surfaceText(rel);
  const end = text.indexOf("*/");
  if (!text.startsWith("/**") || end === -1) throw new Error(`${rel}: no module doc comment`);
  return text.slice(0, end + 2);
}

/** Every backticked code in a stretch of prose. */
function codesIn(text: string): Set<number> {
  return new Set([...text.matchAll(/`(\d{1,3})`/g)].map((m) => Number(group(m, 1))));
}

/** Each table row of a doc comment, keyed by the code in its first cell. */
function docblockRows(text: string): Map<number, string> {
  const rows = new Map<number, string>();
  for (const content of text.split("\n")) {
    const row = ROW_RE.exec(content);
    if (row) rows.set(Number(group(row, 1)), content);
  }
  return rows;
}

const sorted = (ns: Iterable<number>): number[] => [...ns].sort((a, b) => a - b);

describe("the sweep opens a real population of shipped surfaces", () => {
  it("reads the README, every source file and every published docs page", () => {
    const names = SURFACES.map((s) => s.name);
    expect(names).toContain(README);
    expect(names).toContain(EXIT_CODES_TS);
    expect(names).toContain(CONCEPTS);
    expect(names).toContain("src/bin/cosyte.ts");
    expect(names).toContain("src/bin/cosyte-mcp.ts");
    // A sweep that quietly stopped resolving the tree would read as clean. It cannot read as
    // clean over a population it never opened, so the population is asserted.
    expect(SURFACES.length).toBeGreaterThan(20);
    for (const s of SURFACES) expect(s.text.length, s.name).toBeGreaterThan(0);
  });

  it("finds sysexits constants on that tree, so a clean audit is a verdict and not an absence", () => {
    const found = SURFACES.flatMap(attributions);
    expect(found.length).toBeGreaterThan(0);
    const names = [...new Set(found.map((a) => a.name))];
    for (const expected of ["EX_DATAERR", "EX_NOINPUT", "EX_UNAVAILABLE", "EX_SOFTWARE"]) {
      expect(names).toContain(expected);
    }
  });
});

describe("the extractor binds each label to the number it labels", () => {
  const CORRECT = { EX_DATAERR: 65, EX_NOINPUT: 66, EX_UNAVAILABLE: 69, EX_SOFTWARE: 70 };

  it("reads every member of the exported map out of the source, values included", () => {
    expect(memberSpans(surfaceText(EXIT_CODES_TS)).map((s) => s.code)).toStrictEqual(
      Object.values(EXIT),
    );
  });

  it("binds the four header labels through the member rule", () => {
    const bound = attributions(surfaceOf(EXIT_CODES_TS)).filter((a) => a.rule === "member");
    expect(Object.fromEntries(bound.map((a) => [a.name, a.code]))).toStrictEqual(CORRECT);
  });

  it("binds them again through the table-row rule, independently of the member rule", () => {
    const bound = attributions(surfaceOf(EXIT_CODES_TS)).filter((a) => a.rule === "row");
    expect(Object.fromEntries(bound.map((a) => [a.name, a.code]))).toStrictEqual(CORRECT);
  });

  it("leaves a constant with no number on its line unbound rather than guessing", () => {
    const bins = ["src/bin/cosyte.ts", "src/bin/cosyte-mcp.ts"].flatMap((rel) =>
      attributions(surfaceOf(rel)),
    );
    expect(bins.map((a) => a.name)).toStrictEqual(["EX_SOFTWARE", "EX_SOFTWARE"]);
    expect(bins.map((a) => a.code)).toStrictEqual([null, null]);
  });
});

describe("every sysexits constant on a shipped surface sits beside its header value", () => {
  it("reports nothing anywhere on the tree", () => {
    expect(audit(SURFACES)).toStrictEqual([]);
  });
});

describe("a code sysexits.h does not define is documented as this CLI's own", () => {
  it("binds no sysexits constant to exit 1 or exit 2 anywhere on the tree", () => {
    const offenders = SURFACES.flatMap(attributions).filter(
      (a) => a.code !== null && CLI_SPECIFIC_CODES.includes(a.code),
    );
    expect(offenders).toStrictEqual([]);
  });

  it("says so in the module contract and in the row of each undefined code", () => {
    const docblock = moduleDocblock(EXIT_CODES_TS);
    expect(docblock).toMatch(CLI_SPECIFIC_CLAIM);
    const rows = docblockRows(docblock);
    for (const code of CLI_SPECIFIC_CODES) {
      const row = rows.get(code);
      expect(row, `docblock row for exit ${String(code)}`).toBeDefined();
      expect(row ?? "", `docblock row for exit ${String(code)}`).toMatch(CLI_SPECIFIC_CLAIM);
    }
  });

  it("says so on each published page that states the contract", () => {
    for (const page of CONTRACT_PAGES) {
      const section = exitCodeSection(page);
      expect(section, page).toMatch(CLI_SPECIFIC_CLAIM);
      // ASSERT THE PREMISE: the page really does list the two codes the claim is about.
      for (const code of CLI_SPECIFIC_CODES) expect(codesIn(section), page).toContain(code);
    }
  });
});

describe("the published numbers do not move", () => {
  it("the exported map is exactly the seven documented pairs, in order", () => {
    expect(EXIT).toStrictEqual({
      OK: 0,
      INVALID: 1,
      USAGE: 2,
      DATAERR: 65,
      NOINPUT: 66,
      UNAVAILABLE: 69,
      SOFTWARE: 70,
    });
    expect(Object.keys(EXIT)).toStrictEqual([
      "OK",
      "INVALID",
      "USAGE",
      "DATAERR",
      "NOINPUT",
      "UNAVAILABLE",
      "SOFTWARE",
    ]);
  });

  it("each published page describes exactly those seven numbers and no others", () => {
    for (const page of CONTRACT_PAGES) {
      expect(sorted(codesIn(exitCodeSection(page))), page).toStrictEqual(
        sorted(Object.values(EXIT)),
      );
    }
  });

  it("the docblock table lists exactly those seven numbers", () => {
    expect(sorted(docblockRows(moduleDocblock(EXIT_CODES_TS)).keys())).toStrictEqual(
      sorted(Object.values(EXIT)),
    );
  });
});

/**
 * THE NEGATIVE CONTROL. Every case below replays text that this repository actually shipped, or a
 * one-token mutation of text it ships today, and requires the checker to report it. A guard that
 * has never been watched to fail is a guard nobody can believe, and this class of guard is
 * particularly easy to write so that it passes over an empty result forever.
 */
describe("the negative control: the guard reports the defect it exists to prevent", () => {
  /** The `USAGE` member exactly as it shipped: the label in the JSDoc, the value on the next line. */
  const PRE_FIX_MEMBER: Surface = {
    name: "control/exit-codes.ts",
    text: [
      "export const EXIT = {",
      "  /** Usage error: unknown command, bad flag, missing argument (`EX_USAGE`). */",
      "  USAGE: 2,",
      "} as const;",
      "",
    ].join("\n"),
  };

  /** The docblock table row exactly as it shipped. */
  const PRE_FIX_ROW: Surface = {
    name: "control/docblock.ts",
    text: [
      "/**",
      " * | Code | Name       | Meaning                                                     |",
      " * |------|------------|-------------------------------------------------------------|",
      " * | `2`  | `USAGE`    | usage error: unknown command, bad flag, missing argument (EX_USAGE) |",
      " */",
      "",
    ].join("\n"),
  };

  /** The shape a prose page would take if a label were introduced onto it. */
  const PRE_FIX_PROSE: Surface = {
    name: "control/page.md",
    text: "Exit codes: `0` success, `2` usage error (`EX_USAGE`), `65` data error.\n",
  };

  /** A constant the carried table does not define, attached to one of our codes. */
  const UNKNOWN_NAME: Surface = {
    name: "control/unknown.md",
    text: "| `2` | usage error (EX_MISUSE) |\n",
  };

  it("catches the label on a member, where the value is on the following line", () => {
    const findings = audit([PRE_FIX_MEMBER]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.surface).toBe("control/exit-codes.ts");
    expect(findings[0]?.code).toBe(2);
    expect(findings[0]?.message).toContain("EX_USAGE");
    expect(findings[0]?.message).toContain("exit 2");
    expect(findings[0]?.message).toContain("64");
  });

  it("catches the label in a docblock table row", () => {
    const findings = audit([PRE_FIX_ROW]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.surface).toBe("control/docblock.ts");
    expect(findings[0]?.code).toBe(2);
    expect(findings[0]?.message).toContain("EX_USAGE");
  });

  it("catches a label introduced into prose, binding it to the code it sits beside", () => {
    const findings = audit([PRE_FIX_PROSE]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(2);
    expect(findings[0]?.message).toContain("control/page.md");
  });

  it("catches a constant the carried table does not define, rather than passing it through", () => {
    const findings = audit([UNKNOWN_NAME]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("EX_MISUSE");
    expect(findings[0]?.message).toContain("not a constant");
  });

  it("catches every one of them in one pass, naming each offending surface", () => {
    const findings = audit([PRE_FIX_MEMBER, PRE_FIX_ROW, PRE_FIX_PROSE, UNKNOWN_NAME]);
    expect(findings.map((f) => f.surface)).toStrictEqual([
      "control/exit-codes.ts",
      "control/docblock.ts",
      "control/page.md",
      "control/unknown.md",
    ]);
  });

  it("and stays silent on the same shapes carrying the value the header assigns", () => {
    // THE CONTROL'S OWN CONTROL. Without it, a checker that reports every constant it sees would
    // pass every case above and still be useless.
    const correct: Surface[] = [
      {
        name: "control/ok-member.ts",
        text: "export const EXIT = {\n  /** Data error (`EX_DATAERR`). */\n  DATAERR: 65,\n};\n",
      },
      {
        name: "control/ok-row.ts",
        text: " * | `70` | `SOFTWARE` | internal error (EX_SOFTWARE) |\n",
      },
      {
        name: "control/ok-prose.md",
        text: "`0` success, `66` no input (`EX_NOINPUT`), `69` next.\n",
      },
      // The other direction of rule (c): the constant named before the value it is quoted with.
      { name: "control/ok-sentence.md", text: "The header puts `EX_USAGE` at `64`.\n" },
    ];
    expect(audit(correct)).toStrictEqual([]);
    // ASSERT THE PREMISE: the silence is a verdict over four real constants, not over nothing.
    expect(correct.flatMap(attributions).map((a) => a.code)).toStrictEqual([65, 70, 66, 64]);
  });

  it("catches the same sentence shape when it quotes the wrong value", () => {
    const findings = audit([{ name: "control/bad-sentence.md", text: "`EX_USAGE` is `2`.\n" }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(2);
    expect(findings[0]?.message).toContain("control/bad-sentence.md");
  });

  it("the CLI-specific claim check reds on the framing that shipped before this correction", () => {
    const shipped =
      "Exit codes are a **designed surface** CI depends on, grounded in the Unix `sysexits.h` " +
      "conventions: `0` success, `2` usage error, `65` data error, `70` internal error.";
    expect(shipped).not.toMatch(CLI_SPECIFIC_CLAIM);
    expect(exitCodeSection(CONCEPTS)).toMatch(CLI_SPECIFIC_CLAIM);
  });

  it("the number check reds when a published value moves", () => {
    const moved = exitCodeSection(README).replace("| `2`", "| `3`");
    expect(moved).not.toBe(exitCodeSection(README));
    expect([...codesIn(moved)]).toContain(3);
    expect(sorted(codesIn(moved))).not.toStrictEqual(sorted(Object.values(EXIT)));
  });
});
