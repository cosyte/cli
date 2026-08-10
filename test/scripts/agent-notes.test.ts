/**
 * Unit tests for `scripts/check-agent-notes.ts`, the two-file-contract gate.
 *
 * WHAT IS BEING PROVED, in the order it matters:
 *
 *   1. THE GATE SEES. Each of the three things it claims to check is seeded into a throwaway
 *      repo and shown RED, then repaired and shown GREEN in the same tree. A gate is only
 *      worth its exit code once it has been watched to fail.
 *   2. THE GATE REFUSES RATHER THAN REPORTING CLEAN OVER A CORPUS IT NEVER OPENED. This is the
 *      control, and it is the whole reason the exit codes are split 1/2. A gate pointed at an
 *      empty tree must exit 2, never 0. So must a tree with no pointers in it at all.
 *   3. THE BARE CENSUS FIRES IN BOTH DIRECTIONS. A digits-only reference must NOT refuse (or
 *      the gate reds on every pull-request number in the narrative file), and a genuine bare
 *      pointer MUST refuse (or this gate's single-form scope silently stops covering the
 *      corpus, which is the most repeated defect in this whole class of gate).
 *   4. THE BYPASS CLASSES ARE REPRODUCED END TO END, not asserted in the abstract.
 *   5. THE REAL TREE IS GREEN, run through the real script. That case is what puts this gate
 *      on the meta-repo's `scripts/verify.sh cli` ladder without the ladder having to name it,
 *      and it is what reds if a future edit breaks an anchor on either side of the pair.
 *
 * WHAT IS DELIBERATELY NOT PROVED HERE: that any sibling repo satisfies the same contract.
 * A group of cosyte repos carry no `documentation/agent-notes.md` at all, so a
 * universal assertion would be an overclaim and the honest outcome for those repos is a
 * written exemption. The script's banner says so; this file does not restate the argument, it
 * declines to test the universal.
 *
 * ASSERT THE PREMISE, NOT ONLY THE REMEDY. This repository has already sprung two vacuity
 * traps in `test/scripts/phi-scan.test.ts`: a fixture whose `git merge` refused on an
 * identity-less runner, so every later assertion held over an empty result, and a loop that
 * asserted only the detection-OFF side. So every repair case here asserts the RED first and
 * the GREEN second in the same tree, and the fixture builder below never needs a commit (and
 * therefore never needs a committer identity): `git ls-files` reads the INDEX, so `git init`
 * plus `git add` is the whole setup and there is no identity-dependent step to fail silently.
 *
 * RUNNER: `tsx`, matching `test/scripts/phi-scan.test.ts` and `pnpm check:agent-notes`. Node
 * 22 is this package's floor and its native type stripping is behind a flag there, so spawning
 * `node` directly on the `.ts` gate would test something the commit gate does not run. The
 * cost is a cold `tsx` start per case, which this repository has measured at 3.7s under
 * contention against a shared 10s default, so every describe below sets its own budget.
 *
 * The throwaway repos are created under the OS temp dir, never under `test/`. `test/` is a
 * `phi-scan` walk root and that scanner refuses a root it did not observe, so putting churn
 * there would couple two gates that have nothing to do with each other.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const GATE_PATH = join(REPO_ROOT, "scripts", "check-agent-notes.ts");
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");

/** Each case spawns `tsx` cold. Measured here at 3.7s under contention; budget generously. */
const SLOW_MS = 60_000;

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runGate(args: string[]): RunResult {
  const r = spawnSync(TSX_BIN, [GATE_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

let scratch: string;

/**
 * Build a throwaway git repo and return its path. Only the INDEX is populated (`git add`), not
 * a commit: `git ls-files` reads the index, so no commit and therefore no committer identity
 * is needed, which keeps these cases independent of whatever git config the box carries.
 */
function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(scratch, "tree-"));
  git(dir, ["init", "-q"]);
  write(dir, files);
  return dir;
}

function write(dir: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    const slash = rel.lastIndexOf("/");
    if (slash > 0) mkdirSync(join(dir, rel.slice(0, slash)), { recursive: true });
    writeFileSync(abs, content);
  }
  git(dir, ["add", "-A"]);
}

