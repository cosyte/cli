/**
 * Unit tests for scripts/phi-scan.ts: the STARTER PHI commit-gate.
 *
 * These exercise the SHARED MACHINERY and the cross-cutting SSN/email FLOOR that
 * ships with the template. They deliberately do NOT test structured, field-level
 * PHI detection. That is format-specific and is the author's obligation to add
 * (see the STARTER banner in scripts/phi-scan.ts). When you add structured
 * detectors, add positive tests here proving they CATCH real-looking names /
 * DOBs / ids for this standard: a weak scanner is worse than none.
 *
 * The scanner is invoked via spawnSync (array args, no shell) so the full CLI
 * path (argv parse, exit code, stderr) is exercised. Violator/clean files are
 * written to a throwaway temp dir so they never pollute the committed corpus.
 *
 * SECURITY: every subprocess call here uses spawnSync with array args. No exec,
 * no shell-form.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  symlinkSync,
  existsSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = process.cwd();
const SCANNER_PATH = join(REPO_ROOT, "scripts", "phi-scan.ts");
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");

let dir: string;

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runScanner(args: string[], cwd: string = REPO_ROOT): RunResult {
  const r = spawnSync(TSX_BIN, [SCANNER_PATH, ...args], {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Write a file to the temp dir and scan it by path (paths mode, no git needed). */
function scan(name: string, content: string): RunResult {
  const path = join(dir, name);
  writeFileSync(path, content);
  return runScanner([path]);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "phi-scan-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("phi-scan starter: the cross-cutting floor catches SSN + email", () => {
  it("catches a dashed SSN (exit 1)", () => {
    const r = scan("ssn.txt", "patient ssn 123-45-6789 on file\n");
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/123-45-6789/);
    expect(r.stderr).toMatch(/dashed SSN/);
  });

  it("catches an email at a non-test domain (exit 1)", () => {
    const r = scan("email.txt", "contact jane.doe@hospital.org for records\n");
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/jane\.doe@hospital\.org/);
    expect(r.stderr).toMatch(/non-test domain/);
  });
});

describe("phi-scan starter: clean + allow-listed content passes", () => {
  it("a clean file with no PHI shapes exits 0", () => {
    const r = scan("clean.txt", "just some ordinary text, no identifiers here\n");
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK, no hits/);
  });

  it("honors the allow-list: an email at a reserved test domain passes (exit 0)", () => {
    const r = scan("allowed-email.txt", "reach the team at hello@example.com anytime\n");
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

describe("phi-scan starter: the override-log gate", () => {
  it("rejects --allow-fixture without a matching override entry (exit 2)", () => {
    const clean = join(dir, "override-me.txt");
    writeFileSync(clean, "nothing to see\n");
    const r = runScanner(["--allow-fixture", clean]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/phi-scan-overrides\.md/);
  });
});

// ---------------------------------------------------------------------------
// The `--staged` route: the pre-commit half of the gate.
//
// These build throwaway git repositories laid out the way this scanner expects,
// because the defects below are properties of what `git diff --cached` reports
// and cannot be reproduced by scanning a path. The pre-commit hook is
// `pnpm phi-scan --staged`, so this route is the gate a developer actually
// walks through.
//
// SYNTHETIC PHI ONLY. The payload is the dashed-SSN shape this file's own floor
// tests already use plus an address at the RFC 2606 reserved `.invalid` TLD, so
// it is detectable by construction and refers to no one.
// ---------------------------------------------------------------------------

const SYNTHETIC_SSN = "123-45-6789";
const SYNTHETIC_EMAIL = "zzsentinel@hospital.invalid";
const SYNTHETIC_PHI = `synthetic record: ssn ${SYNTHETIC_SSN} contact ${SYNTHETIC_EMAIL}\n`;

/**
 * A link target whose own FILENAME carries the payload. A refusal must name the
 * entry and never echo what it points at: the target path is working-tree text,
 * and a diagnostic about a PHI leak is itself a PHI surface.
 */
const TARGET_NAME = `notes-${SYNTHETIC_SSN}.txt`;

function expectNoPhi(text: string): void {
  expect(text).not.toContain(SYNTHETIC_SSN);
  expect(text).not.toContain(SYNTHETIC_EMAIL);
}

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  if ((r.status ?? -1) !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

function gitOut(cwd: string, args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  return r.stdout ?? "";
}

const COMMIT = ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm"];
const MERGE = ["-c", "user.email=t@example.com", "-c", "user.name=t", "merge"];

/**
 * Every test below spawns the scanner as a child process, and `tsx` pays a cold
 * TypeScript start on each one. Several of these build a git repo and spawn it
 * more than once. The shared 10s default is not enough headroom for that on a
 * loaded box: measured at 0.5s idle and 3.7s under contention for a single
 * spawn, which is a flake waiting to be read as a red gate.
 */
const SLOW_MS = 60_000;

const repos: string[] = [];

/**
 * A throwaway git repo laid out the way this scanner expects: an allow-list
 * under `scripts/`, both scan roots, and one ordinary file in each so the
 * enumeration has something legitimate to find.
 */
function makeRepo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "cli-phi-scan-repo-")));
  repos.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "test", "__fixtures__"), { recursive: true });
  mkdirSync(join(root, "src"));
  copyFileSync(
    join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
    join(root, "scripts", "phi-allow-list.txt"),
  );
  writeFileSync(join(root, "test", "__fixtures__", "ordinary.txt"), "synthetic placeholder\n");
  writeFileSync(join(root, "src", "ok.ts"), "export const ok = 1;\n");
  git(root, ["init", "-q", "."]);
  // Repo-local identity, so no git invocation in this file depends on the
  // runner having one. A CI runner has none, and a git operation that refuses
  // for want of an identity fails in a way that reads as "nothing happened",
  // which is how a fixture goes silently vacuous.
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "t"]);
  return root;
}

afterAll(() => {
  for (const r of repos) rmSync(r, { recursive: true, force: true });
});

describe("phi-scan: the scanner under test is THIS package's", () => {
  // Negative control against a cross-worker file collision. Several agents share
  // one scratch area in this environment, and a sibling package's scanner would
  // answer most of the cases below plausibly while proving nothing about
  // `@cosyte/cli`. Assert the identity rather than assume it.
  it("is @cosyte/cli's scanner, not a sibling's", () => {
    const pkg: unknown = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    const name = (pkg as { name?: unknown }).name;
    expect(name).toBe("@cosyte/cli");
    expect(name).not.toBe("@cosyte/dicom");
    expect(existsSync(SCANNER_PATH)).toBe(true);
    // This repo's own scan roots. A sibling's scanner walks `test/fixtures`, not
    // `test/__fixtures__`, and none of them exempts THIS path.
    const source = readFileSync(SCANNER_PATH, "utf8");
    expect(source).toContain("test/__fixtures__");
    expect(source).toContain("SRC_ROOT");
    expect(source).toContain("SCRIPTS_ROOT");
    expect(source).toContain("test/scripts/phi-scan.test.ts");
    expect(source).not.toContain("PN_TAGS");
  });
});

