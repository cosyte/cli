#!/usr/bin/env tsx
/**
 * `@cosyte/cli` PHI scanner: the CI / pre-commit half of the PHI commit-gate.
 *
 * Pure Node. Zero runtime deps. `git` is the only subprocess, always via
 * `execFileSync` with array args (never shell-form). Walks the synthetic test
 * fixtures (and a conservative text pass over `src/`) and REFUSES anything that
 * looks like real PHI, so a developer cannot commit a real-looking fixture by
 * accident.
 *
 * ===========================================================================
 * ██  STARTER: READ BEFORE YOU RELY ON THIS  ████████████████████████████████
 * ===========================================================================
 *
 *   This file is the SHARED MACHINERY only. As shipped it detects EXACTLY TWO
 *   cross-cutting PHI shapes that apply to ANY format:
 *
 *       (1) a dashed Social Security Number   (\d{3}-\d{2}-\d{4})
 *       (2) an email at a non-test domain
 *
 *   That is a FLOOR, not a gate. It does NOT understand CLI. It will NOT
 *   catch a patient name, a date of birth, an MRN / member id, an address, or a
 *   phone number sitting in a structured CLI field: the PHI that a real
 *   CLI message actually carries.
 *
 *   ⚠  A scanner that silently ships SSN/email-only detection is a FALSE-
 *      CONFIDENCE RISK: it reports green on fixtures stuffed with real names and
 *      DOBs. Before you trust `pnpm phi-scan` as a safety gate for CLI,
 *      YOU MUST add structured, field-level detection for THIS standard's PHI
 *      (names, DOB, MRN / member id, address, phone) in the clearly-fenced
 *      TODO section inside `scanTarget` below.
 *
 *   Worked examples of structured, format-aware detection live in the sibling
 *   parsers: read one before you start:
 *       ../hl7/scripts/phi-scan.ts     (segment → field → component aware)
 *       ../x12/scripts/phi-scan.ts     (ISA-delimited NM1 / DMG / PER aware)
 *       ../dicom/scripts/phi-scan.ts   (binary tag-aware)
 *       ../ccda/scripts/phi-scan.ts    (XML element aware)
 *       ../ncpdp/scripts/phi-scan.ts   (fixed-field aware)
 *
 *   The mechanism for declaring genuinely-synthetic identifiers is the
 *   allow-list (`scripts/phi-allow-list.txt`): a positive declaration that a
 *   fixture's identifiers are fake. Byte-strict formats cannot carry an inline
 *   `# synthetic: true` header, so the allow-list is the proven substitute
 *   (same approach every sibling uses). A whole-file bypass needs
 *   `--allow-fixture <path>` AND a logged entry in `phi-scan-overrides.md`.
 * ===========================================================================
 *
 * Modes:
 *   --staged                 - scan only files staged in `git diff --cached`
 *   --allow-fixture <path>   - bypass one path; rejected unless logged in
 *                              phi-scan-overrides.md
 *   <path> [<path>...]       - scan specific paths
 *   (no args)                - scan all in-scope working-tree files
 *
 * Exit codes: 0 (clean), 1 (hits found), 2 (invocation error).
 *
 * ===========================================================================
 * AN IN-SCOPE ENTRY THAT IS NOT A REGULAR FILE REFUSES THE SCAN (exit 2). It is
 * never silently skipped, because BOTH enumerating routes are blind to it in a
 * way that reads as clean:
 *
 *   - the walk enumerates `Dirent.isFile()`, which is an lstat answer, so a
 *     symbolic link is neither a file nor a directory and used to fall out of
 *     the loop silently, whatever it pointed at. `isDirectory()` answers false
 *     for a LINKED DIRECTORY too, so a whole subtree vanished the same way;
 *   - `--staged` reads content with `git show :<path>`, and git stores a
 *     symbolic link as its TARGET PATH under mode 120000, so that route is
 *     handed the path text and never the target's bytes.
 *
 * Neither route is made to follow such an entry: following would read bytes the
 * enumeration does not control (outside the repo, a loop, a device, a FIFO that
 * blocks the gate forever), and git does not carry those bytes anyway, so a hit
 * on them would be a claim about something no commit contains. Refusing states
 * the only true thing available: there is an entry here the scan cannot account
 * for, so the scan is not clean.
 *
 * ▶ THE PRE-COMMIT HOLE THAT MADE THIS URGENT WAS RENAME DETECTION, AND IT IS
 * NOT LIMITED TO LINKS. `R` and `C` are returned by neither `--diff-filter=AM`
 * nor `AMT`, so ANY `git mv` into a scan root vanished from the `--staged` list
 * entirely: a link (measured: `:120000 120000 <sha> <sha> R100`, index mode
 * 120000, exit 0) and equally an ordinary regular file whose contents this
 * scanner's own floor would have caught (measured: `:100644 100644 <sha> <sha>
 * R100`, exit 0). `--no-renames` is the whole remedy. It costs the record stride
 * nothing: the destination arrives as a single-path `A` and the source as a `D`
 * the filter drops, so the enumeration is a strict SUPERSET of the previous one.
 * `git mv` is an ordinary developer action, not crafted input, and the
 * pre-commit hook (`pnpm phi-scan --staged`) is the gate it walked through.
 *
 * "IN SCOPE" IS A NARROWER THING THAN THE PATH PREFIX, AND THE EXACT BOUNDARY IS
 * WORTH STATING RATHER THAN LEAVING TO BE INFERRED, BECAUSE THE GAP BETWEEN THE
 * TWO IS WHERE THIS DEFECT LIVED. The walk covers everything under
 * `test/__fixtures__/` and `src/` except a gitignored entry (the same rule that
 * already excludes a gitignored fixture, so links do not get a second, stricter
 * boundary of their own) and except a `.md` file. `--staged` covers
 * `test/__fixtures__` and everything under it, plus `src` and the `.ts` files
 * under it, restricted to the staged records git reports as ADDED, MODIFIED or
 * TYPECHANGED.
 *
 * Three boundary facts, each measured on this repo rather than inferred, and
 * each admitting MORE than before rather than less:
 *
 *   1. rename detection is off, so a rename destination arrives as an ordinary
 *      add instead of vanishing with its two-path record;
 *   2. `T` (TYPECHANGE) is in the filter. Replacing a TRACKED regular fixture
 *      with a link is neither an add nor a modify (`:100644 120000 <sha> <sha>
 *      T`), so `AM` deleted the record before any mode could be read;
 *   3. each scan root's OWN path is in scope as well as its contents. An index
 *      entry at exactly `test/__fixtures__` or `src` is never a directory, since
 *      git records no entry for one, so it is the corpus root replaced by a blob
 *      or a link, and a prefix test requiring the trailing slash let it through.
 *
 * TWO THINGS THIS ROUTE STILL DOES NOT ENUMERATE, STATED BECAUSE INFERRING THEM
 * FROM THE PREFIX WOULD BE WRONG, both PRE-EXISTING and neither closed here:
 *
 *   - `D` (a deletion has no staged blob to scan) and `U` (an unmerged path has
 *     no single one). The `U` half costs nothing that can reach a commit:
 *     measured here, `git commit` with an unmerged index REFUSES outright
 *     ("Committing is not possible because you have unmerged files", exit 128),
 *     so no `U` entry has ever been one `git commit` away from landing. It is
 *     `git add` on the resolved path that stages it, and that arrives as `M`.
 *   - under `src/`, only `.ts` files. The all-mode walk covers every non-`.md`
 *     file under `src/`, so the two routes disagree there, and the all-mode
 *     sweep in CI is what covers the difference. Widening the staged half is a
 *     scope decision and is deliberately not taken here.
 *
 * A refusal names the entry's own repo-relative path and an engine-owned token
 * for its kind. IT NEVER REPORTS THE LINK TARGET, which is text off the working
 * tree and can itself carry PHI: a target path of the shape
 * `../patients/<surname>-<given>-<dob>.txt` is the whole reason. The shape is
 * written out rather than an example, because a diagnostic ABOUT a PHI leak is
 * itself a PHI surface, and that applies to the prose explaining it too.
 *
 * The entry's OWN name is a different matter and is printed deliberately, but it
 * is a new line on a channel that used to print nothing for a link, so say what
 * it is: it is the same locus every hit already carries, it is a path a developer
 * chose and git would record in a commit, and a refusal that will not say WHICH
 * entry it means cannot be acted on. Nothing from the other side of the link
 * joins it.
 *
 * KNOWN AND NOT CLOSED HERE, in the all-mode route only: with a scan root that
 * is a DANGLING link, `existsSync` follows it, answers false, and the walk
 * reports clean over a corpus it never opened. That needs a
 * refuse-a-scan-that-observed-nothing rule, which is its own slice. The
 * `--staged` half of that same shape IS closed, by fact 3 above.
 * ===========================================================================
 */

