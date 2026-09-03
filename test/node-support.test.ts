import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * THE RUNTIME-SUPPORT GUARD.
 *
 * This package told the world it runs on `node >=22.0.0` and tested two release lines, 22 and 24.
 * Node 26 sat inside that promise and outside the tested set, so anyone installing on Node 26 was
 * running a combination nobody here had ever run, and would have learned that from a crash rather
 * than from the manifest. Nothing in this suite could see the gap: the manifest states a range, the
 * CI caller states a matrix, and until now no test read both.
 *
 * WHAT THIS GUARD ASSERTS, in the order it matters:
 *
 *   1. The set of Node majors upstream still supports is DERIVED, at the run date, from a release
 *      schedule committed in this repository beside this file, never from a number typed into a
 *      test. A major is supported exactly when `start <= today < end`.
 *   2. No upstream-supported major that the declared `engines.node` range admits is missing from
 *      the Node matrix this repository declares in `.github/workflows/ci.yml`.
 *   3. The other direction: no matrix cell exercises a major the declared range refuses. A tested
 *      line the manifest calls unsupported is the same disagreement, and it is how narrowing a
 *      range silently strands a matrix cell.
 *   4. Every major the range admits is a major the committed schedule actually carries, so an
 *      unknown line is a failure rather than being read as "unsupported" by accident.
 *   5. Every surface that restates the range or the matrix in prose (this repo's contributor guide
 *      and the published installation page) states the same range and the same matrix as the two
 *      machine-readable declarations.
 *
 * THE DIRECTION IS FIXED AND IT IS NOT SYMMETRIC. When the range and the matrix disagree, the
 * claim narrows; the matrix does not grow. Each matrix cell emits a required status-check context
 * (`ci / verify (22, ubuntu-latest)` and `ci / verify (24, ubuntu-latest)`) named in a GitHub
 * ruleset that no commit in this repository can edit. Adding a cell produces a context that arrives
 * NOT REQUIRED, and removing one produces a required context nothing emits, which leaves every pull
 * request pending and unmergeable by anyone. Widening is therefore a three-step change starting
 * outside this repository: ruleset first, matrix second, range third.
 *
 * ASSERT THE PREMISE, NOT ONLY THE REMEDY. Two vacuity traps have already sprung in this
 * repository's suite, so a green here is worth nothing unless a reader can see that the checker
 * opened something real and can still fail. Four things are therefore asserted directly rather than
 * assumed: that the schedule record was opened and is non-empty and carries its provenance, that
 * the extractors really bound values out of `package.json`, `.github/workflows/ci.yml` and
 * `CLAUDE.md` rather than defaulting, that each failure direction is reported over a constructed
 * input at an injected run date, and that the same shapes carrying agreeing values stay silent.
 *
 * This test reads files. It spawns nothing, so it needs no timeout budget of its own.
 */

const ROOT = join(import.meta.dirname, "..");

const RECORD_PATH = "test/node-release-schedule.json";
const MANIFEST_PATH = "package.json";
const WORKFLOW_PATH = ".github/workflows/ci.yml";
const GUIDE_PATH = "CLAUDE.md";
const INSTALL_PATH = "docs-content/installation.md";

/** The upstream record this repository commits a copy of. */
const SCHEDULE_SOURCE = "https://raw.githubusercontent.com/nodejs/Release/main/schedule.json";

/** An ISO calendar date. Compared as a string, which sorts correctly and has no timezone. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A comparator, with optional whitespace after the operator and an optional `v` prefix, over a
 * version whose minor and patch may be omitted.
 */
const COMPARATOR_RE = /(>=|<=|>|<|=)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/y;

/**
 * What may sit between two comparators: whitespace, a comma, or the word `and`. A manifest range
 * writes `>=22.0.0 <26.0.0`; a sentence a human reads writes `>= 22 and < 26`. Both are the same
 * conjunction of comparators, and anything else in a range string is refused rather than guessed.
 */
const SEPARATOR_RE = /(?:\s|,|and\b)+/y;

/** The Node support line of the contributor guide: a range in bold, then the matrix it pairs with. */
const GUIDE_LINE_RE = /^- \*\*Node:\*\* \*\*([^*]+)\*\* \(CI matrix ([^)]*)\)/m;

/** The Node prerequisite of the published installation page. */
const INSTALL_LINE_RE = /- \*\*Node\.js ([^*]+)\*\*/;

/** A schedule key naming a whole major. `v0.8` and friends name a major this guard does not model. */
const MAJOR_KEY_RE = /^v(\d+)$/;

/** Version components are packed into one integer so an interval is a pair of numbers. */
const COMPONENT_UNIT = 1_000_000;
const MAJOR_UNIT = COMPONENT_UNIT * COMPONENT_UNIT;

