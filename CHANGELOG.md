# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions and publishing are managed with [Changesets](https://github.com/changesets/changesets);
this file is maintained by hand (Changesets handles the version bump and publish only).

The released sections below were reconstructed on 2026-08-04. Until then every entry sat under
`Unreleased`, including entries describing releases that had already shipped, so each published
tarball carried a changelog calling its own contents unreleased. Those tarballs are immutable and
still do. Each entry was assigned to the release whose tag first contains it, read off `v0.0.1`,
`v0.0.2` and `v0.0.3`; no entry text was rewritten to fit a section.

## [Unreleased]

### Added

- **Every MCP tool now publishes an `outputSchema`, and every tool result conforms to it.** An agent
  calling a cosyte tool used to receive `structuredContent: { exit, ok }` with no schema to check it
  against, so deciding whether a result held data or a diagnostic meant pattern-matching a text blob.
  Each of the four tools now advertises an output schema and a `title` on `tools/list`, and every
  dispatch path (success, negative verdict, hard failure, usage error, internal error) returns
  structured content conforming to the schema its own tool declared.
  - **The result carries `ok`, `status`, `exit`, `code` and `data`.** `status` is `success`,
    `verdict` or `failed`, and it is the property that separates a negative verdict about the message
    (the tool ran, the payload is present, the call is not an error) from a call that produced
    nothing: the distinction no text blob could make reliably. `code` is the stable diagnostic code on
    a failed call. `data` is the tool's own payload: the parsed model and warnings (or a record stream
    for a multi-record input), the validation verdict and findings, the value-free structural summary,
    or the converted `Bundle`.
  - **On a failed call the structured result is value-free by construction**, not by review: every
    property is drawn from a fixed set (the outcome vocabulary, the exit-code contract, the diagnostic
    code registry), so no part of the caller's input can appear in it. One consequence is deliberate:
    an unknown tool name is no longer echoed back, because a tool name is caller-supplied text like
    any other argument.
  - Tool names, tool count, `tools/list` ordering, input schemas, the exit-code contract, and the rule
    that a parsed-but-invalid `validate` is a successful call are all unchanged, and no dependency was
    added. The suite validates each emitted result against its own tool's declared schema with a
    dependency-free checker that refuses any schema keyword it does not implement.

- **`redact` / `deid` produces a real de-identified copy, delegated whole to `@cosyte/deid`.** The
  command that shipped as an honest `CLI_NOT_IMPLEMENTED` is wired. For `ccda`, `fhir`, `hl7` and
  `x12` stdout carries the de-identified document (serialized exactly as `cosyte fmt` serializes that
  format) and stderr carries the library's own value-free manifest, one line per locus with its
  category, transform, structural path, count, disposition and stable code, plus the library's own
  published output label and version. The CLI adds no policy, no locus map, no transform and no
  fallback scrub, and asserts no de-identification standard of its own.
  - **Every other outcome emits nothing at all**, because a partial pass offered as a de-identified
    copy is the hazard the command exists to prevent. `astm`, `mllp` and `ncpdp` have no adapter in
    that library: `CLI_NOT_IMPLEMENTED` (`69`). `dicom` is covered there, but its de-identified form
    is a Part 10 byte stream this text stdout cannot carry: `CLI_FORMAT_UNSUPPORTED` (`65`), the
    CLI's own limit, deliberately not blamed on the library. Any locus the library reports it could
    not handle is the new `CLI_DEID_INCOMPLETE` diagnostic and exit `1`, with the blocked paths and
    their codes named on stderr.
  - **`@cosyte/deid` is an `optionalDependency`.** An install without it degrades to a value-free
    `CLI_PARSER_UNAVAILABLE` (`69`), decided **before the input is read**, so a copy that cannot
    de-identify never touches the bytes it cannot strip. No other command loads it: the boundary is
    gated statically and observed at runtime in `test/deid-isolation.test.ts`.
  - **Identifier surrogates are keyed with a per-invocation ephemeral key.** The library's default
    policy pseudonymizes MRN / account / beneficiary numbers, and a keyed transform with no key is a
    fatal there, never an unkeyed fallback. The CLI holds no key material and adds no key surface, so
    it keys each run with a fresh random value: surrogates are consistent within one output and
    deliberately not stable across runs. Stated on stderr and in the docs rather than discovered.
  - **`redact` does not honour `--unsafe-show-values`.** The opt-in excerpt exists for debugging a
    rejected parse; on this command an excerpt of the un-stripped input is precisely the leak it
    exists to prevent, so its diagnostics stay value-free under every flag. The PHI-leak sentinel
    matrix now carries a redact row per mode (covered, refused, blocked, library absent, `--format`
    given and omitted, file and stdin).
  - No published exit value moved and no existing `CLI_*` code was renamed. `redact` is still
    deliberately absent from the MCP tool surface.

- **The two-file agent-guidance contract is now gated (`pnpm check:agent-notes`).** `CLAUDE.md` was
  split from `documentation/agent-notes.md` on 2026-08-04, which made every anchor between them
  load-bearing, and nothing checked them. `scripts/check-agent-notes.ts` now verifies that the
  narrative file is tracked, that no section is emptied down to its heading (a container whose body is
  its subsections is exempt and counted), and that every pointer at it resolves. It runs from
  `test/scripts/agent-notes.test.ts`, so it rides the required `ci / verify` contexts and
  `prepublishOnly` rather than adding a fourth workflow.
  - **The matcher was derived by counting this tree, not by porting a sibling's.** Two pointer
    spellings are live across these repositories, and porting without re-counting has produced a false
    green twice: a qualified-only matcher would have covered 3 of `ncpdp`'s 38 pointers, and would
    have matched nothing at all in `terminology` (42 bare, zero qualified) while still exiting 0.
    **Measured here: every pointer is the qualified `documentation/agent-notes.md#<anchor>` form and no
    bare pointer exists**, so the gate matches that form only. No count is written into the gate's
    prose as a promise; the OK line prints all of them on every run, because it measures rather than
    remembers.
  - **A bare-form census keeps that scope honest.** Matching one spelling is safe only while the other
    stays absent, so in **every opened file** each backticked `#<anchor>` span is enumerated: a
    digits-only one is a pull-request reference and is counted and reported, and **any other one
    refuses the run at exit 2** with an instruction to re-derive the matcher. Refusal rather than a
    finding, because the tree has not necessarily broken but the evidence the scope rested on has.
    A first draft scoped the census to the pair and justified that with tree files it claimed a
    widening would red; **running it tree-wide proved none of them can, and that the only files that
    could were the gate's own source and test**, which wrote bare spans out literally. That made the
    narrow scope a self-exemption for the very files where a broken pointer would hide, so the samples
    are now assembled from parts and the census covers the corpus. It closes the hole a pair-scoped
    census leaves: a bare pointer in a third file was covered by neither the matcher nor the census.
  - **Three claims were withdrawn after review rather than shipped.** The opening promise said the
    gate catches "a rename"; it does not, because both halves match on **basename** and the directory
    is never compared, so moving the file while pointers keep their prefix exits 0 with every rendered
    link broken. That is now a narrowed promise and a disclosed miss rather than a bigger guard. A
    **heading inside an HTML comment** mints a phantom anchor, which the list had omitted; it is now
    disclosed and pinned. And a written-down count of sibling repos lacking the file was already
    wrong, so **the number was dropped in favour of the class**.
  - **Two further claims were withdrawn on later review passes, each arriving inside the fix for the
    one before it.** The first fix asserted the HTML-comment miss is disclosed in "every sibling
    copy"; that phrasing came from a review rather than from the tree, and it is false. `ncpdp`,
    `terminology` and `astm` disclose it; `mllp`, `ccda`, `transform` and `docs` do not, and `mllp`
    is the copy this gate's disclosed-miss block is transcribed from, so the shared ancestor never
    carried the entry. The second fix then said the four that lack it are all owed it. Also false:
    `mllp`, `ccda` and `transform` derive anchors by **slugging headings** and are owed it, while
    `docs` resolves explicit `<a id>` anchors and cannot have the miss at all. **A claim about
    another repository is not checkable from inside this one**, so it is measured against that
    repository's source or not made.
  - **It refuses rather than reporting green over a corpus it never opened.** There is no declared
    scan root to be wrong about: the corpus is `git ls-files`, reconciled as **sets of paths**, and
    zero pointers, zero tracked files, an unmerged path, a symlink, a non-regular file or two files
    carrying the contract basename each refuse at exit 2. This repository has already shipped the
    opposite defect once, in `phi-scan`, which printed `OK, no hits` over a root it never walked.
  - **Every claim was watched to fail on a clone of the real tree** before the gate was believed: a
    misspelled real anchor, an emptied real section, the narrative file deleted, a bare pointer that
    resolves, a neutered matcher, and a tree with every pointer rewritten out of range. The last two
    are the `terminology` scenario, and both refuse instead of going green.
  - **Exit codes and corpus handling were re-derived from this repository, not inherited.** `0`, `1`
    for a finding and `2` for a refusal come from `scripts/phi-scan.ts`. An unmerged path **refuses**
    here even though `phi-scan` leaves that status unenumerated, because its reasoning (`git commit`
    refuses an unmerged index) covers a staged route this gate does not have.
  - **The NUL skip is a disclosed miss, not a pass**, and is required rather than tidy: the tree
    tracks vendored `@cosyte/*` tarballs and a synthetic DICOM fixture, none readable as markdown or
    editable to clear a red. The tell is the skipped count on the OK line. A draft claimed this
    partition differs from `check-no-emdash.sh`'s; **that was false and was corrected by reading that
    gate's own OK line.** Both key on an actual NUL byte; the wider set is git's own binary
    classification, which is why neither gate may be reduced to `grep -I`.