function git(dir: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", shell: false });
  if ((r.status ?? -1) !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

/**
 * A sample pointer, ASSEMBLED rather than written out, and that is load-bearing rather than a
 * style choice.
 *
 * The gate scans every tracked text file in the repo and carves out NO exemption for its own
 * source or for this file. So a pointer written literally here would be read as a pointer into
 * THIS repo's `documentation/agent-notes.md` and checked against its anchors, and every fixture
 * below names a section that exists only inside a throwaway repo.
 *
 * The fix is deliberately the fixture and NOT an exemption. This repository's PHI scanner
 * already shows what an exemption costs when it is drawn wider than one path. A gate's own
 * tests are exactly where a genuinely broken pointer would hide, so they stay in scope.
 */
function ptr(anchor: string): string {
  return `documentation/agent-notes.md${"#"}${anchor}`;
}

/** A bare-form span, assembled for the same reason as `ptr`. */
function bare(anchor: string): string {
  return `\`${"#"}${anchor}\``;
}

/** The narrative half, with one real section. */
const NOTES = "# notes\n\nPreamble.\n\n## The section\n\nBody.\n";

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "cli-agent-notes-"));
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("check-agent-notes: the contract it asserts", { timeout: SLOW_MS }, () => {
  it("is green on a tree that keeps the contract", () => {
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
      "documentation/agent-notes.md": NOTES,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("check-agent-notes: OK");
    // The OK line must show its arithmetic, not just its verdict.
    expect(r.stdout).toContain("2 tracked path(s) reconciled = 2 opened");
  });

  it("reds when a pointer dangles, and goes green when the anchor is repaired", () => {
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-wrong-anchor")}\n`,
      "documentation/agent-notes.md": NOTES,
    });

    const before = runGate(["--root", dir]);
    expect(before.code).toBe(1);
    expect(before.stderr).toContain("#the-wrong-anchor does not resolve");
    expect(before.stderr).toContain("CLAUDE.md:3");

    write(dir, { "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n` });
    const after = runGate(["--root", dir]);
    expect(after.code).toBe(0);
  });

  it("reds on a section that is nothing but its heading, and goes green when the body returns", () => {
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
      "documentation/agent-notes.md":
        "# notes\n\nPreamble.\n\n## The section\n\n## Next\n\nBody.\n",
    });

    const before = runGate(["--root", dir]);
    expect(before.code).toBe(1);
    expect(before.stderr).toContain('section "The section" (#the-section) has no body');

    write(dir, { "documentation/agent-notes.md": NOTES });
    expect(runGate(["--root", dir]).code).toBe(0);
  });

  it("does NOT red a container heading, whose body is its subsections", () => {
    // `## Group` immediately followed by `### Sub` has no prose of its own, but the anchor `group`
    // resolves on GitHub and the reader lands on real content, so reporting it is a red
    // against a link that works. This shape is live in this repository's narrative file.
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("group")}\n`,
      "documentation/agent-notes.md":
        "# notes\n\nPreamble.\n\n## Group\n\n### Sub\n\nReal body here.\n",
    });
    const r = runGate(["--root", dir]);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
  });

  it("still reds an emptied LEAF beneath a container, so the exemption opens no false green", () => {
    // The only direction that would matter. The exemption moves the obligation DOWN to the
    // deeper heading rather than removing it, so an emptied leaf is still a finding.
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("sub")}\n`,
      "documentation/agent-notes.md":
        "# notes\n\nPreamble.\n\n## Group\n\n### Sub\n\n## Other\n\nBody.\n",
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('section "Sub" (#sub) has no body');
  });

  it("treats a TRAILING heading as a leaf, never a container, since nothing deeper follows it", () => {
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
      "documentation/agent-notes.md": `${NOTES}\n### Trailing\n`,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('section "Trailing" (#trailing) has no body');
  });

  it("reds when the narrative half is not tracked at all, and calls it a finding rather than a refusal", () => {
    const dir = repo({ "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n` });
    const r = runGate(["--root", dir]);
    // Exit 1, not 2: this is a broken contract a human acts on, not a scan that failed.
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("the narrative half of the pair is not tracked");
  });

  it("reds when the cursor half is not tracked", () => {
    const dir = repo({
      "documentation/agent-notes.md": NOTES,
      "README.md": `See ${ptr("the-section")}.\n`,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("the cursor half of the pair is not tracked");
  });

  it("finds a qualified pointer wherever it is written, not only in CLAUDE.md", () => {
    // The qualified form carries its own filename, so it is unambiguous anywhere. A
    // markdown-only sweep would not open a source file at all.
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
      "documentation/agent-notes.md": NOTES,
      "scripts/thing.ts": `// see ${ptr("not-a-section")}\n`,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("scripts/thing.ts:1");
  });
});

/**
 * THE BARE CENSUS. This repository's pointers are 100% the QUALIFIED spelling, measured before
 * the matcher was written, so the bare form is matched by no checker here. That scope is only
 * safe while the bare form stays absent, and these cases are what keep the absence a
 * measurement. Both directions are asserted, because a census that refuses on a pull-request
 * reference is deleted within a day and a census that never fires proves nothing.
 */
describe("check-agent-notes: the bare census", { timeout: SLOW_MS }, () => {
  it("does NOT refuse on a digits-only reference, and reports it on the OK line", () => {
    // GitHub renders a hash followed by digits as a pull-request reference, and the narrative file
    // uses it that way. Refusing on these would red a healthy tree.
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n\nSee ${bare("36")} and ${bare("27")}.\n`,
      "documentation/agent-notes.md": NOTES,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("2 bare-shaped span(s)");
  });

  it("REFUSES on a genuine bare pointer, even one whose anchor RESOLVES", () => {
    // THE DIRECTION THAT MATTERS. The tree is not necessarily broken; the evidence this gate's
    // single-form scope was derived from is. Green here would be a claim about a corpus the
    // gate no longer covers, which is exactly how a ported matcher printed `all resolving`
    // over 3 of 38 pointers in a sibling repository.
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n\nAlso: ${bare("the-section")}\n`,
      "documentation/agent-notes.md": NOTES,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stdout).not.toContain("OK");
    expect(r.stderr).toContain("suspected BARE pointer");
    expect(r.stderr).toContain("RE-DERIVE THE MATCHER");
  });

  it("REFUSES on a bare pointer written into the NARRATIVE half too, not only the cursor", () => {
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
      "documentation/agent-notes.md": `${NOTES}\nSee ${bare("the-section")}.\n`,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("suspected BARE pointer");
  });

  it("censuses a bare span in a THIRD file too, not only in the pair", () => {
    // THE HOLE A PAIR-SCOPED CENSUS LEAVES, AND WHY THE SCOPE IS THE WHOLE CORPUS. A bare
    // pointer written into any file that is neither half of the pair would be covered by
    // neither the matcher nor a pair-scoped census, which is exactly the uncovered corner the
    // census exists to remove. A first draft scoped it to the pair and justified that with
    // files on this tree that supposedly could not survive a widening; running it tree-wide
    // proved none of them can refuse, and that the only files that could were the gate's own.
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
      "documentation/agent-notes.md": NOTES,
      "README.md": `See ${bare("some-anchor")}.\n`,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("suspected BARE pointer");
    expect(r.stderr).toContain("README.md");
  });

  it("still treats a digits-only span in a third file as a reference, not a refusal", () => {
    // The other direction of the widening. `CHANGELOG.md` on this tree carries backticked
    // pull-request references, and refusing on those would red a healthy repository.
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
      "documentation/agent-notes.md": NOTES,
      "CHANGELOG.md": `Fixed in ${bare("34")} and ${bare("27")}.\n`,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("2 bare-shaped span(s)");
  });

  it("does not match a bare-shaped span that is not anchor-shaped, so a shebang is inert", () => {
    // Measured on this tree: a quoted shebang, a quoted `# synthetic` comment and a lone `#`
    // are all outside the anchor class, so they never reach the reference/pointer decision.
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
      "documentation/agent-notes.md": NOTES,
      "tsup.config.ts": "// a shebang is written `#!/usr/bin/env node` and a marker `# on`.\n",
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("0 bare-shaped span(s)");
  });
});

describe("check-agent-notes: the control, and every other refusal", { timeout: SLOW_MS }, () => {
  it("REFUSES when pointed at a tree with nothing tracked in it", () => {
    const dir = mkdtempSync(join(scratch, "empty-"));
    git(dir, ["init", "-q"]);
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain("listed no readable tracked file");
    expect(r.stdout).not.toContain("OK");
  });

  it("REFUSES when pointed at something that is not a git repository", () => {
    const dir = mkdtempSync(join(scratch, "norepo-"));
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stdout).not.toContain("OK");
  });

  it("REFUSES a tree that holds the pair but zero pointers, instead of calling it clean", () => {
    // The `observed nothing` shape, in this gate's own terms: the corpus exists, the files
    // open, and the answer is still meaningless. EXISTENCE IS NOT OBSERVATION, and a
    // denominator would read healthy here. This is the case that would have caught a matcher
    // ported into a tree whose pointers are spelled the other way.
    const dir = repo({
      "CLAUDE.md": "# cursor\n\nNo link here.\n",
      "documentation/agent-notes.md": NOTES,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("ZERO qualified pointers");
  });

  it("REFUSES when two tracked files carry the contract basename, rather than guessing", () => {
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
      "documentation/agent-notes.md": NOTES,
      "docs-content/agent-notes.md": NOTES,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("named agent-notes.md");
  });

  it("REFUSES an unknown flag rather than scanning with it ignored", () => {
    expect(runGate(["--everything"]).code).toBe(2);
  });

  it("REFUSES a tracked path that is a SYMLINK, rather than scanning bytes from outside the tree", () => {
    // Enforced by O_NOFOLLOW on the open itself, so there is no window between the check and
    // the read. Defeating this refusal is how untracked bytes get read under a tracked name.
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
      "documentation/agent-notes.md": NOTES,
    });
    writeFileSync(join(dir, "outside.txt"), "not tracked\n");
    symlinkSync(join(dir, "outside.txt"), join(dir, "link.md"));
    git(dir, ["add", "-A"]);

    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("tracked path is a symbolic link");
    // The target is deliberately not printed: a target path is itself a PHI surface.
    expect(r.stderr).not.toContain("outside.txt");
  });

  it("REFUSES a tracked path that is missing from the working tree", () => {
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
      "documentation/agent-notes.md": NOTES,
      "gone.md": "here for now\n",
    });
    rmSync(join(dir, "gone.md"));

    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("tracked path is missing from the working tree");
  });

  it("REFUSES a tracked path replaced on disk by a DIRECTORY", () => {
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
      "documentation/agent-notes.md": NOTES,
      "swapped.md": "a regular file, for now\n",
    });
    rmSync(join(dir, "swapped.md"));
    mkdirSync(join(dir, "swapped.md"));

    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("tracked path is not a regular file");
  });

  it("REFUSES a tracked path replaced by a FIFO instead of hanging on it forever", () => {
    // THIS IS WHAT MAKES O_NONBLOCK LOAD-BEARING RATHER THAN DECORATION. Opening a FIFO for
    // reading blocks until a writer appears, so without the flag the gate would hang here
    // indefinitely rather than refuse, and a hung gate reports nothing at all.
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
      "documentation/agent-notes.md": NOTES,
      "pipe.md": "a regular file, for now\n",
    });
    const fifo = join(dir, "pipe.md");
    rmSync(fifo);
    const mk = spawnSync("mkfifo", [fifo], { encoding: "utf8", shell: false });
    if ((mk.status ?? -1) !== 0) return; // no mkfifo here; the directory case still covers the class

    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("tracked path is not a regular file");
  });

  it("REFUSES an UNMERGED path rather than scanning conflict markers", () => {
    // This repository's PHI scanner leaves the unmerged status unenumerated in its STAGED
    // route, and records why: `git commit` refuses an unmerged index at exit 128, so nothing
    // unmerged can reach a commit through that gate. THAT REASONING DOES NOT TRANSFER HERE,
    // because this gate has no staged route: it runs from the test suite and from CI over
    // whatever tree it is handed. So the refusal is re-derived rather than inherited, and this
    // case is what proves it fires.
    //
    // An unmerged index is built directly with `git update-index`, which needs no commit and
    // therefore no committer identity. A `git merge` fixture is what sprang a vacuity trap in
    // this repository's other script suite: it refused on an identity-less runner and every
    // later assertion then held over an empty result.
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
      "documentation/agent-notes.md": NOTES,
      "conflicted.md": "ours\n",
    });
    const blob = spawnSync("git", ["hash-object", "-w", "--stdin"], {
      cwd: dir,
      input: "theirs\n",
      encoding: "utf8",
      shell: false,
    });
    expect(blob.status).toBe(0);
    const sha = blob.stdout.trim();
    git(dir, ["rm", "--cached", "-q", "conflicted.md"]);
    const upd = spawnSync(
      "git",
      ["update-index", "--index-info"],
      // Stages 1, 2 and 3 for one path: exactly what a conflicted index holds.
      {
        cwd: dir,
        input: `100644 ${sha} 1\tconflicted.md\n100644 ${sha} 2\tconflicted.md\n100644 ${sha} 3\tconflicted.md\n`,
        encoding: "utf8",
        shell: false,
      },
    );
    expect(upd.status).toBe(0);

    // ASSERT THE PREMISE: the index really is unmerged before the gate is asked about it.
    const staged = spawnSync("git", ["ls-files", "-u"], { cwd: dir, encoding: "utf8" });
    expect(staged.stdout).toContain("conflicted.md");

    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("is unmerged");
    expect(r.stdout).not.toContain("OK");
  });
});