/** A half-open version interval `[lo, hi)`, in packed units. */
interface Interval {
  readonly lo: number;
  readonly hi: number;
}

/** One release line of the schedule: the two dates that decide whether it is supported. */
interface ReleaseLine {
  readonly start: string;
  readonly end: string;
}

/** What a surface declares about the runtime. A surface may state a range, a matrix, or both. */
interface Declaration {
  readonly surface: string;
  /** The range exactly as that surface spells it, or `null` when it states no range. */
  readonly rangeText: string | null;
  /** The majors that surface says CI exercises, or `null` when it states no matrix. */
  readonly matrix: readonly number[] | null;
}

interface Finding {
  readonly kind: string;
  readonly message: string;
}

function readSurface(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf-8");
}

/**
 * Parse a JSON file into `unknown`. It throws when the file is absent or unparseable rather than
 * answering with an empty object, because a guard that reads a missing record as "nothing to check"
 * passes for exactly as long as the record is missing.
 */
function loadJson(rel: string): unknown {
  const parsed: unknown = JSON.parse(readSurface(rel));
  return parsed;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value);
}

function pack(major: number, minor: number, patch: number): number {
  return major * MAJOR_UNIT + minor * COMPONENT_UNIT + patch;
}

function majorOf(packed: number): number {
  return Math.floor(packed / MAJOR_UNIT);
}

function group(m: RegExpExecArray, i: number): string | undefined {
  return m[i];
}

/**
 * The half-open interval a range string admits.
 *
 * Only the comparator grammar this repository actually writes is accepted: `>=`, `>`, `<`, `<=`,
 * `=` and a bare version, conjoined. A caret, a tilde, an `x` wildcard or an `||` union throws
 * rather than being approximated, because a range this guard cannot read exactly is a range whose
 * agreement with the matrix it cannot decide, and guessing there is the whole defect class.
 */
function parseRange(text: string): Interval {
  const source = text.trim();
  if (source === "") throw new Error("empty Node range");
  let lo = 0;
  let hi = Number.POSITIVE_INFINITY;
  let at = 0;
  let comparators = 0;
  while (at < source.length) {
    COMPARATOR_RE.lastIndex = at;
    const m = COMPARATOR_RE.exec(source);
    if (!m) throw new Error(`unreadable Node range "${text}" at offset ${String(at)}`);
    at = COMPARATOR_RE.lastIndex;
    comparators += 1;

    const op = group(m, 1) ?? "=";
    const major = Number(group(m, 2));
    const minorText = group(m, 3);
    const patchText = group(m, 4);
    const minor = minorText === undefined ? 0 : Number(minorText);
    const patch = patchText === undefined ? 0 : Number(patchText);
    const at0 = pack(major, minor, patch);

    switch (op) {
      case ">=":
        lo = Math.max(lo, at0);
        break;
      case ">":
        lo = Math.max(lo, at0 + 1);
        break;
      case "<":
        hi = Math.min(hi, at0);
        break;
      case "<=":
        hi = Math.min(hi, at0 + 1);
        break;
      default: {
        // A bare version, or one written with `=`, pins whatever it left unstated: `22` is every
        // 22.x.y, `22.3` is every 22.3.y.
        const width =
          patchText !== undefined ? 1 : minorText !== undefined ? COMPONENT_UNIT : MAJOR_UNIT;
        lo = Math.max(lo, at0);
        hi = Math.min(hi, at0 + width);
        break;
      }
    }

    if (at >= source.length) break;
    SEPARATOR_RE.lastIndex = at;
    const sep = SEPARATOR_RE.exec(source);
    if (!sep) throw new Error(`unreadable Node range "${text}" at offset ${String(at)}`);
    at = SEPARATOR_RE.lastIndex;
  }
  if (comparators === 0) throw new Error(`unreadable Node range "${text}"`);
  if (lo >= hi) throw new Error(`Node range "${text}" admits no version at all`);
  return { lo, hi };
}

/** Whether any version of `major` satisfies the range. */
function admitsMajor(range: Interval, major: number): boolean {
  return range.lo < pack(major + 1, 0, 0) && pack(major, 0, 0) < range.hi;
}

/**
 * Every major the range admits.
 *
 * A range with no upper bound admits infinitely many majors, so it cannot be enumerated and cannot
 * be checked against a finite schedule. That is not an accident of this function: an unbounded
 * range is exactly the claim this guard exists to refuse, so it throws and the caller reports it.
 */
function admittedMajors(range: Interval): number[] {
  if (!Number.isFinite(range.hi)) throw new Error("Node range is unbounded above");
  const out: number[] = [];
  for (let major = majorOf(range.lo); major <= majorOf(range.hi - 1); major += 1) {
    if (admitsMajor(range, major)) out.push(major);
  }
  return out;
}