- **`parse` has a documented input-size limit: 67108864 bytes (64 MiB) per invocation, refused as a
  data error.** Node has two hard allocation ceilings (`buffer.constants.MAX_LENGTH` and
  `buffer.constants.MAX_STRING_LENGTH`), and a legitimately large input that crossed one of them threw
  past every handler and was reported as `CLI_INTERNAL` / exit `70`, which says "this is a bug in the
  tool" about an input that is merely big. The CLI now declares its own limit far below both, checks it
  against the **running byte count as the input arrives**, and refuses with a value-free
  `CLI_INPUT_TOO_LARGE` naming the limit and exit `65`. The number is rendered from one constant into
  `cosyte --help` and the command reference, and a test reds if the two ever disagree.
  - The refusal fires before anything allocates memory proportional to the oversized input, which is
    what makes it a refusal rather than a slower way to reach the same crash. The regression suite
    proves it with sources that would run past `MAX_STRING_LENGTH` if anything drained them.
  - The MLLP frame reader's own smaller default ceiling is raised to the CLI's limit on this path, so
    the documented number is the binding one rather than an undocumented number underneath it.

### Changed

- **The MCP text content block is now the serialized JSON of the structured result**, replacing the
  command's raw stdout (on a success) or its stderr diagnostic (on a failure). A client that reads
  only text now sees exactly the value a schema-aware client validates: there is one value, serialized
  once, so the two channels cannot disagree. A client that read the text block expecting the bare
  command output will find the same payload one level down, under `data`.
- **Multi-record `parse` output (`--ndjson` and MLLP) is now emitted record by record, as each record
  is parsed**, instead of being accumulated and written once at the end. The first line reaches stdout
  before the rest of the input has been read, so a bulk batch pipes into the next process instead of
  waiting on the whole file. Per-record isolation and the exit-code contract are unchanged: a record
  that fails to parse is still a value-free `{ record, error }` line, the stream still continues, and
  any failed record still resolves the invocation to exit `65`.
  - **A fatal condition part way through keeps the lines already written and still exits non-zero.**
    A truncated MLLP stream is the visible case: the frames that completed have already been emitted
    when the unterminated one is detected at end of stream, so `stdout` is no longer empty for that
    input. It was never a success and still is not: the exit code carries the failure, and a partial
    record stream is never reported as a complete one.
  - **A downstream consumer that closes the pipe part way through is now a value-free
    `CLI_OUTPUT_WRITE_FAILED`** rather than an unhandled write error. One write per record is a
    failure surface a single write did not have.

- **`CLAUDE.md` narrative was relocated into `documentation/agent-notes.md` to make room for the gate's
  rules.** The branch-protection, PHI-scanner-residual and em-dash blocks were compressed to their
  imperatives; every trap keeps a one-line rule and a pointer, and the reasoning each one compresses
  was already in the narrative file. No trap was deleted and no ceiling was raised.

### Fixed

- **`pnpm phi-scan`'s all-mode walk was rooted at `test/__fixtures__` and `src` only, so 89 of this
  repository's 123 tracked files were scanned by NEITHER of its two routes
  (PHI-SCAN-WALK-ROOT-SCOPE).** The walk now roots at **`src`, `test` and `scripts`**, which opens 72
  tracked files instead of 34.
  - **Measured back to back on the base commit, and re-derived for this repository rather than ported
    from a sibling.** A dashed SSN and an off-domain address written into `test/planted.test.ts`, in
    this repository's own inline-message shape (a whole HL7 message as one `.ts` string literal with
    `\r` escapes between its segments), exited **0** with `OK, no hits` in all mode, while naming the
    same file in paths mode reported both at **exit 1** over the same bytes. A file written under
    `scripts/` behaved identically. Both routes now report both.
  - **All 38 newly opened files were hand-read.** Every message literal is a placeholder and the only
    SSN/email shapes anywhere are the scanner's own declared synthetic payload, so the gap was one of
    **enumeration**, not a live exposure: the defect was that the gate could not see those files, so
    nothing would have caught a real value if one appeared.
  - **`test` REPLACES `test/__fixtures__` rather than joining it.** Roots must stay disjoint: each is
    walked independently and the results concatenated, so a nested root would enumerate every file
    beneath it twice and report each hit twice. The fixture directory is still watched, through the
    observation rule's other condition, **wherever git tracks files under it** (here, seven); only the
    root a refusal is filed under changed.
  - **One cover was LOST, and it is stated rather than implied away:** where git tracks NOTHING under
    `test/__fixtures__`, an empty one no longer refuses. As a declared root it refused by the
    opened-nothing floor whatever git carried; as an ordinary directory it contributes no entry and the
    reconciliation has no expected path to miss. A test pins it.
  - **`scripts/` is a root because the scanner, its allow-list and its override log live there**, so
    the one directory guaranteed to hold PHI-shaped text was the one nothing enumerated. All nine
    files there were measured against the detector before the root was declared: no hits.
  - **The cost of that root nobody would guess: the allow-list's own bytes.** The allow-list documents
    `ID <value>` as a synthetic id "matching an SSN / MRN / member-id shape", and the dashed-SSN check
    consults no allow-list, so an `ID` entry written in that dashed shape now reds the gate on the
    allow-list itself. Latent today (the shipped file declares its only id in the `MRN-` form, and a
    test pins that). **The remedy is to spell the id in a shape the check does not match**, never to
    make that check consult the allow-list (which would delete a detection) and never to exempt the
    file (which would leave the likeliest place for a real value unswept).
  - **A narrowing that came with it:** `test/__fixtures__` is no longer a declared root, so a live or
    dangling symbolic link at that path is now an enumerated entry and is refused outright, whatever
    it points at. Only the three top-level roots can still be followed.
  - **`test/scripts/phi-scan.test.ts` is exempt from the sweep, and is the only exempt path.** It
    carries violator literals on purpose, as the positive half of the scanner's own tests. The
    exemption is applied **after the read**, so the file still counts as observed and an unreadable
    one still refuses; it is **scoped to the sweep**, so naming the file explicitly still reports
    every hit; and it is **per path, never a pattern**.
  - **What this does NOT buy, stated because a wider reading would be false:** the detector is still
    the cross-cutting SSN + email floor, over 38 more files. Structured, field-level detection remains
    unimplemented, and a test now pins that limit rather than leaving it as prose.
  - **`--staged` is deliberately unchanged**, because widening it changes what a commit is blocked on.
    The two routes therefore differ widely, and the scanner's own documentation says by how much.
  - **Four claims about which directories are deliberately NOT scan roots are now checks rather than
    prose**, after two of them were measured false: `docs-content/` and `.changeset/` each carry one
    tracked non-markdown file, and the repository root is not clean under the detector (the `author`
    field carries a real off-domain contact address). `documentation/` and `.github/` were correct.

- **`pnpm phi-scan` printed `OK, no hits` and exited 0 over a corpus it never opened
  (PHI-SCAN-OBSERVED-NOTHING-IS-GLOBAL).** A declared scan root that the walk never observed is now
  a refusal at **exit 2**, in the all-mode sweep CI runs. Each root's walk is reconciled against
  `git ls-files`, and two independent conditions refuse: the root contributed **nothing**, or git
  tracks an in-scope file under the root that the walk did not open.
  - **Six states measured on this repository, every one of them previously exiting 0 with
    `OK, no hits`:** the root missing; the root emptied; the root a **dangling** symbolic link; the
    root a **live** symbolic link to a directory outside the repository; a single tracked fixture
    removed from the working tree with the rest of the root still opened; and `src` moved away.
  - **The dangling case is why a kind check cannot stand in for this rule.** `existsSync` follows
    the link and answers false, so `walk()` returns before `readdirSync` and the existing
    not-a-regular-file refusal never fires. Nothing about the entry is ever inspected, so no check
    on its kind can reach it. Refusing on what was **observed** needs no opinion about the entry.
  - **A denominator is deliberately not what this is.** A count counts the roots and the files that
    did exist, so a healthy-looking total is exactly what a starved root produces. This scanner
    prints no file count and one was not added.
  - **Existence is not observation, which is why both conditions ship.** Refusing only a missing
    root leaves the emptied one open; refusing only an empty result leaves the swapped one open,
    because a root pointed at another directory opens plenty. Neither subsumes the other.
  - **Exit 2 was derived from this scanner's own contract, not ported from a sibling.** `1` means
    "hits found" here; `walk()` already raises an unreadable root as an invocation failure, and a
    root replaced by a regular file already exits 2 through `readdirSync`. Sibling scanners disagree
    on this code, and carrying one across would have been the defect.
  - **`git ls-files` failing refuses rather than answering the empty set**, because an empty answer
    is indistinguishable from "this root tracks nothing" and would switch the rule off in silence.
  - **The rule is one-directional on purpose.** A tracked in-scope file the walk missed refuses; an
    untracked working-tree file the walk found does not, because scanning more than git carries is
    the safe direction.
  - **Scope, stated rather than left to be inferred:** all-mode only. `--staged` is a diff and not a
    corpus, and widening it would change what a **commit** is blocked on, which is a separate
    decision. Naming paths explicitly is unchanged.
  - **Narrowed, not closed, and still disclosed in the module header:** a scan root that is itself a
    live link is still followed. It is now refused whenever git tracks an in-scope file under the
    root that the link's target does not also carry **at the same relative path**, so a link to an
    unrelated directory refuses; the reconciliation compares path **sets** rather than the bytes git
    carries at those paths, so a target mirroring the tracked names still passes at exit 0, and a
    root git tracks nothing under is the degenerate case of that rather than the whole of it. An
    **ancestor** of a scan root remains out of the staged route's scope, and paths mode still follows
    a link a caller names.
