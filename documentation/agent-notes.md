# @cosyte/cli: agent notes

**This is the narrative half of `CLAUDE.md`.** On 2026-08-04 that file was 51,276 bytes and it is
always-read by every worker that `cd`s into this repo, so the per-incident write-ups, the
shipped-phase histories and the long rationales were relocated here **verbatim**, under headings
that match where they lived. Nothing was deleted, softened, or summarised on the way over.

`CLAUDE.md` keeps the cursor, the rules, and **every** trap, each compressed to a one-line
imperative that links back to its section here. That is the contract between the two files: if a
line there tells you not to do something and you do not understand why, the reason is here, and
**"I did not read the reason" is not a licence to discount the rule.**

Governed by the meta-repo's `documentation/decisions/0023-doc-budgets.md`, amendment of 2026-08-04,
which bounds `<submodule>/CLAUDE.md` and names `<repo>/documentation/agent-notes.md` as the
relocation target. **Read the bound off `REPO_CLAUDE` in `.claude/hooks/doc-budget.mjs`, never off a
number written down here.** The mechanism is a per-repo ratchet that is LOWERED as relocations land,
and the first number quoted for it went stale within a day, which is the same defect this whole
audit exists to fix. That amendment's own warning is the one that binds here:
_"These files are where the traps that cost a defect to learn are written down. Relocate the
narrative; keep the cursor, the rule, and every trap."_

---

## Status

The per-incident sections below were the bulk of `CLAUDE.md`'s `## Status` list. Each is reproduced
exactly as it stood, including its leading `- ` bullet.

### The docs sidebar and the IA spine

- **▶ `docs-content/sidebars.json` IS BOUND BY AN IA SPINE THAT NOTHING IN THIS REPO CHECKS, AND
  BREAKING IT STOPS THE WHOLE DOCS SITE DEPLOYING.** This package shipped two off-spine top-level
  categories, **"MCP server"** and **"Reference"**. The docs site lints the sidebar out of each
  package's released `docs-content.tar.gz`, and in strict mode a non-canonical top-level label is an
  **error**, so `cli` was one of two packages holding a site that had not deployed for four days.
  It was pre-existing and masked: every build died earlier, on memory, before reaching the gate.
  **The canonical top-level order is `Overview` (the `intro` DOC REFERENCE, not a category),
  `Installation`, `Quickstart`, `Core Concepts`, `Guides`, `API Reference`, `Troubleshooting`.**
  Categories are OPTIONAL; the rule is that whatever you have is labelled and ordered canonically, so
  `{"docs":["intro"]}` is fully compliant. `mcp` and `reference-commands` now sit under **Guides**,
  `limitations` under **Troubleshooting** (the spine's item 7 explicitly houses "Known Limitations",
  and `mllp`/`astm`/`deid` all keep it there; `synth` is the lone counter-example, so do not copy
  `synth` here); nothing was orphaned.
  **🔴 NEVER AUTHOR AN `API Reference` CATEGORY.** It is injected by the docs site when the package
  ships API sources, and a hand-authored one is a distinct, harder **error** than the off-spine
  label it would be replacing. Renaming "Reference" to "API Reference" trades one failing check for
  another.
  **▶ AND DO NOT REPEAT THE CLAIM THAT IT LANDS "JUST BEFORE Troubleshooting". A refuter falsified
  that here.** Two different code paths inject it and they DISAGREE:
  `docs/scripts/sidebar-resolver.ts` inserts at the canonical position, but it governs the
  UNVERSIONED `content/<slug>/` instance, which is not served once a slug is versioned
  (`includeCurrentVersion: false`). The served path for a released package is
  `docs/scripts/versioning/sidebar-augment.ts`, which **appends** (`[...value, apiCategoryEntry()]`),
  so the rendered nav ends `..., Guides, Troubleshooting, API Reference`. The augmenter's own header
  claims it mirrors the resolver; it does not. **This is a `docs` defect, not a `cli` one**, it is
  cosmetic ordering, and it affects every released package. **The IA linter cannot see it** (it
  refuses `versioned_sidebars/`), so "verified against the linter" is NOT evidence about placement.
  State only what this package controls: it does not author or position that category.
  **Nothing in `verify.sh` or this repo's CI can catch this** (`pack:docs` checks only that
  `intro.md` and `sidebars.json` EXIST), so verify a sidebar edit against the site's own linter,
  `docs/scripts/check-ia-conformance.ts`. It self-executes on import, so `NODE_ENV=test` is required
  to call `lintSidebar` directly. **Use the previously shipped sidebar as a negative control**: if it
  does not report errors, the probe is wrong, not the sidebar.
  **Only a NEW RELEASE clears the gate**, because it reads the shipped artifact and releases are
  immutable, so every already-published version keeps its sidebar forever. Archived versions are
  reported at `info` and never gate. Do not try to fix history.

### The pre-commit PHI gate and git mv

- **▶ THE PRE-COMMIT PHI GATE WAS BLIND TO `git mv`, AND THE HOLE WAS NOT LIMITED TO LINKS.**
  `scripts/phi-scan.ts --staged` is the `pre-commit` hook (`simple-git-hooks`). It listed the index
  with `git diff --cached --name-only --diff-filter=AM`. Rename detection is **on by default**, so
  `git mv <path> test/__fixtures__/<name>` stages as a **two-path `R100`** record, and `R`/`C` are in
  neither `AM` nor `AMT`, so the status filter **deleted the record** and the destination was never
  enumerated. Measured here, both at **exit 0** through the hook: an ordinary regular file carrying a
  value the scanner's own floor catches (`:100644 100644 <sha> <sha> R100`) and a link
  (`:120000 120000 <sha> <sha> R100`, index mode `120000` under the scan root).
  **`--no-renames` is the whole remedy and it is a strict SUPERSET, not a narrowing**: the
  destination arrives as a single-path `A`, the source as a `D` the filter drops. Verified under
  `diff.renames` = `true` / `copies` / `false` / `1` and `diff.renameLimit=1`: **no `R` or `C`
  survives any of them**, which is what makes the two-field `--raw -z` stride **structural rather
  than conditional**. `copies` is not hypothetical here, it emits a live `C100`.
  **Do NOT re-derive this as "needs the two-path record shape, a scope decision".** That framing was
  ported from a sibling and is false; `dicom` measured it and `cli` re-measured it.
  Three more shapes in the same route, each measured at exit 0 on `a7a92f8` and each closed: the
  **destination mode was never read** (`--name-only` gives none, and `git show :<path>` answers a
  link with its **target path as though it were content**, so the scan read path text and never the
  target's bytes, and this is why the route now lists `--raw -z` and refuses a non-blob mode with
  **exit 2**); **`T` was missing from the filter**, so replacing a _tracked_ fixture with a link was
  neither `A` nor `M` and the record was gone before a mode could be read; and **each scan root's own
  path** is in scope now, because git records no index entry for a directory, so an entry at exactly
  `test/__fixtures__` or `src` is that root replaced by a blob or a link.
  **A refusal NEVER prints the link target.** It is working-tree text and a target path of the shape
  `../patients/<surname>-<given>-<dob>.txt` is the whole reason: a diagnostic about a PHI leak is
  itself a PHI surface. The entry's **own** path is printed deliberately, and every offender is
  named, not just the first. **That guarantee is about a REFUSAL and does not extend to a hit** (see
  the linked-scan-root residual below, where the values printed come from the far side of a link).
  **The all-mode walk got the same refusal**, because a scanner whose pre-commit half refuses a link
  while its CI half silently drops one cannot be reasoned about. The `.md` exemption deliberately
  does not reach a link.
  **Two exit-code defects fixed with it, and the reason matters more than the codes:** a missing or
  unreadable allow-list, and an unreadable scan root, both threw past every handler and exited **1**
  with a stack trace. **`1` is this contract's code for "hits found"**, so a broken invocation read
  as a PHI finding. Both are exit **2** now.
  **▶ THE REFUSAL RULE IS SCOPED TO AN _ENUMERATED_ ENTRY, AND THE UNQUALIFIED VERSION IS FALSE.**
  A refuter caught the first draft of this note asserting "neither route follows such an entry" while
  the same file falsifies it. The rule covers an entry the walk reached **beneath a root it had
  already opened**, and a staged record **in scope per the boundary rule** (NOT "at or under a scan
  root": measured, a staged link at `src/notes.json` is under a scan root and `--staged` exits 0 over
  it, because the `src/` half of that scope is `.ts` only. The all-mode sweep refuses it, so nothing
  escapes the gate as a whole). Three shapes escape it, all
  **PRE-EXISTING** (identical on `a7a92f8` and in `dicom`), all measured, **none closed here**:
  (1) **a scan root that is itself a LIVE link is followed** by the all-mode walk, because
  `existsSync`/`readdirSync` both resolve, so the walk reads files no commit contains and prints their
  values under a **fabricated in-repo path** that holds no such file, which is a confident wrong
  provenance on the channel this repo calls a PHI surface. The **dangling** direction is the mirror
  image: it prints OK over a corpus it never opened; (2) **an ancestor** of a scan root is in neither
  route's scope, so staging `test` as a link is exit 0 on `--staged` and the walk then follows it;
  (3) **paths mode follows an explicitly named link** (`statSync` resolves). The `--staged` half of
  shape (1) **is** closed here. **Do not "fix" this by growing the guard inside a rename slice**: the
  remedy taken was to correct the claim, and closing it needs a refuse-a-scan-that-observed-nothing
  rule plus a decision about how far above a root to look.
  **Other residuals, all PRE-EXISTING and none closed:** `D` and `U` are still not enumerated (`U`
  costs nothing that can reach a commit, **measured**: `git commit` refuses an unmerged index
  outright, exit 128); under `src/` the staged route covers only `.ts` while the all-mode walk covers
  every non-`.md` file, so **the two routes disagree there** and the CI sweep is the cover.
  **16 of `test/scripts/phi-scan.test.ts`'s 34 tests run red on `a7a92f8`.** The 18 that stay green
  are the floor tests, the deliberate controls (one of which asserts the payload under test is
  something this scanner would otherwise catch), and the four that **pin the residuals above** and
  are green on both trees by design. **Give these tests explicit timeouts**: each spawns `tsx` cold,
  measured at 0.5s idle and **3.7s under contention** against a shared 10s default.
  **Two vacuity traps this suite has already sprung, both worth knowing before you add to it:** a
  fixture built its merge conflict with a bare `git merge` and DISCARDED the result, which on a
  runner with no git identity refuses before touching the index, so every later assertion held over
  an empty one (real CI caught it; local runs passed against an ambient global identity). And the
  `diff.renames` loop asserted only the detection-OFF side, so it would have passed just as happily
  if git had stopped emitting the record shape the whole change is about. **Assert the premise, not
  only the remedy.**

