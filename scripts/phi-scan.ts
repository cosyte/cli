#!/usr/bin/env tsx
/**
 * `@cosyte/cli` PHI scanner: the CI / pre-commit half of the PHI commit-gate.
 *
 * ===========================================================================
 * WHAT IS IN THIS FILE, AND WHAT IS NOT.
 *
 * The MACHINERY is `@cosyte/script-utils/phi-scan`, a devDependency: argument
 * parsing, the allow-list and override log, target enumeration on all three
 * routes, the union of the working-tree walk with the bytes git carries,
 * content deduplication, THE COMPLETENESS RULE, every refusal, and the
 * cross-cutting SSN/email FLOOR. Read that module's docblock for what each rule
 * closes and what it costs; nothing is restated here, because a claim written
 * down twice is a claim that drifts.
 *
 * IT IS A DEPENDENCY AND NOT A COPY, AND THAT IS THE POINT. This file used to
 * carry the whole engine, and so did twelve siblings, so a newly-found escape
 * cost one pull request and one adversarial review PER REPO. Now it costs one
 * pull request in `cosyte/config` and a version bump here.
 *
 * WHAT STAYS LOCAL is what genuinely differs: THE FIVE PER-REPO AXES below, and
 * the field detection in `detect` at the bottom of this file.
 *
 * IT IS A devDependency, NEVER A RUNTIME ONE. The zero-third-party rule governs
 * what this package SHIPS, and a dev-time gate does not ship: `dependencies`
 * and `optionalDependencies` are untouched by this file.
 * ===========================================================================
 *
 * ===========================================================================
 * ██  STARTER: READ BEFORE YOU RELY ON THIS  ████████████████████████████████
 * ===========================================================================
 *
 *   As shipped, this scanner detects EXACTLY TWO cross-cutting PHI shapes that
 *   apply to ANY format, both of them from the shared floor:
 *
 *       (1) a dashed Social Security Number
 *       (2) an email at a domain the allow-list does not declare
 *
 *   That is a FLOOR, not a gate. IT UNDERSTANDS NONE OF THE WIRE FORMATS THIS
 *   PACKAGE HANDLES. It will NOT catch a patient name, a date of birth, an MRN
 *   / member id, an address or a phone number sitting in a structured field of
 *   any of them.
 *
 *   ⚠  A scanner that silently ships SSN/email-only detection is a FALSE-
 *      CONFIDENCE RISK: it reports green on fixtures stuffed with real names and
 *      DOBs. Before you trust `pnpm phi-scan` as a real PHI gate here, add
 *      structured, field-level detection in the fenced TODO in `detect` below.
 *
 *   THIS PACKAGE IS NOT A PARSER, AND THAT CHANGES WHAT THE TODO IS ASKING FOR
 *   RATHER THAN EXCUSING IT. There is no single standard to parse: this is the
 *   command-line surface over eight of them, so its corpus is TypeScript
 *   sources carrying inline message literals plus a handful of small fixtures,
 *   today seven of them spanning HL7 v2, X12, ASTM, NCPDP SCRIPT XML, DICOM and
 *   FHIR JSON, the last of which has two.
 *   A structured detector here is therefore per-FIXTURE-FORMAT, not per-repo,
 *   and the worked, spec-aware examples are the sibling parsers' own scanners.
 *
 *   The mechanism for declaring genuinely-synthetic identifiers is the
 *   allow-list (`scripts/phi-allow-list.txt`): a positive, reviewed declaration
 *   that a fixture's identifiers are fake. A whole-file bypass
 *   (`--allow-fixture <path>`) still exists and still needs a logged entry in
 *   `phi-scan-overrides.md`, but it is RECORDED AND REFUSED rather than
 *   honored: it cannot reach exit 0 in any mode.
 *
 *   🛑 A DETECTOR YOU ADD BELOW THAT DOES NOT CONSULT `ctx.allow` HAS NO REMEDY
 *   AT ALL, because the bypass is closed. Check every PHI-bearing field against
 *   the allow-list as you add it, or a developer meeting your detector has
 *   nowhere to go.
 * ===========================================================================
 *
 * ===========================================================================
 * EXIT CONTRACT, DEFINED HERE AND NOT INHERITED:
 *
 *   0  the scan ran, READ EVERY TARGET IT ENUMERATED, and found nothing.
 *   1  HITS. Reserved for "this corpus contains something that looks like PHI".
 *      It is NOT exclusive: an allow-list, or an override log, that EXISTS but
 *      cannot be READ throws a plain `Error` and takes node's own exit 1, which
 *      a caller reads as "hits found". The engine names that escape rather than
 *      claiming to have closed it.
 *   2  EVERY STATE THE ENGINE RAISES IN WHICH THE SCAN CANNOT ACCOUNT FOR
 *      SOMETHING. The full list is in the engine's `run()` docblock.
 *
 * 1 IS RESERVED BECAUSE CI AND THE PRE-COMMIT HOOK BRANCH ON THE CODE. A caller
 * must be able to tell "PHI was found here" from "this scan is not
 * trustworthy". DO NOT PORT THESE NUMBERS INTO, OR OUT OF, A SIBLING. The
 * `@cosyte/*` scanners do not agree on them and are not required to, which is
 * why the engine has no default for them.
 * ===========================================================================
 */