- **A present-but-unreadable `phi-scan-overrides.md` exited 1, the code reserved for "hits found".**
  `loadOverrideLog` threw a raw filesystem error past every handler while its sibling reader,
  `loadAllowList`, had already been wrapped. It now exits 2 with a diagnostic. A caller branching on
  the exit code read a broken invocation as a PHI finding.
- **A red pre-publish gate showed a red X and merged anyway, because `ci / prepublish` was a
  required check nowhere (CI-REQUIRED-CHECKS).** The shared pipeline this repo calls grew a
  `prepublish` job on 2026-08-05 (`cosyte/.github#35`, `6142ac4`; its second layer defaulted on in
  `#36`, `90936ea`), so `ci.yml` began emitting a `ci / prepublish` context on every pull request
  here **with no commit landing in this repo**. Repository ruleset `19907924` did not name it, so
  the job could fail and the merge still landed on `main`, which is the branch that publishes.
  `ci / prepublish` is now a required context, `integration_id`-pinned like the other six.
  - **What it gates is this package's own worst shipped defect.** The job is an offline manifest
    lint that refuses a dependency specifier no registry can resolve, plus a probe that packs this
    tree and installs the tarball into a clean directory. `@cosyte/cli@0.0.1` and `0.0.2` reached
    the registry carrying `file:vendor/*.tgz` specifiers and are permanently uninstallable; the
    manifest lint would have refused both. A gate that catches that and then cannot block the merge
    reintroducing it is documentation.
  - **The order was load-bearing and is recorded because it is easy to get backwards.** The context
    name was read off a real `pull_request` check run before the ruleset was written, never off the
    workflow's `name:` field. Requiring a context nothing emits does not fail a pull request, it
    leaves it pending and unmergeable forever. A census of the eight most recent head shas here
    (`#27` through `#34`) finds `ci / prepublish` **zero** times, because the newest of them merged
    before the upstream job existed, so it could not have been required any earlier.
  - **`ci.yml`'s banner now covers the hazard that actually bit.** Every previous wording of it was
    scoped to splitting a step out of `verify` locally. The `uses:` reference is unpinned, so a job
    added upstream emits a new `ci / <job>` context here with no commit in this repo, and it always
    arrives unrequired.
  - **Deliberately NOT in this change: `release.yml`'s version-PR trap note.** It carries a stale
    required-context count and a claim about the "Version Packages" PR arriving with zero check runs
    whose truth depends on whether `RELEASE_PR_TOKEN` is authoring that PR. Two attempts to correct
    it inside this change each produced a fresh false claim: the first a false operational premise,
    the second a false claim about the note's own history. So it is cut out to its own change rather
    than rewritten a third time. Nothing about it is made worse here; it is left exactly as it was.

- **The shipped documentation sidebar was off the canonical IA spine, and it was holding up the
  docs site's deploy (CLI-SIDEBAR-IA-NONCANONICAL).** `docs-content/sidebars.json` declared two
  top-level categories that are not on the spine, **"MCP server"** and **"Reference"**. The docs
  site lints the sidebar it receives from each package's released `docs-content.tar.gz`, and in
  strict mode a non-canonical top-level label grades as an error, so this package failed that gate
  and the site stopped deploying. Pre-existing since the pages were authored; it surfaced only once
  an unrelated build failure stopped masking it.
  - Both categories are removed and their pages folded into categories this package already had, so
    **no page left the navigation and none was orphaned** (verified: the nine documents in
    `docs-content/` and the nine referenced by the sidebar are the same nine). **`mcp`** and
    **`reference-commands`** join **Guides**, next to `guides-overview`, both being task-oriented:
    what to run and what comes back. **`limitations`** joins **Troubleshooting**, next to
    `troubleshooting`, which is where the documentation standard puts known limitations.
  - The categories this package ships are now `Installation`, `Quickstart`, `Core Concepts`,
    `Guides` and `Troubleshooting`, in that order, under the `intro` document.
  - **"Reference" was deliberately NOT renamed to "API Reference".** That category is injected by
    the docs site, and a hand-authored one is refused outright rather than warned about, so the
    rename would have traded a failing check for a differently failing one. Whether and where the
    site adds it is the site's decision, not this package's, and this package neither authors nor
    positions it.
  - Verified against the site's own linter rather than by inspection, with the sidebar shipped in
    the previous release as a **negative control**: that one produces two errors and this one
    produces no findings. **Only a new release can clear the gate**, because it reads the sidebar
    out of the released artifact and published releases are immutable, so the previous release
    keeps its non-canonical sidebar permanently. That is reported without gating once a release is
    no longer current.
  - Documentation-artifact change only: no command, flag, exit code, diagnostic code or export
    moves, and no page content was rewritten.

- **The pre-commit PHI gate never saw a `git mv` into a scan root
  (PHI-SCAN-RENAME-BLIND-AT-PRECOMMIT).** `scripts/phi-scan.ts --staged` listed the index with
  `git diff --cached --name-only --diff-filter=AM`. Rename detection is on by default, so
  `git mv <path> test/__fixtures__/<name>` stages as a **two-path `R100` record**, and `R` and `C`
  are in neither `AM` nor `AMT`: the status filter deleted the record outright and the destination
  was never enumerated. Measured on this repo, both shapes walking through the
  `pnpm phi-scan --staged` pre-commit hook at **exit 0**: a regular file carrying a value this
  scanner's own floor catches (`:100644 100644 <sha> <sha> R100`), and a symbolic link
  (`:120000 120000 <sha> <sha> R100`, index mode `120000` under the scan root). `git mv` is an
  ordinary developer action, not crafted input, and the pre-commit hook is the gate it walked
  through.
  - **`--no-renames` is the remedy, and it costs the record stride nothing.** The destination
    arrives as a single-path `A` and the source as a `D` the filter drops, so the enumeration is a
    strict **superset** of the previous one. Verified under `diff.renames` set to `true`, `copies`,
    `false` and `1`, and under `diff.renameLimit=1`: no `R` or `C` record survives in any of them,
    which makes the two-field record stride structural rather than conditional. `copies` is not
    hypothetical; it produces a live `C100` here.
  - **The destination mode was never read at all.** The route enumerated with `--name-only` and read
    content with `git show :<path>`, and git stores a symbolic link as its **target path** under
    mode `120000`, so the scan was handed the path text and never the target's bytes. It now lists
    with `--raw -z` and **refuses** (exit `2`) any in-scope entry whose destination mode is not a
    regular blob. A refusal names the entry's own repo-relative path and an engine-owned token for
    its kind, and **never the link target**, which is working-tree text that can itself carry PHI.
    Every offender is named, not just the first. That guarantee is about a **refusal** and does not
    extend to a hit; see the linked-scan-root residual below.
  - **`T` (typechange) is now in the filter**, because replacing a _tracked_ regular fixture with a
    link is neither an add nor a modify (`:100644 120000 <sha> <sha> T`), so `--diff-filter=AM`
    deleted the record before any mode could be read. The reverse direction, a link replaced by a
    real file, is now scanned as the file it became.
  - **Each scan root's own path is in scope**, not just its contents. Git records no index entry for
    a directory, so an entry at exactly `test/__fixtures__` or `src` is that root replaced by a blob
    or a link, and a prefix test requiring the trailing slash let it through while the whole corpus
    went unscanned.
  - **The all-mode walk gets the same refusal.** A scanner whose pre-commit half refuses a link
    while its CI half silently drops one is not one a developer can reason about. The walk
    enumerates `Dirent.isFile()`, an lstat answer, so a link (and a linked _directory_, which
    `isDirectory()` also answers false for) fell out of the loop silently. The `.md` exemption
    deliberately does not reach a link: it is a judgement about a file whose bytes the walk could
    have read, and a link's name is no evidence about what is on the other side of it. A gitignored
    entry stays out of scope, by the same rule that already excludes a gitignored fixture.
  - **Two pre-existing exit-code defects fixed with it.** A missing or unreadable allow-list, and an
    unreadable scan root, both threw past every handler and exited **1** with a raw stack trace. `1`
    is this contract's code for _hits found_, so a caller branching on the exit code read a broken
    invocation as a PHI finding and a caller branching on "not 0" read it as the gate working.
    Neither was true. Both are now exit `2` with a diagnostic.
  - **Stated rather than left to be inferred, both pre-existing and neither closed here.** The
    staged route still does not enumerate `D` (a deletion has no staged blob to scan) or `U` (an
    unmerged path has no single one). The `U` half costs nothing that can reach a commit, and that
    was measured rather than assumed: `git commit` refuses an unmerged index outright. Under `src/`
    the staged route still covers only `.ts` files while the all-mode walk covers every non-`.md`
    file, so the CI sweep is what covers the difference; widening the staged half is a scope
    decision and was not taken here.
  - **The refusal rule is scoped to an _enumerated_ entry, and the unqualified version of it is
    false.** It covers an entry the walk reached beneath a root it had already opened, and a staged
    record in scope per the boundary rule, which under `src/` is `.ts` files only, so a staged link
    at `src/notes.json` is under a scan root and `--staged` still exits 0 over it while the all-mode
    sweep refuses it. Three shapes escape the rule, all pre-existing, all measured, none
    closed here: **(1)** a scan root that is itself a **live** link is followed by the all-mode walk,
    because `existsSync` and `readdirSync` both resolve, so the walk reads files no commit contains
    and reports their values under a **fabricated in-repo path** that holds no such file (the
    **dangling** direction is the mirror image: it reports clean over a corpus it never opened);
    **(2)** an **ancestor** of a scan root is in neither route's scope, so staging `test` as a link
    leaves `--staged` at exit 0 and the walk then follows it; **(3)** paths mode follows an
    explicitly named link, because `statSync` resolves. The `--staged` half of shape (1) **is**
    closed here. Closing the rest needs a refuse-a-scan-that-observed-nothing rule plus a decision
    about how far above a scan root to look, which is its own change.
  - `test/scripts/phi-scan.test.ts` builds throwaway git repositories for all of it, because these
    are properties of what `git diff --cached` reports and cannot be reproduced by scanning a path.
    **16 of its 34 tests run red against the scanner on `a7a92f8`**; the 18 that stay green are the
    pre-existing floor tests, the deliberate controls (an ordinary staged hit, a clean pass, a
    staged link outside both roots, an ignored link, and a check that the payload under test is
    something this scanner would otherwise catch), and the four that **pin the disclosed residuals
    above**. Those four are green on both trees by design: they pin behaviour this change does not
    alter, so that the scoped wording of the refusal rule cannot quietly revert to the absolute one.
    Synthetic values only.
  - **No change to the CLI's runtime surface**: no command, flag, exit code, diagnostic code or
    export moves. This is repository tooling.