import { readFileSync, statSync, existsSync, readdirSync, type Dirent } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, sep, isAbsolute } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const ALLOW_LIST_PATH = join(REPO_ROOT, "scripts", "phi-allow-list.txt");
const OVERRIDE_LOG_PATH = join(REPO_ROOT, "phi-scan-overrides.md");

// Roots walked in "all" mode. test/__fixtures__ gets the full scan (the real
// fixture dir this repo uses); src gets the same conservative shape pass because
// it is hand-written code, not data: JSDoc `@example` snippets must not carry
// real PHI either.
const FIXTURE_ROOT = join(REPO_ROOT, "test", "__fixtures__");
const SRC_ROOT = join(REPO_ROOT, "src");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Hit {
  path: string;
  segment: string; // locator (e.g. "(ssn)" / "(email)" or your field id)
  value: string;
  reason: string;
}

interface AllowList {
  /**
   * Uppercase synthetic person-name tokens. UNUSED by the starter floor: the
   * structured name detector you add in the TODO section consumes these.
   */
  names: Set<string>;
  /**
   * Synthetic dates of birth (raw, format-normalized as you choose). UNUSED by
   * the starter floor: your structured DOB detector consumes these.
   */
  dobs: Set<string>;
  /**
   * Synthetic id values (SSN / MRN / member-id shapes). UNUSED by the starter
   * floor: your structured id detector consumes these.
   */
  ids: Set<string>;
  /** Allowed email domains (anything else is a hit). Used by the starter floor. */
  emailDomains: Set<string>;
}