describe(
  "check-agent-notes: the bypass classes, reproduced end to end",
  { timeout: SLOW_MS },
  () => {
    it("sees a heading indented by one space (a /^#{1,6} / guard misses it)", () => {
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
        "documentation/agent-notes.md": "# notes\n\nPreamble.\n\n ## The section\n\nBody.\n",
      });
      // A guard that missed this would report a FALSE RED against a link GitHub resolves.
      expect(runGate(["--root", dir]).code).toBe(0);
    });

    it("sees a setext heading (an underline, not a hash)", () => {
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
        "documentation/agent-notes.md":
          "# notes\n\nPreamble.\n\nThe section\n-----------\n\nBody.\n",
      });
      expect(runGate(["--root", dir]).code).toBe(0);
    });

    it("does NOT mint an anchor from an ATX line inside a code fence", () => {
      // The opposite direction from the two above, and the one that would let a dangling pointer
      // through. A shell sample containing `# The section` is a comment, not a section, and this
      // repository's narrative file embeds shell and `gh api` reproductions.
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
        "documentation/agent-notes.md":
          "# notes\n\nPreamble.\n\n## Real\n\n```sh\n# The section\n```\n",
      });
      const r = runGate(["--root", dir]);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("#the-section does not resolve");
    });

    it("resolves a pointer whose anchor is split across a line wrap", () => {
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-long-")}\nsection-name\n`,
        "documentation/agent-notes.md":
          "# notes\n\nPreamble.\n\n## The long section name\n\nBody.\n",
      });
      expect(runGate(["--root", dir]).code).toBe(0);
    });

    it("still reds a wrapped pointer whose join does not resolve either", () => {
      // The join can rescue a false red; it must not manufacture a pass.
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-long-")}\nwrong-name\n`,
        "documentation/agent-notes.md":
          "# notes\n\nPreamble.\n\n## The long section name\n\nBody.\n",
      });
      expect(runGate(["--root", dir]).code).toBe(1);
    });

    it("disambiguates two identical headings the way GitHub does", () => {
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("same-1")}\n`,
        "documentation/agent-notes.md": "# notes\n\nP.\n\n## Same\n\nA.\n\n## Same\n\nB.\n",
      });
      expect(runGate(["--root", dir]).code).toBe(0);
    });

    it("re-suffixes a slug that collides with an already-generated one", () => {
      // github-slugger loops rather than counting: `Same`, `Same`, `Same-1` yields
      // `same`, `same-1`, `same-1-1`. A counter yields `same-1` twice and reds the last of those.
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("same-1-1")}\n`,
        "documentation/agent-notes.md":
          "# notes\n\nP.\n\n## Same\n\nA.\n\n## Same\n\nB.\n\n## Same-1\n\nC.\n",
      });
      expect(runGate(["--root", dir]).code).toBe(0);
    });

    it("keeps the leading hyphen a dropped leading character leaves behind", () => {
      // github-slugger does NOT trim, so a heading led by a marker glyph slugs with a LEADING
      // hyphen. A trim makes a pointer written without it pass here and resolve to nothing on
      // GitHub. This repository's documents lead load-bearing rules with marker glyphs
      // throughout, so the shape is reachable rather than exotic.
      const notes = "# notes\n\nP.\n\n## ▶ The section\n\nBody.\n";
      const green = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("-the-section")}\n`,
        "documentation/agent-notes.md": notes,
      });
      expect(runGate(["--root", green]).code).toBe(0);

      const red = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
        "documentation/agent-notes.md": notes,
      });
      expect(runGate(["--root", red]).code).toBe(1);
    });

    it("does the same for an EMOJI marker, which this repository also uses", () => {
      const notes = "# notes\n\nP.\n\n## \u{1f6d1} The section\n\nBody.\n";
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("-the-section")}\n`,
        "documentation/agent-notes.md": notes,
      });
      expect(runGate(["--root", dir]).code).toBe(0);
    });

    it("does NOT mint a setext anchor from YAML front matter", () => {
      // The closing `---` of front matter sits directly under a non-blank line, so a naive
      // setext reader mints an anchor from `title: phantom`. That is the false-green direction.
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("title-phantom")}\n`,
        "documentation/agent-notes.md":
          "---\ntitle: phantom\n---\n\n# notes\n\nP.\n\n## Real\n\nBody.\n",
      });
      expect(runGate(["--root", dir]).code).toBe(1);
    });

    it("gives a wrapped setext heading the anchor of the whole paragraph, with the softbreak DELETED", () => {
      // A wrapped setext heading is ONE heading whose text carries a newline, and the slug rule
      // DELETES a newline rather than hyphenating it, so the two halves run together.
      const notes = "# notes\n\nP.\n\nThe long\nsection name\n------------\n\nBody.\n";

      const green = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-longsection-name")}\n`,
        "documentation/agent-notes.md": notes,
      });
      expect(runGate(["--root", green]).code).toBe(0);

      const red = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-long-section-name")}\n`,
        "documentation/agent-notes.md": notes,
      });
      expect(runGate(["--root", red]).code).toBe(1);
    });

    it("deletes a non-ASCII space separator from a slug, as the upstream rule does", () => {
      // The separator is written as an escape, not a literal: a bare U+00A0 in a fixture is
      // invisible to a reader and to a diff.
      const notes = "# notes\n\nP.\n\n## A\u00a0B\n\nBody.\n";
      const green = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("ab")}\n`,
        "documentation/agent-notes.md": notes,
      });
      expect(runGate(["--root", green]).code).toBe(0);
    });

    it("does not read a four-space-indented hash line as a heading, matching CommonMark", () => {
      // Disclosed miss (vi) says the fence tracker does not model indented code blocks. It also
      // says that is not reachable as a phantom anchor, because ATX indentation is bounded at
      // three spaces. This pins the second half.
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
        "documentation/agent-notes.md": "# notes\n\nP.\n\n## Real\n\n    ## The section\n\nBody.\n",
      });
      expect(runGate(["--root", dir]).code).toBe(1);
    });

    it("keeps an underscore in a slug, which is what makes a diagnostic-code heading resolve", () => {
      // A slugger that treated `_` as emphasis, or stripped it as punctuation, would red a
      // pointer at a heading naming one of this package's `CLI_*` codes.
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("cli_not_implemented-and-69")}\n`,
        "documentation/agent-notes.md": "# notes\n\nP.\n\n## CLI_NOT_IMPLEMENTED and 69\n\nBody.\n",
      });
      expect(runGate(["--root", dir]).code).toBe(0);
    });
  },
);