## [0.0.3] - 2026-08-03

### Changed

- **FHIR support is unavailable in an npm-installed copy, and now says so instead of crashing.**
  `@cosyte/fhir` is not on the npm registry, so it cannot be declared as a dependency at all;
  measured, declaring it alongside `@cosyte/transform` (which requires it) fails the whole install
  with `ERESOLVE`. `@cosyte/transform` is therefore skipped by npm as an unresolvable optional
  dependency. Both were previously loaded with a bare `await import()`, which in an installed copy
  would have surfaced a raw resolver error and a stack frame, so FHIR `parse`/`inspect`/`fmt`/`validate`
  and `convert` now degrade to a value-free `CLI_PARSER_UNAVAILABLE` (exit `69`) with a diagnostic that
  says the package is not on the registry rather than "install it". **Neither diagnostic says "install
  it", and that is deliberate**: `npm install @cosyte/transform` fails `E404` on its own
  `@cosyte/fhir` peer, so `loadOptional()`'s stock wording ("install it to use this format, it is an
  optional dependency") would point a user at a command that cannot succeed. New
  `loadOptionalPackage(detail, load)` under `loadOptional`, exported on the `.` subpath.
  `@cosyte/fhir` is retained as a `devDependency` on the vendored tarball so this repo's own FHIR and
  `convert` tests still run; note that `devDependencies` **are** published, so that one
  `file:vendor/*.tgz` specifier does remain in the manifest, harmlessly, because a consumer never
  installs a dependency's `devDependencies` (verified: the install exits `0`). HL7 v2, `map-codes` and
  the six breadth formats are unaffected and work from a plain install.

- **Documented a pre-existing defect that this release makes reachable for the first time:
  `--omit=optional` produces an install in which the `cosyte` command does not run at all.** The
  install exits `0`, then every invocation, `--version` included, fails with `ERR_MODULE_NOT_FOUND` on
  `@modelcontextprotocol/sdk` and a raw stack trace, because the built `dist/bin/cosyte.mjs` imports
  the SDK statically at the top level rather than only on the `mcp` path. Verified identical on the
  base commit, so it is not introduced here; it simply could not be hit before, because the package
  could not be installed at all. `docs-content/` now says not to use that flag instead of implying it
  is a supported way to slim the install. **The code defect is not fixed here** and needs its own
  change: it also falsifies the "a plain `cosyte parse` never pulls it" claim in `src/bin/cosyte.ts`.

- **The docs no longer tell you to run `npx @cosyte/cli …`, which never worked.** Separate from the
  packaging defect and not fixed by it: `npx` runs the executable whose name matches the package
  name's last segment, which would be `cli`, and this package ships `cosyte` and `cosyte-mcp`, so the
  short form fails with `could not determine executable to run`. Reproduced on the published `0.0.2`
  and on the fixed tarball, whose `bin` block is byte-identical. `README.md`, `docs-content/installation.md`
  and both MCP registration snippets now use `npx --package @cosyte/cli cosyte …` /
  `npx -y --package @cosyte/cli cosyte-mcp`, each measured working. A `cli` bin alias would fix the
  short form and is deliberately not added, because `npm install -g` would then claim a command named
  `cli` on the user's `PATH`.

### Fixed

- **`@cosyte/cli` can be installed from npm again (CLI-UNINSTALLABLE-MANIFEST).** `0.0.1` and `0.0.2`
  both published with all ten `@cosyte/*` sibling packages declared as `file:vendor/*.tgz` local
  paths. `vendor/` is not in `files` and there is no `bundledDependencies`, so the tarball shipped
  none of them and every install route died on the first: `ENOENT ...
node_modules/@cosyte/cli/vendor/cosyte-fhir-0.0.0.tgz`. The siblings are now real registry ranges:
  `@cosyte/hl7` (`^0.0.7`) and `@cosyte/terminology` (`^0.0.9`) as hard `dependencies`, and the six
  breadth parsers plus `@cosyte/transform` (`^0.0.4`) as `optionalDependencies`. Verified the way a
  dry-run cannot: the packed tarball was installed in a clean directory outside the repo (exit `0`),
  then both bins were run and the `.` subpath imported under ESM and CJS.

- **`VERSION` and `cosyte --version` now report the release you are running (CLI-VERSION-DRIFT).**
  `src/core/version.ts` exported `"0.0.0"` while `package.json` said `0.0.2`, and the constant's own
  doc comment claimed it was "synced with `package.json#version` on release by the Changesets
  `version` script" when no such step existed. Confirmed in the published tarball: `@cosyte/cli@0.0.2`
  ships `VERSION = "0.0.0"` in `dist/index.mjs` and `dist/index.cjs`. It reached two user-visible
  surfaces, `cosyte --version` and the MCP server's advertised `serverInfo.version`. `scripts/sync-version.mjs`
  (ported from `@cosyte/transform`) now runs inside the `version` script, and `test/sanity.test.ts`
  compares the export against `package.json` so a skipped sync goes red rather than shipping.
  **The two assertions that let five bad releases through the sibling packages are fixed here, not
  just the value:** `docs-content/installation.md` asserted `typeof VERSION` (true of every wrong
  value) and now asserts the exact version, which the sync script keeps in step; and the declaration's
  `: string` annotation, which the sync script's pattern keys on, is pinned by its own test, so
  dropping it fails at `pnpm test` instead of silently at release time.