/** The release lines of a validated record, keyed by major. */
function scheduleOf(value: unknown): Map<number, ReleaseLine> {
  const lines = new Map<number, ReleaseLine>();
  if (!isObject(value)) return lines;
  const schedule = value["schedule"];
  if (!isObject(schedule)) return lines;
  for (const [key, line] of Object.entries(schedule)) {
    const key0 = MAJOR_KEY_RE.exec(key);
    if (!key0 || !isObject(line)) continue;
    const start = line["start"];
    const end = line["end"];
    if (!isDate(start) || !isDate(end)) continue;
    lines.set(Number(group(key0, 1)), { start, end });
  }
  return lines;
}

/**
 * Every major upstream still supports on `runDate`: on or after its `start`, strictly before its
 * `end`. A line moving between Active LTS and Maintenance crosses neither date, so it stays
 * supported; only `end` removes it.
 */
function supportedMajors(schedule: ReadonlyMap<number, ReleaseLine>, runDate: string): number[] {
  const out: number[] = [];
  for (const [major, line] of schedule) {
    if (line.start <= runDate && runDate < line.end) out.push(major);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Everything wrong with the committed record itself: absent content, a missing provenance field, an
 * empty population. These are reported on their own, before any question of agreement is asked.
 */
function auditRecord(value: unknown): Finding[] {
  const findings: Finding[] = [];
  if (!isObject(value)) {
    return [{ kind: "record-unreadable", message: `${RECORD_PATH}: not a JSON object` }];
  }
  const source = value["source"];
  if (typeof source !== "string" || source.trim() === "") {
    findings.push({
      kind: "record-no-source",
      message: `${RECORD_PATH}: records no source URL for the release schedule it carries`,
    });
  }
  if (!isDate(value["accessed"])) {
    findings.push({
      kind: "record-no-accessed-date",
      message: `${RECORD_PATH}: records no accessed date in YYYY-MM-DD form`,
    });
  }
  if (scheduleOf(value).size === 0) {
    findings.push({
      kind: "record-empty",
      message: `${RECORD_PATH}: carries no usable release line, so nothing can be derived from it`,
    });
  }
  return findings;
}

const list = (ns: readonly number[]): string => `[${ns.join(", ")}]`;

/**
 * Every disagreement between the surfaces that restate the range or the matrix and the two
 * machine-readable declarations they restate: `package.json` for the range, the CI caller for the
 * matrix.
 */
function auditDeclarations(declarations: readonly Declaration[]): Finding[] {
  const findings: Finding[] = [];
  const manifest = declarations.find((d) => d.surface === MANIFEST_PATH);
  const workflow = declarations.find((d) => d.surface === WORKFLOW_PATH);
  if (!manifest?.rangeText) throw new Error(`${MANIFEST_PATH} declares no Node range`);
  if (!workflow?.matrix) throw new Error(`${WORKFLOW_PATH} declares no Node matrix`);
  const range = parseRange(manifest.rangeText);

  for (const declaration of declarations) {
    if (declaration.surface !== MANIFEST_PATH && declaration.rangeText !== null) {
      const stated = parseRange(declaration.rangeText);
      if (stated.lo !== range.lo || stated.hi !== range.hi) {
        findings.push({
          kind: "range-restated-differently",
          message:
            `${declaration.surface}: states the Node range "${declaration.rangeText}", ` +
            `but ${MANIFEST_PATH} declares "${manifest.rangeText}"`,
        });
      }
    }
    if (declaration.surface !== WORKFLOW_PATH && declaration.matrix !== null) {
      if (list(declaration.matrix) !== list(workflow.matrix)) {
        findings.push({
          kind: "matrix-restated-differently",
          message:
            `${declaration.surface}: states the CI matrix ${list(declaration.matrix)}, ` +
            `but ${WORKFLOW_PATH} declares ${list(workflow.matrix)}`,
        });
      }
    }
  }
  return findings;
}

interface AuditInput {
  /** The committed schedule record, unvalidated: proving it is usable is part of the guard. */
  readonly record: unknown;
  readonly declarations: readonly Declaration[];
  readonly runDate: string;
}

/**
 * The guard. It returns every disagreement it can see, and an empty array only after it has opened
 * a non-empty record with recorded provenance: a broken record short-circuits, so agreement is
 * never asserted over an empty population.
 */
function audit(input: AuditInput): Finding[] {
  const recordFindings = auditRecord(input.record);
  if (recordFindings.length > 0) return recordFindings;

  const findings = auditDeclarations(input.declarations);
  const schedule = scheduleOf(input.record);
  const declarations = input.declarations;
  const manifest = declarations.find((d) => d.surface === MANIFEST_PATH);
  const workflow = declarations.find((d) => d.surface === WORKFLOW_PATH);
  if (!manifest?.rangeText) throw new Error(`${MANIFEST_PATH} declares no Node range`);
  if (!workflow?.matrix) throw new Error(`${WORKFLOW_PATH} declares no Node matrix`);
  const rangeText = manifest.rangeText;
  const matrix = workflow.matrix;
  const range = parseRange(rangeText);

  for (const major of supportedMajors(schedule, input.runDate)) {
    if (admitsMajor(range, major) && !matrix.includes(major)) {
      findings.push({
        kind: "range-admits-untested-major",
        message:
          `Node ${String(major)} is supported upstream on ${input.runDate} and is admitted by the ` +
          `declared range "${rangeText}", but the declared CI matrix ${list(matrix)} does not ` +
          `exercise it. Narrow the range; do not widen the matrix without the ruleset first.`,
      });
    }
  }

  for (const major of matrix) {
    if (!admitsMajor(range, major)) {
      findings.push({
        kind: "matrix-exercises-unadmitted-major",
        message:
          `the declared CI matrix ${list(matrix)} exercises Node ${String(major)}, but the ` +
          `declared range "${rangeText}" does not admit it: a tested line the manifest calls ` +
          `unsupported`,
      });
    }
  }

  if (!Number.isFinite(range.hi)) {
    findings.push({
      kind: "range-unbounded-above",
      message:
        `the declared range "${rangeText}" has no upper bound, so it admits every future Node ` +
        `major, none of which the CI matrix ${list(matrix)} can exercise`,
    });
    return findings;
  }
  for (const major of admittedMajors(range)) {
    if (!schedule.has(major)) {
      findings.push({
        kind: "admitted-major-not-in-record",
        message:
          `the declared range "${rangeText}" admits Node ${String(major)}, which the committed ` +
          `release schedule does not carry at all: its support status is unknown, not unsupported`,
      });
    }
  }
  return findings;
}

/** The `engines.node` range this package publishes. */
function manifestDeclaration(text: string): Declaration {
  const parsed: unknown = JSON.parse(text);
  if (!isObject(parsed)) throw new Error(`${MANIFEST_PATH}: not a JSON object`);
  const engines = parsed["engines"];
  if (!isObject(engines)) throw new Error(`${MANIFEST_PATH}: declares no engines block`);
  const node = engines["node"];
  if (typeof node !== "string") throw new Error(`${MANIFEST_PATH}: declares no engines.node range`);
  return { surface: MANIFEST_PATH, rangeText: node, matrix: null };
}

/**
 * The Node majors this repository's CI caller passes to the shared pipeline.
 *
 * Comment lines are dropped before the scan so the prose above the job, which names the input and
 * quotes its values, cannot be mistaken for the declaration. A caller that passes no `node-versions`
 * throws: the tested set has to be readable here, not inherited from an input default defined in
 * another repository.
 */
function workflowDeclaration(text: string): Declaration {
  const body = text
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  const m = /^\s*node-versions:\s*(\S.*?)\s*$/m.exec(body);
  if (!m) {
    throw new Error(
      `${WORKFLOW_PATH}: passes no node-versions input, so the tested set is not stated here`,
    );
  }
  const raw = group(m, 1) ?? "";
  const unquoted = /^'(.*)'$|^"(.*)"$/.exec(raw);
  const json = unquoted ? (group(unquoted, 1) ?? group(unquoted, 2) ?? "") : raw;
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${WORKFLOW_PATH}: node-versions is not a non-empty JSON array`);
  }
  const matrix = parsed.map((entry: unknown) => {
    if (typeof entry !== "string" || !/^\d+$/.test(entry)) {
      throw new Error(`${WORKFLOW_PATH}: node-versions holds a non-major entry`);
    }
    return Number(entry);
  });
  return { surface: WORKFLOW_PATH, rangeText: null, matrix };
}

/** The contributor guide restates both the range and the matrix on one line. */
function guideDeclaration(text: string): Declaration {
  const m = GUIDE_LINE_RE.exec(text);
  if (!m) throw new Error(`${GUIDE_PATH}: has no "- **Node:**" support line to read`);
  const matrix = (group(m, 2) ?? "").split("+").map((cell) => {
    const trimmed = cell.trim();
    if (!/^\d+$/.test(trimmed)) throw new Error(`${GUIDE_PATH}: unreadable CI matrix cell`);
    return Number(trimmed);
  });
  return { surface: GUIDE_PATH, rangeText: (group(m, 1) ?? "").trim(), matrix };
}

/** The published installation page restates the range as a prerequisite, and no matrix. */
function installDeclaration(text: string): Declaration {
  const m = INSTALL_LINE_RE.exec(text);
  if (!m) throw new Error(`${INSTALL_PATH}: has no "**Node.js ...**" prerequisite to read`);
  return { surface: INSTALL_PATH, rangeText: (group(m, 1) ?? "").trim(), matrix: null };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const RECORD_VALUE = loadJson(RECORD_PATH);
const SCHEDULE = scheduleOf(RECORD_VALUE);
const MANIFEST = manifestDeclaration(readSurface(MANIFEST_PATH));
const WORKFLOW = workflowDeclaration(readSurface(WORKFLOW_PATH));
const GUIDE = guideDeclaration(readSurface(GUIDE_PATH));
const INSTALL = installDeclaration(readSurface(INSTALL_PATH));
const DECLARATIONS: readonly Declaration[] = [MANIFEST, WORKFLOW, GUIDE, INSTALL];

/** The landed tree, with the run date left injectable so a boundary can be reached deliberately. */
function auditTree(runDate: string = todayISO()): Finding[] {
  return audit({ record: RECORD_VALUE, declarations: DECLARATIONS, runDate });
}

describe("the guard opened the committed schedule record", () => {
  it("carries a source URL and an accessed date, and reports neither missing", () => {
    expect(auditRecord(RECORD_VALUE)).toStrictEqual([]);
    expect(isObject(RECORD_VALUE) ? RECORD_VALUE["source"] : null).toBe(SCHEDULE_SOURCE);
    const accessed = isObject(RECORD_VALUE) ? RECORD_VALUE["accessed"] : null;
    expect(accessed).toMatch(DATE_RE);
    // The record cannot have been fetched after the run reading it.
    expect(String(accessed) <= todayISO()).toBe(true);
  });

  it("carries a real population of release lines, so a derivation is a verdict and not an absence", () => {
    expect(SCHEDULE.size).toBeGreaterThan(20);
    // The rows this package's own decision turns on, read off the record rather than off a spec.
    expect(SCHEDULE.get(22)).toStrictEqual({ start: "2024-04-24", end: "2027-04-30" });
    expect(SCHEDULE.get(24)).toStrictEqual({ start: "2025-05-06", end: "2028-04-30" });
    expect(SCHEDULE.get(26)).toStrictEqual({ start: "2026-05-05", end: "2029-04-30" });
  });

  it("refuses an absent record rather than reading it as nothing to check", () => {
    expect(() => loadJson("test/no-such-schedule.json")).toThrow();
  });
});

describe("the supported set is derived from the record at the run date", () => {
  it("is on or after start and strictly before end", () => {
    expect(supportedMajors(SCHEDULE, "2026-09-02")).toStrictEqual([22, 24, 26]);
    // The end date itself is the first unsupported day, and the start date the first supported one.
    expect(supportedMajors(SCHEDULE, "2026-05-04")).not.toContain(26);
    expect(supportedMajors(SCHEDULE, "2026-05-05")).toContain(26);
    expect(supportedMajors(SCHEDULE, "2027-04-29")).toContain(22);
    expect(supportedMajors(SCHEDULE, "2027-04-30")).not.toContain(22);
  });

  it("excludes the lines that have already ended and the one not yet started", () => {
    const supported = supportedMajors(SCHEDULE, "2026-09-02");
    for (const eol of [20, 23, 25]) expect(supported).not.toContain(eol);
    expect(supported).not.toContain(27);
  });
});

describe("the extractors bound real values out of the real files", () => {
  it("reads engines.node out of the package manifest", () => {
    const parsed: unknown = JSON.parse(readSurface(MANIFEST_PATH));
    expect(isObject(parsed) ? parsed["name"] : null).toBe("@cosyte/cli");
    expect(MANIFEST.rangeText).toBe(">=22.0.0 <26.0.0");
    expect(MANIFEST.matrix).toBeNull();
  });

  it("reads the matrix out of this repository's own CI caller, not an upstream default", () => {
    const text = readSurface(WORKFLOW_PATH);
    expect(text).toContain("uses: cosyte/.github/.github/workflows/ci.yml@main");
    expect(text).toContain("node-versions:");
    expect(WORKFLOW.matrix).toStrictEqual([22, 24]);
    expect(WORKFLOW.rangeText).toBeNull();
  });

  it("refuses a caller that states no matrix rather than inheriting one", () => {
    const silent = ["jobs:", "  ci:", "    with:", "      run-phi-scan: true", ""].join("\n");
    expect(() => workflowDeclaration(silent)).toThrow(/passes no node-versions input/);
  });

  it("does not mistake the prose above the job for the declaration", () => {
    const commented = [
      '      # node-versions: \'["22", "24", "26"]\' would need the ruleset first',
      '      node-versions: \'["22", "24"]\'',
    ].join("\n");
    expect(workflowDeclaration(commented).matrix).toStrictEqual([22, 24]);
  });

  it("reads both the range and the matrix off the contributor guide's support line", () => {
    expect(GUIDE.rangeText).toBe(">= 22, < 26");
    expect(GUIDE.matrix).toStrictEqual([22, 24]);
  });

  it("reads the range off the published installation prerequisite", () => {
    expect(INSTALL.rangeText).toBe(">= 22 and < 26");
    expect(INSTALL.matrix).toBeNull();
  });
});

describe("the range parser reads a range exactly or refuses it", () => {
  it("agrees across the spellings the manifest and the prose surfaces use", () => {
    const manifest = parseRange(">=22.0.0 <26.0.0");
    expect(parseRange(">= 22, < 26")).toStrictEqual(manifest);
    expect(parseRange(">= 22 and < 26")).toStrictEqual(manifest);
  });

  it("admits exactly the majors between the bounds", () => {
    const range = parseRange(">=22.0.0 <26.0.0");
    expect(admittedMajors(range)).toStrictEqual([22, 23, 24, 25]);
    expect(admitsMajor(range, 21)).toBe(false);
    expect(admitsMajor(range, 26)).toBe(false);
    // A range that opens mid-major still admits that major.
    expect(admittedMajors(parseRange(">=22.3.0 <22.5.0"))).toStrictEqual([22]);
    expect(admittedMajors(parseRange("22"))).toStrictEqual([22]);
  });

  it("refuses a grammar it cannot decide rather than approximating it", () => {
    for (const bad of ["^22.0.0", "~22.0.0", "22.x", ">=22.0.0 || >=24.0.0", "latest", ""]) {
      expect(() => parseRange(bad), bad).toThrow();
    }
    expect(() => parseRange(">=26.0.0 <22.0.0")).toThrow(/admits no version/);
  });

  it("refuses to enumerate a range with no upper bound", () => {
    expect(admitsMajor(parseRange(">=22.0.0"), 99)).toBe(true);
    expect(() => admittedMajors(parseRange(">=22.0.0"))).toThrow(/unbounded above/);
  });
});

describe("the tree as landed agrees with itself", () => {
  it("reports nothing: no supported major the range admits is missing from the matrix", () => {
    // ASSERT THE PREMISE FIRST: a clean verdict here is worth nothing over an empty record.
    expect(auditRecord(RECORD_VALUE)).toStrictEqual([]);
    expect(SCHEDULE.size).toBeGreaterThan(20);
    expect(supportedMajors(SCHEDULE, todayISO()).length).toBeGreaterThan(0);
    expect(auditTree()).toStrictEqual([]);
  });

  it("declares a range bounded above that refuses Node 26, the line CI does not exercise", () => {
    const range = parseRange(MANIFEST.rangeText ?? "");
    expect(Number.isFinite(range.hi)).toBe(true);
    expect(admitsMajor(range, 26)).toBe(false);
    expect(supportedMajors(SCHEDULE, todayISO())).toContain(26);
    expect(WORKFLOW.matrix).not.toContain(26);
  });

  it("admits every major the matrix exercises", () => {
    const range = parseRange(MANIFEST.rangeText ?? "");
    for (const major of WORKFLOW.matrix ?? [])
      expect(admitsMajor(range, major), `${String(major)}`).toBe(true);
  });

  it("admits no major the committed schedule does not carry", () => {
    for (const major of admittedMajors(parseRange(MANIFEST.rangeText ?? ""))) {
      expect(SCHEDULE.has(major), `Node ${String(major)}`).toBe(true);
    }
  });
});

/**
 * THE NEGATIVE CONTROL. Every case below constructs the disagreement it names and requires the
 * guard to report it, at a run date chosen so the outcome does not depend on when the suite runs.
 * A guard nobody has watched fail is a guard nobody can believe, and this class of guard is
 * unusually easy to write so that it passes over an empty result forever.
 */
describe("the negative control: the guard reports each disagreement it exists to prevent", () => {
  const TODAY = "2026-09-02";
  const landed: readonly Declaration[] = [
    { surface: MANIFEST_PATH, rangeText: ">=22.0.0 <26.0.0", matrix: null },
    { surface: WORKFLOW_PATH, rangeText: null, matrix: [22, 24] },
  ];

  const withDeclarations = (declarations: readonly Declaration[], runDate = TODAY): Finding[] =>
    audit({ record: RECORD_VALUE, declarations, runDate });

  it("stays silent on the agreeing pair, so the reports below are verdicts and not noise", () => {
    expect(withDeclarations(landed)).toStrictEqual([]);
  });

  it("reports a range that admits a supported major the matrix does not exercise", () => {
    const findings = withDeclarations([
      { surface: MANIFEST_PATH, rangeText: ">=22.0.0 <27.0.0", matrix: null },
      { surface: WORKFLOW_PATH, rangeText: null, matrix: [22, 24] },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("range-admits-untested-major");
    // The message names the offending major, the declared range and the declared matrix.
    expect(findings[0]?.message).toContain("Node 26");
    expect(findings[0]?.message).toContain(">=22.0.0 <27.0.0");
    expect(findings[0]?.message).toContain("[22, 24]");
  });

  it("reports a matrix that exercises a major the range does not admit", () => {
    const findings = withDeclarations([
      { surface: MANIFEST_PATH, rangeText: ">=22.0.0 <24.0.0", matrix: null },
      { surface: WORKFLOW_PATH, rangeText: null, matrix: [22, 24] },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("matrix-exercises-unadmitted-major");
    expect(findings[0]?.message).toContain("Node 24");
    expect(findings[0]?.message).toContain(">=22.0.0 <24.0.0");
    expect(findings[0]?.message).toContain("[22, 24]");
  });

  it("reports a range admitting a major the record does not carry, rather than calling it unsupported", () => {
    const findings = withDeclarations([
      { surface: MANIFEST_PATH, rangeText: ">=22.0.0 <29.0.0", matrix: null },
      { surface: WORKFLOW_PATH, rangeText: null, matrix: [22, 24, 26] },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("admitted-major-not-in-record");
    expect(findings[0]?.message).toContain("Node 28");
    expect(findings[0]?.message).toContain("unknown, not unsupported");
  });

  it("reports an unbounded range, which is the claim this change replaced", () => {
    const findings = withDeclarations([
      { surface: MANIFEST_PATH, rangeText: ">=22.0.0", matrix: null },
      { surface: WORKFLOW_PATH, rangeText: null, matrix: [22, 24] },
    ]);
    expect(findings.map((f) => f.kind)).toContain("range-unbounded-above");
    // The exact defect this change closed is reported too: 26 supported, admitted, untested.
    expect(findings.map((f) => f.kind)).toContain("range-admits-untested-major");
  });

  it("reports a contributor-guide line whose range differs from the manifest", () => {
    const findings = withDeclarations([
      ...landed,
      { surface: GUIDE_PATH, rangeText: ">= 22", matrix: [22, 24] },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("range-restated-differently");
    expect(findings[0]?.message).toContain(GUIDE_PATH);
    expect(findings[0]?.message).toContain(">= 22");
    expect(findings[0]?.message).toContain(">=22.0.0 <26.0.0");
  });

  it("reports a contributor-guide line whose matrix differs from the CI caller", () => {
    const findings = withDeclarations([
      ...landed,
      { surface: GUIDE_PATH, rangeText: ">= 22, < 26", matrix: [22, 24, 26] },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("matrix-restated-differently");
    expect(findings[0]?.message).toContain("[22, 24, 26]");
    expect(findings[0]?.message).toContain("[22, 24]");
  });

  it("reports a published page restating a range the manifest does not declare", () => {
    const findings = withDeclarations([
      ...landed,
      { surface: INSTALL_PATH, rangeText: ">= 22", matrix: null },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("range-restated-differently");
    expect(findings[0]?.message).toContain(INSTALL_PATH);
  });

  it("stays silent when the same restatements agree, spelled the way each surface spells it", () => {
    expect(
      withDeclarations([
        ...landed,
        { surface: GUIDE_PATH, rangeText: ">= 22, < 26", matrix: [22, 24] },
        { surface: INSTALL_PATH, rangeText: ">= 22 and < 26", matrix: null },
      ]),
    ).toStrictEqual([]);
  });
});

describe("a broken record fails before any agreement is asserted", () => {
  const landed: readonly Declaration[] = [
    { surface: MANIFEST_PATH, rangeText: ">=22.0.0 <26.0.0", matrix: null },
    { surface: WORKFLOW_PATH, rangeText: null, matrix: [22, 24] },
  ];
  const provenance = { source: SCHEDULE_SOURCE, accessed: "2026-09-02" };
  const oneLine = { v22: { start: "2024-04-24", end: "2027-04-30" } };

  it("reports an absent record", () => {
    expect(auditRecord(undefined).map((f) => f.kind)).toStrictEqual(["record-unreadable"]);
    expect(auditRecord(null).map((f) => f.kind)).toStrictEqual(["record-unreadable"]);
  });

  it("reports an empty record, and one whose schedule holds no usable line", () => {
    expect(auditRecord({}).map((f) => f.kind)).toStrictEqual([
      "record-no-source",
      "record-no-accessed-date",
      "record-empty",
    ]);
    expect(auditRecord({ ...provenance, schedule: {} }).map((f) => f.kind)).toStrictEqual([
      "record-empty",
    ]);
    expect(
      auditRecord({ ...provenance, schedule: { v22: { start: "2024-04-24" } } }).map((f) => f.kind),
    ).toStrictEqual(["record-empty"]);
  });

  it("reports a record carrying no source URL, and one carrying no accessed date", () => {
    expect(
      auditRecord({ accessed: "2026-09-02", schedule: oneLine }).map((f) => f.kind),
    ).toStrictEqual(["record-no-source"]);
    expect(auditRecord({ source: "  ", schedule: oneLine }).map((f) => f.kind)).toStrictEqual([
      "record-no-source",
      "record-no-accessed-date",
    ]);
    expect(
      auditRecord({ source: SCHEDULE_SOURCE, schedule: oneLine }).map((f) => f.kind),
    ).toStrictEqual(["record-no-accessed-date"]);
    expect(
      auditRecord({ ...provenance, accessed: "2 Sep 2026", schedule: oneLine }).map((f) => f.kind),
    ).toStrictEqual(["record-no-accessed-date"]);
  });

  it("asserts the record before agreement: a broken record reports only the record", () => {
    // The declarations below disagree loudly in both directions. None of it is reported, because
    // the population the agreement would be computed over was never opened.
    const shouting: readonly Declaration[] = [
      { surface: MANIFEST_PATH, rangeText: ">=22.0.0", matrix: null },
      { surface: WORKFLOW_PATH, rangeText: null, matrix: [18] },
    ];
    const findings = audit({ record: {}, declarations: shouting, runDate: "2026-09-02" });
    expect(findings.map((f) => f.kind)).toStrictEqual([
      "record-no-source",
      "record-no-accessed-date",
      "record-empty",
    ]);
    // The control: with a real record those same declarations are reported, so the silence above
    // is the short circuit and not an inability to see anything.
    expect(
      audit({ record: RECORD_VALUE, declarations: shouting, runDate: "2026-09-02" }).length,
    ).toBeGreaterThan(0);
  });

  it("stays silent on a minimal but complete record, so the reports above are not blanket", () => {
    expect(auditRecord({ ...provenance, schedule: oneLine })).toStrictEqual([]);
    // A one-line record is complete for a one-line claim: the range admits only v22 and the matrix
    // exercises only v22. The wider claim in `landed` is checked against this same record below,
    // where the majors it does not carry are exactly what gets reported.
    const narrow: readonly Declaration[] = [
      { surface: MANIFEST_PATH, rangeText: ">=22.0.0 <23.0.0", matrix: null },
      { surface: WORKFLOW_PATH, rangeText: null, matrix: [22] },
    ];
    const record = { ...provenance, schedule: oneLine };
    expect(audit({ record, declarations: narrow, runDate: "2026-09-02" })).toStrictEqual([]);
    // The control: the landed claim over that same one-line record reports every major the record
    // cannot speak for, rather than reading silence as support.
    const wider = audit({ record, declarations: landed, runDate: "2026-09-02" });
    expect(wider.map((f) => f.kind)).toStrictEqual([
      "admitted-major-not-in-record",
      "admitted-major-not-in-record",
      "admitted-major-not-in-record",
    ]);
    expect(wider.map((f) => f.message).join(" ")).toContain("Node 25");
  });
});

/**
 * A release line changes status three times: it becomes LTS, it enters Maintenance, and it ends.
 * Only the last one removes it from the supported set, and the distinction is not academic here:
 * v24 enters Maintenance on 2026-10-20 while remaining supported until 2028-04-30. Both directions
 * are proved at an injected run date rather than waiting for the real clock to reach them.
 */
describe("a status boundary that is not an end date changes nothing", () => {
  it("keeps v24 supported across its Active-LTS to Maintenance transition", () => {
    expect(SCHEDULE.get(24)?.end).toBe("2028-04-30");
    for (const date of ["2026-10-19", "2026-10-20", "2026-10-21"]) {
      expect(supportedMajors(SCHEDULE, date), date).toContain(24);
      expect(auditTree(date), date).toStrictEqual([]);
    }
  });

  it("keeps v26 supported across the day it becomes LTS", () => {
    for (const date of ["2026-10-27", "2026-10-28", "2026-10-29"]) {
      expect(supportedMajors(SCHEDULE, date), date).toContain(26);
    }
  });

  it("stops requiring a major in the matrix once it passes its end date", () => {
    const thin: readonly Declaration[] = [
      { surface: MANIFEST_PATH, rangeText: ">=22.0.0 <26.0.0", matrix: null },
      { surface: WORKFLOW_PATH, rangeText: null, matrix: [24] },
    ];
    // Before v22's end date, dropping it from the matrix is reported.
    const before = audit({ record: RECORD_VALUE, declarations: thin, runDate: "2027-04-29" });
    expect(before).toHaveLength(1);
    expect(before[0]?.kind).toBe("range-admits-untested-major");
    expect(before[0]?.message).toContain("Node 22");
    // On and after it, the same tree is clean: an ended line is not required in the matrix.
    expect(supportedMajors(SCHEDULE, "2027-04-30")).not.toContain(22);
    expect(
      audit({ record: RECORD_VALUE, declarations: thin, runDate: "2027-04-30" }),
    ).toStrictEqual([]);
    expect(
      audit({ record: RECORD_VALUE, declarations: thin, runDate: "2027-06-01" }),
    ).toStrictEqual([]);
  });
});