### Refusing a scan root the walk never observed (2026-08-07)

The measurement first, because the class this belongs to is one where a phrase sweep reads as
authoritative while measuring nothing, and every number below was re-derived here rather than carried
from a sibling.

Every count below is **as of `cd221a0`**, the base this was measured on, and the anchor is not
decoration: this slice adds files of its own, so a bare "122 tracked" goes stale in the commit that
ships it, and the neither-route and `PID|` counts move with it (this very section is one of the files
that moves them, since the paragraph below contains the literal it counts). A refuter caught exactly
that. Re-derive against a named sha or do not write the number down.

- **122 tracked files. The all-mode walk opens 34** (7 under `test/__fixtures__`, 27 under `src/`).
  **88 are scanned by NEITHER route**, and **6 of those carry an inline `PID|` literal**: five HL7
  v2 messages built as `.ts` string literals inside `test/*.test.ts`, plus one `"PID|secret"` fed to
  a locator function to prove it does not echo. All six were read by hand and are placeholder shapes
  (`DOE^JANE`, `X^^^H^MR`, `123^^^HOSP`); none is a real identifier. **That 88 is an ENUMERATION gap
  and it is a different item** (`PHI-SCAN-WALK-ROOT-SCOPE`): this change widened no root, so it
  neither opened nor needed to open any of them.
- **The recogniser was NOT widened, and the measurement is why.** This slice adds no newly opened
  file in the healthy state, so there is no new document shape for a detector to miss. The floor is
  still SSN plus non-test email, still disclosed as a floor in the module banner, and the structured
  field-level detector the banner demands is still owed.

**What was open, all six measured on this tree, every one of them printing `OK, no hits` and exiting
0 beforehand:** the fixture root missing; the fixture root emptied; the fixture root a **dangling**
symbolic link; the fixture root a **live** symbolic link to a directory outside the repository; one
tracked fixture removed from the working tree with the rest of the root still opened; and `src` moved
away. **9 of `test/scripts/phi-scan.test.ts`'s 47 tests run red against `cd221a0`'s scanner** and
green against this one. **Name the denominator and re-derive it, because this very number went stale
inside the paragraph correcting a stale number**: it read `8` of `45` one commit earlier, and adding
the unmerged-count test moved it. **The composition of the 38 that stay green was stated here twice
and was wrong both times, so it is CUT rather than restated a third time**: 33 of them are tests
`cd221a0`'s suite already carried, most of them regression guards from earlier slices that fit none
of the tidy categories a summary reaches for. Re-derive it if you need it; do not summarise it.

**The remedy is reconciliation, not counting.** Each root's walk is compared against
`git ls-files -z -- <root>`, and two independent conditions refuse: the root contributed nothing, or
git tracks an in-scope file under the root that the walk did not open.

- **Neither condition subsumes the other, which is why both ship.** An emptied root opens nothing; a
  root swapped for another directory opens plenty. Refusing only a missing root would leave the
  emptied half open, because **existence is not observation**.
- **The dangling link is why a kind check cannot stand in.** `existsSync` FOLLOWS the link and
  answers false, so `walk()` returns before `readdirSync` and the not-a-regular-file refusal above
  never fires. Nothing about the entry is ever inspected, so no check on its kind can reach it.
- **A denominator was deliberately not added.** A count counts the roots and files that DID exist, so
  a healthy-looking total is precisely what a starved root produces. This scanner prints no file
  count and one was not introduced.
- **Exit 2 was derived from this scanner's own contract and not ported.** `1` means "hits found"
  here; `walk()` already raises an unreadable root as an invocation failure, and a root replaced by a
  regular file already exits 2 through `readdirSync`'s `ENOTDIR` (re-measured, not assumed). Sibling
  scanners disagree on this code and carrying one across would have been the defect.
- **`git ls-files` failing REFUSES rather than answering the empty set**, because an empty answer is
  indistinguishable from "this root tracks nothing" and would switch the whole rule off in silence.
- **One-directional on purpose:** a tracked in-scope file the walk missed refuses; an untracked
  working-tree file the walk found does not. Scanning more than git carries is the safe direction,
  and refusing it would red the gate on every fixture written but not yet added.
- **All-mode only.** `--staged` is a diff and not a corpus, and widening it changes what a COMMIT is
  blocked on, which is a separate decision that two siblings declined deliberately.

**Two of the three disclosed escapes are narrowed, not closed, and the disclosure says so.** A scan
root that is itself a live link is still followed. It is refused whenever git tracks an in-scope file
under the root that the link's target does not also carry **at the same relative path**, so a link to
an unrelated directory refuses here. **Do NOT shorten that to "survives only where git tracks nothing
under it": a refuter falsified exactly that sentence in one run**, and it had been written on three
surfaces at once including this one. The reconciliation compares **path sets**, not the bytes git
carries at those paths, so a target directory mirroring this repo's own seven tracked fixture NAMES
passes at exit 0 with decoy contents; a root tracking nothing is the degenerate case of that, not the
whole of it. An **ancestor** of a scan root is still out of the staged route's scope; the all-mode
half of it is covered incidentally, because replacing `test` leaves `test/__fixtures__` unopenable.
Paths mode is untouched. **How far ABOVE a root to look is still undecided.**

**Also fixed, and re-derived rather than inherited:** the two `PRE-EXISTING` minors a sibling named
were measured **NOT open here** (`loadAllowList` and `readdirSync` were already wrapped to exit 2, and
an unmerged `U` entry is already pinned as out of scope and unable to reach a commit). Their sibling
reader **was** open: a present-but-unreadable `phi-scan-overrides.md` threw a raw `EACCES` past every
handler and node exited **1**, this contract's code for "hits found". Now exit 2.

### Widening the walk to this repository's whole authored corpus (2026-08-07)

`PHI-SCAN-WALK-ROOT-SCOPE` in `cli`. The other half of the item above: the observation rule made the
gate refuse a root it never opened, and this one moved the roots so that they cover the files that
actually exist.

**The four numbers, re-derived on `ba059a2` rather than ported.** 123 tracked files; **34** opened by
the all-mode walk (7 `test/__fixtures__` + 27 `src/`); **89** scanned by **neither** route; **7** of
those carrying an inline HL7 `PID|` literal. The sibling slice measured 122/34/88/6 at `cd221a0`; the
one-file and one-literal deltas are its own changeset file and its own narrative in
`documentation/agent-notes.md`, which is a small illustration of the point that this set grows on its
own. **All 38 files the widening newly opens were hand-read**: every message literal is a placeholder
(`DOE^JANE`, `X^^^H^MR`, `SENDER`, `ZZSENTINEL*`) and the only SSN/email shapes anywhere are this
scanner's own declared synthetic payload. **So the 89 were an ENUMERATION gap, not a live PHI
exposure** - the defect is that the gate could not SEE those files, so nothing would have caught a
real value if one appeared.