- **The `attw` publish gate no longer exits 0 on an untyped pack (ATTW-FALSE-GREEN-PORT).** The
  `attw` script was the bare CLI (`attw --pack . --profile node16`), and
  `@arethetypeswrong/cli@0.18.4`'s `getExitCode.js` opens with `if (!analysis.types) return 0`,
  returning before the problem list is read. So a tarball carrying no declarations at all printed
  "This package does not contain types." and **exited 0**, and `verify.sh` propagated that 0 as a
  pass. Reproduced on this package with zero concurrency and the real `--profile node16`
  invocation, twice: with `dist/` removed, and with all ten of the build's declaration files
  deleted and its JS left in place. The second is the realistic window, because `tsup` writes JS in
  one pass and declarations in a later one; instrumented on one build here at a 10ms poll, all
  eight `.mjs`/`.cjs` files appeared on a single poll at 4.92s and all ten declarations on a single
  later poll at 11.82s, a 6.90s interval. That interval moves with load (7.85s on a busier box);
  the ordering, and the ten declarations landing together, do not. Not answered with a lock or a
  build queue: the gate is now able to report that its own inputs were missing, whatever removed
  them.
  - `scripts/attw.mjs` (ported from the fix shipped in `@cosyte/terminology`) runs two nets around
    the real binary. A **preflight** that every relative path `package.json` promises exists and is
    non-empty, naming the missing file; and a **post-check** that promotes the untyped sentence to a
    failure, which catches declarations that are on disk but excluded from the tarball. Every
    argument this repo passes is forwarded, so `--profile node16` keeps its exact meaning: measured
    here, without it `@cosyte/cli/mcp` fails `node10` resolution and `attw` exits 1.
  - **The preflight also walks `bin`, which the ported original did not**, because this is a `bin`
    package and the sibling it came from ships no executable. Measured: with `dist/bin/cosyte.mjs`
    deleted and everything else built, `attw --pack . --profile node16` printed every subpath green
    and exited 0 over a tarball with no `cosyte` command in it.
  - **`--quiet`, `-q`, `--format`, `-f` and `--config-path` are refused by option name and not by
    value**, as is a `.attw.json` setting `quiet` or `format` (`readConfig()` applies it after
    argv). Each was measured here to remove the untyped sentence from the output while still
    exiting 0. `--config-path` is refused on a measurement rather than the inference the original
    recorded. **Two limits are disclosed rather than closed**, both measured: the match is on an
    exact argv token, so commander's attached and clustered short forms `-fjson` and `-Pf json` get
    through (`-qP` does not; the wrapper treats an empty transcript as a failure), and a declared
    path not starting with `.` is skipped by the preflight. The invocation this replaced exited 0
    on the same pack with no arguments at all.
  - **A correction to the ported message.** `files: ["dist"]` packs all ten declarations `tsup`
    emits while `package.json` names only four; the shared `dist/io-<hash>.d.*` **and the four
    `dist/bin/*.d.*`** ride along unnamed, and `analysis.types` is true if the tarball carries any
    declaration. Measured on this tree: losing the four declared declarations gives "No types"
    problems and **exit 1** while any of the other six survives, and only losing all ten gives the
    untyped sentence and **exit 0**. So a partial declaration loss is caught by `attw` itself and
    only a total one is the false green. The preflight reports both outcomes instead of asserting
    the exit 0, which the inherited wording would have done falsely.
  - `test/scripts/attw-gate.test.ts` pins all of it against the real binary, including attw's own
    exit 0, a negative control on a well-formed package, that a genuine attw failure still fails
    with attw's own status, and that the profile flag survives the wrapper in both directions.
  - `scripts/verify.sh` in the meta-repo is unchanged; its propagation was never at fault.

- **The route to an installable release, recorded in `RELEASING.md` and verified against the
  registry.** `@cosyte/hl7` (`0.0.3`), `@cosyte/terminology` (`0.0.4`) and all six breadth parsers
  would swap to real ranges today. `@cosyte/fhir` is unpublished (`FHIR-NPM-NAME`, an npm E403
  name-similarity rejection) and `@cosyte/transform@0.0.2` fails `E404` on its `@cosyte/fhir` peer,
  so neither can. An installable release is nonetheless reachable before that unblocks, because npm
  tolerates an `optionalDependency` that fails to resolve (measured). It needs a code change first:
  `@cosyte/fhir` and `@cosyte/transform` are imported with a raw `await import()`, so they must be
  routed through a guarded loader to degrade to `CLI_PARSER_UNAVAILABLE` (exit `69`) rather than
  crash. `loadOptional()` cannot be reused unchanged: it takes a `CosyteFormat`, and `"transform"` is
  not one, and its diagnostic hardcodes the word "parser". Not undertaken here.
  - **Superseded by the two `0.0.3` entries above**: the swap and the loader change were both
    carried out. Two claims that entry made did not survive
    contact: the "name similarity" reading of the `@cosyte/fhir` `E403` was **retracted across the
    ecosystem on 2026-08-03** (the cause is unexplained; do not assert one), and "npm tolerates an
    `optionalDependency` that fails to resolve" is true only in isolation. Declaring **both**
    `@cosyte/fhir` and `@cosyte/transform` optional fails the install outright with `ERESOLVE`, which
    is why `@cosyte/fhir` ended up not declared at all rather than declared optional.

## [0.0.2] - 2026-07-31

### Added

- **`README.md` now opens with the shared Cosyte lockup in a `<picture>` block, above the H1.** The
  dark-ground tile (`cosyte-lockup-tile-on-dark-1200x300.png`) sits behind a
  `prefers-color-scheme: dark` media query and the light-ground tile
  (`cosyte-lockup-tile-on-light-1200x300.png`) is the inner `<img>` fallback, so the mark is read on
  a ground that matches the page it is read on. The `# @cosyte/cli` heading and the blockquote under
  it are unchanged: the artwork reads "Cosyte" and the heading names the package, so nothing on the
  page is duplicated. Both URLs were re-checked immediately before the push and returned
  `200 image/png` (10513 bytes dark, 10455 light). The block was copied byte for byte out of
  `@cosyte/hl7`'s `README.md` rather than retyped and diffed against it, because a transcription
  error in one of these URLs is a broken image on a public package page.

  **This replaces the per-package banner added earlier in the same unreleased window, and the reason
  it replaces it is recorded rather than dropped.** That banner was a plain markdown image, chosen
  over `<img>` or `<picture>` on the stated ground that whether npm's markdown sanitizer preserves a
  `<picture>` element was unverified. That was an accurate account of what was known when it was
  written, and it has since been measured: **GitHub honours the `prefers-color-scheme` switch**
  (observed on `@cosyte/astm` in dark mode, where the rendered image's `currentSrc` resolves to the
  on-dark tile and its parent element is `PICTURE`), and **on the npm package page the `<img>` is
  hoisted out of its `<picture>` by the anchor wrapper** rather than the element being stripped, so
  the light cut renders, which is the correct one there because npmjs.com has no dark mode. Those two
  measurements were taken on `astm` and reported into this repo rather than re-taken here; what was
  re-checked directly for `cli` is that both tile URLs return `200 image/png`. The failure mode is
  safe either way: a renderer that strips `<source>` renders the inner `<img>`, so the worst case is
  a light-ground mark on a dark page, never a missing or broken image.

  **Why this is corrected rather than annotated in place.** `0.0.1` published on 2026-07-29, a day
  before the banner landed, so no `@cosyte/cli` tarball has ever carried the banner or the sentence
  announcing it. Annotating an entry no consumer received would publish an addition and its
  replacement as two changes when only one was ever visible, so the banner entry is removed from this
  release and its reasoning is carried here instead of being silently reversed.

  The alt text describes the artwork, a plus mark set in two overlapping rounded squares beside the
  Cosyte wordmark, rather than the package. It is what a screen reader on the npm page reads out and
  what a reader gets when the image fails to load, so repeating the `@cosyte/cli` heading below it
  would be a wasted line. The wording is the one eight sibling packages already carry, confirmed
  against both rendered PNGs here rather than copied on trust.

### Fixed

- **The public surface now states that `0.0.1` is published and uninstallable (ASSETS-P8).** `0.0.1`
  published on 2026-07-29 with all ten `file:vendor/*.tgz` dependency specifiers intact. `vendor/` is
  not in `files` and there is no `bundledDependencies`, so every install route (`npm i`, `npm i -g`,
  `npx`) fails with `ENOENT` on `node_modules/@cosyte/cli/vendor/cosyte-fhir-0.0.0.tgz`. Reproduced
  in a clean directory. A published version is immutable (ADR 0001), so `0.0.1` stays broken and the
  fix must ship as a later version.
  - `README.md` gains a **"Known issue"** section stating what fails, the exact error, why, and that
    a source checkout is the only workaround. `docs-content/installation.md` gains the same under
    **"Installing fails today"**. Both copies of the broken `npx`-based MCP registration snippet are
    annotated (`README.md` and `docs-content/mcp.md`).
  - **Four false claims corrected.** (1) `README.md` said "not yet published to npm"; it is
    published. (2) It described swapping the vendored sibling deps for real `@cosyte/*` npm ranges as
    a step still to come "at that flip"; the flip already happened without the swap, which is the
    defect. (3) The same "not yet published" claim appeared in **three** `docs-content/` pages. (4)
    The `redact`/`deid` terminal diagnostic, the `--help` text, three JSDoc blocks that compile into
    `dist/*.d.ts`, and **five** docs pages said `@cosyte/deid` was unpublished, unshipped, or unbuilt;
    it is published at `0.0.2`, and the accurate statement is that the CLI does not wire it yet. Every
    count here was re-derived by census of the base tree, not estimated.
  - **The "all eight formats" claim was checked and is correct**: `CosyteFormat` and `OP_SUPPORT` both
    enumerate exactly eight.
  - `RELEASING.md` records that the documented dependency-swap step was skipped, that a green
    `npm publish --dry-run` cannot catch this (it packs a tarball but never resolves its deps from a
    registry), and adds a checklist step to install the published version from outside the repo.

## [0.0.1] - 2026-07-29

### Added