import { runPhiScan, type DetectContext } from "@cosyte/script-utils/phi-scan";

// ===========================================================================
// ██  THE FIVE PER-REPO AXES  ███████████████████████████████████████████████
// ===========================================================================
//
// A PORT IS NOT A COPY. Five things genuinely differ between the sibling
// `@cosyte/*` scanners, and every one of them is a PARAMETER of the shared
// engine rather than a fork of it. Re-derived HERE, against this repository:
//
//   1. EXIT CODES        `EXIT_CODES`. No default exists, deliberately.
//   2. ROOTS+EXCLUSIONS  `SCAN_ROOTS`, `EXCLUDED_PATHS`, and the READ filter.
//   3. `--staged` SCOPE  `isStagedReadable`.
//   4. GITLINKS          `regularBlobModes`, defaulted by the engine to git's
//                        two regular-blob modes. Nothing to set here, and the
//                        default is checked rather than skipped: this
//                        repository tracks no entry at any other mode.
//   5. EOL NORMALIZATION No parameter: the engine's walk/index deduplication is
//                        BY CONTENT, so a repo whose index carries LF and whose
//                        working tree carries CRLF scans BOTH forms. Checked
//                        rather than skipped: this repository commits LF and
//                        has no `.gitattributes`, so the two copies agree and
//                        the union adds no read on a clean checkout.
// ===========================================================================

/** AXIS 1: this repo's exit contract, stated in the header block above. */
const EXIT_CODES = { clean: 0, hits: 1, refuse: 2 } as const;

/**
 * AXIS 2: the roots `all` mode walks. RE-DERIVED FOR THIS REPOSITORY, never
 * ported: `src/`, `test/` and `scripts/` are where this package writes
 * messages.
 *
 * A PLAIN LIST OF REPO-RELATIVE NAMES. It used to be a list of
 * `{ abs, rel }` pairs so that a refusal could name a root that did not
 * currently resolve; the engine derives both, and normalises `src`, `./src`,
 * `src/` and an absolute path to the same root, so the pair has nothing left to
 * carry. NONE OF THESE IS `./`-PREFIXED, and that is checked rather than
 * assumed: a `./`-prefixed root walks correctly while matching no index path,
 * which empties the union and both index refusals in silence.
 *
 * THEY MUST STAY DISJOINT. A root nested inside another (`test/__fixtures__`
 * kept alongside `test`) is walked by both, so the fixture directory was
 * REPLACED by `test` rather than joined by it.
 *
 * WHAT IS DELIBERATELY *NOT* A ROOT, each for a measured reason rather than an
 * omission:
 *   - `vendor/`: `pnpm pack` tarballs. A DEFLATE stream decoded as UTF-8 is not
 *     text this gate can say anything true about, and these are third-party
 *     build artifacts rather than this repository's authored corpus.
 *   - `docs-content/`, `documentation/` and `.changeset/`: almost every tracked
 *     file under them is Markdown, which the read filter skips by design. Not
 *     ALL: `docs-content/sidebars.json` and `.changeset/config.json` are not,
 *     so declaring them would open two files rather than none. They stay out
 *     because two JSON manifests are not where this package writes messages.
 *   - `.github/`: its 8 tracked files were re-measured against the floor here
 *     rather than quoted from an earlier note, and report no hits.
 *   - the repository root: NOT clean, and that is the honest reason rather than
 *     a tidier one. Measured by running this scanner with `SCAN_ROOTS` set to
 *     `["."]`: exit 1, redding on `package.json`, whose `author` field carries
 *     the brand's own contact address at a domain the allow-list does not
 *     declare, and on a `vendor/` tarball, whose DEFLATE bytes decode to an
 *     email shape. So rooting at the repository root would red the gate today
 *     on a value that is correct and on bytes this gate can say nothing true
 *     about. (Neither value is spelled here, for the reason the next paragraph
 *     gives; the `package.json` case is pinned in
 *     `test/scripts/phi-scan.test.ts`.)
 *
 * 🛑 `scripts` IS A ROOT, SO THIS FILE IS UNDER ITS OWN SCAN. An example SSN or
 * a real-looking address written into a comment HERE reds the gate, and a draft
 * banner that spelled one was caught by this gate reporting a hit on itself.
 * NAME A PHI SHAPE, NEVER SPELL A LITERAL. The engine's dashed-SSN branch does
 * consult the allow-list, so a synthetic `ID` may now be declared in the dashed
 * shape without redding the allow-list itself; the shipped list declares its
 * only id in the `MRN-` form, which the floor does not match either way.
 *
 * 🛑 NARROWING THIS IS A SCOPE DECISION AND IT IS THE AXIS MOST LIKELY TO BE
 * WRONG. It was narrower once (`test/__fixtures__` and `src` only) and 89 of
 * this repository's tracked files were opened by NEITHER route, seven of them
 * carrying an inline HL7 `PID|` literal. If you narrow it, measure what the
 * narrowing STOPS reading rather than assuming it stops reading nothing.
 */