**RED before, GREEN after, measured back to back on `ba059a2`.** A dashed SSN and an off-domain
address written into `test/planted.test.ts`, in this repo's own inline-message shape (a whole HL7
message as one `.ts` string literal with `\r` escapes between segments), exited **0** `OK, no hits`
in all mode, while `phi-scan test/planted.test.ts` reported both at **exit 1** over the same bytes. A
file written to `scripts/` behaved identically. After the change both routes report both hits.
**Fourteen of the suite's 68 cases red against `ba059a2`'s scanner.**

**The roots are `src`, `test`, `scripts`, re-derived from this repository's own files.** `test`
REPLACES `test/__fixtures__` rather than joining it: `buildTargetsForAll` walks each root
independently and concatenates, so a nested root would enumerate every file beneath it twice and
report each hit twice. The fixture directory did not stop being watched - an emptied or missing one is
still refused, through the observation rule's OTHER condition (git tracks in-scope files under `test`
that the walk did not open), and the refusal still names each one. Only the root the message is filed
under changed, which is what the four updated assertions in the suite are.

**`scripts` is included, and that is this repository's answer rather than a sibling's.** The
recogniser's patterns, the allow-list the scanner refuses to run without, and the override log it
points a developer at all live there, so the one directory guaranteed to hold PHI-shaped text was the
one nothing enumerated. All nine files were measured against the floor before the root was declared:
zero hits, so the widening lands green on its own bytes rather than on a new carve-out. **Keep it that
way**: `scripts/phi-scan.ts` is now under its own scan, so an example SSN written into a comment there
reds the gate.

**What is deliberately NOT a root, each measured rather than omitted.** `vendor/` (ten `pnpm pack`
tarballs; a DEFLATE stream decoded as UTF-8 is not text this gate can say anything true about, and the
em-dash gate's NUL grounding cites them); `docs-content/`, `documentation/` and `.changeset/` (every
tracked file under them is `.md`, which the walk skips by design, so declaring them would add
reconciliation surface and open not one byte); `.github/` and the repository root (measured clean, and
neither is where this package writes messages - and rooting at the repository root is the one sibling
shape that got caught enumerating a build transient).

**The deliberate-violator exemption, one entry long.** `test/scripts/phi-scan.test.ts` carries the
payload on purpose, so with `test/` a root the sweep would red on the scanner's own suite forever.
Three properties, each pinned by a control that reds when it is removed:

- **Applied at the SCAN, not the enumeration.** The file is still walked, still READ, and still counts
  as observed and reconciled. An unreadable one still refuses at exit 2 rather than passing as exempt.
- **Scoped to the all-mode sweep.** `phi-scan test/scripts/phi-scan.test.ts` still reports every hit
  at exit 1. An unscoped exemption would DELETE a detection the base had, which is "instead of" where
  this work is only ever "in addition to"; a sibling shipped that mistake before catching it.
  Measured: making it unscoped reds exactly the case that asserts the scoping.
- **Per PATH, never a pattern.** An extension rule cannot tell a file carrying violator literals on
  purpose from one carrying them by accident. The same payload in `test/scripts/other.test.ts` reds.

**Allow-listing the values instead was refused, and the reason is the email half.** `EMAILDOMAIN` is
global, so declaring `hospital.org` would switch the email detector off for the whole corpus while
this file's own positive case asserts that exact address IS reported. The dashed-SSN check consults no
allow-list at all, so there is no token-level route for that half either.

**A NARROWING the widening bought, asserted rather than claimed.** `test/__fixtures__` is no longer a
ROOT, so a live or dangling link AT that path is now an ENUMERATED entry beneath `test` and is refused
by the not-a-regular-file rule, whatever it points at and whatever git tracks. Only the three
top-level roots are still followable. The two residual pins were retargeted one level up for exactly
this reason, and a new case pins the narrowing.

**🛑 WHAT THIS BOUGHT, AND WHAT IT DID NOT.** It bought the SSN/email floor over 38 more files and
**nothing else**. The structured, field-level detection this scanner needs before it can be called a
PHI gate is still the unimplemented TODO in `scanTarget`, and opening a file does not implement it. A
test pins that limit rather than leaving it as prose: an undashed nine-digit id, a name, a DOB and an
address in the same `PID` segment all go unreported, at exit 0.

**The recogniser was NOT widened, and that is a measurement rather than an omission.** The companion
defect this class carries is that a recogniser assumes **the file IS the document**, so enumerating a
`.ts` source whose message is an inline string literal buys nothing. That failure mode needs an
ANCHORED detector, and this scanner has none: `scanCommonShapes` is two unanchored `matchAll` passes
over the whole text, so its reach over a `PID|` literal embedded in TypeScript is identical to its
reach over a standalone `.hl7` fixture. Pinned by an anchor-free probe that puts one token in three
placements (a standalone document, an inline HL7 literal with `\r` escapes, a multi-line template
literal) and requires all three to red.

**The one widening a sibling shipped here was measured and DECLINED: the escape-decoded second view**
(`\x2d` and friends, which hide a token from a raw text pass). Run over every file this widening newly
opens, the decoded view finds nothing the raw view does not and loses nothing either: this
repository's sources spell their messages literally and use `\r`/`\n`/`\t` alone. Porting it would
have been a guard with no measurement behind it. **The measurement is pinned as a TRIPWIRE rather than
asserted once**: the suite runs both views over the whole newly-opened corpus and REDS if they ever
disagree, which is the signal that the next worker should widen (in ADDITION to the raw pass, never
instead of it). A negative control proves the tripwire can see a difference, and the tripwire's
regexes are deliberately a SECOND COPY of the floor's, because one that imported them would go quiet
in exactly the case where the floor itself was narrowed.

**`--staged` IS UNCHANGED, DELIBERATELY.** Widening the walk changes what CI sweeps; widening
`--staged` changes what a COMMIT is BLOCKED on, which is a hook decision. So `test/*.ts`,
`test/scripts/**` and everything under `scripts/` are swept by the all-mode route and enumerated by
neither of `--staged`'s predicates. The CI sweep is the cover, exactly as it already was for the
non-`.ts` half of `src/`. The two routes now disagree by a lot more than they used to, and the module
header says so rather than leaving it to be inferred.

**The path-SET escape is unchanged and still open.** The reconciliation compares path sets, not the
bytes git carries at those paths, so a root swapped for a directory mirroring the tracked *names*
still exits 0 over decoy contents. Comparing blobs is a larger rule and is deliberately not taken
here; the widening does not make it worse, it only moves which paths the decoy has to mirror.

**Re-measured rather than inherited:** both named `PRE-EXISTING` minors (`loadAllowList`/`readdirSync`
throwing the "hits found" code; unmerged `U` entries enumerated by neither `AM` nor `AMT`) are still
**NOT open here**, and their sibling reader is already fixed. `verify.sh cli` now fails **two**
pre-existing steps rather than one: `pnpm audit --prod --audit-level high` (all advisories transitive
under `@modelcontextprotocol/sdk`) and the licenses gate, which reports
`ERR_PNPM_MISSING_PACKAGE_INDEX_FILE` for the vendored `@cosyte/fhir` tarball. **Both reproduce
byte-identically on a base tree** restored by file copy, `package.json` and `pnpm-lock.yaml` are
untouched by this change, and **no CI job runs either command**. The licenses one is newly VISIBLE
rather than newly broken: the umbrella's ladder used to print green on that step without running it.

**Still live and not this slice's:** `test:fuzz` and `pack:docs` are real gates the umbrella's verify
ladder never names, so they are invisible rather than skipped. And `.github/workflows/ci.yml`'s banner
says the ruleset requires **four** contexts while it requires **seven** - flagged here, not fixed,
because it is its own item.

### The em-dash brand gate