- **Phase 7: release hardening (the final roadmap phase; the CLI is feature-complete).** No new
  runtime command surface: this phase is publish-readiness.
  - **Fuzz gate over the two input boundaries.** `test/fuzz.property.test.ts` fuzzes the terminal
    (`run`, over arbitrary argv vectors + stdin bytes) and the agent surface (`dispatchTool`, over an
    arbitrary tool name + arguments), asserting neither ever throws an unhandled exception, always
    resolves to a documented exit code, and never leaks a raw stack frame onto a secondary channel. The
    case count scales via `CLI_FUZZ_RUNS`; a scheduled **Fuzz** workflow (`.github/workflows/fuzz.yml`)
    runs it nightly at a high count, and `pnpm test:fuzz` runs it on demand.
  - **Exit-code golden matrix.** `test/exit-code-matrix.test.ts` locks one representative invocation for
    every code in the `0/1/2/65/66/69/70` contract, driven end-to-end through `run`, so a regression that
    turns an invalid-input exit `1` into a `0` (or renumbers a code) fails CI. The exit-code map and the
    stable `CLI_*` diagnostic codes are a stability surface: renaming one is a breaking change.
  - **Publish dry-run proven.** A new `smoke` gate (`scripts/smoke.mjs`, wired into `verify.sh`)
    exercises the **built** package (the dual ESM/CJS `.` and `./mcp` subpath exports, and **both**
    `cosyte` / `cosyte-mcp` bins under `node`) and `npm publish --dry-run` assembles a clean tarball
    (`dist` + `README`/`LICENSE`/`CHANGELOG`). `attw` remains a publish gate.
  - **Honesty + release docs.** `docs-content/limitations.md` (wraps-not-implements, the non-goals, the
    honest per-(format, operation) support matrix, the PHI-default posture), a man-page-style
    `docs-content/reference-commands.md`, and `RELEASING.md` (the one-package-two-bins publish,
    provenance/OIDC, the vendored-`file:`→npm dep swap, and the two standing founder stops).

- **Phase 6: six more formats + streaming + shell completion (ADR 0025).** The `cosyte` CLI now wraps
  **all eight cosyte formats**, routed through a single lazy **per-format adapter registry**
  (`src/core/parsers.ts`) that replaces the old per-command `hl7 ? : fhir` branches and makes support
  **per (format, operation)**. An unsupported (format, op) is a value-free `CLI_FORMAT_UNSUPPORTED`,
  never a fake (ADR 0018).
  - **New formats and their honest capabilities.** `x12`, `astm`, `ncpdp` (SCRIPT) → **parse · inspect ·
    fmt · validate**; `ccda` → **inspect · fmt** (XML re-serialize) **· validate** (`parse` deferred, no
    library-blessed JSON model; XML is the canonical form); `dicom` → **inspect · validate** (`parse`/`fmt`
    deferred. The model is binary); `mllp` → **parse · inspect** (a transport container the CLI de-frames
    to its enclosed HL7 message(s)). Content autodetection now covers all eight (conservative + disjoint:
    a leading `0x0B` VT byte routes to `mllp`, `ISA`→`x12`, an `H`-record→`astm`, `<ClinicalDocument>`→`ccda`,
    a `<Message>` in the NCPDP namespace→`ncpdp`, `DICM`@128→`dicom`); `--format` accepts `mllp`.
  - **Streaming / multi-message.** `parse` emits **NDJSON** with per-record isolation for inherently
    multi-record inputs: an **MLLP** stream (one record per frame) and any input under the new
    **`--ndjson`** flag (one record per non-empty line: the FHIR bulk-data convention). A record that
    fails to parse becomes a value-free `{ record, error }` line and the stream continues; the overall
    exit is a data error (`65`) if any record failed. A single message is unchanged (one pretty, or
    `--json` compact, envelope + a value-free warning-count note).
  - **Shell completion.** `cosyte completion <bash|zsh|fish>` prints a static, value-free completion
    script generated from the command tree.
  - **Dependencies. The cap stays 4 (no umbrella edit).** The six breadth parsers are vendored
    **`optionalDependencies`**, lazy-loaded per format and **outside** the hard-runtime-dep closure
    (ADR 0025, mirroring the MCP SDK isolation of ADR 0024). An absent optional parser degrades to a
    value-free **`CLI_PARSER_UNAVAILABLE`** (exit `69`), never a crash. Pinned sibling commits: dicom
    `d1ed590`, x12 `0c60606`, ccda `3753216`, ncpdp `184eecc`, astm `92ac210`, mllp `aecff75` (all
    v0.0.1 except astm records-layer). Third-party CLI-core runtime deps stay **zero**.
  - New diagnostic **`CLI_PARSER_UNAVAILABLE`** (exit `69`); the exit-code contract is otherwise
    unchanged (`0/1/2/65/66/69/70`). New value-free inspect summaries per format; new programmatic
    exports (`OP_SUPPORT`, `supportsOp`, `formatsSupporting`, `parseFormat`, `inspectFormat`, `fmtFormat`,
    `validateFormat`, `deframeMllp`, `loadOptional`, `valueFreeLocator`, `DETECTABLE_FORMATS`,
    `completionCommand`, and the result/summary types). The public `WIRED_FORMATS` set is **removed** in
    favour of the per-op `OP_SUPPORT` matrix (pre-alpha `0.0.x` surface change).

- **Phase 5: the `cosyte-mcp` MCP server (the agent front door).** A **stdio Model Context Protocol
  server** that exposes the shared command core to an LLM/agent as callable tools: the second adapter
  over one core (ADR 0022, 0024). Reachable three ways: the new **`cosyte-mcp`** bin, the **`cosyte mcp`**
  subcommand, and the **`@cosyte/cli/mcp`** subpath export. Tools: **`parse`**, **`validate`**,
  **`inspect`**, and **`convert`**, each a thin wrapper that calls the same command handler the terminal
  uses (with `--json`), so `cosyte parse` and the MCP `parse` tool agree by construction; the CLI
  re-implements nothing.
  - **PHI posture, inherited and hardened.** Every tool runs under the value-free posture. There is
    **no** `--unsafe-show-values` door on the agent surface. A tool _result_ carries the requested data
    (the parsed model / converted Bundle: the explicit request); a tool _error_ carries only the value-
    free diagnostic (a stable code + positional context), never an input value. A parsed-but-invalid
    `validate` verdict is a **successful** call reporting the verdict, not a tool error; only a hard
    failure (unparseable / no input / usage) sets `isError`.
  - **The MCP SDK is isolated and runtime-optional (ADR 0024).** `@modelcontextprotocol/sdk` (the CLI's
    first and only third-party runtime dependency) is declared in **`optionalDependencies`** (pinned
    `1.29.0`) and imported **only** in `src/mcp/server.ts`, reachable solely via the `./mcp` boundary
    (the subpath, the `cosyte-mcp` bin, and a dynamic `import()` on the `cosyte mcp` branch). A `cosyte
parse` invocation never loads it; the core works with the SDK absent (`--omit=optional`). Because it
    is not part of the hard runtime closure, the umbrella `verify-policy.json` cap on `cli` runtime
    `dependencies` stays **4**: unchanged. A static isolation test proves no `core`/`commands` module
    imports the SDK.
  - New subpath export **`@cosyte/cli/mcp`** and new **`cosyte-mcp`** bin; new programmatic exports
    (`createMcpServer`, `startStdioServer`, `dispatchTool`, `TOOL_DEFS`, and the MCP result types) on the
    `./mcp` subpath. `redact`/`deid` (gated on `@cosyte/deid`) and `map-codes` are deliberately not
    exposed as tools yet.

- **Phase 4: `convert` / `map-codes` (the consumer-of-consumers commands).** Two commands that wrap
  the higher-layer libraries; the CLI adds **no** mapping or terminology logic of its own.
  - **`convert <file|-> --to fhir [--json] [--quiet]`**: **HL7 v2 → FHIR R4** via
    **`@cosyte/transform`**. Parses the input with `@cosyte/hl7`, hands the parsed message to
    `transform.toFhir`, and emits the serialized FHIR **message `Bundle`** (the library's canonical
    serialization) on **stdout**: `cosyte convert` equals `transform`'s programmatic output. The
    conversion's value-free issues (a stable code + a v2-index → FHIRPath locator, never a field value)
    render on stderr (or as a JSON envelope under `--json`); `--quiet` suppresses them. The
    load-bearing rule mirrors `validate`: an **error-severity** transform issue drives exit **`1`**,
    never `0`. `--to fhir` is required (the only target); a **non-HL7 source** (e.g. a FHIR document) is
    a value-free `CLI_FORMAT_UNSUPPORTED` data error (`65`), never a fake conversion; an unparseable
    HL7 input is `CLI_PARSE_FAILED` (`65`).
  - **`map-codes <conceptmap|-> --code <code> [--system <uri>] [--version] [--display] [--json]
[--quiet]`**: translate a single source coding through a **BYO FHIR R4 ConceptMap** via
    **`@cosyte/terminology`** (`$translate`). The positional is the ConceptMap document; the source
    coding is named by flags. A ConceptMap and a code are **reference data, not PHI**, so the
    translation result goes to **stdout**: a **match** → the target coding(s) + exit **`0`**; an
    **unmapped** code → the never-fabricate `TERM_TRANSLATE_UNMAPPED` signal + exit **`1`**. A map that
    is not valid JSON or not a loadable ConceptMap is the new value-free **`CLI_MAP_INVALID`** data
    error (`65`), surfacing the stable terminology-loader code (e.g. `TERM_CONCEPTMAP_MALFORMED`),
    never the map's bytes.
  - New **`CLI_MAP_INVALID`** diagnostic code. New programmatic exports: `convertCommand`,
    `convertOutcome`, `mapCodesCommand`. New runtime dependencies (ADR 0023): **`@cosyte/transform`**
    (`e6c4531`, v0.0.0) and **`@cosyte/terminology`** (`e5ed368`, v0.0.1) as **hard, first-party,
    lazy-loaded** deps: vendored as `pnpm pack` tarballs under `vendor/` until PUB-FLIP
    (`pnpm vendor:refresh`; umbrella ADR 0008). The umbrella `verify-policy.json` cap on `cli` runtime
    deps was raised **2 → 4**; third-party CLI-core runtime deps stay **zero** (both siblings are
    lazy-loaded per command, so the `parse` fast path never loads them).
  - **ADR `0023`**: wire `@cosyte/transform` + `@cosyte/terminology`; the deliberate 2 → 4 cap raise
    (amends ADR 0021).