/**
 * One case per DISCLOSED MISS in the script header that is marked [PINNED], each written in the
 * direction the miss actually fails. If a miss is added to the header, a case belongs here or
 * the marking must say [SCOPE]. A disclosure that names a test must name one that exists.
 */
describe(
  "check-agent-notes: the disclosed misses, each in the direction it fails",
  { timeout: SLOW_MS },
  () => {
    it("(i) passes a wrapped pointer whose head fragment is itself a valid anchor", () => {
      // The join is attempted only after the unwrapped anchor fails, so a head that resolves
      // ends the check there and the garbage tail is never seen. Asserted as green so that
      // closing it later is a deliberate change and not a surprise.
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\nzzz-not-an-anchor\n`,
        "documentation/agent-notes.md": NOTES,
      });
      expect(runGate(["--root", dir]).code).toBe(0);
    });

    it("(ii) does not decode a percent-encoded anchor, so it reds", () => {
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the%20section")}\n`,
        "documentation/agent-notes.md": NOTES,
      });
      const r = runGate(["--root", dir]);
      expect(r.code).toBe(1);
      // Matched only up to the `%`, so the reported anchor is `the`, not `the section`.
      expect(r.stderr).toContain("pointer #the does not resolve");
    });

    it("(iii) ignores an anchor on any other file, including the cursor half", () => {
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n\nAlso CLAUDE.md#no-such-anchor.\n`,
        "documentation/agent-notes.md": NOTES,
      });
      expect(runGate(["--root", dir]).code).toBe(0);
    });

    it("(iv) checks a pointer inside a fenced code block exactly like prose", () => {
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n\n\`\`\`sh\n# ${ptr("bogus")}\n\`\`\`\n`,
        "documentation/agent-notes.md": NOTES,
      });
      const r = runGate(["--root", dir]);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("pointer #bogus does not resolve");
    });

    it("(v) skips a NUL-bearing file whole, so a pointer inside one is never read", () => {
      // THE MISS THAT CAN PRINT `all resolving` OVER A DANGLING POINTER. Asserted green on
      // purpose: it is disclosed in the script header and in CLAUDE.md, and the tell is the
      // skipped count, which is asserted here too so a silent widening of the skip reds.
      //
      // The exclusion is REQUIRED in this repository rather than a tidy-up: the tree tracks
      // vendored `@cosyte/*` tarballs and a synthetic DICOM fixture, none of which can be read
      // as markdown or edited to clear a red.
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
        "documentation/agent-notes.md": NOTES,
        "blob.bin": `binary \0 payload ${ptr("totally-bogus-anchor")}\n`,
      });
      const r = runGate(["--root", dir]);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain("3 tracked path(s) reconciled = 2 opened + 1 skipped as binary");
    });

    it("(v) opens a file GIT would call binary but that holds no NUL, so the skip stays narrow", () => {
      // The skip is keyed on an ACTUAL NUL byte, which is NARROWER than git's own binary
      // classification. A lone-CR file (an HL7 v2 or ASTM terminator is a lone `CR`) is
      // `i/-text` to git and holds no NUL, so this gate OPENS it and reads the pointers inside.
      // Pinned so that nobody "simplifies" the skip to `grep -I` or `git ls-files --eol`, either
      // of which would drop a readable text file from the sweep with no tell.
      // `scripts/check-no-emdash.sh` keys on NUL for the same reason and agrees here.
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
        "documentation/agent-notes.md": NOTES,
        // Lone CR terminators, no NUL, and a dangling pointer inside.
        "loneCr.txt": `first record\rsecond record, see ${ptr("not-a-section")}\r`,
      });
      const r = runGate(["--root", dir]);
      // Opened, therefore the pointer inside it is READ and reported.
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("loneCr.txt");
      expect(r.stderr).toContain("#not-a-section does not resolve");
    });

    it("(vi) does NOT mint an anchor from an ATX line inside a code fence", () => {
      // (vi) was marked [PINNED] while this block held no case for it, which broke this
      // block's own stated invariant even though the shape was exercised further up the file.
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("fenced")}\n`,
        "documentation/agent-notes.md": "# notes\n\nP.\n\n## Real\n\n```sh\n## Fenced\n```\n",
      });
      const r = runGate(["--root", dir]);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("#fenced does not resolve");
    });

    it("(vi-b) DOES mint a phantom anchor from a heading inside an HTML comment", () => {
      // THE MISS EVERY SIBLING COPY DISCLOSES AND THIS ONE FIRST FORGOT TO. `<!--` and `-->`
      // are not tracked as a block, so a commented-out heading is counted here and renders no
      // anchor on GitHub: a pointer at it passes green and resolves to nothing. Asserted GREEN
      // on purpose, because it is a disclosed miss rather than a promise, and asserting it is
      // what makes closing it later a deliberate act instead of a surprise.
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("commented-out")}\n`,
        "documentation/agent-notes.md":
          "# notes\n\nP.\n\n## Real\n\nBody.\n\n<!--\n## Commented out\n-->\n",
      });
      const r = runGate(["--root", dir]);
      expect(r.code).toBe(0);
    });

    it("(vii) transcribes the slugger rather than importing it, and reds if that drifts", () => {
      // (vii) was marked [PINNED] with no case in this block. The transcription is exercised
      // by `SLUG_CASES` inside the gate's own self-test, so the direction it fails in is a
      // REFUSAL before any tree is read: proved here by the fact that every other case in this
      // file gets a verdict at all, and directly by a heading whose slug only a faithful
      // transcription produces (no trim, and an underscore kept).
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("-cli_not_implemented")}\n`,
        "documentation/agent-notes.md": "# notes\n\nP.\n\n## ▶ CLI_NOT_IMPLEMENTED\n\nBody.\n",
      });
      expect(runGate(["--root", dir]).code).toBe(0);
    });

    it("(xii) refuses on an anchor-shaped span that was never a pointer, the price of widening", () => {
      // THE COST OF THE TREE-WIDE CENSUS, DISCLOSED RATHER THAN NARROWED. A hex colour or a CSS
      // id written as a backticked anchor-shaped span refuses, and the refusal's advice to
      // re-derive the matcher is wrong for a colour. Asserted so the cost is a known, deliberate
      // trade rather than a surprise: the direction is conservative (refuse, never false green),
      // and the pair-scoped census it replaced avoided this only by leaving every third file
      // uncovered by both the matcher and the census.
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
        "documentation/agent-notes.md": NOTES,
        "docs-content/theme.md": `The brand ink is ${bare("fff")}.\n`,
      });
      const r = runGate(["--root", dir]);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("suspected BARE pointer");
      expect(r.stderr).toContain("docs-content/theme.md");
    });

    it("(xi) compares the narrative file's BASENAME only, so a move to another directory passes", () => {
      // MEASURED, AND IT IS WHY THE OPENING PROMISE NO LONGER SAYS "a rename". The file moved
      // out of `documentation/` while every pointer keeps the old path prefix: every rendered
      // link 404s on GitHub and this gate still exits 0. Asserted green as a disclosed miss.
      const dir = repo({
        "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
        "docs/agent-notes.md": NOTES,
      });
      const r = runGate(["--root", dir]);
      expect(r.code).toBe(0);
      // The gate reports the path it actually found, which is the only tell a reader gets.
      expect(r.stdout).toContain("docs/agent-notes.md");
    });
  },
);