- **Em-dash brand gate armed, and unlike most siblings this repo was NOT clean when it landed.**
  `scripts/check-no-emdash.sh` (`pnpm check:no-emdash`) plus `.github/workflows/no-emdash.yml` enforce
  the founder directive banning `U+2014` outright (`knowledgebase/06-brand/voice-and-tone.md`, "No em
  dashes. Ever."). It scans **both** halves the rule covers: every tracked file, **and** the PR title,
  body, and commit messages, on the non-default `edited` trigger so retitling a PR re-checks it.
  **Measured byte-level over all 124 tracked files, not over markdown alone** (a markdown-only count is
  what wrongly cleared `dicom`): **659 occurrences across 87 files**, all literal, none encoded. **61 of
  the 87 are not markdown** (26 are), and one is `package.json`, whose `description` publishes to npm. All 659
  were rewritten in the same commit, so the gate arrives green over a tree that was cleared rather than
  green over a tree nobody measured.
  **What lands on `main` here is a repo setting, read rather than assumed, and it differs from `mllp`:
  all THREE merge methods are enabled** (`allow_squash_merge`, `allow_merge_commit`,
  `allow_rebase_merge`). Squash uses `squash_merge_commit_title: COMMIT_OR_PR_TITLE` and
  `squash_merge_commit_message: COMMIT_MESSAGES`; merge and rebase land the branch commit messages
  verbatim. So **the branch commit messages are the one text that lands under every enabled method**,
  the PR title lands under two of three, and **the PR body lands under none**. It is scanned anyway as
  deliberate over-strictness. Do not repeat `ncpdp`'s copy, which says "the PR title and body are what
  lands": the body never lands anywhere.
  **The script is composed from three copies, and the composition is the thing to understand before
  editing it.** Base: `website`'s **NUL-exclusion** shape. Plus `ncpdp`'s two route fixes (a tracked
  file named exactly `-` was read as **standard input** and never opened, so the gate printed OK over a
  live em dash; `-d skip` silently passed a tracked **symlink to a directory**). Plus `dicom`'s
  **binary-match diagnostic branch**. The `./` prefix is applied in the list-building **loop**, not via
  `sed -z`, so the scan is a single command with the stderr capture bound to all of it, and there is no
  GNU-only `sed` dependency that has no self-test.
  **Why the NUL-exclusion shape here, and unlike `mllp` the reason is not a hypothetical.** This repo
  tracks **eleven** binaries: the ten `vendor/cosyte-*.tgz` packed siblings (an `npx` bin cannot
  peer-depend, so the parsers are hard vendored deps) and `test/__fixtures__/sample.dcm`. Measured on
  this tree: **`vendor/cosyte-hl7-0.0.0.tgz` already contains the byte sequence `E2 80 94`** (one
  occurrence, offset 50217 of 665534 bytes, in a DEFLATE stream). A text-only port therefore reds on
  this repo **today**, naming a compressed byte stream nobody wrote, and **that red has no
  remediation**: you cannot rewrite compressed bytes with a period. A gate whose red state has no fix
  is a gate someone disables. **Do not add `grep -I` instead**: measured on GNU grep 3.8, a text file
  whose bad byte sits on the same line as the em dash is skipped by `-I` in total silence (no stdout,
  no stderr, exit 0) and the gate prints OK.
  **The disclosed cost, said plainly: a tracked TEXT file holding a NUL byte is silently exempt, and
  seeding a vendored tarball with a live em dash leaves this gate green. That is a miss, not a pass.**
  Verified, along with the control that proves the NUL rule causes it (the same tarball bytes with
  every NUL stripped, carrying the same em dash, goes RED). `cli` has **no** NUL-bearing text file
  today, checked over all 124 tracked files rather than assumed, so the exclusion currently exempts
  exactly eleven files and all eleven are genuine binaries. **Do not round that off to "hypothetical
  here."** `git ls-files --eol` calls **thirteen** files binary, not eleven: the other two are
  `test/__fixtures__/adt-a01.hl7` and `test/__fixtures__/minimal.astm`, which git classifies on its
  lone-CR branch because an HL7 v2 and an ASTM segment terminator is `CR` with no `LF`. Those two hold
  **zero** NUL bytes, so they stay in scope, and that was **proved, not assumed**: each was seeded with
  a live em dash in turn and the gate went red naming the file. `cli` wraps eight parsers and its
  `test/__fixtures__/` corpus is the obvious place a NUL-bearing text fixture would arrive. **The tell
  is the excluded count on the OK line: it reads 11 today.** If one lands, revisit the partition (the
  `.gitattributes` declaration `pathways` prefers, which this repo cannot use because it declares no
  attributes at all), never the ban.
  One disclosed property of a red on those two fixtures: the hit echoes the matching _line_, and a
  CR-delimited frame is one line, so a whole message lands in a public CI log. Acceptable and
  deliberately un-truncated, because those fixtures are synthetic by policy and `pnpm phi-scan` gates
  that policy over the same files. Remaining known limits (encoded-form matching is literal, so
  `%e2%80%94`, `&#X2014;` and `&#x2014` pass; the scan reads contents and never file names) are in the
  script header and are **shared across every copy, so fix them there, not here**: a divergent copy is
  worse than a shared known limit.
  **▶ READ THIS BEFORE PORTING THIS GATE ANYWHERE ELSE. AN EM DASH IS SOMETIMES A VALUE, NOT
  PUNCTUATION, AND A BULK SWEEP WILL SILENTLY EDIT A CAPABILITY CLAIM.** The refuter caught it here and
  it is the single most valuable thing this port produced. In `docs-content/limitations.md` the
  per-(format, operation) support matrix used a bare em dash (`U+2014`) **as a cell value meaning
  "not supported"**.
  The sweep rewrote it as punctuation, so `dicom`.`fmt`, `mllp`.`fmt` and `mllp`.`validate` rendered as
  a stray colon. **That converts "support absent" into "support unstated", on the one page whose entire
  job is honest capability disclosure**, and it reads as a rendering artifact rather than as a claim, so
  a reader does not even know something is missing. It is the same family as this repo's own rule for
  the public-surface gate: **CUT, do not rewrite; softening a stated limit into an implied capability
  while tidying a sentence is a worse defect than the thing being removed.**
  **Nothing in this repo's CI could have caught it**, and that is the part to carry: `test/docs-content.test.ts`
  only executes ` ```ts runnable ` blocks, and `prettier`'s glob covers `src/**`, `test/**`, `scripts/**`
  and root `*.{json,md,yml}` but **NOT `docs-content/`**. Fixed by replacing the marker with the words
  `not supported`. **Before sweeping any repo, grep for an em dash used as a table cell or a list marker
  first** (`\|\s*\x{2014}\s*[\|\(]` found exactly the three lines here) and convert those to a WORD,
  by hand, before running any bulk transform. A marker that means "no" must survive as a word, never as
  punctuation.
  **A second measurement lesson from the same review, because this item's history is wrong counts
  propagating through briefs:** the first draft of these notes said "37 of the 87 are not markdown",
  asserted as measured fact inside the sentence arguing for measurement rigor. It was wrong. **Correct
  and final: 659 occurrences across 87 of 124 tracked files; 26 of those files are markdown and 61 are
  not; 37 is the non-markdown AND non-`test/` subset.** Re-derive numbers before writing them down, and
  never quote them from a sibling repo's copy of this note.
  **Pre-existing and correctly not retroactive:** commit subjects already on `main` may carry `U+2014`.
  The message half only runs on `pull_request`. History is not rewritten.

### The vendor to npm dependency swap

- **The published manifest is installable again, and `VERSION` no longer lies.** `0.0.1` and `0.0.2`
  are permanently broken on npm (`file:vendor/*.tgz` specifiers in the published manifest, `ENOENT` on
  every install route) and both shipped `VERSION = "0.0.0"` against a `0.0.2` manifest, which
  `cosyte --version` and the MCP `serverInfo.version` both printed. Fixed together:
  **`scripts/sync-version.mjs`** now runs inside the `version` script and rewrites **two** targets,
  `src/core/version.ts` and the asserted literal in `docs-content/installation.md`; `test/sanity.test.ts`
  compares the export against `package.json` **and** pins the declaration's `: string` shape, which the
  script's pattern keys on. **Fix the ASSERTION, not just the value:** the docs block asserted
  `typeof VERSION`, which is true of every wrong value and green-lit both bad releases.
  **The dep swap is done except for one dependency, and the exception is the interesting part.**
  `@cosyte/hl7` (`^0.0.7`) and `@cosyte/terminology` (`^0.0.9`) are hard deps at real ranges; the six
  breadth parsers and `@cosyte/transform` (`^0.0.4`) are `optionalDependencies` at real ranges.
  **`@cosyte/fhir` is not declared at all**, because it is not on the registry and, measured here,
  declaring it in ANY form alongside `@cosyte/transform` (whose `@cosyte/fhir` peer is mandatory)
  fails the whole install with `ERESOLVE`: optional dep and optional _peer_ both. Either one alone
  installs clean; the pair does not. **Do not explain this with a missing
  `peerDependenciesMeta.optional` flag** - measured across the suite, that flag does not decide the
  outcome, and the mechanism is unexplained. `@cosyte/fhir` is kept as a **`devDependency`** on the
  vendored tarball so this repo's own FHIR/`convert` tests run and so `transform`'s peer resolves in
  the dev tree. Consequence, stated on every consumer surface rather than discovered: **an installed
  copy has no FHIR support**, and FHIR `parse`/`inspect`/`fmt`/`validate` plus `convert` degrade to a
  value-free `CLI_PARSER_UNAVAILABLE` (69). That required `loadOptionalPackage(detail, load)` beneath
  `loadOptional` (which takes a `CosyteFormat` and hardcodes the word "parser", wrong for both cases)
  plus `loadFhir()`; `test/absent-sibling.test.ts` includes a **static guard** that reds on a new
  **single-line, unwrapped** `import("@cosyte/fhir")` / `import("@cosyte/transform")` in `src/`, which
  is the shape the defect took. **Do not write "any new call site": a refuter falsified that wording
  by adding a thunk assigned to a variable, and the suite stayed 10/10 green.** It also misses a
  multi-line import and a **static** `import … from "@cosyte/fhir"` - and this repo now HAS the first
  static reference to that package (`src/core/parsers.ts`, `import type`, erased at build, verified
  absent from `dist/`). Dropping the word `type` loads it eagerly and breaks every command in an
  installed copy, unseen by the guard. Also note the two diagnostics deliberately do NOT say
  "install it": `npm install @cosyte/transform` fails `E404` on its own `fhir` peer, so that advice
  would send a user at a command that cannot succeed. `loadOptional()`'s stock wording says exactly
  that, which is why neither goes through it.
  **Verified by installing, which a `--dry-run` cannot do**: pack, `npm install` the tarball in a clean
  directory outside the repo (exit 0), run both bins, import `.` under ESM and CJS. Negative control:
  the published `0.0.2` still `ENOENT`s. Keep that step; it is checklist step 6 in `RELEASING.md`.
  **A THIRD fault is real, pre-existing, and NOT fixed by any of this: `npx @cosyte/cli …` fails with
  `could not determine executable to run`.** `npx` runs the bin matching the package name's last
  segment (`cli`); this package ships `cosyte` and `cosyte-mcp`. The `bin` block is byte-identical to
  the published `0.0.2`, so the swap cannot have changed it. Docs now say
  `npx --package @cosyte/cli cosyte …` (measured working). **A `cli` bin alias would fix it and is
  deliberately not added** - `npm install -g` would then claim the name `cli` on the user's `PATH`.
  That trade is a founder call.

### Shipped phases

The roadmap's build phases, newest first, exactly as each was recorded on landing. The CLI is
feature-complete: Phase 7 was the final phase.

- **Phase 7 shipped (CLI-7): release hardening: the final roadmap phase. The CLI is feature-complete.**
  No new runtime command surface; this phase is publish-readiness. **Fuzz** over the CLI's two input
  boundaries: the terminal (`run`, over argv plus stdin bytes) and the agent surface (`dispatchTool`,
  over a tool name plus arguments): proving neither ever throws or leaks a stack frame
  (`test/fuzz.property.test.ts`, scaled by `CLI_FUZZ_RUNS`, run nightly by a scheduled **Fuzz** workflow
  and on demand via `pnpm test:fuzz`). The **exit-code golden matrix** (`test/exit-code-matrix.test.ts`)
  locks one representative invocation for every code in the `0/1/2/65/66/69/70` contract as a stability
  surface. **Publish dry-run proven:** `attw` green, a new `smoke` gate (`scripts/smoke.mjs`, in
  `verify.sh`) exercising the built dual ESM/CJS `.` and `./mcp` subpaths **and both bins** under `node`,
  and a clean `npm publish --dry-run` tarball. **Honesty docs:** `docs-content/limitations.md`
  (wraps-not-implements, the non-goals, the per-(format, op) matrix, the PHI posture) and a
  man-page-style `docs-content/reference-commands.md`; plus `RELEASING.md` (the two-bin publish,
  provenance/OIDC, the vendor→npm swap, the two founder stops). **Founder-gated tail (NOT crossed):** the
  real `npm publish` and the repo public-flip remain the two standing human stops, and, unique to this
  `bin`, the vendored `file:` sibling deps must become real `@cosyte/*` npm ranges at `PUB-FLIP` (a
  published package cannot ship a `file:` dep). Everything up to those is done.
- **Phase 6 shipped** (`operations/roadmaps/cli.md` §Phase 6). **Six more formats + streaming + shell
  completion** (ADR 0025). The CLI now wraps **all eight** cosyte formats through a single lazy
  **per-format adapter registry** (`src/core/parsers.ts`) that replaced the per-command `hl7 ? : fhir`
  branches and makes support **per (format, operation)** via `OP_SUPPORT`: an unsupported (format, op)
  is a value-free `CLI_FORMAT_UNSUPPORTED`, never a fake. Capabilities: `x12`/`astm`/`ncpdp` →
  parse+inspect+fmt+validate; `ccda` → inspect+fmt(XML)+validate (parse deferred, no library JSON
  model); `dicom` → inspect+validate (parse/fmt deferred: binary model); `mllp` → parse+inspect (a
  transport container de-framed to its enclosed HL7). Autodetection covers all eight (conservative +
  fail-safe: a co-match is a _detected_ ambiguity, never a mis-route). **Streaming:** `parse` emits
  **NDJSON** with per-record isolation for MLLP frames and the
  new **`--ndjson`** input mode (a failed record is a value-free `{record,error}` line; any failure →
  exit `65`). **`cosyte completion <bash|zsh|fish>`** prints a static completion script. The six breadth
  parsers are **`optionalDependencies`** (vendored, lazy per format, outside the hard-dep closure: ADR
  0025), so the umbrella `verify-policy` `cli` cap **stays 4**; an absent optional parser degrades to a
  value-free **`CLI_PARSER_UNAVAILABLE`** (exit `69`). New diagnostic `CLI_PARSER_UNAVAILABLE`; the public
  `WIRED_FORMATS` set is replaced by the per-op `OP_SUPPORT` matrix.
- **Phase 5 shipped** (`operations/roadmaps/cli.md` §Phase 5). Adds the **`cosyte-mcp` MCP server**: the
  **agent front door** and the _second adapter_ over the one shared `core` (ADR 0022). A **stdio** Model
  Context Protocol server on `@modelcontextprotocol/sdk`, reachable three ways: the new **`cosyte-mcp`**
  bin, the **`cosyte mcp`** subcommand, and the **`@cosyte/cli/mcp`** subpath export. It exposes four
  tools (**`parse`/`validate`/`inspect`/`convert`**) each a thin wrapper that calls the same command
  handler the terminal uses (with `--json`), so `cosyte parse` and the MCP `parse` tool agree by
  construction; the CLI re-implements nothing. Every tool runs **value-free** (no `--unsafe-show-values`
  door on the agent surface): a tool _result_ carries the requested data, a tool _error_ carries only the
  value-free diagnostic, and a parsed-but-invalid `validate` verdict is a **successful** call reporting
  the verdict: only a hard failure sets `isError`. The **SDK is isolated and runtime-optional** (ADR
  0024): it is the CLI's first and only third-party runtime dep, declared in **`optionalDependencies`**
  (pinned `1.29.0`), imported only in `src/mcp/server.ts`, and reachable solely via the `./mcp`
  boundary: a `cosyte parse` invocation never loads it (proven by `test/mcp-isolation.test.ts`), and the core
  works with the SDK absent. Because it is not in the hard runtime closure, the umbrella `verify-policy`
  runtime-dep cap on `cli` stays **4**. `redact`/`deid` and `map-codes` are deliberately not yet exposed
  as tools. New exports (on `./mcp`): `createMcpServer`, `startStdioServer`, `dispatchTool`, `TOOL_DEFS`.
- **Phase 4 shipped** (`operations/roadmaps/cli.md` §Phase 4). Adds the two **consumer-of-consumers**
  commands, each a thin wrapper that re-implements no library logic: **`convert <file|-> --to fhir`**
  (HL7 v2 → FHIR R4 via **`@cosyte/transform`**: parse with `hl7`, `toFhir`, serialize with `fhir`;
  the `Bundle` on stdout, value-free issues on stderr, an **error-severity issue drives exit `1`**, a
  non-HL7 source is `CLI_FORMAT_UNSUPPORTED`/`65`) and **`map-codes <conceptmap|-> --code … [--system
…]`** (ConceptMap `$translate` via **`@cosyte/terminology`**, BYO ConceptMap: a match → target
  coding(s) + exit `0`; unmapped → `TERM_TRANSLATE_UNMAPPED` + exit `1`; an unloadable map → the new
  **`CLI_MAP_INVALID`**/`65`). Both siblings are **hard, first-party, lazy-loaded** runtime deps
  (vendored tarballs; the umbrella dep cap was raised **2 → 4**: ADR 0023). New exports:
  `convertCommand`, `convertOutcome`, `mapCodesCommand`.