- **Phase 3: `validate` / `inspect` / `fmt`.** Three commands over the two wired parsers
  (HL7 v2 + FHIR R4), each a thin wrapper that re-implements no library logic.
  - **`validate <file|-> [--profile] [--json] [--quiet]`**: parse + run the wrapped parser's own
    validation surface, with the **verdict in the exit code**: `0` valid, **`1` invalid** (parseable
    but non-conformant), `65` unparseable, `66` no input, `2` usage. The load-bearing rule: a
    validation failure is **never** exit `0`; "unparseable" (`65`) is a distinct signal from "parsed
    but invalid" (`1`). Findings are **value-free**: a stable code, a severity, and a positional
    locator (a FHIRPath, or an HL7 segment/field index), on stderr by default, or as value-free JSON
    on stdout under `--json`; `--quiet` makes the exit code the whole signal. The CLI invents **no**
    verdict: FHIR validity is `@cosyte/fhir`'s `validateResource().valid` (plus any error-severity
    read issue); HL7 validity is "parseable" (its warnings are non-fatal by the library's design:
    surfaced, never failing). **`--profile` is gated** to an honest `CLI_NOT_IMPLEMENTED` (exit `69`):
    the CLI bundles no profiles yet, so it never fakes or silently drops a profile verdict.
  - **`inspect <file|-> [--json]`**: a **value-free structural summary**: HL7 message type, version,
    per-segment-type counts, and a warning count; FHIR `resourceType`, Bundle entry counts by type, and
    a read-issue count. Counts and structural type codes only, never a field value.
  - **`fmt <file|->`**: **canonical re-serialization** via the wrapped library's spec-clean
    serializer (`Hl7Message.toString()` / `serializeResource`); its stdout **is** the data channel. An
    unparseable input is a data error (`65`) with **no partial emit**.
  - New `EXIT.INVALID` (`1`): the `validate` verdict code (the exit-code contract is now
    `0/1/2/65/66/69/70`). All four commands share one input + format front door (`core/resolveInput`)
    and one value-free parser-failure boundary (`core/wrap`), so the value-free-by-default posture and
    the `--unsafe-show-values` chokepoint apply uniformly; `parse` was refactored onto the shared
    helpers (behavior-preserving). New programmatic exports: `validateCommand`, `inspectCommand`,
    `fmtCommand`, `resolveInput`, `parseFailureResult`, `formatHl7Position`, `errorResult`. No new
    runtime dependencies: stays within the cap of 2.

- **Phase 2: PHI posture hardened + `redact`/`deid` + `--unsafe-show-values`.**
  - **`--unsafe-show-values`**: a global, opt-in, PHI-exposing flag, resolved once and order-
    independently and funnelled through a **single chokepoint** (`core/phi.ts`), so the "a value
    reaches a secondary surface **iff** the flag is set" property holds in one place. Off by default;
    with it set, a `CLI_PARSE_FAILED` diagnostic appends a bounded, single-line excerpt of the
    offending input. Every other surface stays value-free, and a successful parse still puts values
    only on the stdout data channel.
  - **`redact` / `deid` (`<file|->`, `--format`)**: the de-identification command, shipped as an
    **honest, typed `CLI_NOT_IMPLEMENTED`** (new exit code `69`, `EX_UNAVAILABLE`). It is **gated on
    `@cosyte/deid`** (unpublished, `DEID-1` in flight), **never reads the input**, and never emits a
    partial Safe-Harbor scrub presented as de-identified. A built-in redactor is **deliberately
    withheld**: a partial scrub over only the obvious PHI loci would leave PHI behind and present a
    false-safety impression (the cardinal hazard). It delegates to `@cosyte/deid` via a documented
    seam (`core/deid.ts`) when that library ships and is vetted.
  - **Never a PHI temp file / never a file log**: proven by test (no command creates a file in the
    working directory) and by design (commands return a `RunResult`; only the thin `bin` writes to
    process streams).
  - New `CLI_NOT_IMPLEMENTED` diagnostic code and `EXIT.UNAVAILABLE` (`69`); new programmatic exports
    (`PhiPosture`, `VALUE_FREE`/`SHOW_VALUES`, `extractPhiPosture`, `unsafeInputSuffix`, `deidStatus`,
    `redactCommand`).

- **Phase 1: the `cosyte parse` foundation.** Reshaped the scaffold from a library skeleton into a
  **`bin` package**: `package.json#bin` maps `cosyte` → `dist/bin/cosyte.mjs` (a shebang entry over a
  testable `core`), argument-parsed with Node's built-in `util.parseArgs` + a hand-rolled subcommand
  dispatcher (**no third-party CLI framework**).

- **`cosyte parse <file|->`**: reads a file argument or stdin (`-`); **autodetects the format by
  content** (HL7 v2 `MSH` framing, FHIR JSON `resourceType`): conservative and fail-safe (a confident
  single match parses; ambiguity/no-match is a data error asking for `--format`, never a guess); routes
  to the wrapped parser (**lazy-loaded** per format); emits the parsed model as **typed JSON on
  stdout**. Flags: `--format`, `--json`, `--quiet`, `--no-color`.

- **The exit-code contract** (`sysexits.h`-grounded, documented, tested): `0` success · `2` usage ·
  `65` data/parse error (`EX_DATAERR`) · `66` no input (`EX_NOINPUT`) · `70` internal (`EX_SOFTWARE`).
  The CLI never exits `0` on input it could not handle.

- **Value-free diagnostic channel** with stable `CLI_*` codes (`CLI_FORMAT_UNDETECTED`,
  `CLI_FORMAT_AMBIGUOUS`, `CLI_FORMAT_UNSUPPORTED`, `CLI_NO_INPUT`, `CLI_EMPTY_INPUT`,
  `CLI_PARSE_FAILED`, `CLI_USAGE`, `CLI_INTERNAL`). **stdout is the data channel; every stderr line is
  value-free**: code + position only, never a field value. No temp files, no file logging.

- **Programmatic `core` API** (the `.` subpath): `detectFormat` / `classifyCandidates` /
  `detectionError`, `EXIT`, `CLI_CODES` / `CliError`, `run`, `parseCommand`, `VERSION`.

- **Runtime dependencies (ADR 0021):** `@cosyte/hl7` (`46d50eb`, v0.0.1) and `@cosyte/fhir` (`7a099b2`,
  v0.0.0) as **hard, first-party** deps (an `npx` bin cannot peer-depend) vendored as `pnpm pack`
  tarballs under `vendor/` until PUB-FLIP (`pnpm vendor:refresh`; umbrella ADR 0008). Capped at **2**
  by the umbrella `verify-policy.json`; third-party CLI-core runtime deps stay **zero**.

- **ADRs:** `0021` (developer-tooling tier is a `bin` that hard-depends on first-party siblings;
  third-party runtime deps minimized) and `0022` (one repo, two bins: the CLI and the future
  `cosyte-mcp` MCP server over one core; the web playground is out of scope).

### Changed

- **The documented per-(format, operation) support matrix now states its negatives in words.** In
  `docs-content/limitations.md` the table used a bare `U+2014` **as a cell value meaning "not
  supported"**. The em-dash sweep below rewrote it as punctuation, so `dicom` `fmt`, `mllp` `fmt` and
  `mllp` `validate` rendered as a stray colon: **"support absent" silently became "support unstated"**,
  on the page whose whole job is honest capability disclosure, in a form a reader would read as a
  rendering artifact rather than as a claim. Caught by the conformance refuter, not by CI, and nothing
  in this repo's CI could have caught it (`test/docs-content.test.ts` only executes runnable `ts`
  blocks, and Prettier's glob does not cover `docs-content/`). Those three cells now read
  `not supported`. **The support facts are unchanged; the page now says them.** Before sweeping any
  repo for this character, find the places it is a value rather than punctuation and convert those by
  hand, to a word, first.