describe("check-agent-notes: against this repo", { timeout: SLOW_MS }, () => {
  it("is green on this tree, with every pointer resolving", () => {
    const r = runGate([]);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("documentation/agent-notes.md");
    expect(r.stdout).toContain("all resolving");
  });

  it("accounts for every tracked path on the OK line", () => {
    // The reconciliation is the anti-`observed nothing` property, so it is asserted as a
    // property of the OUTPUT, not just of the exit code: `tracked == opened + skipped`.
    const r = runGate([]);
    const m = /(\d+) tracked path\(s\) reconciled = (\d+) opened \+ (\d+) skipped as binary/.exec(
      r.stdout,
    );
    expect(m).not.toBeNull();
    const tracked = Number(m?.[1]);
    const opened = Number(m?.[2]);
    const skipped = Number(m?.[3]);
    expect(opened).toBeGreaterThan(0);
    expect(tracked).toBe(opened + skipped);
  });

  it("reads a real, non-zero population of qualified pointers on this tree", () => {
    // ASSERT THE PREMISE. The gate refuses at zero, so this cannot be vacuous, but the count
    // is asserted as positive here anyway so that a future change which drops the corpus to a
    // single pointer is visible as a deliberate act rather than a silent narrowing.
    const r = runGate([]);
    const m = /(\d+) qualified pointer\(s\) from (\d+) file\(s\), all resolving/.exec(r.stdout);
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBeGreaterThan(1);
    expect(Number(m?.[2])).toBeGreaterThan(0);
  });

  it("reports the bare census over this whole tree, every span a digits-only reference", () => {
    // The census is what keeps the single-form scope honest, so its result is asserted rather
    // than merely produced. A non-digits bare span ANYWHERE on this tree, this file and the
    // gate's own source included, would have refused the run above.
    const r = runGate([]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/\d+ bare-shaped span\(s\) across every opened file/);
    expect(r.stdout).toContain("none a pointer");
  });
});