- **Phase 3 shipped** (`operations/roadmaps/cli.md` §Phase 3). Adds three commands over the two wired
  parsers: **`validate`** (parse + the wrapped parser's own validation surface, **verdict in the exit
  code**: `0` valid / `1` invalid / `65` unparseable; findings value-free; `--profile` gated to an
  honest `CLI_NOT_IMPLEMENTED`/`69`; verdict never invented: FHIR = `validateResource().valid`, HL7 =
  parseable), **`inspect`** (a value-free structural summary: message/resource type, segment/entry
  counts, warning/issue count), and **`fmt`** (canonical re-serialization via the library's serializer;
  stdout is the data channel; no partial emit on unparseable input). Adds **`EXIT.INVALID` (`1`)**: the
  exit-code contract is now `0/1/2/65/66/69/70`. All four commands share one input+format front door
  (`core/input.ts` `resolveInput`) and one value-free parser-failure boundary (`core/wrap.ts`), so the
  value-free posture + `--unsafe-show-values` chokepoint stay uniform (`parse` refactored onto them,
  behavior-preserving).
- **Phase 2 shipped** (`operations/roadmaps/cli.md` §Phase 2). Pre-alpha `0.0.x`, unpublished. On top
  of Phase 1's `cosyte parse` (HL7 v2 + FHIR R4, content autodetection, exit-code contract, value-free
  `CLI_*` diagnostics), Phase 2 hardens the PHI posture: the global opt-in **`--unsafe-show-values`**
  (the single door to a value on a secondary surface, funnelled through one chokepoint in
  `core/phi.ts`), a proven **never-a-PHI-temp-file** guarantee, and the **`redact`/`deid`** command as
  an honest, `@cosyte/deid`-gated `CLI_NOT_IMPLEMENTED` (exit `69`), never a built-in partial scrub
  that would risk a false-safety impression. Exit-code contract is now `0/2/65/66/69/70`.