interface Args {
  mode: "all" | "staged" | "paths";
  paths: string[];
  allowFixtures: string[];
}

class InvocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvocationError";
  }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Args {
  let staged = false;
  const paths: string[] = [];
  const allowFixtures: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--") {
      for (let j = i + 1; j < argv.length; j += 1) {
        const v = argv[j];
        if (v !== undefined) paths.push(v);
      }
      break;
    } else if (a === "--staged") {
      staged = true;
      i += 1;
    } else if (a === "--allow-fixture") {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new InvocationError("--allow-fixture requires a path argument");
      }
      allowFixtures.push(next);
      i += 2;
    } else if (a !== undefined && a.startsWith("--")) {
      throw new InvocationError(`Unknown flag: ${a}`);
    } else if (a !== undefined) {
      paths.push(a);
      i += 1;
    } else {
      i += 1;
    }
  }

  if (staged && paths.length > 0) {
    throw new InvocationError("--staged cannot be combined with positional paths");
  }

  // An `--allow-fixture` path is a *subtractive* acknowledgement on a broader
  // scan, never a scan target on its own, so it also seeds the positional path
  // set. That makes `--allow-fixture X` mean "scan X, but allow it" (proving the
  // override gate actually subtracts a scanned target) instead of a silent no-op.
  const scanPaths = paths.length > 0 ? paths : [...allowFixtures];

  let mode: Args["mode"];
  if (staged) {
    mode = "staged";
  } else if (scanPaths.length > 0) {
    mode = "paths";
  } else {
    mode = "all";
  }
  return { mode, paths: scanPaths, allowFixtures };
}

// ---------------------------------------------------------------------------
// Allow-list + override log
// ---------------------------------------------------------------------------