const SCAN_ROOTS: readonly string[] = ["src", "test", "scripts"];

/**
 * AXIS 2 (the subtractive half): repo-relative paths NO SWEEPING route reads:
 * not the walk, not the index union, not `--staged`. Paths mode still reads
 * them, which is what keeps naming one directly a hit rather than a silent
 * pass.
 *
 * 🛑 EXCLUDE A LITERAL PATH, NEVER A CLASS. A predicate ("skip binary blobs",
 * "skip generated files") needs no maintenance and quietly grows new members; a
 * sibling measured that a binary-blob predicate would have dropped two of its
 * own hand-written sources, which embed NUL bytes as HMAC domain separators.
 *
 * AN ENTRY HERE IS A FILE THE SWEEP HAS NO VERDICT ABOUT, so each one carries a
 * comment saying why.
 */
const EXCLUDED_PATHS: ReadonlySet<string> = new Set<string>([
  // The scanner's OWN unit test. It must carry violator-shaped values to prove
  // the floor catches them, so it is a deliberate violator source rather than a
  // fixture: sweeping it would report the test's own inputs as findings on
  // every run. Allow-listing those values instead was refused and the reason is
  // the email half: `EMAILDOMAIN` is GLOBAL, so declaring the domain to green
  // this one file would switch the email detector off for the whole corpus,
  // while this file's own positive case asserts that exact address IS reported.
  // It is excluded by literal path so the exclusion is visible in a diff, and
  // it is the ONLY file this repository excludes.
  "test/scripts/phi-scan.test.ts",
]);

/**
 * AXIS 3: the READ half of scope for `--staged`, i.e. which staged blobs a
 * COMMIT is blocked on.
 *
 * IT IS DELIBERATELY NARROWER THAN THE SWEEP, AND THE ASYMMETRY IS THE
 * DECISION. Widening the walk changes what CI sweeps; widening this changes
 * what a COMMIT is BLOCKED on, which is a hook decision taken on its own and
 * declined here three times. So `test/*.ts`, `test/scripts/**` and everything
 * under `scripts/` are swept by `all` mode in CI and enumerated by neither of
 * this predicate's branches. The CI sweep is the cover, and the size of the
 * difference is stated rather than left to be discovered.
 *
 * 🛑 THIS IS NOT `isUnderScanRoot`, AND COLLAPSING THE TWO REOPENS A MEASURED
 * HOLE. The engine's non-regular and non-blob refusals key on the ROOT half of
 * scope, never on this read filter, so a staged symbolic link under `test/` or
 * `scripts/` is refused even though this predicate would not read a FILE there.
 * A link's name is no evidence about what is on the other side of it.
 *
 * THE TWO BARE ROOT NAMES ARE KEPT AS READ SCOPE, NOT AS THE MECHANISM. Git
 * records no index entry for a directory, so an index entry at exactly `src` or
 * `test/__fixtures__` is that root replaced by something else; the engine
 * refuses the link and gitlink cases through `isUnderScanRoot`, which covers
 * them whatever this predicate says. What is left for them here is the blob
 * case, which no refusal covers and which this route can simply read.
 *
 * ⚖️ EVERY PATH THIS ADMITS IS INSIDE `SCAN_ROOTS`, and that containment is
 * checked rather than assumed: `test/__fixtures__` and its contents are under
 * the `test` root, `src` is a root, and `src/**.ts` is under it. The engine
 * REFUSES a staged path this admits and no scan root covers, rather than
 * silently narrowing to the intersection, because that state is a
 * misconfiguration in the one place the gate blocks a commit.
 */