- **Phase 1 shipped** (§Phase 1). `cosyte parse <file|->` for **HL7 v2** + **FHIR R4**, **content
  format autodetection** (conservative, fail-safe, never a guessed parser), the documented
  **exit-code contract**, and the **value-free diagnostic** channel with stable `CLI_*` codes.

### Hard runtime deps

- **Hard runtime deps (ADR 0021 + 0023), as they stand AFTER the vendor → npm swap:** only
  **`@cosyte/hl7` (`^0.0.7`) + `@cosyte/terminology` (`^0.0.9`)** are hard `dependencies` now, both
  real registry ranges (an `npx` bin can't peer-depend). `@cosyte/transform` moved to
  `optionalDependencies` and **`@cosyte/fhir` is undeclared** - see the swap note above for why, and
  do not "restore" either without reading it. That is **2** hard runtime deps against an umbrella
  `verify-policy.json` cap of **4**, so it is under the cap, not at it. **Lazy-loaded per command.**
  On the `0.0.x` ladder `^0.0.7` permits no other version, so these are effectively exact pins, and
  Dependabot now sees them (it never could while they were `file:` specs). `vendor/` survives only to
  supply `@cosyte/fhir` as a **`devDependency`**; the other nine tarballs are refreshed by
  `pnpm vendor:refresh` but wired to nothing, and removing them is a deliberate separate cleanup.
  Third-party CLI-core runtime deps: **zero**. The MCP server's **`@modelcontextprotocol/sdk`** is the
  CLI's only third-party runtime dep: declared in **`optionalDependencies`** (not `dependencies`),
  isolated behind `./mcp`, so it is outside the hard-closure cap (ADR 0024).

### Deferred

- **Deferred:** the roadmap's build phases are complete (P7 release hardening shipped). Per-(format, op)
  cells remain deferred honestly (never faked): `dicom`
  `parse`/`fmt` (binary model), `ccda` `parse` (XML is the canonical `fmt` surface), `mllp` `fmt`/`validate`.
  The MCP tool set covers `parse`/`validate`/`inspect`/`convert`; `redact`/`map-codes` tools and
  remote/HTTP MCP are later. `redact`'s real de-identification is deferred to when `@cosyte/deid` ships
  (P2 landed the gated stub + seam). `validate --profile` is reserved but gated (`CLI_NOT_IMPLEMENTED`/`69`)
  until the CLI can load a profile, no profiles are bundled.

### ADRs

- **ADRs:** `documentation/decisions/0021` (dependency-tier: a `bin` hard-deps first-party siblings),
  `0022` (one-repo-two-bins: CLI + MCP over one core; web playground out of scope), `0023` (wire
  `transform` + `terminology` for `convert`/`map-codes`; the deliberate 2 → 4 dep-cap raise), `0024`
  (the Phase-5 MCP server; the SDK as an isolated, runtime-optional dependency: hard-dep cap stays 4),
  and `0025` (the Phase-6 breadth parsers as runtime-optional lazy deps outside the cap; the cap stays 4).

---

## Branch protection (and the limits of this claim)

`main` is protected by the repository ruleset **`ci-required-checks`** (id `19907924`,
`source_type: Repository`, `enforcement: active`, conditions `~DEFAULT_BRANCH`). Rules: `deletion`,
`non_fast_forward`, `required_status_checks`. Before it existed, every check this repo ran was
advisory: `ci`, `codeql`, `scorecard` and `fuzz` could all be red and the merge still landed on
`main`, and `main` is the branch that publishes.

Required contexts, each pinned to **`integration_id: 15368`** (the `github-actions` app) so that a
commit status of the same name posted by any other actor with write access cannot satisfy it:

| context                                    | added      |
| ------------------------------------------ | ---------- |
| `ci / verify (22, ubuntu-latest)`          | 2026-07-28 |
| `ci / verify (24, ubuntu-latest)`          | 2026-07-28 |
| `ci / actionlint`                          | 2026-07-28 |
| `ci / prepublish`                          | 2026-08-06 |
| `codeql / analyze (javascript-typescript)` | 2026-07-28 |
| `no-internal-refs`                         | 2026-07-28 |
| `no-emdash`                                | 2026-07-28 |

These are the names GitHub actually reports, read off real check runs, **not** off a workflow's
`name:` field. Requiring a context nothing emits does not fail a PR; it leaves it pending and
unmergeable forever. None of `ci.yml`, `codeql.yml`, `no-internal-refs.yml` or `no-emdash.yml`
carries a `paths:` filter, so no PR can skip one.

**Do not quote the row count from memory, and do not carry it into another document.** It was `6`
until `ci / prepublish` was added and it moves whenever the called workflow does. Derive it:
`gh api repos/cosyte/cli/rulesets/19907924 --jq '[.rules[]|select(.type=="required_status_checks").parameters.required_status_checks[].context]'`.

### `ci / prepublish`, and the hazard that a context can arrive with no commit here

**▶ A `ci / *` CONTEXT CAN APPEAR IN THIS REPO WITH NO COMMIT IN THIS REPO, AND IT ARRIVES NOT
REQUIRED.** `ci.yml` calls `cosyte/.github/.github/workflows/ci.yml@main`, unpinned. A job added to
that reusable workflow starts emitting `ci / <job>` on every PR here immediately, the ruleset does
not name it, and so **a red result from it shows a red X and the merge lands anyway**. Nothing
errors, nothing warns, and no commit in this repo records that the surface changed. Every previously
written form of the "a required job gates all of its steps" warning was scoped to a **local** split,
so none of them covered this.

(Two corrections this paragraph has already needed, kept visible because both are easy to write
again. There is **no merge queue** on this repo: `gh api repos/cosyte/cli/branches/main/protection`
returns `404 Branch not protected` and the ruleset carries no `merge_queue` rule. And
`required_approving_review_count: 0` is **not** the reason a red non-required check merges: a context
absent from `required_status_checks` blocks nothing at **any** approval count, because the ruleset
only ever evaluates the contexts it names. The approval count is why the merge needs no **review**,
which is a different question and does not bear on this one.)

That is not hypothetical. The `prepublish` job was added upstream in `cosyte/.github#35` (`6142ac4`,
2026-08-05) and its second layer was defaulted on in `#36` (`90936ea`, the same day). **The census
that proves it was unrequired**: on the eight most recent `pull_request` head shas here (`#27`
through `#34`), `ci / prepublish` appears **zero** times, because the newest of them (`#34`) merged
`2026-08-04T22:22:24Z` and the upstream job postdates it. So the job could not have been read off a
real check run before this slice, and requiring it earlier would have been the `knowledgebase`
mistake (naming a context nothing emits) rather than a fix. **The order is load-bearing: it has to
run first, then be added, in that order.** It was read off the real check run on the pull request
that shipped this section before the ruleset was written.

**▶ THE COST THAT ORDERING DOES NOT COVER, DISCLOSED BECAUSE IT WAS PAID: ADDING A REQUIRED CONTEXT
STRANDS EVERY OPEN PULL REQUEST WHOSE HEAD SHA ALREADY RAN.** The ordering protects PRs opened
_after_ the write, because their head shas produce the new context. It does nothing for a head sha
that ran before it existed: that PR now needs a context nothing will ever post for it, so it goes
`BLOCKED` and stays there.

**Attribute this by measuring each head sha, not by listing what is open.** Six pull requests were
open at the time of this write, one of them being the PR performing it; of the other five, exactly
**three** were stranded by it, and the first draft of this paragraph named the wrong set by reading
`mergeStateStatus` instead of the check runs:

| PR  | head sha   | state before the write                                | stranded by this write? |
| --- | ---------- | ----------------------------------------------------- | ----------------------- |
| #33 | `f69ab63a` | six older required contexts green                     | **yes**                 |
| #18 | `73758565` | six older required contexts green                     | **yes**                 |
| #16 | `6cc21d8a` | six older required contexts green                     | **yes**                 |
| #29 | `95510b9d` | `ci / verify` **red on both matrix legs**             | no, already unmergeable |
| #15 | `b63cd115` | no `no-emdash`, no `no-internal-refs` (predates both) | no, already stranded    |

All three affected PRs are Dependabot's, and Dependabot regenerates its branches, so **nothing was
pushed to them**: a push onto a branch this slice does not own, to clear a condition this slice
created, is the more intrusive fix. **The remedy, when it is yours to apply, is one push per
branch**, which re-runs CI and produces the context. It is not a ruleset problem and must not be
fixed by removing the requirement. Check before the next such write:
`gh api repos/cosyte/cli/commits/<head>/check-runs`, per open PR.

**What it gates, and why leaving it unrequired was the expensive kind of hole.** `prepublish` runs
two layers: an offline **manifest lint** that refuses a dependency specifier no registry can resolve,
and a **pack-and-install** probe that `npm pack`s this tree and installs the tarball into a clean
anonymous directory. Both default on upstream and this caller passes neither input. This package is
the reason that gate exists: `@cosyte/cli@0.0.1` and `0.0.2` were published carrying
`file:vendor/*.tgz` specifiers and are **permanently uninstallable** (ADR 0001, a published version
never moves backwards). The manifest lint would have refused both. A gate that catches that, and then
does not block the merge that reintroduces it, is documentation.

**It is required, not merely present, deliberately.** The alternative considered and rejected was to
leave it advisory on the grounds that it touches the network on every PR and a registry blip would
red it. That cost is real and is disclosed upstream: the `pnpm install --frozen-lockfile` in this job
has no registry-outage softening, unlike the pack layer's `inconclusive` verdict. It was accepted
here anyway, because an advisory pre-publish gate on the branch that publishes is the exact shape of
"a green check that cannot block a merge".

### The one time a required check actually blocked something in this slice, and what it caught

**▶ THE DEMONSTRATION THIS WHOLE SUBJECT HAD BEEN MISSING, AND IT LANDED ON THE AUTHOR.** Everything
above is about a check that reports without blocking. While shipping it, the first thing a required
context actually blocked was **this author's own prose**: editing the pull request body turned
`no-emdash` **red**, twice, on a **required** context, over four `U+2014` characters that had been
typed into the PR body's explanatory sections. The pull request went `mergeStateStatus: BLOCKED` and
stayed unmergeable until the body was rewritten (runs at `12:14:31Z` and `12:14:59Z` failed;
`12:16:34Z` passed).

**Why it is worth a section rather than a footnote.** It is the concrete counter-example to the
failure this section documents. A red X that does not block a merge is documentation; this was a red
X that stopped a merge dead, and the difference between the two is exactly one line in a ruleset.

**And it landed on the half of the gate that nothing local can see.** `scripts/check-no-emdash.sh`
scans **tracked files** and was green throughout, both in the pre-commit hook and in `verify.sh`;
`git diff` over the branch carried zero `U+2014`. The offending text was never in a file. The PR
body is a surface that exists only on GitHub, reached only by `no-emdash.yml`'s `edited` trigger, and
**no local run of anything in this repo could have caught it**. So the two halves of that gate are not
redundant: the tracked-file half is the one a worker exercises constantly and the PR-text half is the
one that catches what a worker writes _about_ the work.

**Read alongside the standing note that the PR body lands under none of the three merge methods.**
That is still true, and the gate scans it anyway as deliberate over-strictness. This is what that
over-strictness buys, observed rather than argued: without it, four em dashes would have gone onto a
public pull request on a public repository, and the ban is absolute.

**Not built, and it must not be built without answering one question first.** A gate inside CI that
`curl`s this repo's own ruleset and asserts the required set would close the observability gap named
at the end of this section. Anonymous GitHub API is **60 requests per hour, per IP, and hosted
runners share IPs**, so such a gate trades a false green for a **flaky red on a required context**,
which is worse than the hole. Answer the flakiness question with a measurement before writing it.

**`no-internal-refs` is the one that is NOT `<workflow> / <job>`, and the shape is worth knowing.**
`ci / verify (22, ubuntu-latest)` is prefixed because `verify` runs inside a _called_ reusable
workflow, so the context is `<caller job id> / <called job name> (matrix)`. `no-internal-refs` is an
ordinary job in this repo's own workflow, so its check-run name is just the **job id**. That means
**renaming the job silently detaches the required check**: the ruleset keeps naming a context nothing
emits, every PR goes pending forever, and nothing errors or warns. Rename the job and the ruleset
together, or neither. It was added to the ruleset on 2026-07-28, after the first real check run
existed and its name was read back off that run.

**`no-emdash` is the second of that shape, added 2026-07-28 the same way.** Its workflow is titled
`Em-dash gate` and a PR's checks list renders it as `Em-dash gate / no-emdash`, but **the context
GitHub reports is the bare job id `no-emdash`**, which is what the ruleset names. Requiring either of
the other two strings would leave every PR pending forever while the ruleset looked configured. The
name was read off a real `pull_request` check run on `#20` before the ruleset was written, never off
the workflow file, and writability was confirmed with the `PUT` itself rather than a `GET` (an
Organization-sourced ruleset returns `200` to a `GET` and `404` to an identical-payload `PUT`;
`19907924` is `source_type: Repository`, and it is the only ruleset this repo has).

**What is deliberately NOT required, and why each would be a defect:**

- **`scorecard / analysis`** runs on `push` to `main` and on a schedule, never on `pull_request`.
  Requiring it would strand every PR pending forever.
- **`fuzz`** is `schedule` + `workflow_dispatch` only, for the same reason. The same property suite
  runs inside `ci / verify` at a lower case count, so the PR path is covered by a context that
  does arrive.
- **`release / release`** runs on `push` to `main`. It is not a PR gate.
- The **`CodeQL`** check posted by the Advanced Security app (id `57789`) reports **alert state**,
  not whether the analysis ran. `codeql / analyze` already gates that.

**A required job gates all of its steps.** Splitting a step out of `ci / verify` into its own job
silently un-requires it, with no error and no warning. There is a banner on `ci.yml` where someone
would trip it.

**▶ Scope of the claim, stated plainly: a ruleset makes a red check BLOCK a merge. It does not make
the check correct, and nothing inside this repository can observe its own ruleset.** Delete the
ruleset and this test suite stays green while this section keeps asserting protection. It is not
verifiable from inside the repo, by `verify.sh`, or by any gate here. Verify it the only way that
works:

```bash
gh api repos/cosyte/cli/rulesets
```

Two things recorded as **unproven** rather than fine: no fork PR has ever run here, so neither the
first-time-contributor approval gate nor whether `codeql / analyze` can report on a fork token
(which cannot hold `security-events: write`) has been observed.

---

## Engineering Guardrails

### The attw wrapper

- **▶ `attw` SAYS "does not contain types" AND EXITS 0, SO THE `attw` SCRIPT IS A WRAPPER, NOT THE
  BARE CLI.** `getExitCode.js` in `@arethetypeswrong/cli@0.18.4` opens with
  `if (!analysis.types) return 0`, so the problem list is never consulted and no `--profile`,
  `--ignore-rules` or config setting reaches that early return. For a package that ships types it
  means the declarations were **not in the tarball**, which is a broken publish reported as a pass,
  and `verify.sh` propagates the 0. **The race only supplies the condition.** Reproduced here with
  **zero concurrency**, under the real `--pack . --profile node16`: `rm -rf dist` and, separately,
  deleting all ten of a completed build's declaration files both print the sentence and exit 0.
  `tsup` writes JS in one pass and declarations in a later one; instrumented on one build here at a
  10ms poll, all eight `.mjs`/`.cjs` files appeared on a single poll at 4.92s and all ten
  declarations on a single later poll at 11.82s, a **6.90s window**. **Do not quote that interval as
  a constant**: it moves with load (7.85s on a busier box). What does not move is the ordering, and
  that the ten declarations land together. So the answer is **not** a lock, a lease or a build queue.
  `scripts/attw.mjs` carries **two nets**: a preflight that every relative path `package.json`
  promises exists and is non-empty (which names the missing file), and a post-check on the untyped
  sentence (which catches declarations on disk but excluded from the tarball by `files`; no instance
  of that is on record here).
  **Three things specific to this repo, each measured, none inherited from the sibling this was
  ported from:**
  1. **The preflight walks `bin` as well as `exports`.** `attw` never reads `bin`. With
     `dist/bin/cosyte.mjs` deleted and everything else built, it printed every subpath green and
     exited 0 over a tarball with no `cosyte` command in it.
  2. **`--profile node16` is load-bearing and is forwarded, never reinterpreted.** Without it,
     `@cosyte/cli/mcp` fails `node10` resolution and `attw` exits 1. The wrapper passes every
     argument straight through.
  3. **SIX PACKED-BUT-UNDECLARED DECLARATIONS DECIDE WHICH SILENCE YOU GET, AND THE OBVIOUS
     TWO-LINE VERSION OF THIS IS FALSE.** `files: ["dist"]` packs all **ten** declarations `tsup`
     emits; `package.json` names only **four** (`dist/index.d.*`, `dist/mcp.d.*`). The other six ride
     along unnamed: `dist/io-<hash>.d.ts`/`.d.cts` **and the four `dist/bin/*.d.ts`/`.d.cts`**.
     `analysis.types` is true if the tarball carries **any** declaration, so **any one of the six** is
     enough. Measured, JS intact: the four declared gone with io-\* and bin/\* packed, **exit 1**;
     also without io-\*, **exit 1**; also without bin/\* but with io-\* back, **exit 1**; all ten
     gone, the untyped sentence and **exit 0**. So a **partial** loss is caught by `attw` itself and
     only a **total** one is the false green, and the build window above is the total case. The
     preflight therefore reports both outcomes and **must not assert the exit 0**. A first draft
     named only the io chunk as the deciding file, measured it on a `bin`-less throwaway fixture, and
     wrote the fixture's result down as this tree's; a refuter falsified it in one run. **Re-measure
     before you shorten this.**
     The post-check reads a string, so what would hide that string is **refused** rather than
     tolerated: `--quiet`, `-q`, `--format`, `-f`, `--config-path`, and a `.attw.json` setting `quiet`
     or `format` (`readConfig()` applies it after argv). Every one was measured here to remove the
     sentence and still exit 0, `--config-path` included. **The refusal matches an EXACT ARGV TOKEN**
     (or the part before an `=`), by option name and not by value. **Two disclosed holes, measured,
     deliberately left open:** commander's attached and clustered short forms `-fjson` and `-Pf json`
     get through and exit 0 over an untyped pack (`-qP` does not, the empty-transcript net catches
     it), and a declared path not starting with `.` is skipped by the preflight. Neither is closed,
     because the bare invocation this replaced exited 0 on that pack with **no** arguments at all, so
     the gate is strictly better either way, and a short-option parser is a moving part the guard does
     not need. **Of the ARGV refusal say "exact argv token", never "wholesale":** the stronger wording
     was live in both the header and the printed message, and was refuted. The `.attw.json` refusal
     **is** wholesale (key presence, any value) and that word is correct there; the two messages
     differ on purpose. `test/scripts/attw-gate.test.ts` pins both nets, the upstream exit 0 itself, a
     negative control on a well-formed package, and that a real `attw` failure still fails with attw's
     own status.
     **The vendored `file:` deps do not touch this.** `npm pack --dry-run` on a clean build lists
     **30** entries and zero from `vendor/`, and no emitted declaration carries a `@cosyte/*` module
     specifier. (A draft said 70. It was read off a stale `dist/`; a clean `pnpm clean && pnpm build`
     gives 30, and 26 of those are `dist/`.) The published manifest being uninstallable is a real,
     separate condition; this gate neither addresses it nor is shaped by it.

---

## Standing disciplines (every change)

### No internal project bookkeeping on a public surface

The long-form half of standing discipline 4. The rule itself, and the founder directive it comes
from, stay in `CLAUDE.md`.

**Four surfaces, three different answers.** `/** */` doc comments compile into `dist/*.d.ts` and
`dist/*.d.cts` and render on hover, so they are **gated**, and in this repo they were by far the
largest violating surface. String literals reach a consumer as terminal diagnostic text, so they
are **gated too**: this package printed an internal work item inside `CLI_NOT_IMPLEMENTED` and an
ADR number inside `CLI_PARSER_UNAVAILABLE` before that pass existed. `//` and plain `/* */`
comments are **not gated** and identifiers are **welcome** in them, because **the convention says
source comments are a place identifiers belong**. That is the whole reason. **Do not justify that
boundary from what reaches `dist/`**: two drafts of the `ncpdp` copy tried, a refuter proved both
false, and two drafts of this paragraph made the same mistake again. Measured on this tree, at
`06abc86`: `dist` is `files[0]`, there is no `.npmignore`, and **24 of the 27** tracked `src/`
files appear whole in a build map's `sourcesContent` (`src/index.ts`, `src/core/result.ts` and
`src/mcp/index.ts` contribute only re-exports and types, so the bundler erases them). Two
sentences that read well and are **false**, so do not write them: "everything in `src/` ships",
and "the bundles carry `//` comments verbatim" (measured: of the 43 whole-line `//` comments in
tracked `src/*.ts`, exactly **one** survives into any emitted `.mjs`/`.cjs`). **The boundary rests
on the convention, not on either fact.** The line is not what a consumer receives; it is what a
consumer is **shown**.