- **No cosyte surface in this repo uses an em dash any more, and a CI gate keeps it that way.** The
  brand rule (`knowledgebase/06-brand/voice-and-tone.md`, "No em dashes. Ever.") bans `U+2014`
  outright and names commit messages explicitly. Measured byte-level over **all 124 tracked files**,
  not over markdown alone: **659 occurrences across 87 files**, all as the literal character and none
  in an encoded form. **61 of the 87 are not markdown** (26 are), and one is `package.json`, whose
  `description` is published to npm and rendered on the package page. Every occurrence was rewritten
  in place with a period, a colon, a comma, or parentheses, never re-encoded. Consumer-visible text
  that changed wording: the npm description, `README.md`, `docs-content/`, `cosyte --help`, the
  generated `bash`/`zsh`/`fish` completion scripts, and the `redact`/`deid` and reserved `--profile`
  unavailability messages. **No stable code, exit code, flag name, or JSON field changed**, so nothing
  branching on an exit code or parsing `--json` is affected. Commit subjects already on `main` are
  left alone: the message half runs on `pull_request` only, and history is not rewritten.
  - **The gate.** `scripts/check-no-emdash.sh` (`pnpm check:no-emdash`) plus
    `.github/workflows/no-emdash.yml` scan both halves the rule covers: every tracked file, and the
    pull request title, body, and commit messages, on the non-default `edited` trigger so retitling a
    pull request re-checks it. The new `no-emdash` check-run context is required by the
    `ci-required-checks` ruleset.
  - **Binary handling, which is why this repo does not run the text-only variant its siblings run.**
    `cli` tracks eleven binaries (the ten `vendor/cosyte-*.tgz` packed sibling dependencies and
    `test/__fixtures__/sample.dcm`), so the script partitions on an explicit NUL-byte rule rather than
    on `grep -I`'s heuristic, which would silently skip a genuine text file with a broken encoding.
    The reason is measured rather than precautionary: `vendor/cosyte-hl7-0.0.0.tgz` **already
    contains the byte sequence `E2 80 94`** by compression coincidence, so a text-only scan reds on it
    today, naming a compressed byte stream nobody wrote and offering no way to fix it.
  - **Disclosed limits, in the script header rather than left implicit.** A tracked _text_ file
    holding a NUL byte is exempt and its em dash would be missed (there is none today; the excluded
    count on the OK line is the tell). Encoded-form matching is literal, so lowercase `%e2%80%94`, a
    capital-X `&#X2014;`, and a semicolon-less `&#x2014` pass. The scan reads file contents, never
    file names.

- **The published type declarations no longer carry internal project bookkeeping.** `dist/index.d.ts`
  and `dist/mcp.d.ts` (and their `.d.cts` twins) are compiled from the JSDoc on every exported symbol,
  and that JSDoc was citing item identifiers (`CLI-6`), ADR numbers (`ADR 0018`, `0021`, `0022`,
  `0025`), the meta-repo roadmap in prose and by path (`cli roadmap §7`,
  `operations/roadmaps/cli.md`), and phase language (`§Phase 4`, `Phase-5`, "in a later phase"). All
  of it rendered on hover for anyone who installed the package. **Measured on `62fba77` with the rule
  set that ships alongside: 61 occurrences across 23 tracked `src/` files, producing 56 across the
  three declaration files a consumer receives (43 in `dist/index.d.ts`, 12 in `dist/mcp.d.ts` and 1
  in the shared `dist/io-*.d.ts` chunk both entries import), each mirrored in its `.d.cts` twin. Now
  0 on every one of them.** (The shared chunk is easy to miss and was missed once here: a count that
  scans only the named entry points under-reports.) Every removal is a cut, not a rewrite: the
  surrounding guarantees (value-free stderr, the never-a-fake `CLI_FORMAT_UNSUPPORTED`, the gated
  `redact`, the exit-code contract) are worded exactly as strongly as before. Internal traceability
  stays where the convention puts it: this file, the changesets, the commits and the roadmap.

- **A dependency-budget figure left `src/core/deid.ts` too.** The module said wiring `@cosyte/deid`
  "would breach the CLI's runtime-dep cap (2)". Only the number was stale: the cap has been 4 since
  `convert`/`map-codes` landed, and the constraint itself still holds, because the package declares
  exactly 4 hard runtime dependencies and a fifth would indeed breach it. The clause went because a
  dependency-budget figure is internal bookkeeping a consumer cannot act on, not because the
  constraint lapsed. The reasons that actually ground the refusal to ship a built-in redactor are
  untouched: `@cosyte/deid` is unpublished, the wrapped parsers expose no de-identification API, and
  a partial scrub would present a false-safety impression.

- **`CosyteFormat`'s documentation no longer understates autodetection.** It read as though content
  detection recognised only HL7 v2 and FHIR, with the other six accepted by `--format` but "not yet
  wired", which has not been true since all eight formats gained signatures. The stale sentence is
  removed rather than restated.

- **A gate now enforces the public-surface rule, which is why the class stops regrowing.**
  `scripts/check-no-internal-refs.sh` (`pnpm check:no-internal-refs`, on the `verify.sh cli` ladder)
  plus `.github/workflows/no-internal-refs.yml` port the shape of `hl7`'s gate
  ([hl7#62](https://github.com/cosyte/hl7/pull/62), [hl7#64](https://github.com/cosyte/hl7/pull/64))
  and `ncpdp`'s ([ncpdp#36](https://github.com/cosyte/ncpdp/pull/36)) rather than the file. Four
  passes: the public markdown surface line by line and paragraph-joined, the npm metadata, `src/`
  doc comments, and `src/` string literals (the pass that would have caught the two identifiers this
  package printed to a user's terminal). Seven rules. Re-derived for this repo: the scan surface, a
  standards-designation exclusion list covering **all eight** formats (this is the package where
  `HL7-V2`, `FHIR-R4`, `DICOM-SR`, `NCPDP-SCRIPT`, `X12-837P`, `CCDA-R2.1`, `MSH-2`, `NM1-03`,
  `439-E4` and `ICD-10-CM` are live at once, so the `WORD-N` trap is at its widest), and a seventh
  rule no sibling has, a **prose roadmap citation**, which was 30 of the 61 and which `hl7`'s
  path-keyed rule cannot see. Both self-test halves run on every invocation: positive samples prove
  each rule still matches, negative samples prove none has been widened into the `WORD-N` shape that
  would delete the reference material the CLI's docs exist to provide. `CHANGELOG.md` is excluded on
  purpose, as it is in `hl7` and `ncpdp`: it ships inside the npm tarball, yet the convention names it
  as one of the places identifiers belong. That contradiction is ecosystem-wide, and it is recorded
  here rather than settled by one repo.

- **`redact`/`deid` no longer names an internal tracking identifier on any consumer surface.** The
  `CLI_NOT_IMPLEMENTED` text printed when de-identification is unavailable carried an internal work
  item that means nothing to anyone running the command, and the same identifier reached the
  published type declarations (`dist/index.d.ts` / `dist/index.d.cts`), where it surfaces in editor
  tooltips. Both now state only the consumer-observable fact: the command delegates to
  `@cosyte/deid`, which is unpublished, and the CLI ships no built-in redactor because a partial
  scrub would present a false-safety impression. The stable `CLI_NOT_IMPLEMENTED` code and the exit
  `69` are unchanged.

- **`CLI_PARSER_UNAVAILABLE`'s message no longer cites an internal decision record.** The error
  raised when an optional per-format parser is not installed pointed at an ADR number, which is
  meaningless to a caller; it now just names the package to install. The stable
  `CLI_PARSER_UNAVAILABLE` code and the exit `69` are unchanged. The same sweep removed the
  remaining roadmap-phase language from `README.md` and `docs-content/troubleshooting.md`.

- **The CI checks are now binding on `main`.** `ci / verify (22, ubuntu-latest)`,
  `ci / verify (24, ubuntu-latest)`, `ci / actionlint` and `codeql / analyze (javascript-typescript)`
  are required status checks, each pinned to the `github-actions` app, alongside branch deletion and
  force-push protection. They were advisory before: a red check could not stop a merge. Dependabot
  now watches the npm and GitHub Actions dependency surfaces weekly, which nothing did previously.

- **Reshaped the package from the parser-library scaffold to a `bin` package.** Removed the archetype
  stubs (`parseCli`, `WARNING_CODES`, `FATAL_CODES`); replaced the library `src/index.ts` and the
  round-trip property test with the command tree, the programmatic `core` API, and command-contract /
  autodetection / PHI-leak / equivalence tests. Rewrote `docs-content/` and `README.md` for the CLI.

### Fixed

- **README + guides now describe the shipped Phase-3 command surface.** The `README.md` and
  `docs-content/guides-overview.md` "Status" blurbs read as a Phase-1-forward roadmap ("Phase 1 ships
  `parse`…"); they now state the current surface directly (`parse` / `validate` / `inspect` / `fmt`
  and the gated `redact`/`deid`) over the two wired parsers (HL7 v2 + FHIR R4). The pre-alpha,
  not-yet-published-to-npm status is unchanged (accurate), and the `npx`/`npm install -g` examples now
  carry a "not on npm yet" caveat (docs-only; README-ORG-SWEEP).

- **`phi-scan` now scans the real fixture directory.** The scanner's fixture root pointed at a
  nonexistent `test/fixtures/`; it now walks `test/__fixtures__/` (and the same path in the staged
  filter), so the PHI commit-gate actually covers the CLI's synthetic fixtures.

[Unreleased]: https://github.com/cosyte/cli/compare/v0.0.3...HEAD
[0.0.3]: https://github.com/cosyte/cli/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/cosyte/cli/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/cosyte/cli/releases/tag/v0.0.1