describe("phi-scan: the synthetic payload is genuinely detectable", { timeout: SLOW_MS }, () => {
  // Guards against proving nothing by fixture: every refusal case below rests on
  // this payload being something the scanner would otherwise catch.
  it("as a plain staged regular file under a scan root it is a hit (exit 1)", () => {
    const root = makeRepo();
    writeFileSync(join(root, "test", "__fixtures__", "violator.txt"), SYNTHETIC_PHI);
    git(root, ["add", "test/__fixtures__/violator.txt"]);

    const r = runScanner(["--staged"], root);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(SYNTHETIC_SSN);
    expect(r.stderr).toContain(SYNTHETIC_EMAIL);
  });
});

describe(
  "phi-scan --staged: rename detection hid an entire staged path",
  { timeout: SLOW_MS },
  () => {
    it("scans a regular file RENAMED into the fixture root, which R100 dropped entirely", () => {
      // The headline. `git mv` is an ordinary developer action. With rename
      // detection on (the default) git stages it as a TWO-PATH `R100` record, and
      // `R` is in neither `AM` nor `AMT`, so the status filter deleted the record
      // and the destination was never enumerated at all. A rename that also
      // substitutes a real value walked straight through the pre-commit hook.
      const root = makeRepo();
      writeFileSync(join(root, "loose.txt"), SYNTHETIC_PHI);
      git(root, ["add", "loose.txt", "test/__fixtures__/ordinary.txt"]);
      git(root, [...COMMIT, "base"]);
      git(root, ["mv", "loose.txt", "test/__fixtures__/loose.txt"]);

      // The premise, in both directions: with detection on the record is a
      // two-path rename the status filter drops; with it off it is a plain add.
      expect(gitOut(root, ["diff", "--cached", "--raw"])).toContain("R100");
      expect(gitOut(root, ["diff", "--cached", "--raw", "--diff-filter=AM"]).trim()).toBe("");
      expect(gitOut(root, ["diff", "--cached", "--raw", "--diff-filter=AMT"]).trim()).toBe("");
      expect(
        gitOut(root, ["diff", "--cached", "--raw", "--no-renames", "--diff-filter=AMT"]),
      ).toMatch(/^:000000 100644 /);

      const r = runScanner(["--staged"], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(1);
      expect(r.stderr).toContain("test/__fixtures__/loose.txt");
      expect(r.stderr).toContain(SYNTHETIC_SSN);
    });

    it("scans a .ts file RENAMED into src/, the second scan root", () => {
      const root = makeRepo();
      writeFileSync(join(root, "loose.ts"), `// ${SYNTHETIC_PHI}`);
      git(root, ["add", "loose.ts", "src/ok.ts"]);
      git(root, [...COMMIT, "base"]);
      git(root, ["mv", "loose.ts", "src/loose.ts"]);

      const r = runScanner(["--staged"], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(1);
      expect(r.stderr).toContain("src/loose.ts");
    });

    it("refuses a LINK renamed into the fixture root: R100 at mode 120000", () => {
      // The same hole with the entry shape that makes it worst. The index really
      // does hold mode 120000 under the scan root, and the whole record was gone.
      const root = makeRepo();
      writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
      symlinkSync(TARGET_NAME, join(root, "toplink.txt"));
      git(root, ["add", "toplink.txt", "test/__fixtures__/ordinary.txt"]);
      git(root, [...COMMIT, "base"]);
      git(root, ["mv", "toplink.txt", "test/__fixtures__/toplink.txt"]);

      expect(gitOut(root, ["diff", "--cached", "--raw"])).toContain("R100");
      expect(gitOut(root, ["diff", "--cached", "--raw", "--diff-filter=AMT"]).trim()).toBe("");
      expect(
        gitOut(root, ["diff", "--cached", "--raw", "--no-renames", "--diff-filter=AMT"]),
      ).toMatch(/^:000000 120000 /);
      expect(gitOut(root, ["ls-files", "--stage", "test/__fixtures__/toplink.txt"])).toMatch(
        /^120000 /,
      );

      const r = runScanner(["--staged"], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("test/__fixtures__/toplink.txt");
      expect(r.stderr).toContain("a symbolic link");
      expectNoPhi(r.stderr);
      expect(r.stdout).not.toMatch(/OK/);
    });

    it("no R or C record survives --no-renames, whatever diff.renames is set to", () => {
      // The property that makes the two-field stride STRUCTURAL rather than
      // conditional. `copies` is not hypothetical: it produces a live `C100` here.
      for (const value of ["true", "copies", "false", "1"]) {
        const root = makeRepo();
        git(root, ["config", "diff.renames", value]);
        git(root, ["config", "diff.renameLimit", "1"]);
        writeFileSync(join(root, "loose.txt"), SYNTHETIC_PHI);
        git(root, ["add", "loose.txt", "test/__fixtures__/ordinary.txt"]);
        git(root, [...COMMIT, "base"]);
        git(root, ["mv", "loose.txt", "test/__fixtures__/loose.txt"]);
        writeFileSync(join(root, "test", "__fixtures__", "copy.txt"), SYNTHETIC_PHI);
        git(root, ["add", "test/__fixtures__/copy.txt"]);

        // Detection ON first, so the claim "`copies` is not hypothetical, it
        // emits a live C100" is asserted here rather than only stated in prose.
        // Without this, the loop would pass just as happily if git had stopped
        // producing the record shape this whole change is about.
        const on = gitOut(root, ["diff", "--cached", "--raw"]);
        if (value === "copies") {
          expect(on, "diff.renames=copies must emit a live C record").toMatch(/\sC\d*\t/);
        }
        if (value !== "false") {
          expect(on, `diff.renames=${value} must emit a live R record`).toMatch(/\sR\d*\t/);
        }

        const off = gitOut(root, ["diff", "--cached", "--raw", "--no-renames"]);
        expect(off, `diff.renames=${value}`).not.toMatch(/\s[RC]\d*\t/);
        for (const line of off.split("\n").filter((l) => l.length > 0)) {
          expect(line, `diff.renames=${value}`).toMatch(
            /^:\d{6} \d{6} [0-9a-f]+ [0-9a-f]+ [A-Z]\t/,
          );
        }

        const r = runScanner(["--staged"], root);
        expect(r.code, `diff.renames=${value} stderr: ${r.stderr}`).toBe(1);
        expect(r.stderr).toContain("test/__fixtures__/loose.txt");
        expect(r.stderr).toContain("test/__fixtures__/copy.txt");
      }
    });
  },
);

describe(
  "phi-scan --staged: a staged entry that is not a regular file",
  { timeout: SLOW_MS },
  () => {
    it("git really does store a link as its target path, not the target's bytes", () => {
      // The measurement the refusal rests on. If git ever changed this, the
      // refusal would be arguing from a premise that no longer holds.
      const root = makeRepo();
      writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
      symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "__fixtures__", "leak.txt"));
      git(root, ["add", "test/__fixtures__/leak.txt"]);

      expect(gitOut(root, ["ls-files", "--stage", "test/__fixtures__/leak.txt"])).toMatch(
        /^120000 /,
      );
      const shown = gitOut(root, ["show", ":test/__fixtures__/leak.txt"]);
      expect(shown.trim()).toBe(`../../${TARGET_NAME}`);
      expect(shown).not.toContain(SYNTHETIC_EMAIL);
    });

    it("refuses a staged symlink (exit 2) without echoing a PHI-bearing target path", () => {
      // On the base scanner this route enumerated the link, handed `git show` the
      // path text, found no SSN or email in it and printed OK. With a target name
      // of this shape it would instead have reported a hit whose value came out of
      // the WORKING TREE'S OWN FILENAME, never the target's contents. The refusal
      // must restore neither reading.
      const root = makeRepo();
      writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
      symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "__fixtures__", "leak.txt"));
      git(root, ["add", "test/__fixtures__/leak.txt"]);

      const r = runScanner(["--staged"], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("test/__fixtures__/leak.txt");
      expect(r.stderr).toContain("a symbolic link");
      expectNoPhi(r.stderr);
      expect(r.stdout).not.toMatch(/OK/);
    });

    it("refuses a TYPECHANGE: a tracked regular fixture replaced by a link", () => {
      // The shape `--diff-filter=AM` deleted before any mode could be read.
      const root = makeRepo();
      git(root, ["add", "test/__fixtures__/ordinary.txt"]);
      git(root, [...COMMIT, "base"]);

      writeFileSync(join(root, "payload.txt"), SYNTHETIC_PHI);
      rmSync(join(root, "test", "__fixtures__", "ordinary.txt"));
      symlinkSync(
        join("..", "..", "payload.txt"),
        join(root, "test", "__fixtures__", "ordinary.txt"),
      );
      git(root, ["add", "test/__fixtures__/ordinary.txt"]);

      // The premise: git raises this as a typechange, not A or M, so the old
      // `--name-only --diff-filter=AM` list was EMPTY.
      expect(gitOut(root, ["diff", "--cached", "--name-only", "--diff-filter=AM"]).trim()).toBe("");
      expect(gitOut(root, ["diff", "--cached", "--raw"])).toContain(" 120000 ");

      const r = runScanner(["--staged"], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("test/__fixtures__/ordinary.txt");
      expect(r.stderr).toContain("a symbolic link");
      expectNoPhi(r.stderr);
    });

    it("scans the other direction of a typechange: a link replaced by a real file", () => {
      const root = makeRepo();
      symlinkSync("ordinary.txt", join(root, "test", "__fixtures__", "link.txt"));
      git(root, ["add", "test/__fixtures__/link.txt"]);
      git(root, [...COMMIT, "base"]);

      rmSync(join(root, "test", "__fixtures__", "link.txt"));
      writeFileSync(join(root, "test", "__fixtures__", "link.txt"), SYNTHETIC_PHI);
      git(root, ["add", "test/__fixtures__/link.txt"]);

      const r = runScanner(["--staged"], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(1);
      expect(r.stderr).toContain(SYNTHETIC_SSN);
    });

    it("refuses a scan ROOT staged as a link, not just entries under it", () => {
      // An index entry at exactly `test/__fixtures__` is the corpus root replaced
      // by a blob or a link; git records no index entry for a directory, so this
      // path can only mean that. A prefix test requiring the trailing slash lets
      // it through and the whole corpus then goes unscanned.
      const root = makeRepo();
      writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
      rmSync(join(root, "test", "__fixtures__"), { recursive: true });
      symlinkSync(join("..", TARGET_NAME), join(root, "test", "__fixtures__"));
      git(root, ["add", "test/__fixtures__"]);

      expect(gitOut(root, ["ls-files", "--stage", "test/__fixtures__"])).toMatch(/^120000 /);

      const r = runScanner(["--staged"], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("test/__fixtures__");
      expect(r.stderr).toContain("a symbolic link");
      expectNoPhi(r.stderr);
    });

    it("refuses the src/ root staged as a link too", () => {
      const root = makeRepo();
      writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
      rmSync(join(root, "src"), { recursive: true });
      symlinkSync(TARGET_NAME, join(root, "src"));
      git(root, ["add", "src"]);

      const r = runScanner(["--staged"], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("a symbolic link");
      expectNoPhi(r.stderr);
    });

    it("refuses a staged gitlink under a scan root (exit 2)", () => {
      const root = makeRepo();
      const nested = join(root, "test", "__fixtures__", "nested");
      mkdirSync(nested);
      git(nested, ["init", "-q", "."]);
      writeFileSync(join(nested, "payload.txt"), SYNTHETIC_PHI);
      git(nested, ["add", "payload.txt"]);
      git(nested, [...COMMIT, "n"]);
      git(root, ["add", "test/__fixtures__/nested"]);

      // The premise the refusal's WORDING rests on, and it is not the symlink one:
      // `git show` does not hand back a target path for a gitlink, it fails
      // outright. A `why` clause asserting otherwise would be false for every mode
      // this refusal covers except 120000.
      const shown = spawnSync("git", ["show", ":test/__fixtures__/nested"], {
        cwd: root,
        encoding: "utf8",
        shell: false,
      });
      expect(shown.status).not.toBe(0);
      expect(shown.stderr).toContain("bad object");

      const r = runScanner(["--staged"], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("test/__fixtures__/nested");
      expect(r.stderr).toContain("a gitlink");
      expect(r.stderr).not.toContain("hands back its target path");
      expectNoPhi(r.stderr);
    });

    it("names EVERY offender, not just the first", () => {
      const root = makeRepo();
      writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
      symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "__fixtures__", "one.txt"));
      symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "__fixtures__", "two.txt"));
      git(root, ["add", "test/__fixtures__/one.txt", "test/__fixtures__/two.txt"]);

      const r = runScanner(["--staged"], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("test/__fixtures__/one.txt");
      expect(r.stderr).toContain("test/__fixtures__/two.txt");
      expect(r.stderr).toContain("2 entries");
      expectNoPhi(r.stderr);
    });
  },
);

describe("phi-scan --staged: the scope is widened, never narrowed", { timeout: SLOW_MS }, () => {
  it("still catches a staged ordinary file carrying the payload (exit 1)", () => {
    // Regression control on the `--raw -z` reparse: reading the mode must not
    // cost the route the ordinary files it was already enumerating.
    const root = makeRepo();
    writeFileSync(join(root, "test", "__fixtures__", "violator.txt"), SYNTHETIC_PHI);
    git(root, ["add", "test/__fixtures__/violator.txt"]);

    const r = runScanner(["--staged"], root);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/__fixtures__/violator.txt");
  });

  it("passes staged ordinary clean files in both roots (exit 0)", () => {
    const root = makeRepo();
    git(root, ["add", "test/__fixtures__/ordinary.txt", "src/ok.ts"]);
    const r = runScanner(["--staged"], root);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK, no hits/);
  });

  it("leaves a staged link OUTSIDE both scan roots alone", () => {
    // The mode check narrows what the scope ADMITS; it does not widen the scope.
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(TARGET_NAME, join(root, "docs-link.txt"));
    git(root, ["add", "docs-link.txt"]);

    const r = runScanner(["--staged"], root);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("an unmerged (U) entry is out of scope, and cannot reach a commit anyway", () => {
    // Stated rather than inferred, because the disclosure is only worth anything
    // if the second half is true: git REFUSES to commit an unmerged index, so no
    // `U` entry has ever been one `git commit` away from landing.
    const root = makeRepo();
    git(root, ["add", "test/__fixtures__/ordinary.txt"]);
    git(root, [...COMMIT, "base"]);
    const base = gitOut(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
    git(root, ["checkout", "-q", "-b", "other"]);
    writeFileSync(join(root, "test", "__fixtures__", "ordinary.txt"), SYNTHETIC_PHI);
    git(root, ["add", "test/__fixtures__/ordinary.txt"]);
    git(root, [...COMMIT, "theirs"]);
    git(root, ["checkout", "-q", base]);
    writeFileSync(join(root, "test", "__fixtures__", "ordinary.txt"), "a different change\n");
    git(root, ["add", "test/__fixtures__/ordinary.txt"]);
    git(root, [...COMMIT, "ours"]);
    // The merge is EXPECTED to fail, so its result is asserted rather than
    // discarded. Ignoring it made this test vacuous on a runner with no git
    // identity configured: `git merge` refused before touching the index, no
    // conflict was created, and every assertion below passed over an empty one.
    // A merge that does not conflict here is a broken fixture, not a pass.
    const merge = spawnSync("git", [...MERGE, "other"], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    });
    expect(merge.status, `merge: ${merge.stdout}${merge.stderr}`).not.toBe(0);
    expect(`${merge.stdout}${merge.stderr}`).toContain("CONFLICT");

    expect(gitOut(root, ["ls-files", "-u"])).toContain("test/__fixtures__/ordinary.txt");
    expect(gitOut(root, ["diff", "--cached", "--raw", "--diff-filter=AMT"]).trim()).toBe("");
    expect(gitOut(root, ["diff", "--cached", "--raw", "--diff-filter=AMTU"])).toMatch(
      / U\ttest\/__fixtures__\/ordinary\.txt/,
    );

    // Out of scope for the scan...
    expect(runScanner(["--staged"], root).code).toBe(0);
    // ...and out of reach of a commit.
    const attempt = spawnSync("git", [...COMMIT, "attempt"], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    });
    // 128, not merely non-zero: the disclosure names that exit code.
    expect(attempt.status).toBe(128);
    expect(`${attempt.stdout}${attempt.stderr}`).toContain("unmerged files");
  });
});

/**
 * `makeRepo()` with both scan roots' contents ADDED to the index, which is what
 * `git ls-files` answers off. Every reconciliation case below needs a TRACKED
 * corpus, because the rule compares what git carries against what the walk
 * opened, and a repo tracking nothing has nothing to reconcile. A commit is not
 * needed: `git ls-files` reads the index.
 */
function makeTrackedRepo(): string {
  const root = makeRepo();
  git(root, ["add", "test/__fixtures__/ordinary.txt", "src/ok.ts"]);
  // Assert the premise rather than assume it. If the add ever stopped taking,
  // every case below would hold over an empty expected set and pass vacuously,
  // which is the failure mode this file has already sprung twice.
  expect(gitOut(root, ["ls-files", "test/__fixtures__"]).trim()).toBe(
    "test/__fixtures__/ordinary.txt",
  );
  return root;
}

describe(
  "phi-scan: a declared scan root the walk never observed refuses (exit 2)",
  { timeout: SLOW_MS },
  () => {
    // CI runs `pnpm phi-scan` with no arguments, so this route is the one that
    // can print `OK, no hits` and exit 0 over a corpus nobody opened. Each case
    // here exited 0 with that message before the observation rule, measured.

    it("stays green when every root is healthy and fully observed", () => {
      // The premise, first: a refusal rule that reds the ordinary case teaches
      // people to disable it, and every case below would pass vacuously against
      // a scanner that had simply started refusing everything.
      const root = makeTrackedRepo();
      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      expect(r.stdout).toMatch(/OK, no hits/);
    });

    it("refuses a MISSING root whose corpus git still tracks", () => {
      const root = makeTrackedRepo();
      rmSync(join(root, "test", "__fixtures__"), { recursive: true });

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      // Filed under `test`, which is the ROOT, since the widening replaced
      // `test/__fixtures__` with its parent. The actionable half is unchanged:
      // the refusal still names the tracked file that went unopened.
      expect(r.stderr).toContain("test: opened 0 file(s)");
      expect(r.stderr).toContain("test/__fixtures__/ordinary.txt");
      expect(r.stdout).not.toMatch(/OK/);
    });

    it("refuses an EMPTIED root, which existence alone cannot tell from a clean one", () => {
      // `existsSync` answers true here and `readdirSync` succeeds: the root is a
      // real, readable directory. Refusing a MISSING root would leave this half
      // wide open, which is why the rule is about observation and not existence.
      const root = makeTrackedRepo();
      rmSync(join(root, "test", "__fixtures__", "ordinary.txt"));
      expect(existsSync(join(root, "test", "__fixtures__"))).toBe(true);

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("test/__fixtures__/ordinary.txt");
    });

    it("refuses a DANGLING root link, which existsSync FOLLOWS and answers false for", () => {
      // The sharpest case, and the reason a not-a-regular-file check cannot
      // stand in for this rule: `existsSync` resolves the link, answers false,
      // and `walk()` returns before `readdirSync`. Nothing about the entry is
      // ever inspected, so no kind check can fire on it.
      //
      // AIMED AT `test` RATHER THAN `test/__fixtures__` SINCE THE WIDENING, and
      // the reason is the whole point of the case: the fixture directory is no
      // longer a ROOT, so a link there is an ENUMERATED entry and the kind check
      // DOES fire on it (pinned separately below). Only a declared root can
      // still reach `walk()`'s first line, so only a declared root exercises
      // this rule.
      const root = makeTrackedRepo();
      rmSync(join(root, "test"), { recursive: true });
      symlinkSync("nowhere-at-all", join(root, "test"));
      expect(existsSync(join(root, "test"))).toBe(false);

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("test: opened 0 file(s)");
      expect(r.stderr).toContain("test/__fixtures__/ordinary.txt");
      expect(r.stdout).not.toMatch(/OK/);
    });

    it("refuses a dangling link AT the old fixture root, by the enumerated-entry rule", () => {
      // The narrowing the widening bought, asserted rather than claimed.
      // `test/__fixtures__` used to be a declared root, where a dangling link
      // reached `walk()`'s `existsSync` and nothing about the entry was ever
      // inspected. It is now an ordinary entry BENEATH `test`, so `Dirent`'s
      // lstat answer sees it and the not-a-regular-file refusal fires on it
      // directly, naming the entry and its kind.
      const root = makeTrackedRepo();
      rmSync(join(root, "test", "__fixtures__"), { recursive: true });
      symlinkSync(join("..", "nowhere-at-all"), join(root, "test", "__fixtures__"));

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("test/__fixtures__");
      expect(r.stderr).toContain("a symbolic link");
      expect(r.stdout).not.toMatch(/OK/);
    });

    it("refuses a root swapped for an outside directory, which a count reads as healthy", () => {
      // Shape (1) of the module header in its TRACKED form. The walk follows the
      // link and opens a file, so a denominator or a per-root count looks fine.
      // What gives it away is that none of the corpus git carries was among what
      // was opened, and the reported path resolves while naming nothing tracked.
      const root = makeTrackedRepo();
      const outside = realpathSync(mkdtempSync(join(tmpdir(), "cli-phi-scan-outside-")));
      repos.push(outside);
      writeFileSync(join(outside, "unrelated.txt"), "synthetic placeholder\n");
      rmSync(join(root, "test"), { recursive: true });
      symlinkSync(outside, join(root, "test"));

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("test: opened 1 file(s)");
      expect(r.stderr).toContain("test/__fixtures__/ordinary.txt");
    });

    it("refuses one tracked file removed while the rest of the root is opened", () => {
      // Root granularity would miss this: the root exists, is readable, and
      // yields files. The rule is per tracked FILE, not per root.
      const root = makeTrackedRepo();
      writeFileSync(join(root, "test", "__fixtures__", "second.txt"), "synthetic placeholder\n");
      git(root, ["add", "test/__fixtures__/second.txt"]);
      rmSync(join(root, "test", "__fixtures__", "ordinary.txt"));

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("test: opened 1 file(s)");
      expect(r.stderr).toContain("test/__fixtures__/ordinary.txt");
      expect(r.stderr).not.toContain("test/__fixtures__/second.txt");
    });

    it("refuses when src/ is the starved root, not only the fixture root", () => {
      const root = makeTrackedRepo();
      rmSync(join(root, "src"), { recursive: true });

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("src: opened 0 file(s)");
      expect(r.stderr).toContain("src/ok.ts");
    });

    it("is ONE-DIRECTIONAL: an untracked file the walk found is not a refusal", () => {
      // Scanning more than git carries is the safe direction. Refusing it would
      // red the gate on every fixture a developer has written but not yet added.
      const root = makeTrackedRepo();
      writeFileSync(join(root, "test", "__fixtures__", "not-added-yet.txt"), "placeholder\n");
      expect(gitOut(root, ["ls-files", "test/__fixtures__/not-added-yet.txt"]).trim()).toBe("");

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    });

    it("still scans the corpus it reconciles: a tracked violator is a hit, not a refusal", () => {
      // The rule must not become the only thing the all-mode route reports.
      const root = makeTrackedRepo();
      writeFileSync(join(root, "test", "__fixtures__", "violator.txt"), SYNTHETIC_PHI);
      git(root, ["add", "test/__fixtures__/violator.txt"]);

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(1);
      expect(r.stderr).toContain("test/__fixtures__/violator.txt");
      expect(r.stderr).not.toContain("refusing the scan");
    });

    it("refuses rather than reconciling against an empty list when git cannot answer", () => {
      // An empty `git ls-files` answer is indistinguishable from "this root
      // tracks nothing", so a git that cannot answer would switch the whole rule
      // off in silence and restore the exact green it exists to end.
      const bare = realpathSync(mkdtempSync(join(tmpdir(), "cli-phi-scan-nogit-")));
      repos.push(bare);
      mkdirSync(join(bare, "scripts"));
      mkdirSync(join(bare, "test", "__fixtures__"), { recursive: true });
      mkdirSync(join(bare, "src"));
      copyFileSync(
        join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
        join(bare, "scripts", "phi-allow-list.txt"),
      );
      writeFileSync(join(bare, "test", "__fixtures__", "ordinary.txt"), "placeholder\n");
      writeFileSync(join(bare, "src", "ok.ts"), "export const ok = 1;\n");
      // The premise: this really is outside any repository, so `git ls-files`
      // fails rather than answering about some enclosing one.
      expect(gitOut(bare, ["rev-parse", "--show-toplevel"]).trim()).toBe("");

      const r = runScanner([], bare);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("could not ask git what it tracks");
      expect(r.stdout).not.toMatch(/OK/);
    });

    it("names an unmerged path ONCE, not once per stage", () => {
      // `git ls-files` emits an unmerged path once per stage, so a conflicted
      // fixture was named three times in one refusal and read as three missing
      // files. The refusal was right either way; a diagnostic nobody can trust
      // is how a gate stops being read.
      const root = makeTrackedRepo();
      git(root, [...COMMIT, "base"]);
      const base = gitOut(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
      git(root, ["checkout", "-q", "-b", "other"]);
      writeFileSync(join(root, "test", "__fixtures__", "ordinary.txt"), "theirs\n");
      git(root, ["add", "test/__fixtures__/ordinary.txt"]);
      git(root, [...COMMIT, "theirs"]);
      git(root, ["checkout", "-q", base]);
      writeFileSync(join(root, "test", "__fixtures__", "ordinary.txt"), "ours\n");
      git(root, ["add", "test/__fixtures__/ordinary.txt"]);
      git(root, [...COMMIT, "ours"]);
      const merge = spawnSync("git", [...MERGE, "other"], {
        cwd: root,
        encoding: "utf8",
        shell: false,
      });
      // The premise, asserted rather than discarded: a merge that does not
      // conflict leaves one stage, and every assertion below would hold for the
      // wrong reason. This suite has already shipped that exact vacuity once.
      expect(merge.status, `merge: ${merge.stdout}${merge.stderr}`).not.toBe(0);
      expect(gitOut(root, ["ls-files", "-u", "test/__fixtures__"]).trim().split("\n")).toHaveLength(
        3,
      );
      rmSync(join(root, "test", "__fixtures__", "ordinary.txt"));

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("git tracks 1 in-scope file(s)");
      expect(r.stderr.match(/test\/__fixtures__\/ordinary\.txt/g)).toHaveLength(1);
    });

    it("leaves --staged alone: it is a diff, with no corpus to reconcile against", () => {
      // Widening `--staged` changes what a COMMIT is blocked on, which is a
      // different decision and is deliberately not taken here.
      const root = makeTrackedRepo();
      git(root, [...COMMIT, "base"]);
      rmSync(join(root, "test", "__fixtures__"), { recursive: true });
      writeFileSync(join(root, "src", "added.ts"), "export const added = 1;\n");
      git(root, ["add", "src/added.ts"]);

      const r = runScanner(["--staged"], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    });
  },
);

describe("phi-scan: an invocation failure exits 2, never 1", { timeout: SLOW_MS }, () => {
  // `1` is this contract's code for "hits found". A caller branching on the exit
  // code read a broken invocation as a PHI finding; a caller branching on
  // "not 0" read it as the gate working. Both readings were wrong.
  it("a missing allow-list exits 2 with a diagnostic, not 1 with a stack trace", () => {
    const root = makeRepo();
    rmSync(join(root, "scripts", "phi-allow-list.txt"));
    git(root, ["add", "test/__fixtures__/ordinary.txt"]);

    const r = runScanner(["--staged"], root);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("[phi-scan]");
    expect(r.stderr).toContain("allow-list not found");
    expect(r.stderr).not.toContain("InvocationError:");
    expect(r.stderr).not.toContain("at loadAllowList");
  });

  it("an unreadable OVERRIDE LOG exits 2, not 1 with a stack trace", () => {
    // The allow-list reader was wrapped; its sibling, `loadOverrideLog`, was
    // not, so a present-but-unreadable `phi-scan-overrides.md` threw a raw
    // EACCES past every handler and node exited 1: this contract's code for
    // "hits found". Measured at exit 1 before this change.
    //
    // `hasAssertions` for the same reason as the case below: under a uid that
    // ignores mode bits the file stays readable and the early return would be a
    // silent pass rather than a visible skip.
    expect.hasAssertions();
    const root = makeRepo();
    const log = join(root, "phi-scan-overrides.md");
    writeFileSync(log, "# overrides\n\n### test/__fixtures__/ordinary.txt\n");
    let r: RunResult;
    try {
      spawnSync("chmod", ["000", log], { encoding: "utf8", shell: false });
      let readable = true;
      try {
        readFileSync(log, "utf8");
      } catch {
        readable = false;
      }
      expect(typeof readable).toBe("boolean");
      if (readable) return;
      r = runScanner(["--allow-fixture", "test/__fixtures__/ordinary.txt"], root);
    } finally {
      spawnSync("chmod", ["644", log], { encoding: "utf8", shell: false });
    }
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("[phi-scan]");
    expect(r.stderr).toContain("could not read the override log");
    expect(r.stderr).not.toContain("InvocationError:");
    expect(r.stderr).not.toContain("at loadOverrideLog");
  });

  it("an unreadable scan root exits 2, rather than throwing out of readdirSync", () => {
    // `expect.hasAssertions()` because the early-out below is otherwise a silent
    // pass: under a uid that ignores mode bits (root in a container) traversal
    // still works, the test returns having asserted NOTHING, and this is the
    // only coverage of the unreadable-scan-root half. A green test that asserted
    // nothing is the same vacuity class as the discarded `git merge` above.
    // GitHub's `ubuntu-*` runners are non-root, so the real path runs there.
    expect.hasAssertions();
    const root = makeRepo();
    const guarded = join(root, "test", "__fixtures__");
    let r: RunResult;
    try {
      spawnSync("chmod", ["000", guarded], { encoding: "utf8", shell: false });
      const modeIgnored = existsSync(join(guarded, "ordinary.txt"));
      // Assert the reason for skipping rather than returning bare, so the skip
      // is visible in the run instead of indistinguishable from a pass.
      expect(typeof modeIgnored).toBe("boolean");
      if (modeIgnored) return;
      r = runScanner([], root);
    } finally {
      spawnSync("chmod", ["755", guarded], { encoding: "utf8", shell: false });
    }
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("[phi-scan]");
    expect(r.stderr).toContain("could not read test/__fixtures__");
    expect(r.stdout).not.toMatch(/OK/);
  });
});

describe(
  "phi-scan: the all-mode walk refuses a non-regular entry too",
  { timeout: SLOW_MS },
  () => {
    // The staged route is the pre-commit gate and was this slice's target; the
    // all-mode sweep is the CI backstop, and shipping a scanner where one refuses
    // a link and the other silently drops it would be indefensible.
    it("refuses a symlink under a scan root pointing at PHI (exit 2)", () => {
      const root = makeRepo();
      writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
      symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "__fixtures__", "leak.txt"));

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("test/__fixtures__/leak.txt");
      expect(r.stderr).toContain("a symbolic link");
      expectNoPhi(r.stderr);
    });

    it("refuses a symlinked DIRECTORY, which isDirectory() also answers false for", () => {
      const root = makeRepo();
      mkdirSync(join(root, "elsewhere"));
      writeFileSync(join(root, "elsewhere", TARGET_NAME), SYNTHETIC_PHI);
      symlinkSync(join("..", "..", "elsewhere"), join(root, "test", "__fixtures__", "linked-dir"));

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("test/__fixtures__/linked-dir");
      expectNoPhi(r.stderr);
    });

    it("refuses a link named README.md, which the file route's exemption would skip", () => {
      // The `.md` exemption is a judgement about a file whose bytes the walk could
      // have read. A link's NAME is no evidence about what is on the other side.
      const root = makeRepo();
      writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
      symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "__fixtures__", "README.md"));

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("test/__fixtures__/README.md");
      expect(r.stderr).toContain("a symbolic link");
      expectNoPhi(r.stderr);
    });

    it("an ignored link is out of scope, by the rule that already excludes an ignored fixture", () => {
      const root = makeRepo();
      writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
      symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "__fixtures__", "leak.txt"));
      writeFileSync(join(root, ".gitignore"), "test/__fixtures__/leak.txt\n");

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    });

    it("a repo with no link and no violator still scans clean (exit 0)", () => {
      const root = makeRepo();
      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      expect(r.stdout).toMatch(/OK, no hits/);
    });
  },
);