**This repo is where the `WORD-N` trap is widest**, because the CLI wraps all eight formats and its
pages reach for every one of their vocabularies at once. `CLI-6` is ours; `HL7-V2`, `FHIR-R4`,
`DICOM-SR`, `NCPDP-SCRIPT`, `X12-837P`, `CCDA-R2.1`, `MSH-2`, `NM1-03`, `ST-01`, `439-E4` and
`ICD-10-CM` are reference material a consumer came here for. Never re-key a rule on the `WORD-N`
shape; the negative self-tests exist to make that attempt red.

**Two remediation rules that matter more here than anywhere else.** (1) **Repair the head**: a
sentence with an identifier stripped off the front reads worse than the text it replaced. (2)
**CUT, do not rewrite.** This package's whole posture is honesty about what it _cannot_ do: gated
stubs that exit `69` and never fake a scrub, value-free stderr, the per-(format, operation)
`OP_SUPPORT` matrix. Softening a stated limit into an implied capability while tidying a sentence
is a worse defect than the bookkeeping being removed. Delete the claim rather than replace it, and
revert a rewrite verbatim rather than repair it.

**What the gate cannot do:** it catches identifiers, not English sentences about our process, and
it reads `src/`, never `dist/` (untracked build output it cannot see without building). A new
programme prefix has to be added by hand. So the reviewer still owns half the rule.