function isStagedReadable(relPath: string): boolean {
  if (relPath === "test/__fixtures__" || relPath.startsWith("test/__fixtures__/")) return true;
  if (relPath === "src") return true;
  return relPath.startsWith("src/") && relPath.endsWith(".ts");
}

/**
 * The field-level detection the shared engine deliberately does not own,
 * because it differs per repository.
 *
 * The engine has already run the cross-cutting floor (SSN + email shapes) over
 * `ctx.text` and reported any hits against the correct locus. Everything below
 * is this repository's.
 *
 * @param ctx The target's text and bytes, the parsed allow-list, and `hit`.
 */
function detect(ctx: DetectContext): void {
  // ── TODO: add structured, field-level PHI detection here ───────────────────
  //
  //   The floor ONLY catches SSN/email shapes. Before you rely on this scanner
  //   as a real safety gate, add structured, field-level detection (at minimum:
  //   person NAMES, DATE OF BIRTH, MRN / MEMBER ID, ADDRESS and PHONE) and
  //   check every PHI-bearing field against the allow-list (`ctx.allow.names` /
  //   `.dobs` / `.ids`), raising a hit for anything not positively declared
  //   synthetic.
  //
  //   WHAT THAT MEANS HERE IS NOT WHAT IT MEANS IN A PARSER, and the difference
  //   is why this section is still empty rather than half-done. A parser has
  //   ONE wire format to parse. This package has none of its own: its corpus is
  //   TypeScript carrying inline message literals, plus small fixtures in HL7
  //   v2, X12, ASTM, NCPDP SCRIPT XML, FHIR JSON and DICOM. So a detector here
  //   dispatches on the fixture's format first and then parses it properly
  //   (delimiters / segments / elements / tags). Do NOT bolt on a blind text
  //   regex for names: coded values (`CBC^Complete Blood Count`, `Boston^MA`)
  //   produce false confidence. The sibling parsers' scanners are the worked,
  //   spec-aware examples to adapt:
  //
  //     for (const record of splitRecords(ctx.text)) {
  //       // check name / dob / id / address / phone fields against ctx.allow
  //       // ctx.hit({ segment: "<field>", value, reason: "<why>" });
  //     }
  //
  //   🛑 CHECK `ctx.allow` IN EVERY DETECTOR YOU ADD. The `--allow-fixture`
  //   bypass cannot reach a clean run, so a detector that consults nothing
  //   leaves a developer with a hit they cannot answer and a gate they will
  //   route around.
  //
  //   Until this section is implemented, treat a green `pnpm phi-scan` as
  //   "no SSN/email shapes found", NOT as "no PHI".
  //
  //   Raise hits through `ctx.hit`, which fills in the locus. Never build a
  //   path yourself: the index union scans bytes that may not be the ones on
  //   disk, and a hit naming an undecorated path a developer then opens and
  //   finds clean is its own defect.
  // ───────────────────────────────────────────────────────────────────────────
  void ctx;
}

process.exit(
  runPhiScan({
    exitCodes: EXIT_CODES,
    scanRoots: SCAN_ROOTS,
    excludedPaths: EXCLUDED_PATHS,
    isStagedReadable,
    detect,
    // `isWalkReadable` is deliberately NOT set: the engine's default is the
    // shared Markdown exemption, which is the boundary this repository already
    // had, so if it ever moves it moves for every repo at once through a
    // version bump. Override it here only with a measured reason written down
    // beside the override.
  }),
);