function loadAllowList(): AllowList {
  if (!existsSync(ALLOW_LIST_PATH)) {
    throw new InvocationError(`allow-list not found at ${ALLOW_LIST_PATH}`);
  }
  // `existsSync` is not "readable": a present-but-unreadable allow-list would
  // otherwise throw a raw fs error past every handler and exit 1.
  let raw: string;
  try {
    raw = readFileSync(ALLOW_LIST_PATH, "utf8");
  } catch (err) {
    throw new InvocationError(
      `could not read the allow-list at ${ALLOW_LIST_PATH}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  const names = new Set<string>();
  const dobs = new Set<string>();
  const ids = new Set<string>();
  const emailDomains = new Set<string>();
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const sp = line.indexOf(" ");
    if (sp < 0) continue;
    const tag = line.slice(0, sp);
    const value = line.slice(sp + 1).trim();
    if (value.length === 0) continue;
    switch (tag) {
      case "NAME":
        names.add(value.toUpperCase());
        break;
      case "DOB":
        dobs.add(value);
        break;
      case "ID":
        ids.add(value.toUpperCase());
        break;
      case "EMAILDOMAIN":
        emailDomains.add(value.toLowerCase());
        break;
      default:
        break;
    }
  }
  return { names, dobs, ids, emailDomains };
}

function normalizePath(p: string): string {
  const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
  const rel = relative(REPO_ROOT, abs);
  return rel.split(sep).join("/");
}

function loadOverrideLog(): Set<string> {
  if (!existsSync(OVERRIDE_LOG_PATH)) return new Set();
  const raw = readFileSync(OVERRIDE_LOG_PATH, "utf8");
  const out = new Set<string>();
  for (const lineRaw of raw.split(/\r?\n/)) {
    const m = /^###\s+(.+?)\s*$/.exec(lineRaw);
    if (m && m[1] !== undefined) out.add(normalizePath(m[1]));
  }
  return out;
}

function validateAllowFixtures(allowFixtures: string[]): void {
  if (allowFixtures.length === 0) return;
  const overrides = loadOverrideLog();
  const missing = allowFixtures.map(normalizePath).filter((p) => !overrides.has(p));
  if (missing.length > 0) {
    const lines = missing.map((p) => `  - ${p}`).join("\n");
    throw new InvocationError(
      `--allow-fixture rejected: no matching entry in phi-scan-overrides.md for:\n${lines}\n` +
        `Add a "### <path>" subsection to phi-scan-overrides.md and commit it.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Target enumeration
// ---------------------------------------------------------------------------

interface Target {
  path: string; // forward-slash repo-relative path for reporting
  read: () => Buffer;
}

/**
 * An entry the enumeration reached but cannot scan. Both fields are safe to
 * print: `path` is the entry's own repo-relative path (the same locus every hit
 * already carries) and `kind` is a token from the closed set below. Nothing off
 * the other side of a link is ever recorded here.
 */
interface Unscannable {
  path: string;
  kind: string;
}

/** Closed-set, engine-owned description of a directory entry's kind. */
function direntKind(e: Dirent): string {
  if (e.isSymbolicLink()) return "a symbolic link";
  if (e.isFIFO()) return "a FIFO";
  if (e.isSocket()) return "a socket";
  if (e.isBlockDevice()) return "a block device";
  if (e.isCharacterDevice()) return "a character device";
  return "not a regular file";
}

/**
 * Enumerate a scan root. `Dirent`'s predicates are lstat answers and are not
 * exhaustive: an entry that is neither a directory nor a regular file is
 * collected into `unscannable` rather than dropped, so the caller can refuse
 * instead of reporting clean over it.
 */
function walk(dir: string, out: string[], unscannable: Unscannable[]): void {
  if (!existsSync(dir)) return;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    // A root this scan cannot read is an INVOCATION failure (exit 2), never a
    // clean run and never exit 1: `1` means "hits found", and reporting "no
    // PHI" over a directory nobody opened is the reading this must not produce.
    throw new InvocationError(
      `could not read ${normalizePath(dir)}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out, unscannable);
    } else if (e.isFile()) {
      // README/markdown docs may legitimately describe violator values; they
      // are documentation, not fixtures.
      if (e.name.toLowerCase().endsWith(".md")) continue;
      out.push(full);
    } else {
      // Deliberately NOT subject to the `.md` exemption above. That exemption is
      // a judgement about a file whose bytes the walk could have read; a link's
      // name is no evidence at all about what is on the other side of it.
      unscannable.push({ path: normalizePath(full), kind: direntKind(e) });
    }
  }
}

/**
 * Refuse (exit 2) over entries the enumeration reached and cannot scan. EVERY
 * offender is named, not just the first: a developer who has to re-run the gate
 * once per link learns to distrust it.
 */
function refuseUnscannable(entries: Unscannable[], why: string, remedy: string): void {
  if (entries.length === 0) return;
  const lines = entries.map((u) => `  - ${u.path} (${u.kind})`).join("\n");
  const noun =
    entries.length === 1 ? "entry is not a regular file" : "entries are not regular files";
  throw new InvocationError(
    `refusing the scan: ${String(entries.length)} ${noun}:\n${lines}\n${why} ${remedy}`,
  );
}

function gitIgnored(paths: string[]): Set<string> {
  const ignored = new Set<string>();
  if (paths.length === 0) return ignored;
  try {
    // SECURITY: array-form execFileSync, no shell. Default (Buffer) encoding, because
    // `encoding: "buffer"` with `input` is rejected by Node.
    const out = execFileSync("git", ["check-ignore", "--stdin", "-z"], {
      input: paths.map(normalizePath).join("\0"),
      stdio: ["pipe", "pipe", "ignore"],
    });
    for (const p of out.toString("utf8").split("\0")) {
      if (p.length > 0) ignored.add(p);
    }
  } catch {
    // `git check-ignore` exits 1 when nothing matches: treat as none ignored.
  }
  return ignored;
}

function buildTargetsForAll(): Target[] {
  const files: string[] = [];
  const unscannable: Unscannable[] = [];
  walk(FIXTURE_ROOT, files, unscannable);
  walk(SRC_ROOT, files, unscannable);

  // One `git check-ignore` over both lists. An ignored entry is already out of
  // scope for the file route, so applying the same rule to a link keeps a single
  // boundary rather than inventing a second, stricter one for links alone.
  const ignored = gitIgnored([...files.map(normalizePath), ...unscannable.map((u) => u.path)]);

  refuseUnscannable(
    unscannable.filter((u) => !ignored.has(u.path)),
    "The walk can neither read such an entry nor vouch for what is on the other side of it.",
    "Remove it, replace it with a regular file, or (if it is genuinely not part of the " +
      "corpus) untrack it and add it to .gitignore.",
  );

  return files
    .filter((abs) => !ignored.has(normalizePath(abs)))
    .map((abs) => ({ path: normalizePath(abs), read: () => readFileSync(abs) }));
}

function buildTargetsForPaths(paths: string[]): Target[] {
  return paths.map((p) => {
    const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
    if (!existsSync(abs)) throw new InvocationError(`File not found: ${p}`);
    if (!statSync(abs).isFile()) throw new InvocationError(`Not a regular file: ${p}`);
    return { path: normalizePath(abs), read: () => readFileSync(abs) };
  });
}

/** git's file modes for a regular blob. Every other mode is not a file to read. */
const REGULAR_BLOB_MODES = new Set(["100644", "100755"]);

/** Closed-set, engine-owned description of a git file mode. */
function gitModeKind(mode: string): string {
  if (mode === "120000") return "a symbolic link";
  if (mode === "160000") return "a gitlink (a nested repository)";
  return `a git mode-${mode} entry`;
}

/** `:<srcmode> <dstmode> <srcsha> <dstsha> <status>` - the info half of a `--raw -z` record. */
const RAW_RECORD = /^:(?:\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ [A-Z]\d*$/;

/**
 * The staged route's scope. Each root's OWN path counts as well as its contents:
 * git records no index entry for a directory, so an entry at exactly
 * `test/__fixtures__` or `src` is that root replaced by a blob or a link.
 */
function isStagedInScope(path: string): boolean {
  if (path === "test/__fixtures__" || path.startsWith("test/__fixtures__/")) return true;
  if (path === "src") return true;
  return path.startsWith("src/") && path.endsWith(".ts");
}

function buildTargetsForStaged(): Target[] {
  let listBuf: Buffer;
  try {
    // SECURITY: array-form execFileSync, no shell.
    //
    // `--raw` rather than `--name-only` because the DESTINATION MODE is the only
    // thing this route can read a non-regular entry off. `git show :<path>` does
    // not stand in for it: for a symbolic link it answers the target path as if
    // it were content, and it is the mode, not the answer, that says so.
    //
    // `--no-renames` IS THE ONE THAT CLOSED THE PRE-COMMIT HOLE, AND THE STATUS
    // FILTER ALONE WAS NOT ENOUGH. Rename detection is on by default (and
    // `diff.renames` can turn copy detection on too), so `git mv <path>` into a
    // scan root stages as a TWO-PATH `R100` record, which `--diff-filter` then
    // deletes outright because `R` and `C` are in neither `AM` nor `AMT`.
    // Measured on this repo, both shapes exiting 0 through the pre-commit hook:
    // a link (`:120000 120000 <sha> <sha> R100`, index mode 120000) and an
    // ordinary regular file carrying a value this scanner's own floor catches
    // (`:100644 100644 <sha> <sha> R100`). With detection off the destination
    // arrives as a single-path `A` (`:000000 120000 0000000 <sha> A`) and the
    // source as a `D` the filter drops, so the enumeration is a strict SUPERSET
    // of the previous one and the two-field stride below is untouched. It also
    // makes that stride STRUCTURAL rather than conditional: with detection off,
    // no `R` or `C` record can be produced whatever the caller's `diff.renames`
    // setting is. Verified under `diff.renames` set to `true`, `copies`, `false`
    // and `1`, and under `diff.renameLimit=1`.
    //
    // `T` (TYPECHANGE) IS IN THE FILTER, AND LEAVING IT OUT MADE THE MODE CHECK
    // BELOW UNREACHABLE WHENEVER THE FIXTURE WAS ALREADY TRACKED. Replacing a
    // TRACKED regular file with a link is not an add and not a modify: git
    // raises it as `T` (`:100644 120000 <sha> <sha> T`), so `--diff-filter=AM`
    // deleted the record before any mode could be read and the pre-commit hook
    // passed the link green. Typechange carries a single path, exactly like `A`
    // and `M`, so admitting it costs the stride nothing, and the reverse
    // typechange (a link replaced by a real file) is now scanned as the file it
    // became.
    listBuf = execFileSync(
      "git",
      ["diff", "--cached", "--raw", "-z", "--no-renames", "--diff-filter=AMT"],
      { encoding: "buffer", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    throw new InvocationError(
      `git diff --cached failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // `--raw -z` emits `<info>\0<path>\0` per record. `R` (rename) and `C` (copy)
  // are the only statuses carrying a SECOND path, and `--no-renames` above means
  // git cannot emit either, so the stride is two fields. The regex still admits a
  // score-suffixed status: if one ever reached here the stride would desync and
  // the next record would fail to parse, which REFUSES - the same outcome as any
  // other unparseable record, and the safe one. A record that does not parse
  // REFUSES rather than being skipped: a silently shortened list is exactly the
  // shape this scan must never report clean over.
  const fields = listBuf.toString("utf8").split("\0");
  const staged: { path: string; mode: string }[] = [];
  let i = 0;
  while (i < fields.length) {
    const info = fields[i];
    if (info === undefined || info.length === 0) {
      i += 1;
      continue;
    }
    const m = RAW_RECORD.exec(info);
    const mode = m?.[1];
    const path = fields[i + 1];
    if (mode === undefined || path === undefined || path.length === 0) {
      throw new InvocationError(
        "could not read the output of `git diff --cached --raw -z`: unrecognized record. " +
          "Refusing rather than scanning a list that may be short.",
      );
    }
    staged.push({ path, mode });
    i += 2;
  }

  const inScope = staged.filter((s) => isStagedInScope(s.path));

  refuseUnscannable(
    inScope
      .filter((s) => !REGULAR_BLOB_MODES.has(s.mode))
      .map((s) => ({ path: s.path, kind: gitModeKind(s.mode) })),
    // Deliberately says what the INDEX holds, not what `git show` would answer:
    // `git show :<path>` answers a symbolic link with its target path as though
    // that were content, but for a gitlink it fails outright (`fatal: bad
    // object`), so a sentence about `git show` would be false for every mode
    // here except 120000.
    "The index records such an entry by reference rather than as file content, so nothing " +
      "readable through it would be evidence about what it names.",
    "Unstage it, or replace it with a regular file.",
  );

  return inScope.map(({ path: relPath }) => ({
    path: relPath,
    // SECURITY: array-form execFileSync, no shell. `:<path>` is a git pathspec.
    read: (): Buffer =>
      execFileSync("git", ["show", `:${relPath}`], {
        encoding: "buffer",
        stdio: ["ignore", "pipe", "pipe"],
      }),
  }));
}

// ---------------------------------------------------------------------------
// Cross-cutting shape checks: the format-agnostic FLOOR
// ---------------------------------------------------------------------------

function scanCommonShapes(path: string, content: string, allow: AllowList, hits: Hit[]): void {
  // Dashed SSN anywhere (a dashed \d{3}-\d{2}-\d{4} is always a hit).
  for (const m of content.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g)) {
    hits.push({ path, segment: "(ssn)", value: m[0], reason: "dashed SSN pattern" });
  }
  // Emails whose domain is not an allow-listed reserved / test domain.
  for (const m of content.matchAll(/\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g)) {
    const domain = (m[1] ?? "").toLowerCase();
    if (!allow.emailDomains.has(domain)) {
      hits.push({ path, segment: "(email)", value: m[0], reason: "email with non-test domain" });
    }
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function scanTarget(target: Target, allow: AllowList, hits: Hit[]): void {
  let buf: Buffer;
  try {
    buf = target.read();
  } catch (err) {
    throw new InvocationError(
      `could not read ${target.path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const text = buf.toString("utf8");

  // The format-agnostic floor: dashed SSN + non-test email. This runs on every
  // target and is all the starter detects.
  scanCommonShapes(target.path, text, allow, hits);

  // ── TODO: add CLI-specific structured field-level PHI detection here ──
  //
  //   The floor above ONLY catches SSN/email shapes. Before you rely on this
  //   scanner as a real safety gate you MUST add structured, field-level
  //   detection for CLI's PHI (at minimum: person NAMES, DATE OF BIRTH,
  //   MRN / MEMBER ID, ADDRESS, and PHONE), parsing `text` according to the
  //   CLI wire format and checking each PHI-bearing field against the
  //   allow-list (`allow.names` / `allow.dobs` / `allow.ids`), pushing a `Hit`
  //   for anything not positively declared synthetic.
  //
  //   Parse the format properly (delimiters / segments / elements / tags): do
  //   NOT bolt on a blind text regex for names: coded values (`CBC^Complete
  //   Blood Count`, `Boston^MA`) produce false confidence. See the sibling
  //   parsers named in the STARTER banner at the top of this file for worked,
  //   spec-aware examples you can adapt:
  //
  //     const d = detectCLIDelimiters(text);          // if applicable
  //     for (const record of splitCLI(text, d)) {
  //       // check name / dob / id / address / phone fields against `allow`
  //       // hits.push({ path: target.path, segment: "<field>", value, reason });
  //     }
  //
  //   Until this section is implemented, treat a green `pnpm phi-scan` as
  //   "no SSN/email shapes found", NOT as "no PHI".
  // ───────────────────────────────────────────────────────────────────────────
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(hits: Hit[]): void {
  if (hits.length === 0) {
    process.stdout.write("[phi-scan] OK, no hits\n");
    return;
  }
  const byPath = new Map<string, Hit[]>();
  for (const h of hits) {
    const arr = byPath.get(h.path);
    if (arr) arr.push(h);
    else byPath.set(h.path, [h]);
  }
  for (const [path, group] of byPath) {
    process.stderr.write(`[phi-scan] HIT: ${path}\n`);
    for (const h of group) {
      process.stderr.write(
        `  segment=${h.segment} value=${JSON.stringify(h.value)} (${h.reason})\n`,
      );
    }
  }
  process.stderr.write(
    `[phi-scan] ${String(hits.length)} hit(s) across ${String(byPath.size)} file(s). ` +
      `If a value is genuinely synthetic, declare it in scripts/phi-allow-list.txt OR ` +
      `run with --allow-fixture <path> AND log it in phi-scan-overrides.md.\n`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
    validateAllowFixtures(args.allowFixtures);
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  // Loading the allow-list is an INVOCATION step, so its failure is exit 2. It
  // used to sit outside every `catch` here: a missing or unreadable allow-list
  // threw an uncaught `InvocationError`, which node reports with a stack trace
  // and exit 1 - and `1` is this contract's code for "hits found". A caller
  // branching on the exit code read a broken invocation as a PHI finding, and a
  // caller branching on "not 0" read it as the gate working. Neither is true.
  let allow: AllowList;
  try {
    allow = loadAllowList();
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }
  const allowed = new Set<string>(args.allowFixtures.map(normalizePath));

  let targets: Target[];
  try {
    if (args.mode === "staged") targets = buildTargetsForStaged();
    else if (args.mode === "paths") targets = buildTargetsForPaths(args.paths);
    else targets = buildTargetsForAll();
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  targets = targets.filter((t) => !allowed.has(t.path));

  const hits: Hit[] = [];
  for (const t of targets) {
    try {
      scanTarget(t, allow, hits);
    } catch (err) {
      if (err instanceof InvocationError) {
        process.stderr.write(`[phi-scan] ${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  report(hits);
  return hits.length === 0 ? 0 : 1;
}

process.exit(main());