---

## Corrections made during the relocation (2026-08-04)

Everything above was moved, not edited. The few claims that were **changed** rather than moved
are all listed here, with the superseded wording quoted, so nothing is lost. Do not treat this
list as closed: add to it rather than restating a count.

**This file is deliberately NOT run through prettier.** It is outside the repo's `format:check`
glob (`"*.{json,md,yml}"`, top level only), and reformatting it would rewrap the relocated text
and destroy the verbatim guarantee this file exists to provide. The leftover 3-space paragraph
indents are below the 4-space code-block threshold, so they render normally and hide nothing.

**The `Tech Stack` runtime-deps bullet was stale and contradicted `Status`.** It read:

> - **Runtime deps:** `@cosyte/hl7` + `@cosyte/fhir` + `@cosyte/transform` + `@cosyte/terminology`
>   (first-party, hard, vendored: ADR 0021 + 0023), capped at **4**. The six CLI-6 breadth parsers
>   (`dicom`/`x12`/`ccda`/`ncpdp`/`astm`/`mllp`) are vendored **`optionalDependencies`**, lazy-loaded per
>   format and **outside** that cap (ADR 0025); the MCP `@modelcontextprotocol/sdk` is likewise optional
>   (ADR 0024). **Zero third-party** in the CLI core (`util.parseArgs`, no framework).

That is the **pre-swap** shape. The `Hard runtime deps` section above records what actually shipped:
after the vendor to npm swap only `@cosyte/hl7` and `@cosyte/terminology` are hard `dependencies`,
`@cosyte/transform` moved to `optionalDependencies`, and `@cosyte/fhir` is **undeclared**. Verified
against `package.json` on `origin/main` on 2026-08-04. `CLAUDE.md`'s bullet now states the shipped
shape and points at the swap note; the stale wording is preserved above rather than deleted.

**One further wording edit, recorded for completeness.** The `Tech Stack` testing bullet read
"CLI-7 adds an **argv+stdin+MCP fuzz** gate ..."; it now reads "Plus an **argv+stdin+MCP fuzz**
gate ...". The phase attribution survives verbatim in `### Shipped phases` above; only the two
words of attribution changed.

**The Phase 7 entry's "Founder-gated tail (NOT crossed)" is superseded and is preserved as the
record of what was true on landing.** Measured 2026-08-04: `cosyte/cli` is **public**
(`gh repo view cosyte/cli --json visibility`) and the package has published. `CLAUDE.md` carries
the current state. Flipping visibility is never waived and is not an agent's to cross; the
`npm publish` half is covered by the standing founder directive.

**One number was NOT carried across as written.** The umbrella described this package as "FIXED at
`0.0.3`". On 2026-08-04 `npm view @cosyte/cli version` read **`0.0.4`** and `package.json` on
`origin/main` read `0.0.4`. The trap itself is live and unchanged and is stated in `CLAUDE.md`
without a number: **`@cosyte/fhir` is still absent from the manifest because `fhir` cannot publish
(`FHIR-NPM-NAME`), and an installed copy therefore has no FHIR support.** Only the version literal
was dropped, for exactly the reason ADR 0023 deleted the umbrella's version list: a quoted version
here is a number that goes stale between the write and the read.