describe(
  "phi-scan: the disclosed residuals, pinned so the disclosure cannot drift",
  { timeout: SLOW_MS },
  () => {
    // These pin behaviour that is PRE-EXISTING, WRONG, and deliberately NOT closed
    // in this change. They exist because the module header's refusal rule is
    // scoped to an ENUMERATED entry, and the unqualified version of that sentence
    // is false. A test that pins the exception is what stops the scoped wording
    // from quietly reverting to the absolute one.
    //
    // If one of these starts failing because the behaviour was FIXED, that is
    // good news: delete the test and the matching disclosure together.

    it("FOLLOWS a scan root that is itself a live link, and misreports provenance", () => {
      // The walk reaches `readdirSync` through `existsSync`, and both resolve
      // links. So the corpus root can point outside the repository and the walk
      // reads bytes no commit contains, reporting them under an in-repo path that
      // holds no such file.
      //
      // NARROWED, NOT CLOSED, AND THE NARROWING IS THE WHOLE POINT OF USING
      // `makeRepo()` HERE RATHER THAN THE TRACKED HELPER: the observation rule
      // refuses this shape as soon as git tracks anything under the root (the
      // tracked form is asserted in the observation suite). What survives is
      // exactly this - a root git carries NOTHING under, so the reconciliation
      // has no expected path to miss and the walk's one hit satisfies the
      // opened-nothing floor.
      //
      // THE LINK IS AT `test` RATHER THAN `test/__fixtures__` SINCE THE
      // WIDENING. That is not a cosmetic retarget: the fixture directory is no
      // longer a declared root, so a link there is refused outright and this
      // shape is now reachable ONLY at one of the three top-level roots. The
      // escape is one level narrower than it was, and it is still open there.
      const root = makeRepo();
      const outside = realpathSync(mkdtempSync(join(tmpdir(), "cli-phi-scan-outside-")));
      repos.push(outside);
      writeFileSync(join(outside, "real-notes.txt"), SYNTHETIC_PHI);
      rmSync(join(root, "test"), { recursive: true });
      symlinkSync(outside, join(root, "test"));

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(1);
      // The provenance defect, stated as an assertion. The reported path does
      // RESOLVE, through the link, which is why `existsSync` is true one line
      // down; what makes it a fabrication is that git tracks no such file and no
      // commit contains it. The `ls-files` assertion is doing the real work.
      expect(r.stderr).toContain("test/real-notes.txt");
      expect(existsSync(join(root, "test", "real-notes.txt"))).toBe(true);
      expect(gitOut(root, ["ls-files", "test/real-notes.txt"]).trim()).toBe("");
    });

    it("FOLLOWS a root link whose target MIRRORS the tracked names, corpus fully tracked", () => {
      // The exact shape a refuter used to falsify the shorter disclosure. The
      // reconciliation compares PATH SETS, not the bytes git carries at those
      // paths, so a target directory holding the same relative filenames
      // satisfies both conditions with decoy contents and the gate prints the
      // headline sentence this whole rule exists to end. "Survives only where
      // git tracks nothing under it" is FALSE, and this pins that it is false.
      const root = makeTrackedRepo();
      const decoy = realpathSync(mkdtempSync(join(tmpdir(), "cli-phi-scan-decoy-")));
      repos.push(decoy);
      mkdirSync(join(decoy, "__fixtures__"));
      writeFileSync(join(decoy, "__fixtures__", "ordinary.txt"), "decoy, not the tracked bytes\n");
      rmSync(join(root, "test"), { recursive: true });
      symlinkSync(decoy, join(root, "test"));
      // The premise: git really does carry a DIFFERENT blob at that path, so a
      // pass here is a pass over a corpus that was never opened.
      expect(gitOut(root, ["show", ":test/__fixtures__/ordinary.txt"])).toContain(
        "synthetic placeholder",
      );

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      expect(r.stdout).toMatch(/OK, no hits/);
    });

    it("does not see an ANCESTOR of a scan root staged as a link", () => {
      // Fact 3 puts `test/__fixtures__` and `src` in scope, but not `test`. The
      // "git records no index entry for a directory" argument applies to `test`
      // verbatim, so this is the same shape one level up.
      const root = makeRepo();
      writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
      rmSync(join(root, "test"), { recursive: true });
      symlinkSync(TARGET_NAME, join(root, "test"));
      git(root, ["add", "test"]);

      expect(gitOut(root, ["ls-files", "--stage", "test"])).toMatch(/^120000 /);
      expect(runScanner(["--staged"], root).code).toBe(0);
    });

    it("FOLLOWS an explicitly named link in paths mode, because statSync resolves", () => {
      const root = makeRepo();
      const outside = realpathSync(mkdtempSync(join(tmpdir(), "cli-phi-scan-outside-")));
      repos.push(outside);
      writeFileSync(join(outside, "payload.txt"), SYNTHETIC_PHI);
      symlinkSync(join(outside, "payload.txt"), join(root, "link.txt"));

      const r = runScanner(["link.txt"], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(1);
      expect(r.stderr).toContain(SYNTHETIC_SSN);
    });
  },
);

// ---------------------------------------------------------------------------
// The walk's ROOTS: `src`, `test` and `scripts`, widened from `test/__fixtures__`
// and `src`.
//
// MEASURED BACK TO BACK ON `ba059a2`, THE COMMIT THIS WIDENING LANDED ON, AND
// RE-DERIVED FOR THIS REPOSITORY RATHER THAN PORTED: 123 tracked files, 34 opened
// by the walk, 89 scanned by NEITHER route. A dashed SSN and an off-domain
// address written into `test/planted.test.ts` (in this repo's own inline-message
// shape) and into `scripts/planted.txt` each exited 0 "OK, no hits" in all mode,
// while naming the same file in PATHS mode reported both at exit 1 over the same
// bytes. That gap was ENUMERATION, never detection, which is why the cases below
// assert the two routes AGREE: a narrowing of the roots reds here.
// ---------------------------------------------------------------------------

describe(
  "phi-scan: the walk reaches this repo's whole authored corpus",
  { timeout: SLOW_MS },
  () => {
    for (const rel of [
      ["test", "planted.test.ts"], // `test/` outside the fixture dir: the item's headline
      ["test", "scripts", "planted.test.ts"], // and nested under it
      ["scripts", "planted.txt"], // the directory the scanner itself lives in
      ["src", "planted.ts"], // the root that was already covered: a control
      ["test", "__fixtures__", "planted.txt"], // the old root, still covered after the swap
    ]) {
      const path = rel.join("/");
      it(`sweeps a violator at ${path}, and paths mode agrees`, () => {
        const root = makeRepo();
        mkdirSync(join(root, ...rel.slice(0, -1)), { recursive: true });
        writeFileSync(join(root, ...rel), SYNTHETIC_PHI);

        const sweep = runScanner([], root);
        expect(sweep.code, `stderr: ${sweep.stderr}`).toBe(1);
        expect(sweep.stderr).toContain(path);
        expect(sweep.stderr).toContain(SYNTHETIC_SSN);

        // The two routes must say the same thing about the same bytes. Before the
        // widening the first three of these exited 0 here and 1 below.
        const named = runScanner([path], root);
        expect(named.code, `stderr: ${named.stderr}`).toBe(1);
        expect(named.stderr).toContain(SYNTHETIC_SSN);
      });
    }

    it("still reports a clean tree as clean over all three roots (exit 0)", () => {
      // The premise. A widening that reds the ordinary case is a widening someone
      // reverts, and every assertion above would pass against a scanner that had
      // simply started refusing everything.
      const root = makeRepo();
      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      expect(r.stdout).toMatch(/OK, no hits/);
    });

    it("refuses when `scripts` is the starved root, so the new root is reconciled too", () => {
      // A root that is declared but not reconciled is the defect this repo closed
      // one change ago. Adding a root without extending that rule to it would
      // reopen it for the new root alone.
      const root = makeRepo();
      git(root, ["add", "scripts/phi-allow-list.txt", "src/ok.ts"]);
      rmSync(join(root, "scripts", "phi-allow-list.txt"));

      const r = runScanner([], root);
      // The allow-list is gone, so the earlier invocation step refuses first. That
      // is the correct order and is asserted rather than worked around: a
      // `scripts/` empty enough to starve the observation rule cannot be reached
      // without first removing the file this scanner refuses to run without.
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("allow-list not found");
    });

    it("reconciles `scripts` against git when the allow-list is present but the corpus is not", () => {
      const root = makeRepo();
      writeFileSync(join(root, "scripts", "helper.mjs"), "export const h = 1;\n");
      git(root, ["add", "scripts/helper.mjs"]);
      rmSync(join(root, "scripts", "helper.mjs"));

      const r = runScanner([], root);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("scripts/helper.mjs");
    });
  },
);

describe("phi-scan: the deliberate-violator exemption", { timeout: SLOW_MS }, () => {
  // This file carries the payload on purpose, and `test/` is now a scan root, so
  // without the exemption the sweep would red forever on its own test suite.

  it("the sweep of THIS repository is green, over this file's real payload", () => {
    // Not a fixture: the actual `pnpm phi-scan` CI invocation, in this tree.
    const r = runScanner([]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK, no hits/);
  });

  it("names the file in the scanner's own source, so the exemption is reviewable", () => {
    const source = readFileSync(SCANNER_PATH, "utf8");
    expect(source).toContain("DELIBERATE_VIOLATOR_SOURCES");
    expect(source).toContain("test/scripts/phi-scan.test.ts");
  });

  it("is SCOPED TO THE SWEEP: naming this file in paths mode still reports every hit", () => {
    // The half that keeps this a widening rather than a trade. An unscoped
    // exemption would DELETE a detection the base had, and a sibling shipped
    // exactly that mistake before catching it.
    const r = runScanner(["test/scripts/phi-scan.test.ts"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(SYNTHETIC_SSN);
    expect(r.stderr).toContain("jane.doe@hospital.org");
  });

  it("is PER PATH, not a pattern: the same payload in a sibling test file still reds", () => {
    // An extension or directory rule could not tell a file that carries violator
    // literals on purpose from one that carries them by accident, which is the
    // whole distinction this gate exists to draw.
    const root = makeRepo();
    mkdirSync(join(root, "test", "scripts"), { recursive: true });
    writeFileSync(join(root, "test", "scripts", "other.test.ts"), SYNTHETIC_PHI);

    const r = runScanner([], root);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/scripts/other.test.ts");
  });

  it("an exempt file is still READ and still counts as observed", () => {
    // The exemption is applied after the read, so it cannot be mistaken for a
    // file the walk never reached: an unreadable one still refuses (exit 2)
    // rather than passing as exempt. `hasAssertions` because a uid that ignores
    // mode bits would otherwise make the early return a silent pass.
    expect.hasAssertions();
    const root = makeRepo();
    mkdirSync(join(root, "test", "scripts"), { recursive: true });
    const exempt = join(root, "test", "scripts", "phi-scan.test.ts");
    writeFileSync(exempt, SYNTHETIC_PHI);
    let r: RunResult;
    try {
      spawnSync("chmod", ["000", exempt], { encoding: "utf8", shell: false });
      let readable = true;
      try {
        readFileSync(exempt, "utf8");
      } catch {
        readable = false;
      }
      expect(typeof readable).toBe("boolean");
      if (readable) return;
      r = runScanner([], root);
    } finally {
      spawnSync("chmod", ["644", exempt], { encoding: "utf8", shell: false });
    }
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("could not read test/scripts/phi-scan.test.ts");
  });
});

describe("phi-scan: the floor is ANCHOR-FREE, which is what the widening rests on", () => {
  // ENUMERATING A `.ts` SOURCE BUYS NOTHING IF THE DETECTOR ASSUMES THE FILE *IS*
  // THE DOCUMENT. That is the companion defect this class carries, and it is a
  // property of an ANCHORED recogniser. This scanner has none: `scanCommonShapes`
  // is two unanchored passes over the whole text. These cases assert that rather
  // than leaving it as a claim in a banner, by putting one token in three
  // placements and requiring all three to red.

  const PLACEMENTS: [string, string, string][] = [
    ["a standalone document", "doc.txt", `patient ssn ${SYNTHETIC_SSN} on file\n`],
    [
      "an inline HL7 literal inside TypeScript",
      "inline.ts",
      `const M =\n  "MSH|^~\\\\&|A|B|C|D|20240101||ADT^A01|1|P|2.5\\rPID|1||X^^^H^MR||DOE^JANE||19800101|F|||||||||${SYNTHETIC_SSN}\\r";\n`,
    ],
    [
      "a multi-line template literal",
      "template.ts",
      "const M = `\n  line one\n  ssn " + SYNTHETIC_SSN + "\n`;\n",
    ],
  ];

  for (const [label, name, body] of PLACEMENTS) {
    it(`catches the same token in ${label}`, () => {
      const r = scan(name, body);
      expect(r.code, `stderr: ${r.stderr}`).toBe(1);
      expect(r.stderr).toContain(SYNTHETIC_SSN);
    });
  }

  it("KNOWN LIMIT, pinned: the floor is SSN + email and the widening did not change that", () => {
    // The disclosure "enumerating the files buys the SSN/email floor and NOTHING
    // else" is asserted here rather than only written down. An undashed id, a
    // name, a date of birth and an address in the very same PID segment go
    // unreported, because the structured detector is still the unimplemented TODO
    // in `scanTarget`. If one of these ever starts failing, a real detector
    // landed: delete the case and the disclosure together.
    const r = scan(
      "unreported.ts",
      'const M =\n  "PID|1||MRN00042^^^H^MR||DOE^JANE||19800101|F|||42 SYNTHETIC ST^^METROPOLIS^NY^10001||555-0100|||||123456789";\n',
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK, no hits/);
  });
});

describe("phi-scan: the escape-decoded view was MEASURED and DECLINED, and stays measured", () => {
  // A sibling widened its recogniser to a second, ESCAPE-DECODED view of a source
  // literal, because a `.ts` file can spell a token through `\x2d` and hide it
  // from a raw text pass. Measured over every file THIS widening newly opens, the
  // decoded view finds nothing the raw view does not, so porting it here would
  // have been a guard with no measurement behind it.
  //
  // THE MEASUREMENT IS PINNED RATHER THAN ASSERTED ONCE. If a source ever lands
  // that does hide a token behind an escape, this reds and tells the next worker
  // to widen. The regexes are deliberately a SECOND COPY of the scanner's floor:
  // a tripwire that imported them would go quiet in exactly the case where the
  // floor itself was narrowed.

  const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
  const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
  const ALLOWED_DOMAINS = new Set(
    readFileSync(join(REPO_ROOT, "scripts", "phi-allow-list.txt"), "utf8")
      .split(/\r?\n/)
      .filter((l) => l.startsWith("EMAILDOMAIN "))
      .map((l) => l.slice("EMAILDOMAIN ".length).trim().toLowerCase()),
  );

  const SIMPLE: Record<string, string> = {
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
    f: "\f",
    "0": "\0",
    "'": "'",
    '"': '"',
    "\\": "\\",
    "`": "`",
  };

  /** The escape-decoded view of a source literal: `\x2d`, `\u002d`, `\r` and friends. */
  function decode(text: string): string {
    return text.replace(
      /\\(u\{[0-9a-fA-F]{1,6}\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[nrtvf0'"\\`])/g,
      (whole, esc: string) => {
        if (esc.startsWith("u") || esc.startsWith("x")) {
          const hex = esc.startsWith("u{") ? esc.slice(2, -1) : esc.slice(1);
          const cp = Number.parseInt(hex, 16);
          return Number.isNaN(cp) ? whole : String.fromCodePoint(cp);
        }
        return SIMPLE[esc] ?? whole;
      },
    );
  }

  function floorTokens(text: string): Set<string> {
    const out = new Set<string>();
    for (const m of text.matchAll(SSN_RE)) out.add(`ssn:${m[0]}`);
    for (const m of text.matchAll(EMAIL_RE)) {
      if (!ALLOWED_DOMAINS.has((m[1] ?? "").toLowerCase())) out.add(`email:${m[0]}`);
    }
    return out;
  }

  /** Exactly what the widened walk opens: tracked, non-`.md`, under the three roots. */
  function walkedCorpus(): string[] {
    return gitOut(REPO_ROOT, ["ls-files", "--", "src", "test", "scripts"])
      .split("\n")
      .filter((p) => p.length > 0 && !p.toLowerCase().endsWith(".md"));
  }

  it("the tripwire can see a difference (negative control on the comparison itself)", () => {
    // Without this, a decode() that silently stopped decoding would make the
    // sweep below pass for the wrong reason, which is the vacuity class this
    // suite has already sprung twice.
    const hidden = 'const s = "123\\x2d45\\u002d6789";';
    expect([...floorTokens(hidden)]).toStrictEqual([]);
    expect([...floorTokens(decode(hidden))]).toStrictEqual([`ssn:${SYNTHETIC_SSN}`]);
  });

  it("the corpus it sweeps is the one the walk opens, and it is not empty", () => {
    const corpus = walkedCorpus();
    expect(corpus.length).toBeGreaterThan(50);
    expect(corpus).toContain("test/scripts/phi-scan.test.ts");
    expect(corpus).toContain("scripts/phi-scan.ts");
    expect(corpus).toContain("src/index.ts");
  });

  it("finds no token the raw view misses, across every file the walk opens", () => {
    const divergent: string[] = [];
    for (const rel of walkedCorpus()) {
      const text = readFileSync(join(REPO_ROOT, rel), "utf8");
      const raw = floorTokens(text);
      const decoded = floorTokens(decode(text));
      for (const t of decoded) if (!raw.has(t)) divergent.push(`${rel}: only decoded: ${t}`);
      for (const t of raw) if (!decoded.has(t)) divergent.push(`${rel}: only raw: ${t}`);
    }
    // A failure here is NOT a defect in this change. It means a source landed
    // that spells a PHI-shaped token through an escape, so the escape-decoded
    // view now earns its place: widen `scanCommonShapes` (in ADDITION to the raw
    // pass, never instead of it) and re-derive this measurement.
    expect(divergent).toStrictEqual([]);
  });
});
