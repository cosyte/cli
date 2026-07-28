#!/usr/bin/env bash
# scripts/check-no-internal-refs.sh
#
# Founder directive, 2026-07-27: NO INTERNAL PROJECT BOOKKEEPING ON A PUBLIC SURFACE.
# Anything a consumer reads (a GitHub release body, README.md, docs-content/, the npm
# package description) describes what the software does and what changed. It must never
# carry our internal bookkeeping: item identifiers (`CLI-6`, `CCDA-P7`), "Phase 8" /
# "roadmap Phase K", sweep and programme names, ADR numbers, internal repo paths, or
# process commentary about how the artifact came to exist. Source of truth: the meta-repo's
# `documentation/conventions.md`, "No internal project bookkeeping on a public surface".
# The founder's words: "The releases should also not speak on anything regarding phases,
# etc. That has no relevance to the user consuming it. This goes for readmes and
# documentation as well."
#
# WHY THIS IS A GATE AND NOT A MEMORY NOTE. Founder, same day: "it needs to not just be a
# memory note, but something that is addressed in the workflow accordingly. This needs to
# not happen again." A one-time sweep regresses the first time someone writes `(CLI-8)` into
# a README. A documented rule governs whoever reads it; a gate governs everyone.
#
# AND IN THIS REPO THE REGRESSION ALREADY HAPPENED TWICE, WHICH IS WHY THE GATE ARRIVES
# LATE RATHER THAN EARLY. `@cosyte/cli` shipped an internal work item inside
# `CLI_NOT_IMPLEMENTED`'s message and an ADR number inside `CLI_PARSER_UNAVAILABLE`'s, both
# printed straight to a user's terminal and both compiled into `dist/index.d.ts`. They were
# cut by hand; nothing stopped them being written, and nothing would have stopped the next
# one. That is the fourth pass at the bottom of this file, and it is the reason this gate is
# not markdown-only.
#
# WHERE THE IDENTIFIERS DO BELONG, and therefore what this gate deliberately does NOT scan:
# the changeset, CHANGELOG.md, commit messages, the PR title and body, CLAUDE.md,
# `documentation/decisions/`, RELEASING.md, source `//` comments, and the meta-repo. The
# traceability is real and worth keeping; it just belongs on the inside. So this is a
# translation at the boundary, not a deletion, and the boundary is what SCAN SURFACE below
# defines.
#
# ---------------------------------------------------------------------------
# WHAT IS LIFTED FROM WHERE, AND WHAT IS DELIBERATELY NOT.
#
#   * THE SHAPE is `hl7`'s `scripts/check-no-internal-refs.sh`
#     ([hl7#62](https://github.com/cosyte/hl7/pull/62), [hl7#64](https://github.com/cosyte/hl7/pull/64)),
#     by way of `ncpdp`'s copy ([ncpdp#36](https://github.com/cosyte/ncpdp/pull/36)) which
#     added the string-literal pass. THE SHAPE, NOT THE FILE. What is carried across
#     verbatim because it is genuinely cross-repo: the prefix list, the paragraph-join
#     second pass, the doc-comment third pass, the string-literal fourth pass, the
#     silent-green route closures, and the NEGATIVE self-tests. What is re-derived for the
#     CLI: the scan surface, the standards-designation exclusions, the phase rule's
#     clinical guards, and every self-test sample.
#
#   * THE DETECTION RULES ultimately come from `cosyte/.github`
#     `scripts/release-notes.mjs` (its `CONTENT_RULES`), which is validated against every
#     published release body across the org. This file transcribes the prefix-keyed set to
#     PCRE. THE REASONING IS KEPT WITH THEM ON PURPOSE. Every one of the four traps recorded
#     here shipped a public defect before it was caught, and a reader who has not hit them
#     will tidy the guard away as over-complication.
#
# ---------------------------------------------------------------------------
# THE FOUR TRAPS THAT BREAK A NAIVE DETECTOR. All four are why this file is not a one-line
# grep. Do not "simplify" past them.
#
#   (1) KEY ON KNOWN PROJECT PREFIXES, NEVER ON THE `WORD-N` SHAPE. THIS REPO IS THE ONE
#       WITH THE MOST SURFACE AREA FOR THAT TRAP IN THE WHOLE ECOSYSTEM, because the CLI
#       WRAPS ALL EIGHT FORMATS and its pages therefore reach for every one of their
#       vocabularies at once. `CLI-6` is one of our items; `HL7-V2`, `FHIR-R4`, `DICOM-SR`,
#       `NCPDP-SCRIPT`, `X12-837P` and `CCDA-R2.1` are the designations of the standards a
#       consumer came here to read about, and `MSH-2`, `PID-3`, `NM1-03`, `ST-01` and
#       `ICD-10-CM` are segment, field and code-system references that are typographically
#       identical to an item identifier. A parser repo meets one of those vocabularies; this
#       one meets all of them. A shape rule would strip the reference material the CLI's
#       docs exist to provide. The cost of keying on prefixes is that A NEW PROGRAMME MEANS
#       ADDING ITS PREFIX to the list below, and nothing will catch it until someone does.
#       That is the cheaper of the two mistakes.
#
#   (2) DECAPITATION, which is a rule for the person REMEDIATING a hit, not for the scanner.
#       Stripping an identifier off the FRONT leaves the fragment behind: "Phase 7
#       (thirteenth slice): builder emits X (CCDA-P7)" became "(thirteenth slice): builder
#       emits X" across 17 lines of ccda's published release notes, which is worse than the
#       text it replaced. Repair the head: drop a leading orphan parenthetical, strip
#       leading punctuation, recapitalise. Same mid-sentence: "(of the v2.4 capability arc)"
#       reads worse than no parenthetical at all.
#
#   (3) CASE SENSITIVITY. The identifier rule is case-SENSITIVE and the segment after the
#       hyphen must start uppercase or with a digit, which is what lets `FHIR-bridge`,
#       `docs-content/`, `HL7-defined` and `CLI-safe` through. Leading digits are fine too:
#       `835`, `271` and `837` open X12 headlines legitimately, NCPDP's transaction codes
#       are `B1`/`B2`/`B3`/`E1`, and this repo's exit-code contract is written as bare
#       numbers.
#
#   (4) PHASE PATTERNS NEED A LETTER SUFFIX (`Phase 5b`) AND A LETTER-ONLY FORM (`Phase W`):
#       a digits-only pattern misses both. Ordinal `slice` and `wave` are ours too
#       ("thirteenth slice", "second wave"): "slice" is our word for a unit of work and a
#       reader does not have it. In prose it should read "change".
#
# ---------------------------------------------------------------------------
# SCAN SURFACE. This gate scans the PUBLIC surface only. The same identifier is REQUIRED on
# the inside and BANNED on the outside, so scanning every tracked file would red on
# CHANGELOG.md, `.changeset/`, CLAUDE.md and source comments, where the convention
# explicitly says the identifiers belong. A gate that reds on correct content is a gate
# someone deletes.
#
# In scope:
#   * README.md      the repo's front page, and shipped inside the npm tarball
#   * LICENSE        shipped inside the npm tarball
#   * docs-content/  every tracked file, including sidebars.json: this is the content
#                    published to docs.cosyte.com
#   * package.json   the npm-visible metadata ONLY (`description`, `keywords`), extracted
#                    and scanned as text. Named explicitly by the convention. The rest of
#                    package.json is not public prose, and scanning it whole would red on a
#                    future dependency or script name that happens to match.
#
# Out of scope, each for a stated reason:
#   * CHANGELOG.md   SHIPS INSIDE THE NPM TARBALL (`files[3]`), so it is genuinely public
#                    surface, and it carries internal identifiers across its whole history.
#                    It is excluded anyway because the convention NAMES CHANGELOG.md as one
#                    of the places identifiers BELONG, and because rewriting a changelog's
#                    history destroys the traceability that same convention preserves. THAT
#                    IS A LIVE CONTRADICTION IN THE STANDARD. It is ECOSYSTEM-WIDE (every
#                    package has it), `hl7` excludes it on exactly this reasoning and
#                    `ncpdp` followed, and it is not for one repo to settle alone. RECORDED
#                    HERE AND QUEUED on PUBLIC-SURFACE-HYGIENE in the meta-repo, rather than
#                    silently decided in either direction. This copy changes nothing about
#                    it and claims nothing new about it.
#   * RELEASING.md   THE MAINTAINER RUNBOOK, and this repo's counterpart to ncpdp's
#                    `docs/adr/` exclusion. It is the CLI-specific overlay on the suite-wide
#                    release mechanics: the vendor-to-npm dependency swap, the provenance
#                    config, the two founder stops. It is NOT in package.json `files`, it is
#                    NOT published to docs.cosyte.com, and its entire subject is HOW THE
#                    ARTIFACT COMES TO EXIST -- the exact category the convention names as
#                    internal. Scanning it would red on a document whose job is to carry
#                    that content.
#   * documentation/decisions/
#                    THIS REPO'S OWN ARCHITECTURE DECISION RECORDS (ADRs 0021 through 0025).
#                    Not in `files`, not published to docs.cosyte.com, and an ADR is BY
#                    DEFINITION a record of how the artifact came to exist. Rule 3 below
#                    bans ADR numbers on the public surface; scanning the ADRs themselves
#                    would red on files whose whole job is to carry one.
#   * phi-scan-overrides.md
#                    the audit log for fixture-level PHI-scan bypasses. Internal compliance
#                    bookkeeping, not consumer documentation.
#   * CLAUDE.md, .github/, .changeset/, scripts/, test/, vendor/
#                    internal by definition, or code rather than prose.
#   * src/ DOC COMMENTS
#                    IN SCOPE, as a THIRD PASS at the bottom of this file, with its own rule
#                    array (SRC_RULE_PATTERN), its own self-tests, and its own extractor.
#                    `src/` JSDoc IS public: it is compiled into `dist/index.d.ts`,
#                    `dist/index.d.cts`, `dist/mcp.d.ts` and `dist/mcp.d.cts`, `dist` is the
#                    first entry in package.json's `files`, and it is what a consumer's
#                    editor shows on hover. IT IS THE LARGEST OF THIS REPO'S SURFACES BY A
#                    WIDE MARGIN: measured on the base commit of the change that added this
#                    file, the markdown surface was clean and the doc comments were not.
#   * src/ STRING LITERALS
#                    IN SCOPE, as a FOURTH PASS, and in THIS package that pass is not an
#                    afterthought: a CLI's most widely read text is its stderr. See
#                    STR_RULE_NAME.
#   * src/ `//` COMMENTS
#                    OUT of scope, because THE CONVENTION SAYS SO: it names source comments
#                    as one of the places identifiers BELONG. That is the whole reason, and
#                    it is deliberately the only one. DO NOT REASON ABOUT THIS BOUNDARY FROM
#                    WHAT REACHES `dist/`. Two drafts of the ncpdp copy tried and both were
#                    false, each caught by a refuter. The measured fact, and the only one
#                    worth writing down: `dist` is `files[0]`, there is no `.npmignore`, and
#                    `dist/*.map` carries MOST tracked source files whole in
#                    `sourcesContent`. MEASURED RATHER THAN ASSUMED, and deliberately not
#                    rounded up: 24 of the 27 tracked `src/` files appear in a map's
#                    `sources`; `src/index.ts`, `src/core/result.ts` and `src/mcp/index.ts`
#                    do not, because they contribute only re-exports and types the bundler
#                    erases. So "every byte of `src/` ships" would be FALSE, and it is
#                    exactly the convenient over-claim a refuter caught twice on the ncpdp
#                    copy and twice here. THE BUNDLES ARE NOT AN ARGUMENT FOR THIS BOUNDARY
#                    EITHER WAY: an earlier draft said they carry `//` comments verbatim,
#                    which is false. Measured on this tree: of the 43 whole-line `//`
#                    comments in tracked `src/*.ts`, exactly ONE survives into any emitted
#                    `.mjs`/`.cjs`. The boundary does not rest on that fact and must not be
#                    re-derived from it. The true statement is narrower and still
#                    enough: MOST of `src/` ships, and the gate's line is not "what reaches
#                    the consumer's disk" anyway -- it is WHAT THE CONSUMER IS SHOWN: JSDoc
#                    their editor renders on hover, and message text their terminal prints.
#                    Those are passes three and four. A comment they would have to go
#                    digging for is not.
#   * dist/          NOT SCANNED, and this is the gate's stated ceiling rather than a hole
#                    that has been closed. `dist/` is untracked build output: neither this
#                    script nor CI can read it without building first, and this script does
#                    not build. What the third pass gates is dist's SOURCE, which is a proxy
#                    that holds only because the dts build copies doc text verbatim. A build
#                    that began transforming comments would decouple the two silently.
#
# ---------------------------------------------------------------------------
# NO STDIN / PR-TEXT MODE, deliberately. This rule says identifiers BELONG in the commit,
# the PR and the changeset, so a PR-text half here would red on correct work. The half that
# keeps identifiers out of a published RELEASE BODY exists and is not here: `cosyte/.github`
# `scripts/release-notes.mjs assert` runs inside the shared release pipeline and refuses to
# publish a violating body.
#
# ---------------------------------------------------------------------------
# DISCLOSED RESIDUALS. Known and stated rather than discovered later.
#
#   (i)   THE PREFIX LIST IS DUPLICATED across every copy of this gate and against
#         release-notes.mjs, because a bash gate inside a package repo cannot import from
#         `cosyte/.github` and vendoring a 900-line Node script into 11 repos is worse. So
#         the copies can drift: a prefix added there does not appear here. The cross-repo
#         fix is one shared list (published as data by `cosyte/.github`, or as a `@cosyte/*`
#         package), and it is ONE fix across every copy rather than one per repo. Do not
#         patch this copy alone; a divergent variant is worse than a known shared limit.
#   (ii)  The scan reads file CONTENTS, never file NAMES. A tracked path that itself carries
#         an identifier passes green.
#   (iii) An identifier inside a fenced code block, a URL, or a link target is treated
#         exactly like prose. Deliberate (a reader sees it either way), but it means a
#         legitimate quotation of an internal path in an example would have to be rewritten
#         rather than escaped.
#   (iv)  This gate does not check the em dash, and unlike `hl7` and `ncpdp` this repo has
#         no `check-no-emdash.sh` for it to defer to. Stated as a KNOWN GAP rather than
#         silently absorbed: the em-dash rule is a separate directive with a separate gate
#         in the sibling repos, porting it is a separate change, and this file deliberately
#         does not grow a second rule set to cover for its absence. Measured while writing
#         this: `package.json`'s `description` carries a U+2014. That is a real violation of
#         a DIFFERENT rule, it is pre-existing, and it belongs to `EMDASH-CONFORMANCE`, not
#         here.
#   (v)   IT CATCHES IDENTIFIERS, NOT PROSE ABOUT OUR PROCESS. The founder's rule bans both.
#         A heading reading "what this phase adds", a note about "the roadmap's final
#         phase", a sentence describing why a cell was deferred in terms of our sequencing:
#         no pattern finds those, they are ordinary English whose only fault is describing
#         how the artifact came to exist, and they were removed BY HAND alongside this gate.
#         THE BY-HAND HALF IS NOT CLAIMED COMPLETE, and should not be. On ncpdp a refuter
#         found three ADR citations written as PATHS after the sweep claimed to be done, and
#         an attempt to REWRITE process prose replaced it with a guarantee the code does not
#         provide. THAT FAILURE MODE IS SHARPEST IN THIS PACKAGE, because this package's
#         whole posture is honesty about what it CANNOT do: gated stubs that exit 69 and
#         never fake a scrub, value-free stderr, a per-(format, operation) support matrix.
#         Softening a stated limit into an implied capability while "tidying" a sentence
#         would be a worse defect than the bookkeeping it removed. THE REMEDY IS TO CUT, NOT
#         TO REWRITE: delete the claim rather than replace it.
#   (vi)  `phase` AT THE END OF A CLAUSE IS NOT CAUGHT. Rule 2 keys on `phase` plus a
#         following word, so `phase models` and `phase adds` red; `phase.` and `phase;` do
#         not. A rule for the determiner form was written, measured and REMOVED in the hl7
#         copy because of what it cost in clinical phrasing ("the phase of the clinical
#         study"), and that verdict is inherited rather than re-litigated. It is a
#         reviewer's catch. The paragraph-joined second and third passes narrow it: `phase`
#         at a line end followed by more prose in the same paragraph DOES red.
#  (vii)  A VIOLATION SPLIT BY INLINE MARKUP REJOINS IN NEITHER PASS. `phase **8**` and
#         `phase [8](...)` put markup between the two tokens, and neither the line scan nor
#         the paragraph join strips it. Closing it needs a markdown renderer, not a bigger
#         regex. REACHABLE HERE: these docs bold heavily.
# (viii)  THE THIRD PASS CANNOT SEE `dist/`, only its source. Stated at length in the pass
#         itself and in SCAN SURFACE above, and repeated here because it is the single most
#         important thing to know about what this gate does and does not prove.
#   (ix)  A DOC COMMENT THAT DOES NOT OPEN ITS OWN LINE IS INVISIBLE TO THE THIRD PASS. The
#         extractor enters a block only on `^[[:space:]]*/**`, so `const x = 1; /** ... */`
#         is scanned by neither pass 3 (never entered) nor pass 4 (not a string literal).
#         Not fixed because entering mid-line means tracking whether the `/**` is itself
#         inside a string or a regex, which is a tokenizer. Prettier puts a doc comment on
#         its own line and `format:check` runs ahead of this gate on the ladder.
#   (x)   MEASURE ON THE REFLOWED TEXT, NOT LINE BY LINE, when you sweep by hand. hl7's
#         `Plan N` sweep was done with a line scan, reported itself complete, and shipped an
#         instance into `dist/` where `Plan` ended a line and `04` began the next. Also:
#         QUOTE A COUNT WITH THE TREE IT WAS TAKEN ON, OR NOT AT ALL.
#   (xi)  TWO KNOWN FALSE POSITIVES ON THIS PACKAGE'S OWN REFERENCE MATERIAL, found by a
#         refuter, zero instances on this tree, and stated here rather than pre-emptively
#         patched. Both are LOUD REDS, never silent misses, and each is one exclusion-list
#         entry away from fixed. Fix them when a real line needs it, with that line as the
#         measurement:
#           * `X12-005010X222A1` and `X12-004010X098A1`, the canonical HIPAA implementation
#             guide ids for the 837 Professional (the 005010X222A1 and 004010X098A1
#             releases; the matching 270/271 guides are `X12-005010X279A1` and
#             `X12-004010X092A1`, which red identically).
#             Rule 1's arms stop at `X12-\d{3}[A-Z]?` and
#             `X12-\d{6}`, so the full guide id reds. A `X12-\d{6}[A-Z]\d{3}[A-Z]\d` arm
#             closes it.
#           * "Each slice of a DICOM series". Rule 4's imaging-noun exclusion only looks at
#             the noun FOLLOWING `slice`, so a determiner form whose imaging sense arrives
#             through a trailing `of` phrase reds. That is the mirror of the exclusion
#             already written into the rule for the leading modifier, and it is left open
#             because narrowing a rule with no live instance to hold it is how a hole gets
#             opened by accident.
#
# Run it locally with `pnpm check:no-internal-refs`.
set -euo pipefail

# LOCALE PIN, load-bearing, and inherited for the same measured reason: `grep -P` compiles
# PCRE in UTF-8 mode only when the locale says so. Under LC_CTYPE=POSIX (a bare container,
# cron, `sh -c`) GNU grep's handling of non-ASCII in the input and of `\w` in the pattern
# changes, and the docs scanned here contain non-ASCII. A gate whose matching depends on an
# inherited environment is a gate that reports green somewhere and red elsewhere.
export LC_ALL=C.UTF-8

# ---------------------------------------------------------------------------
# THE BANNED SET, transcribed from release-notes.mjs CONTENT_RULES
# ---------------------------------------------------------------------------

# Known project and programme prefixes. THE KEYING IS ON THESE, NEVER ON THE `WORD-N` SHAPE:
# see trap (1) above. Kept in the same order as the source list so a diff between the copies
# is legible.
#
# `PKG` IS DELIBERATELY ABSENT and is present in the source list, for hl7's reason rather
# than one of ours: `PKG-1` and `PKG-4` are HL7 v2 Chapter 17 Item Packaging segment-field
# references. That reason is MORE live here than in hl7, not less, because this package
# documents HL7 v2 alongside seven other formats. `PKG` has never been minted as an item
# anywhere.
#
# `SYNTH` IS KEPT, and that is a divergence from the ncpdp copy which drops it. ncpdp drops
# it because its runnable examples use `SYNTH-MSG-0001` identifiers as visible PHI
# discipline. Measured on this tree: `SYNTH-` appears on the public surface and in `src/`
# ZERO times. The only instances anywhere in tracked content outside this script are two
# payload values in `test/__fixtures__/newrx.xml`, which this gate does not scan; this file's
# own references are self-test samples. So keeping it costs nothing here and keeps a real
# meta-repo prefix covered. THE CONSEQUENCE IS DELIBERATE AND IS ASSERTED BELOW, in SYNTH_TRIPWIRE_SAMPLE
# rather than in NEGATIVE[0]: `SYNTH-MSG-0001` REDS under this list, so if a runnable example
# in this package ever adopts that naming, the fix is to drop `SYNTH` from the list above
# with ncpdp's reason, NOT to rename the example data. The assertion exists so that outcome
# is a documented choice a reader was warned about, not a surprise on a green suite.
PROJECT_PREFIXES='PARSERS-PUBLIC|DOCS-CONTENT|KNOWLEDGEBASE|TERMINOLOGY|PATHWAYS|TRANSFORM|WEBSITE|STAGING|SUPPLY|NCPDP|ASSETS|EMDASH|README|CONFIG|DICOM|DEID|CCDA|ASTM|MLLP|FHIR|CREW|DOCS|PERF|SYNC|VERSION|PUBLIC|HL7|X12|IAC|CLI|KB|PW|PUB|CI|REAL|TERM|WF|VERIFY|SYNTH'

# STANDARDS DESIGNATIONS THAT COLLIDE WITH THE PREFIX LIST, excluded explicitly. Seven of
# the prefixes above (`NCPDP`, `HL7`, `X12`, `DICOM`, `FHIR`, `CCDA`, `ASTM`) name a standard
# this ecosystem parses as well as one of our projects, and get an arm below. `MLLP` and
# `TERM` are named here so their ABSENCE is deliberate rather than an oversight: MLLP is a
# framing protocol with no versioned designation to exempt, and `TERM` is our prefix for the
# terminology programme and is not a standard's name at all, so `TERM-<UPPER>` stays fully
# banned in both cases. IN THIS PACKAGE ALL SEVEN ARMS ARE LIVE AT ONCE, which is what makes
# this list longer here than in any parser repo: the CLI wraps all eight formats, so its
# pages name every designation a consumer might arrive with. There is no shape that separates
# `CLI-6` from `NCPDP-SCRIPT`, so the separation is an explicit, reviewable exclusion list.
# "LIVE" MEANS REACHABLE, NOT PRESENT, and the difference is worth stating because a reader
# will check. Measured on this tree: ZERO hyphenated designations appear on the gated surface
# -- these pages write "HL7 v2" and "FHIR R4" unhyphenated. The list is therefore entirely
# PRECAUTIONARY today. It is still the right list, because this is the one package whose docs
# can legitimately reach for any of the eight at once, and because the cost of a missing arm
# is deleting reference material rather than a loud red.
# It must be extended by hand, and that is the cheaper mistake. EVERY ALTERNATIVE IN EVERY
# ARM is asserted in NEGATIVE[0] and SRC_NEGATIVE[0] -- all of them, not a representative
# sample. A refuter demonstrated why: with `HL7-V3`, `HL7-FHIR`, `HL7-OMG`, `DICOM-SEG` and
# `DICOM-DIR` merely written here and not asserted, deleting them from this variable left
# every self-test GREEN, and the gate then red on `An HL7-V3 message, a DICOM-SEG object`.
#
# TWO ARMS ARE DELIBERATELY NOT CARRIED:
#   * hl7's `HL7-\d{3,4}`, which exempts HL7 v2 table numbers written with a hyphen
#     (Table 0396). Measured on this tree: `HL7-` followed by digits appears ZERO times on
#     the public surface and in `src/` doc comments. This package documents commands, not v2
#     tables. Carrying the arm would exempt a shape this repo never writes while weakening
#     the rule against a real `HL7-<digits>` item identifier leaking in from a sibling's
#     release note.
#   * An `MLLP-` designation. MLLP has no versioned or variant designation in common use
#     (it is a framing protocol, not a document standard), so there is nothing legitimate to
#     exempt and `MLLP-<UPPER>` stays fully banned.
STANDARDS_DESIGNATION='NCPDP-(?:SCRIPT|TELECOM|D\.\d|F\d)|HL7-(?:V2|V3|CDA|FHIR|OMG)|FHIR-R\d[A-Z]?|DICOM-(?:SR|RT|SEG|DIR|PS\d)|X12-\d{3}[A-Z]?|X12-\d{6}|CCDA-R\d(?:\.\d)?|ASTM-E\d+'

# Rule 1: internal project identifier. CASE SENSITIVE, and the segment after the hyphen must
# start with an uppercase letter or a digit, which is what lets `FHIR-bridge`, `HL7-defined`
# and `docs-content/` through (trap 3). The second alternative is our internal priority
# label, and it matches its own trailing word rather than looking ahead for one: an earlier
# version keyed on `P\d+` followed by end-of-string or a comma, which is the shape rule this
# file exists to avoid. It deleted the ICD-10-CM code in "Map ICD-10 P07, P22 and P29 to
# SNOMED CT" and truncated the code range "P00-P96". Corrupting a diagnosis code to remove
# an internal label is not a trade worth making.
#
# The collisions this rule has to survive in a package that wraps EIGHT formats are the
# whole reason the exclusion list above is as long as it is. HL7 v2 segment-field references
# (`MSH-2`, `PID-3`, `PV1-19`), X12 element references (`NM1-03`, `ST-01`), NCPDP Telecom
# field ids (`439-E4`, `111-AM`), code systems (`ICD-10-CM`, `ICD-9`) and the standards
# designations are all in scope of this package's documentation simultaneously. None of the
# segment prefixes is in PROJECT_PREFIXES, and nothing here keys on a leading digit. All are
# asserted in NEGATIVE[0] so a later "simplification" cannot quietly drop them.
RULE_NAME[0]='internal project identifier'
RULE_PATTERN[0]='\b(?!(?:'"$STANDARDS_DESIGNATION"')\b)(?:'"$PROJECT_PREFIXES"')(?:-[A-Z0-9][A-Z0-9.]*)+\b|\bP\d+ (?:safety|documentation)\b'

# Rule 2: phase and wave language. CASE INSENSITIVE via the inline `(?i)`, because the rules
# do not share a case policy and one `grep -i` for all of them would break trap (3).
# `Phase 5b` and `Phase W` are both covered (trap 4). The negative lookahead keeps ordinary
# English off the list, so "in phase with the source system" and "out of phase" survive.
#
# THE CLINICAL LOOKBEHINDS ARE KEPT AND THE HL7 FIELD-NAME LOOKAHEAD IS DROPPED, and the
# split is deliberate rather than a partial copy.
#
#   KEPT: `study|clinical|trial` and the ordinary clinical senses
#   (`acute|chronic|luteal|follicular|liquid|gas`), plus the clinical-trial roman numerals
#   when followed by trial vocabulary. This is a healthcare CLI whose docs discuss the data
#   its wrapped parsers carry, so acute-phase reactants and Phase III trials are reachable
#   prose here even though none is live today. A bare `Phase III` is still flagged, because
#   it is genuinely ambiguous with an internal single-letter item and a loud red on a rare
#   line beats a silent hole.
#
#   DROPPED: `identifier|start|end|evaluability|number` from the lookahead. In hl7 those
#   exempt the field names of the Chapter 7 `CSP` Clinical Study Phase segment (`CSP-1 Study
#   Phase Identifier`, `CSP-2 Study Phase Start Date/Time`, ...). Measured on this tree,
#   those four phrases and `CSP-` appear ZERO times: this package documents commands and
#   exit codes, not v2 segment dictionaries. Carrying them would widen the hole in residual
#   (vi) for a construction this repo does not write. NOTE THE ORDERING that makes the drop
#   safe: `(?<!study )` in PHASE_NOT_CLINICAL already exempts the whole family, because
#   every one of those field names is "Study Phase ...". The lookahead was hl7's belt on top
#   of that braces.
#
# `phase[ -]` rather than `phase ` is kept: `Phase-L` was live in hl7's docs and slipped a
# space-only rule.
#
# `phases?` (the PLURAL STEM) is kept from the ncpdp copy rather than reverted to hl7's
# singular. Measured on this tree before remediation: this repo's doc comments read "the
# roadmap's build phases" and "the phases that follow", which a singular rule walks straight
# past. Widening the stem rather than bolting on a second alternative keeps the clinical
# lookbehinds and the ordinary-English lookahead applied to the plural too.
ORDINAL='(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty-first|twenty-second|twenty-third|twenty-fourth|\d+(?:st|nd|rd|th))'
PHASE_NOT_CLINICAL='(?<!study )(?<!clinical )(?<!trial )(?<!acute )(?<!chronic )(?<!luteal )(?<!follicular )(?<!liquid )(?<!gas )'
PHASE_NOT_ENGLISH='(?!of\b|with\b|in\b|out\b|the\b|and\b|is\b|for\b|to\b|(?:I{1,3}|IV)\s+(?:trial|stud|clinical|oncolog))'
RULE_NAME[1]='phase or wave language'
RULE_PATTERN[1]='(?i)\b(?:roadmap phases?\b[ ]?[A-Za-z0-9]*|'"$PHASE_NOT_CLINICAL"'phases?[ -]'"$PHASE_NOT_ENGLISH"'[A-Za-z0-9]+[a-z]?\b|wave \d+\b|the \w+ and final phase\b|documentation residual\b|'"$ORDINAL"' (?:slice|wave)\b)'

# Rule 3: ADR references. An ADR number is a pointer into a decision record the reader did
# not come here for. This repo has FIVE of its own (`documentation/decisions/0021` through
# `0025`) and cites meta-repo ones besides, which is exactly why the rule is kept rather
# than dropped as hl7-shaped: the temptation to cite them by number is not hypothetical
# here, it is what shipped. Cite what the decision WAS, not the number it has.
#
# `/` IS KEPT IN THE SEPARATOR CLASS from the ncpdp copy. hl7 cites ADRs in prose ("Decided
# in ADR 0015"), so a space-or-hyphen class covers it; three ncpdp citations written as
# PATHS survived a whole gate because of that gap and were found by a refuter. This repo
# writes BOTH forms, so both arms earn their place. The PATH form this repo actually uses is
# `documentation/decisions/0025-...`, which carries no literal `ADR` at all and is caught by
# RULE 5 rather than by this one -- do not assume rule 3 covers it.
#
# THE `\d{3,4}` FLOOR IS INHERITED AND IS A KNOWN GAP: `ADR 7` and `ADR-12` are not caught.
# Left as hl7 has it, because every ADR in this ecosystem is written four-digit and lowering
# the floor to `\d{1,4}` would start matching ordinary two-digit numbers after any three
# letters that happen to spell `adr`.
RULE_NAME[2]='ADR reference'
RULE_PATTERN[2]='(?i)\bADR[ \-/]?\d{3,4}\b'

# Rule 4: `slice`, our internal word for a unit of work. It is ALSO real clinical vocabulary
# elsewhere in this ecosystem: a DICOM study has slices, with a slice thickness, a slice
# location and slice spacing -- and THIS package wraps `@cosyte/dicom`, so that collision is
# first-party here rather than borrowed. So this keys on the determiner forms that are
# unambiguously ours ("this slice", "the final slice") and excludes the imaging nouns. A
# bare `slice` is deliberately NOT flagged: across this corpus that word is more often the
# reader's than ours, and TypeScript says `.slice()` constantly.
#
# The imaging-noun exclusion is grounded in @cosyte/dicom's generated tag dictionary
# (SliceThickness, SliceLocation, SpacingBetweenSlices, NumberOfSlices). A modifier may sit
# between the determiner and the noun ("the misfiling-prevention slice") but a preposition
# may not: "the Number of Slices" is a DICOM attribute, not one of our units of work.
#
# `phase` IS DELIBERATELY NOT MATCHED HERE. A refuter pass on the hl7 copy added it to catch
# "non-goals of this phase"; the next pass measured what it cost and the answer was ordinary
# clinical English ("the phase of the clinical study", "each phase of the trial"). No
# modifier exclusion list rescues that, because the collision is with the HEAD noun rather
# than the modifier. That verdict is inherited, not re-litigated: rule 2 still catches
# `phase X`, and "of this phase" with no following identifier is the reviewer's catch
# recorded in residual (vi).
IMAGING_NOUNS='thickness|location|spacing|position|interval|order|number|index|gap|count|data|pixel|orientation|plane|direction|width|vector|sensitivity|progression|factor'
RULE_NAME[3]='internal jargon ("slice")'
RULE_PATTERN[3]='(?i)\b(?:this|that|the|each|another|previous|next|final|current)\s+(?:(?!(?:of|in|on|between|per|for|to|with|at)\s)[\w-]+\s+){0,2}slices?\b(?!\s+(?:'"$IMAGING_NOUNS"'))'

# Rule 5: internal repo paths. A docs page carries citations, and a reader who installs
# @cosyte/cli has no meta-repo. Keyed on the known meta-repo paths, not on a `dir/file.md`
# shape, for exactly the reason trap (1) gives -- this package's own pages legitimately cite
# `docs-content/limitations.md`, which a shape rule would take with it.
#
# `documentation/decisions/` IS THE ARM THAT MATTERS MOST HERE, and it does double duty. In
# the meta-repo that path holds the ecosystem ADRs. In THIS repo it also holds our own five,
# and `documentation/` IS NOT IN package.json `files` -- so a README citation of
# `documentation/decisions/0025-...` gives an npm consumer a dead link to a decision record
# they cannot open, on top of being an ADR reference the convention already bans. Both
# readings point the same way, so the arm is kept as written rather than narrowed to the
# meta-repo.
RULE_NAME[4]='internal repo path'
RULE_PATTERN[4]='\boperations/(?:BACKLOG\.md|roadmaps/|plans/)|\bdocumentation/(?:decisions/|ecosystem-map\.md|conventions\.md)|\bBACKLOG\.md\b'

# Rule 6: internal traceability markers. Bracketed spec-trace tags that key into a roadmap
# traceability table, and "Open-question #12" pointers into a decision log the reader cannot
# open. Zero instances measured on this tree; the rule is carried because the convention
# that produces them is shared across the ecosystem and a page copied from a sibling would
# bring them along. Both are DELIMITER-ANCHORED rather than shape-keyed, which is the only
# reason they are safe: the tag rule requires a literal `[S-` opening bracket and at least
# two characters after it, so a documented character range like `[S-Z]` does not match, and
# neither does a value set written `[SNOMED]`.
RULE_NAME[5]='internal traceability marker'
RULE_PATTERN[5]='\[S-[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*\]|(?i:\bopen[- ]question #?\d+\b)'

# Rule 7: A PROSE CITATION OF THE ROADMAP. THIS RULE EXISTS IN NO SIBLING COPY, and it is
# added here for one reason: it is measurement, not taste. On the base commit of this change
# the gated doc-comment surface carried THIRTY roadmap citations, which is more than every
# other rule in this file found put together. `hl7` and `ncpdp` cite the roadmap by PATH
# (`operations/roadmaps/<repo>.md`), which rule 5 already catches; THIS repo cites it in
# PROSE, as "(cli roadmap §7)" attached to the doc comment of almost every exported symbol.
# Rule 5 cannot see that form, rule 2 sees it only when a "§Phase N" happens to follow, and
# the item that produced this change exists precisely because the class regrows when nothing
# guards it. A gate that misses its own repo's dominant class is decoration.
#
# WHAT IT KEYS ON, and why each arm is drawn where it is:
#   * `<repo> roadmap`, keyed on the KNOWN REPO NAMES rather than on a `<word> roadmap`
#     shape. Same bargain as trap (1): a new repo means adding its name here, and nothing
#     catches it until someone does. That is the cheaper mistake, and it keeps "a product
#     roadmap", "the vendor's roadmap" and any consumer-facing use of the ordinary English
#     word out of scope.
#   * `the|this|our roadmap`, because two of the thirty were written that way ("the
#     roadmap's `{ format; confidence }` sketch", "the roadmap §Phase 6 forbids") and a
#     rule keyed on repo names alone would have walked past both.
#   * `roadmap §`, the section-pointer form, which survives even if the qualifier changes.
#
# THE ACCEPTED FALSE POSITIVE, stated rather than discovered: a README section headed
# "Roadmap" that describes upcoming capability in consumer terms is legitimate content, and
# a sentence pointing at it ("see the roadmap below") would red here. That is the same
# bargain rule 2 makes with a bare `Phase III`: a loud red on a rare line beats a silent
# hole. Measured on this tree, `roadmap` appears on the public markdown surface ZERO times,
# so the trade costs nothing today. A BARE HEADING IS NOT MATCHED (no qualifier, no `§`),
# which is what keeps that section writable if someone ever wants one.
#
# THE RESIDUAL: a BARE `§7` with the word `roadmap` removed is NOT caught, and that is
# deliberate rather than an oversight. `§` is also how a real standard's section is cited,
# and this package documents eight of them, so a blanket `§` rule is trap (1) with the
# widest possible blast radius. Measured on this tree: every one of the 35 `§` occurrences
# in the gated surface was a roadmap pointer and none was a standards citation, so the hole
# is real but currently empty. WHEN REMEDIATING, DROP THE WHOLE PARENTHETICAL: stripping
# "cli roadmap" and leaving "(§7)" is trap (2), a fragment pointing at nothing.
ROADMAP_OWNERS='cli|hl7|fhir|mllp|dicom|x12|ccda|ncpdp|astm|transform|terminology|synth|deid|pathways|docs|website|iac|crew|knowledgebase|config|the|this|our'
RULE_NAME[6]='internal roadmap citation'
RULE_PATTERN[6]='(?i)\b(?:'"$ROADMAP_OWNERS"') roadmap(?:'"'"'s)?\b|\broadmaps?(?:'"'"'s)?[ ]?§'

RULE_COUNT=7

# ---------------------------------------------------------------------------
# THE `src/` DOC-COMMENT RULE SET, deliberately a SEPARATE ARRAY
# ---------------------------------------------------------------------------
#
# WHY A SECOND SURFACE EXISTS AT ALL. The block above scans markdown a reader browses. This
# one scans the JSDoc a consumer's EDITOR renders: `src/` doc comments are compiled into
# `dist/index.d.ts`, `dist/index.d.cts`, `dist/mcp.d.ts` and `dist/mcp.d.cts` by tsup, `dist`
# is the first entry in package.json's `files`, and every `npm i @cosyte/cli` receives them.
#
# IN THIS REPO IT IS NOT THE SECOND SURFACE, IT IS THE FIRST. Measured on the base commit of
# the change that added this file: the markdown surface had already been swept clean by an
# earlier pass, and the doc comments had not been touched at all. Every remaining violation
# in the package was here.
#
# WHY A SEPARATE ARRAY RATHER THAN REUSING RULE_PATTERN. Code comments are not markdown. The
# two surfaces have different collision profiles (TypeScript prose says `.slice()` and "the
# slice after the fixed header"; markdown says "the thirteenth slice"), different wrap
# shapes, and different self-test material. Sharing one array would mean a fix for one
# surface silently retunes the other, and the negative self-test that caught it would be in
# the wrong file's language. They START identical. They are ALLOWED to diverge, and when
# they do, each side's NEGATIVE sample is what stops the divergence from being a widening.
#
# WHAT IS SCANNED, precisely: only text inside `/** ... */` blocks. NOT `//` line comments
# and NOT `/* */` block comments, and that boundary is the whole point rather than a
# convenience. `/** */` is what the dts build carries into `dist`; `//` is not. The
# convention names source comments as a place identifiers BELONG. So the line this draws is
# exactly the founder's line: what a CONSUMER receives is public and is swept; what only a
# maintainer reads stays internal.
#
# REMOVING A DOC COMMENT TO SATISFY THIS PASS IS A REGRESSION, NOT A FIX. JSDoc with an
# `@example` on every public export is a hard guardrail in CLAUDE.md and the JSDoc lint rule
# is an error, but neither lint nor coverage notices prose deleted from the middle of a
# block. Rewrite the sentence to say what the software does -- and in this package, when the
# sentence being repaired states a LIMIT (a deferred (format, operation) cell, a gated stub,
# a value-free posture), CUT the bookkeeping and leave the limit standing exactly as strong
# as it was. Softening it into an implied capability is the worse defect.
SRC_RULE_NAME[0]="${RULE_NAME[0]}"; SRC_RULE_PATTERN[0]="${RULE_PATTERN[0]}"
SRC_RULE_NAME[1]="${RULE_NAME[1]}"; SRC_RULE_PATTERN[1]="${RULE_PATTERN[1]}"
SRC_RULE_NAME[2]="${RULE_NAME[2]}"; SRC_RULE_PATTERN[2]="${RULE_PATTERN[2]}"
SRC_RULE_NAME[3]="${RULE_NAME[3]}"; SRC_RULE_PATTERN[3]="${RULE_PATTERN[3]}"
SRC_RULE_NAME[4]="${RULE_NAME[4]}"; SRC_RULE_PATTERN[4]="${RULE_PATTERN[4]}"
SRC_RULE_NAME[5]="${RULE_NAME[5]}"; SRC_RULE_PATTERN[5]="${RULE_PATTERN[5]}"
SRC_RULE_NAME[6]="${RULE_NAME[6]}"; SRC_RULE_PATTERN[6]="${RULE_PATTERN[6]}"
SRC_RULE_COUNT=7

# ---------------------------------------------------------------------------
# THE `src/` STRING-LITERAL RULE SET: the fourth pass
# ---------------------------------------------------------------------------
#
# WHY IT EXISTS, AND WHY IT MATTERS MORE HERE THAN ANYWHERE ELSE IN THE SUITE. A library's
# most widely read text is its warning messages. A COMMAND-LINE TOOL'S IS ITS STDERR, and
# that is the only text most of its users will ever read: a `CLI_*` diagnostic printed to a
# terminal, pasted into a support ticket, or scraped by the CI job that branched on the exit
# code. Those strings are neither markdown nor doc comments, so the three passes above walk
# straight past them.
#
# MEASURED, and not hypothetically: this package SHIPPED an internal work item inside
# `CLI_NOT_IMPLEMENTED`'s message and an ADR number inside `CLI_PARSER_UNAVAILABLE`'s. Both
# printed to a user's terminal. Both were cut by hand before this file existed. Rule 1 and
# rule 3 are the two highest-value rules in this gate and neither had any reach into a
# string at all until this pass.
#
# THE FALSE-POSITIVE RISK WAS MEASURED BEFORE THE PASS WAS ADDED, because a rule over code
# strings is the obvious place for one. All SEVEN rules over every double-quoted and backtick
# literal in tracked `src/`, on the remediated tree: ZERO matches. Import specifiers, the
# `CLI_*` diagnostic-code constants (underscored, so rule 1's hyphen requirement never
# fires), the format names, the option strings and the completion-script templates all pass
# cleanly. The rules are therefore reused whole rather than trimmed: a narrowed copy would
# have no measurement behind it.
#
# WHAT IS SCANNED, precisely: double-quoted and backtick literals on lines that are NOT
# whole-line comments. Four boundaries, each deliberate:
#   * WHOLE-LINE COMMENTS ARE SKIPPED (`//`, `/*`, `/**`, and a continuation ` *`). Pass
#     three owns doc comments, and `//` comments are deliberately out of scope for the whole
#     gate.
#   * A TRAILING COMMENT ON A CODE LINE IS STILL SCANNED. Accepted rather than solved:
#     splitting a trailing comment off needs a tokenizer, and the failure mode is an
#     over-report on a line a maintainer can read in one second.
#   * SINGLE-QUOTED LITERALS ARE NOT SCANNED. Prettier (`@cosyte/prettier-config`) emits
#     double quotes, `format:check` runs ahead of this gate on the verify ladder, and tracked
#     `src/` contains no single-quoted string. Including `'` would instead capture comment
#     prose between two apostrophes, which would drag `//` comments into scope through the
#     back door.
#   * A MULTI-LINE TEMPLATE LITERAL IS SCANNED PER LINE, so a violation split across its
#     line breaks is missed. Under-reports rather than over-reports. REACHABLE HERE: the
#     shell-completion scripts in `src/commands/completion.ts` are multi-line templates.
STR_RULE_NAME[0]="${RULE_NAME[0]}"; STR_RULE_PATTERN[0]="${RULE_PATTERN[0]}"
STR_RULE_NAME[1]="${RULE_NAME[1]}"; STR_RULE_PATTERN[1]="${RULE_PATTERN[1]}"
STR_RULE_NAME[2]="${RULE_NAME[2]}"; STR_RULE_PATTERN[2]="${RULE_PATTERN[2]}"
STR_RULE_NAME[3]="${RULE_NAME[3]}"; STR_RULE_PATTERN[3]="${RULE_PATTERN[3]}"
STR_RULE_NAME[4]="${RULE_NAME[4]}"; STR_RULE_PATTERN[4]="${RULE_PATTERN[4]}"
STR_RULE_NAME[5]="${RULE_NAME[5]}"; STR_RULE_PATTERN[5]="${RULE_PATTERN[5]}"
STR_RULE_NAME[6]="${RULE_NAME[6]}"; STR_RULE_PATTERN[6]="${RULE_PATTERN[6]}"
STR_RULE_COUNT=7

# ---------------------------------------------------------------------------
# SELF-TESTS. A gate is believed only after it has shown it can still see.
# ---------------------------------------------------------------------------
#
# Two halves, and the second is the one that is unusual. POSITIVE samples prove each rule
# still matches what it bans (refuse to report a clean tree from a scanner that cannot see).
# NEGATIVE samples prove each rule still lets through the reference material it was most
# likely to destroy, which is trap (1) turned into an assertion: if someone "simplifies" the
# identifier rule to a `WORD-N` shape, the negative self-test reds here instead of silently
# deleting `NCPDP-SCRIPT`, `MSH-2` and `ICD-10-CM` from the docs of the one package that
# documents all eight formats at once. Both halves run on every invocation, local and CI,
# and both refuse rather than warn.

self_test_fail() {
  echo "ERROR: check-no-internal-refs - SELF-TEST FAILED: $1" >&2
  echo "       The scanner is not behaving as specified, so no result from it can be" >&2
  echo "       believed. Refusing to report on the tree." >&2
  exit 1
}

# rule index -> text that MUST match. Every sample is written in THIS repo's own vocabulary,
# so a reader can tell what the rule is for without opening another package.
POSITIVE[0]='Item CLI-6 is done, and CCDA-P7 with it'
POSITIVE[1]='Phase 5b closes it (Phase W, Phase-L and the thirteenth slice landed earlier, in wave 2), and Phases 6 and 7 preceded it'
POSITIVE[2]='Decided in ADR 0025, restated in ADR-0021, and recorded in docs/adr/0001-x.md'
POSITIVE[3]='This slice adds the completion command and the final slice removes it'
POSITIVE[4]='Roadmap operations/roadmaps/cli.md and documentation/decisions/0025-x.md'
POSITIVE[5]='Repeating [S-EXIT], and Open-question #12 resolves the direction'
POSITIVE[6]='Grounded in the cli roadmap §7, refined from the roadmap sketch, and the deid roadmap forbids it'

# rule index -> text that must NOT match. Every entry is real reference material from one of
# the EIGHT formats this CLI wraps, or ordinary English that collides with our jargon. This
# sample is longer than any sibling's on purpose: this is the package where all eight
# vocabularies are live at once, which is trap (1) at its widest.
# EVERY ALTERNATIVE OF EVERY STANDARDS_DESIGNATION ARM APPEARS HERE, exhaustively, so that
# deleting any one of them from the variable reds this sample instead of quietly narrowing
# the exclusion list. A refuter proved that a representative subset does not do that job.
NEGATIVE[0]='HL7-V2 and HL7-V3 and HL7-CDA and HL7-FHIR and HL7-OMG and HL7-defined tables, FHIR-R4 and FHIR-R5 and FHIR-R4B and FHIR-bridge, DICOM-SR and DICOM-RT and DICOM-SEG and DICOM-DIR and DICOM-PS3, NCPDP-SCRIPT and NCPDP-TELECOM and NCPDP-D.0 and NCPDP-F6, X12-837P and X12-270 and X12-005010, CCDA-R2 and CCDA-R2.1, ASTM-E1394 and ASTM-E1381, segment fields MSH-2 and PID-3 and PV1-19 and OBX-5, X12 elements NM1-03 and ST-01 and ISA-13, NCPDP field ids 439-E4 and 111-AM and 511-FB, code systems ICD-10-CM and ICD-9-CM, transaction codes B1 B2 B3 and E1, 835 remittance and 271 eligibility and 837 claims, ICD-10 P00-P96, docs-content/ layout, a CLI-safe wrapper and CLI-friendly output, UTF-8 input'
NEGATIVE[1]='A Phase III oncology trial and a Phase II study; the clinical phases of a drug programme; the acute phase reactant; luteal phase dosing and follicular phase dosing; the liquid phase of a preparation; the adapter stays in phase with the source system and is out of phase'
NEGATIVE[2]='ADR is not a segment identifier, and 0025 alone is a value'
NEGATIVE[3]='The slice thickness and the number of slices are DICOM attributes, each slice location is too, and the phase of the clinical study, the phase of illness and each phase of the trial are the reader words this rule must not touch'
NEGATIVE[4]='Parser operations are documented in the README, and documentation for the API is generated'
NEGATIVE[5]='A character range like [S-Z], a value set written [SNOMED], and open questions about the feed'
# A bare heading, the ordinary English word with no qualifier this rule knows, and the
# derived forms. All three must survive, or a consumer-facing "what is coming next" section
# becomes unwritable and the rule has eaten the reader's content instead of ours.
NEGATIVE[6]='## Roadmap; a product roadmap and the vendor roadmap; roadmapping the migration; the roadmaps of other projects'

# RULE 3'S `/` ARM GETS ITS OWN ASSERTION, separate from the array loop. The array samples
# carry BOTH the prose form ("ADR 0025") and the path form, so every one of them still
# matches under the narrower hl7 pattern the widening replaced: they prove the rule works,
# they do NOT prove it still has the arm ncpdp added. A "resync with hl7" that reverts
# RULE_PATTERN[2] would leave the whole suite green and silently reopen the exact hole the
# widening exists to close. So the path form is asserted ALONE, with nothing else in the
# sample for the rule to match on.
ADR_PATH_SAMPLE='Ratified in docs/adr/0001-xml-parser.md'
if ! printf '%s\n' "$ADR_PATH_SAMPLE" | grep -qP -e "${RULE_PATTERN[2]}"; then
  self_test_fail "rule 'ADR reference' no longer matches an ADR cited as a PATH ('docs/adr/0001-...'), which is a form the siblings write and which hl7's narrower pattern misses. Three live citations survived a whole gate because of that gap. Do not drop '/' from the separator class."
fi

# RULE 5'S `documentation/decisions/` ARM GETS ITS OWN ASSERTION, for this repo's reason
# rather than an inherited one. THIS repo cites its own ADRs by that path, and that form
# carries no literal `ADR`, so rule 3 cannot see it: rule 5 is the ONLY thing standing
# between `documentation/decisions/0025-...` in a README and an npm consumer following a
# dead link into a directory that is not in the tarball. POSITIVE[4] would still pass if
# this arm were deleted, because it also carries `operations/roadmaps/`.
ADR_PATHFORM_SAMPLE='See documentation/decisions/0024-mcp-server-sdk.md'
if ! printf '%s\n' "$ADR_PATHFORM_SAMPLE" | grep -qP -e "${RULE_PATTERN[4]}"; then
  self_test_fail "rule 'internal repo path' no longer matches this repo's own ADR path form ('documentation/decisions/0024-...'). That form carries no literal 'ADR', so rule 3 cannot see it and this arm is the only cover it has."
fi

# RULE 7 GETS A STANDALONE EXISTENCE ASSERTION, and it is the most important one in this
# file. The array loops run `while i < RULE_COUNT`, so a "resync with hl7" or "resync with
# ncpdp" that restores `RULE_COUNT=6` DELETES THIS REPO'S HIGHEST-VALUE RULE WITH EVERY
# SELF-TEST STILL GREEN: samples 0 through 5 all still pass, nothing reds, and the 30 roadmap
# citations that rule 7 alone can see quietly become invisible again. That is the same
# silent-resync failure the ADR-path assertion above exists for, and rule 7 is more exposed
# than rule 3 because it has no sibling copy to be diffed against at all. Asserted by COUNT,
# not by pattern, because the count is what a resync changes.
if [ "$RULE_COUNT" -lt 7 ] || [ -z "${RULE_PATTERN[6]:-}" ]; then
  self_test_fail "rule 7 ('internal roadmap citation', RULE_PATTERN index 6) is missing or RULE_COUNT was lowered below 7. That rule is this repo's own addition and has no sibling copy: it found 30 of the 61 violations on the tree this gate shipped with, and rules 1 through 6 cannot see a single one of them. If a resync with hl7 or ncpdp dropped it, restore it rather than accepting the lower count."
fi
if [ "$SRC_RULE_COUNT" -lt 7 ] || [ "$STR_RULE_COUNT" -lt 7 ]; then
  self_test_fail "the src doc-comment or string-literal rule set no longer carries all 7 rules. The doc-comment surface is where every violation on this repo's shipping tree lived, so a short rule set there is the gate silently covering less than it reports."
fi

# THE `SYNTH` TRIPWIRE, asserted in the POSITIVE direction on purpose. `SYNTH` is in
# PROJECT_PREFIXES here and is deliberately absent from the ncpdp copy, so `SYNTH-MSG-0001`
# is a VIOLATION in this repo and legitimate example data in that one. Measured zero
# instances here today. This assertion is what makes that divergence a documented choice
# rather than a trap: if it ever fires on real content, read the `SYNTH` note above before
# renaming anything.
SYNTH_TRIPWIRE_SAMPLE='The example message id SYNTH-MSG-0001'
if ! printf '%s\n' "$SYNTH_TRIPWIRE_SAMPLE" | grep -qP -e "${RULE_PATTERN[0]}"; then
  self_test_fail "rule 'internal project identifier' no longer matches 'SYNTH-MSG-0001'. That is not necessarily wrong, but it is a DIVERGENCE from what this file documents: 'SYNTH' is kept in PROJECT_PREFIXES here (ncpdp drops it) precisely so that naming reds. Update the SYNTH note above in the same change, or restore the prefix."
fi

i=0
while [ "$i" -lt "$RULE_COUNT" ]; do
  if ! printf '%s\n' "${POSITIVE[$i]}" | grep -qP -e "${RULE_PATTERN[$i]}"; then
    self_test_fail "rule '${RULE_NAME[$i]}' no longer matches its own positive sample."
  fi
  if printf '%s\n' "${NEGATIVE[$i]}" | grep -qP -e "${RULE_PATTERN[$i]}"; then
    hit=$(printf '%s\n' "${NEGATIVE[$i]}" | grep -oP -e "${RULE_PATTERN[$i]}" | head -1)
    self_test_fail "rule '${RULE_NAME[$i]}' now matches legitimate reference material (matched: '${hit}'). This is the WORD-N trap: it destroys the standards designations, segment-field references and code systems that the docs of a CLI wrapping eight formats exist to provide."
  fi
  i=$((i + 1))
done

# The `src/` set gets its OWN self-tests, in the language of the surface it guards. The
# NEGATIVE samples are built from material actually present in this package's source: format
# names and segment references in doc comments, and TypeScript that reads like our jargon
# (`bytes.slice(0, 512)`, `argv.slice(2)`).
SRC_POSITIVE[0]='Item CLI-6 is done, and CCDA-P7 with it'
SRC_POSITIVE[1]='Phase 5b closes it (Phase W, Phase-L and the thirteenth slice landed earlier, in wave 2), and Phases 6 and 7 preceded it'
SRC_POSITIVE[2]='Decided in ADR 0025, restated in ADR-0021, and recorded in docs/adr/0001-x.md'
SRC_POSITIVE[3]='This slice adds the completion command and the final slice removes it'
SRC_POSITIVE[4]='Roadmap operations/roadmaps/cli.md and documentation/decisions/0025-x.md'
SRC_POSITIVE[5]='Repeating [S-EXIT], and Open-question #12 resolves the direction'
SRC_POSITIVE[6]='Grounded in the cli roadmap §7, refined from the roadmap sketch, and the deid roadmap forbids it'

SRC_NEGATIVE[0]='HL7-V2 and HL7-V3 and HL7-CDA and HL7-FHIR and HL7-OMG, FHIR-R4 and FHIR-R5 and FHIR-R4B and FHIR-bridge, DICOM-SR and DICOM-RT and DICOM-SEG and DICOM-DIR and DICOM-PS3, NCPDP-SCRIPT and NCPDP-TELECOM and NCPDP-D.0 and NCPDP-F6, X12-837P and X12-270 and X12-005010, CCDA-R2 and CCDA-R2.1, ASTM-E1394 and ASTM-E1381, MSH-2 and PID-3 and OBX-5, NM1-03 and ST-01, 439-E4 and 111-AM, ICD-10-CM, B1 B2 B3 E1, UTF-8 and CRLF'
SRC_NEGATIVE[1]='A Phase III oncology trial and a Phase II study; the clinical phases of a drug programme; the acute phase reactant; luteal phase dosing; the liquid phase of a preparation; the adapter stays in phase with the source system and is out of phase'
SRC_NEGATIVE[2]='ADR is not a segment identifier, and 0025 alone is a value'
SRC_NEGATIVE[3]='The slice thickness and the number of slices are DICOM attributes, each slice location is too; bytes.slice(0, 512) and argv.slice(2) are TypeScript; and the phase of the clinical study, the phase of illness and each phase of the trial are the reader words this rule must not touch'
SRC_NEGATIVE[4]='Parser operations are documented in the README, and documentation for the API is generated'
SRC_NEGATIVE[5]='A character range like [S-Z], a value set written [SNOMED], and open questions about the feed'
SRC_NEGATIVE[6]='## Roadmap; a product roadmap and the vendor roadmap; roadmapping the migration; the roadmaps of other projects'

# The STRING-LITERAL set gets its own samples too, in the language of a `CLI_*` diagnostic
# printed to a terminal. THE POSITIVE SAMPLES FOR RULES 1 AND 3 ARE THE TWO DEFECTS THIS
# PACKAGE ACTUALLY SHIPPED, restated: an item identifier inside a `CLI_NOT_IMPLEMENTED`
# message and an ADR number inside a `CLI_PARSER_UNAVAILABLE` one. Asserting the real shapes
# is the point -- a sample the rule cannot match is how a gate ends up believed for the
# wrong reason. The NEGATIVE ones are real strings from this package's source: the
# underscored diagnostic codes (which must never look like an identifier), import
# specifiers, the format names, and the remediated message text, so a widening that starts
# flagging correct diagnostics reds here instead of on the next pull request.
STR_POSITIVE[0]='redact is gated behind CLI-3 until the scrubber lands'
STR_POSITIVE[1]='Added in Phase 9 and reworked in phase 10b'
STR_POSITIVE[2]='parser unavailable; vendored as an optional dependency per ADR 0025'
STR_POSITIVE[3]='Added by the final slice of the command tree'
STR_POSITIVE[4]='See operations/roadmaps/cli.md'
STR_POSITIVE[5]='Traced as [S-EXIT]'
STR_POSITIVE[6]='unsupported for this format; see the cli roadmap for when it lands'

STR_NEGATIVE[0]='CLI_NOT_IMPLEMENTED and CLI_PARSER_UNAVAILABLE and CLI_FORMAT_UNSUPPORTED and CLI_MAP_INVALID, ./core/run.js and ../commands/parse.js, hl7 fhir dicom x12 ccda ncpdp astm mllp, --unsafe-show-values and --ndjson, HL7-V2 and FHIR-R4 and NCPDP-SCRIPT and X12-837P, MSH-2 and PID-3, UTF-8'
STR_NEGATIVE[1]='de-identification is not implemented; install @cosyte/deid to enable it. A Phase III trial and the acute phase reactant are out of scope, and the reader stays in phase with the source system.'
STR_NEGATIVE[2]='ADR is not a segment identifier, and 0025 alone is a value'
STR_NEGATIVE[3]='the parser for this format is not installed. The slice thickness and the number of slices are DICOM attributes.'
STR_NEGATIVE[4]='Parser operations are documented in the README, and documentation for the API is generated'
STR_NEGATIVE[5]='A character range like [S-Z], a value set written [SNOMED], and open questions about the feed'
STR_NEGATIVE[6]='## Roadmap; a product roadmap and the vendor roadmap; roadmapping the migration; the roadmaps of other projects'

i=0
while [ "$i" -lt "$STR_RULE_COUNT" ]; do
  if ! printf '%s\n' "${STR_POSITIVE[$i]}" | grep -qP -e "${STR_RULE_PATTERN[$i]}"; then
    self_test_fail "string-literal rule '${STR_RULE_NAME[$i]}' no longer matches its own positive sample."
  fi
  if printf '%s\n' "${STR_NEGATIVE[$i]}" | grep -qP -e "${STR_RULE_PATTERN[$i]}"; then
    hit=$(printf '%s\n' "${STR_NEGATIVE[$i]}" | grep -oP -e "${STR_RULE_PATTERN[$i]}" | head -1)
    self_test_fail "string-literal rule '${STR_RULE_NAME[$i]}' now matches a legitimate runtime string (matched: '${hit}'). A diagnostic a consumer reads in their terminal must survive this gate; only our bookkeeping must not."
  fi
  i=$((i + 1))
done

i=0
while [ "$i" -lt "$SRC_RULE_COUNT" ]; do
  if ! printf '%s\n' "${SRC_POSITIVE[$i]}" | grep -qP -e "${SRC_RULE_PATTERN[$i]}"; then
    self_test_fail "src rule '${SRC_RULE_NAME[$i]}' no longer matches its own positive sample."
  fi
  if printf '%s\n' "${SRC_NEGATIVE[$i]}" | grep -qP -e "${SRC_RULE_PATTERN[$i]}"; then
    hit=$(printf '%s\n' "${SRC_NEGATIVE[$i]}" | grep -oP -e "${SRC_RULE_PATTERN[$i]}" | head -1)
    self_test_fail "src rule '${SRC_RULE_NAME[$i]}' now matches legitimate reference material (matched: '${hit}'). This is the WORD-N trap, arriving through the source-comment surface: it destroys the format designations and segment references this CLI's IntelliSense exists to provide."
  fi
  i=$((i + 1))
done

# ---------------------------------------------------------------------------
# Refusals. Anything the scanner writes to stderr means it did not read everything it was
# given, and an incomplete scan must never print OK. Exit status cannot carry that signal:
# grep exits 1 on "no match", which xargs reports as 123, so "clean" and "died part way
# through the batch" are indistinguishable by code. A match inside input grep classifies as
# binary also arrives on stderr with empty stdout.
# ---------------------------------------------------------------------------
ERRLOG=$(mktemp)
FILELIST=$(mktemp)
SCANLIST=$(mktemp)
NPMBUF=$(mktemp)
REFLOWBUF=$(mktemp)
RAWBUF=$(mktemp)
SRCLIST=$(mktemp)
SRCSCAN=$(mktemp)
DOCLINES=$(mktemp)
DOCMAP=$(mktemp)
DOCFLOW=$(mktemp)
DOCFLOWMAP=$(mktemp)
STRLINES=$(mktemp)
STRMAP=$(mktemp)
trap 'rm -f "$ERRLOG" "$FILELIST" "$SCANLIST" "$NPMBUF" "$REFLOWBUF" "$RAWBUF" \
      "$SRCLIST" "$SRCSCAN" "$DOCLINES" "$DOCMAP" "$DOCFLOW" "$DOCFLOWMAP" \
      "$STRLINES" "$STRMAP"' EXIT

refuse_if_incomplete() {
  [ -s "$ERRLOG" ] || return 0
  cat "$ERRLOG" >&2
  echo "" >&2
  # GNU grep >= 3.5 prints "grep: FILE: binary file matches" on STDERR with nothing on
  # stdout, so a match in input it cannot read as text arrives here rather than in the hit
  # list. Name that case, or the run reds blaming an I/O failure that never happened and
  # sends a reader hunting it. This branch only chooses the wording; every path exits 1.
  if grep -qi 'binary file' "$ERRLOG"; then
    echo "ERROR: check-no-internal-refs - the input named above MATCHED a banned pattern," >&2
    echo "       but grep classifies it as binary, so the hit has no line number. Treat it" >&2
    echo "       as a real violation, and repair the file's encoding (it should be UTF-8)." >&2
  fi
  if grep -qiv 'binary file' "$ERRLOG"; then
    echo "ERROR: check-no-internal-refs - the scan reported errors, so it did not read all" >&2
    echo "       of its input. Refusing to report green from an incomplete scan." >&2
  fi
  exit 1
}

fail_with_hits() {
  local what="$1" hits="$2"
  echo "$hits" >&2
  echo "" >&2
  echo "ERROR: check-no-internal-refs - internal project bookkeeping found in ${what}." >&2
  echo "       A consumer reads this surface. Item identifiers, phase and wave language," >&2
  echo "       ADR numbers and meta-repo paths belong in the changeset, CHANGELOG.md, the" >&2
  echo "       commit, the PR and the roadmap. Translate at the boundary: say what the" >&2
  echo "       software does and what changed." >&2
  echo "       When you strip an identifier off the FRONT of a line, repair the head too:" >&2
  echo "       drop a leading orphan parenthetical, strip leading punctuation, recapitalise." >&2
  echo "       Leaving the fragment behind is worse than the text it replaced." >&2
  echo "       And when the sentence states a LIMIT, CUT the bookkeeping and leave the limit" >&2
  echo "       exactly as strong as it was. Softening it into an implied capability is the" >&2
  echo "       worse defect in this package." >&2
  echo "       Rule: documentation/conventions.md, 'No internal project bookkeeping on a" >&2
  echo "       public surface'." >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Build the scan list
# ---------------------------------------------------------------------------
#
# `git ls-files` is relative to the working directory, so from a subdirectory it lists a
# subtree and the scan would report OK having skipped the rest of the surface. Anchor at the
# top level.
cd "$(git rev-parse --show-toplevel)"

# The public surface, as paths. Each is justified in the SCAN SURFACE note at the top.
SURFACE_PATHS=(README.md LICENSE docs-content)

# Every named surface path must still be tracked. Without this, renaming or deleting
# README.md makes the gate scan less and still print OK, which is the same silent-green
# failure the routes below close, arriving through the file list instead of through grep.
for p in "${SURFACE_PATHS[@]}"; do
  if [ -z "$(git ls-files -- "$p")" ]; then
    echo "ERROR: check-no-internal-refs - the public surface path '$p' is not tracked." >&2
    echo "       Either it was renamed or removed (update SURFACE_PATHS in this script," >&2
    echo "       deliberately), or the scan is about to cover less than it claims." >&2
    echo "       Refusing to report green from a shrunken surface." >&2
    exit 1
  fi
done

# DRIFT TRIPWIRE on the npm tarball. `files` in package.json decides what a consumer
# actually receives, so anything added there is new public surface this gate would not know
# about. Rather than let that pass silently, refuse until someone puts it in SURFACE_PATHS or
# names it below as deliberately excluded.
#
# EVERY entry is checked, not just the prose-looking ones. Filtering `files` down to
# `*.md`/`LICENSE` first would discard `dist` before checking, and so structurally could not
# see the tarball's largest prose payload: the compiled JSDoc in `dist/index.d.ts`. A
# tripwire that cannot see the thing it was built to catch is not a tripwire. The two
# standing exclusions are named with their reasons in SCAN SURFACE above: `CHANGELOG.md`
# (contested, queued) and `dist` (untracked build output this script cannot read; its SOURCE
# is gated by the third and fourth passes instead).
command -v node >/dev/null || {
  echo "ERROR: check-no-internal-refs - node is required (to read package.json) and is not" >&2
  echo "       on PATH. Refusing to skip the npm-surface half of this gate." >&2
  exit 1
}
UNKNOWN_TARBALL_DOCS=$(node -e '
  const pkg = JSON.parse(require("fs").readFileSync("package.json", "utf8"));
  // Scanned by this gate:            README.md, LICENSE
  // Excluded deliberately, reasons in SCAN SURFACE: CHANGELOG.md, dist
  const known = new Set(["README.md", "LICENSE", "CHANGELOG.md", "dist"]);
  process.stdout.write((pkg.files ?? []).filter((f) => !known.has(f)).join(" "));
')
if [ -n "$UNKNOWN_TARBALL_DOCS" ]; then
  echo "ERROR: check-no-internal-refs - package.json 'files' ships something this gate does" >&2
  echo "       not cover: $UNKNOWN_TARBALL_DOCS" >&2
  echo "       That is public surface a consumer receives in the tarball. Add it to" >&2
  echo "       SURFACE_PATHS, or record it as a deliberate exclusion in this script." >&2
  exit 1
fi

git ls-files -z -- "${SURFACE_PATHS[@]}" > "$FILELIST"

if [ ! -s "$FILELIST" ]; then
  echo "ERROR: check-no-internal-refs - no tracked public-surface files to scan. Refusing" >&2
  echo "       to report green from a scan that read nothing." >&2
  exit 1
fi

# THE SILENT-GREEN ROUTES, all closed here. This list is NOT a claim of exhaustiveness:
# route (9) was found by a refuter against an hl7 copy whose own comment implied it was
# already complete.
#
#   (1) THE SCANNER CANNOT SEE. Closed by the locale pin and the positive self-tests above,
#       plus the negative self-tests, which also catch a rule widened into the trap (1)
#       shape.
#   (2) AN EMPTY FILE LIST. `xargs` without `-r` runs grep anyway, and grep with no file
#       operand reads STDIN, finds nothing, and exits 0. Closed by `-r` AND by refusing an
#       empty list outright, above and again after the loop.
#   (3) `git ls-files` FAILS (unreadable or corrupt index) AND ITS STATUS IS ERASED. The list
#       is built as its OWN command, not as the head of the pipeline: piped, its status is
#       swallowed by the `|| true` the no-match case needs, and the scan reports OK over an
#       empty list.
#   (4) A PATH THE SCANNER NEVER RECEIVES. `git ls-files` C-quotes any path holding a space,
#       a quote or a non-ASCII byte, so unseparated, grep is handed a name no file has.
#       Closed by `-z` here and `-0` on xargs.
#   (5) A FILENAME PARSED AS AN OPTION. A tracked file named `-q` would silence the whole
#       batch and the gate would print OK. Closed by `-e` before the pattern and `--` after
#       it.
#   (6) A FILENAME READ AS STANDARD INPUT, which `--` does NOT close. `--` stops `-` being
#       parsed as an OPTION; grep then reads the bare operand `-` as STDIN, and xargs points
#       its child's stdin at /dev/null, so a tracked file literally named `-` (a `cmd > -`
#       typo, which `git add -A` stages without complaint) is NEVER OPENED and the gate
#       prints OK over a live violation. Closed by `./`-prefixing every path AS THE LIST IS
#       BUILT, in the loop below rather than through `sed -z`, so the scan stays a single
#       command with the stderr capture bound to all of it. BE PRECISE ABOUT REACHABILITY:
#       grep treats only a BARE `-` operand as stdin, and none of the listed surface paths is
#       the repo root today, so the worst a file named `-` can produce is `docs-content/-`,
#       which grep opens normally. The prefix is kept as the thing that makes widening the
#       surface safe, not as decoration.
#   (7) AN UNREAD ENTRY THAT IS NOT A MISSED MATCH. `-d skip` silently skips a tracked
#       symlink to a directory: no stderr, so nothing refuses, and the gate goes green having
#       never opened it. `-d skip` is NOT used. The loop refuses a tracked entry that is not
#       a regular file BY NAME instead, which is louder. The `! -L` guard matters: `-d`
#       follows symlinks, so a symlink to a directory tests true and would be skipped as if
#       it were a gitlink.
#   (8) A SCAN THAT DIED PART WAY THROUGH AND REPORTED CLEAN. grep's exit status cannot
#       distinguish that from no-match. Closed by capturing stderr and refusing on any of it;
#       see refuse_if_incomplete.
#   (9) A VIOLATION THAT STRADDLES A LINE WRAP. Every rule here except the bare identifier is
#       multi-token, and this repo hard-wraps its markdown, so a phase sentence broken across
#       two lines reads perfectly on the rendered page and is invisible to a line scan.
#       Closed by the paragraph-joined second pass below.
#
# Also, and not a route so much as a standing choice: NO `-I`. `-I` skips anything grep's
# heuristic calls binary, which includes a genuine TEXT file with a broken encoding, so a
# violation inside one would be skipped in silence. This repo's public surface is markdown
# and JSON with no binaries (checked: no tracked file under it holds a NUL byte), so losing
# `-I` makes a future binary a loud red instead of a silent miss. Fail closed, not open.
# `-H` is set so every hit carries its filename: grep omits the name when handed exactly one
# file, which an xargs batch boundary can produce.
: > "$SCANLIST"
gitlinks=0
scanned=0
while IFS= read -r -d '' f; do
  if [ -d "$f" ] && [ ! -L "$f" ]; then
    gitlinks=$((gitlinks + 1))
    continue
  fi
  if [ ! -r "$f" ]; then
    echo "ERROR: check-no-internal-refs - tracked file is not readable: $f" >&2
    echo "       Refusing to report green from a scan that could not open its input." >&2
    exit 1
  fi
  if [ ! -f "$f" ]; then
    echo "ERROR: check-no-internal-refs - tracked entry is not a regular file: $f" >&2
    echo "       Refusing to report green from a scan that skipped one of its inputs." >&2
    exit 1
  fi
  printf './%s\0' "$f" >> "$SCANLIST"
  scanned=$((scanned + 1))
done < "$FILELIST"

if [ ! -s "$SCANLIST" ]; then
  echo "ERROR: check-no-internal-refs - no public-surface files survived list building." >&2
  echo "       Refusing to report green from a scan that read nothing." >&2
  exit 1
fi

# The npm metadata is public surface that is not a file of its own. Extract the two fields
# the convention names and scan them as text. Written with a real newline between fields so a
# hit reports a usable line number.
node -e '
  const pkg = JSON.parse(require("fs").readFileSync("package.json", "utf8"));
  const lines = ["description: " + (pkg.description ?? ""), "keywords: " + (pkg.keywords ?? []).join(", ")];
  process.stdout.write(lines.join("\n") + "\n");
' > "$NPMBUF"
if [ ! -s "$NPMBUF" ]; then
  echo "ERROR: check-no-internal-refs - could not read the npm metadata from package.json." >&2
  echo "       Refusing to report green from a scan that read nothing." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Scan, one rule at a time so a hit can name the rule it broke
# ---------------------------------------------------------------------------
#
# Each rule is its own single command with its own stderr capture, rather than one merged
# pattern: a merged pattern cannot report WHICH rule fired, and "phase language" and
# "internal identifier" want different remediation advice. The cost is N passes over a
# handful of markdown files, which is nothing.
ALL_HITS=""
i=0
while [ "$i" -lt "$RULE_COUNT" ]; do
  : > "$ERRLOG"
  HITS=$(xargs -0 -r grep -H -nP -e "${RULE_PATTERN[$i]}" -- < "$SCANLIST" 2>>"$ERRLOG" || true)
  refuse_if_incomplete

  : > "$ERRLOG"
  NPM_HITS=$(grep -H -nP -e "${RULE_PATTERN[$i]}" -- "$NPMBUF" 2>>"$ERRLOG" || true)
  refuse_if_incomplete
  # Report the npm metadata under a name a reader can act on, not a temp path.
  [ -n "$NPM_HITS" ] && NPM_HITS=$(printf '%s\n' "$NPM_HITS" | sed "s|^${NPMBUF}|package.json (npm metadata)|")

  for block in "$HITS" "$NPM_HITS"; do
    [ -n "$block" ] || continue
    ALL_HITS="${ALL_HITS}[${RULE_NAME[$i]}]"$'\n'"${block}"$'\n'
  done
  i=$((i + 1))
done

# ---------------------------------------------------------------------------
# Second pass: the same rules over PARAGRAPH-JOINED text
# ---------------------------------------------------------------------------
#
# WHY THIS EXISTS. Every rule above except the bare identifier is MULTI-TOKEN (`phase X`,
# `wave N`, `this slice`, `roadmap phase K`), grep matches within a line, and this repo
# hard-wraps its markdown by house style. So a violation that happens to straddle a wrap is
# invisible to the line scan, while a reader of the rendered page sees it plainly, because
# markdown folds a soft line break into a space. In the hl7 copy this was not hypothetical: a
# spec-notes page read "... A future phase" / "may add opt-in decode ...", and the gate
# printed OK over it.
#
# So the file is joined the way markdown renders it (consecutive non-blank lines in a
# paragraph become one line, blank lines stay blank) and scanned again. Line numbers are lost
# by construction, so this pass reports the FILE and the MATCHED TEXT, and it reports only
# matches the line pass did not already produce, which keeps a wrapped hit from being printed
# twice in the same run.
while IFS= read -r -d '' f; do
  # WHITESPACE IS SQUEEZED, and that is the whole difference between this pass working and
  # this pass looking as though it works. Joining lines verbatim leaves the continuation
  # line's own indentation in the joined text: an indented wrap produces `phase   may`, and
  # every rule here is written with single spaces, so it does not match. Indented
  # continuations are the DOMINANT wrap shape in this corpus, because the pages are mostly
  # bulleted, so the pass would miss the very case it was added for while reporting that it
  # had run. Squeezing runs of whitespace to one space is also what markdown itself does to a
  # paragraph, so this models the rendered page rather than approximating it.
  : > "$ERRLOG"
  awk '
    /^[[:space:]]*$/ { print ""; next }
    { line = $0; gsub(/[[:space:]]+/, " ", line); sub(/^ /, "", line); printf "%s ", line }
    END { print "" }
  ' "$f" > "$REFLOWBUF" 2>>"$ERRLOG"
  refuse_if_incomplete

  i=0
  while [ "$i" -lt "$RULE_COUNT" ]; do
    : > "$ERRLOG"
    grep -oP -e "${RULE_PATTERN[$i]}" -- "$f" > "$RAWBUF" 2>>"$ERRLOG" || true
    refuse_if_incomplete

    : > "$ERRLOG"
    FLOW_HITS=$(grep -oP -e "${RULE_PATTERN[$i]}" -- "$REFLOWBUF" 2>>"$ERRLOG" || true)
    refuse_if_incomplete

    if [ -n "$FLOW_HITS" ]; then
      # Only what the line pass could not see. An empty RAWBUF means no line-pass match, and
      # `grep -f` with no patterns selects nothing, so -v then keeps every wrapped hit.
      EXTRA=$(printf '%s\n' "$FLOW_HITS" | grep -Fxv -f "$RAWBUF" | sort -u || true)
      if [ -n "$EXTRA" ]; then
        while IFS= read -r m; do
          [ -n "$m" ] || continue
          ALL_HITS="${ALL_HITS}[${RULE_NAME[$i]} / wrapped across lines]"$'\n'"${f}: ${m}"$'\n'
        done <<< "$EXTRA"
      fi
    fi
    i=$((i + 1))
  done
done < "$SCANLIST"

# ---------------------------------------------------------------------------
# THIRD PASS: `src/` DOC COMMENTS, the prose that compiles into `dist/`
# ---------------------------------------------------------------------------
#
# THE CEILING, STATED FIRST, because it is the honest frame for everything below. `dist/` is
# UNTRACKED BUILD OUTPUT. No checked-in gate can scan it without building first, and this
# script deliberately does not build. So the thing a consumer actually receives is NOT what
# is checked here. What is checked is its SOURCE: the `/** */` blocks the dts build copies
# verbatim. That is a PROXY, and it is a good one only because the copy is verbatim -- tsup
# rewrites declarations, not doc text. A rewrite of the build that started transforming
# comments would silently decouple the two, and nothing here would notice. This pass
# therefore raises the floor on `dist/`; it does not observe `dist/`.
#
# Two consequences worth naming rather than discovering:
#   * A doc comment that never reaches an exported declaration is swept anyway. That is
#     deliberate: which comments survive the dts rollup is a property of the BUILD, not of
#     the source, and gating on it would make the gate's answer depend on tsup's inlining
#     decisions. It matters here because this package has TWO entry points (`.` and `./mcp`),
#     so "does it reach a declaration file" is two questions rather than one.
#   * `dist/*.d.cts` is the same text as `dist/*.d.ts`, so one clean source covers both
#     conditions.

# The `src/` surface must still be tracked, for the same reason SURFACE_PATHS is checked: a
# rename that empties this list must red, not shrink the scan in silence.
git ls-files -z -- 'src/*.ts' 'src/**/*.ts' > "$SRCLIST"
if [ ! -s "$SRCLIST" ]; then
  echo "ERROR: check-no-internal-refs - no tracked src/*.ts files to scan for doc" >&2
  echo "       comments. Either the source moved (update this pass, deliberately) or the" >&2
  echo "       scan is about to cover less than it claims. Refusing to report green." >&2
  exit 1
fi

# Same list-building discipline as the public-surface pass: `./`-prefixed as the list is
# built (route 6), a non-regular-file entry refused by name rather than skipped (route 7), an
# unreadable entry refused (not silently missed).
: > "$SRCSCAN"
src_scanned=0
while IFS= read -r -d '' f; do
  if [ -d "$f" ] && [ ! -L "$f" ]; then continue; fi
  if [ ! -r "$f" ]; then
    echo "ERROR: check-no-internal-refs - tracked source file is not readable: $f" >&2
    echo "       Refusing to report green from a scan that could not open its input." >&2
    exit 1
  fi
  if [ ! -f "$f" ]; then
    echo "ERROR: check-no-internal-refs - tracked source entry is not a regular file: $f" >&2
    echo "       Refusing to report green from a scan that skipped one of its inputs." >&2
    exit 1
  fi
  printf './%s\0' "$f" >> "$SRCSCAN"
  src_scanned=$((src_scanned + 1))
done < "$SRCLIST"

if [ ! -s "$SRCSCAN" ]; then
  echo "ERROR: check-no-internal-refs - no source files survived list building." >&2
  echo "       Refusing to report green from a scan that read nothing." >&2
  exit 1
fi

# EXTRACT THE DOC COMMENTS. Two buffers per pass, and the reason for the second one is line
# numbers: the rules must run over doc text ALONE (so a rule cannot match a line number, a
# path, or the code on the far side of a `*/`), which means the location has to travel beside
# the text rather than inside it. DOCLINES holds one doc line of text per line; DOCMAP holds
# `file:lineno` at the SAME line index. A hit at index N in one is located by index N in the
# other.
#
# The leaders are stripped the way an IDE strips them: `/**`, a leading `*`, and `*/`
# disappear, because none of them is part of what the reader sees on hover. `//` and plain
# `/* */` are NOT extracted -- see the boundary argument at SRC_RULE_NAME above.
: > "$DOCLINES"; : > "$DOCMAP"; : > "$DOCFLOW"; : > "$DOCFLOWMAP"
: > "$ERRLOG"
while IFS= read -r -d '' f; do
  awk -v file="$f" -v dl="$DOCLINES" -v dm="$DOCMAP" -v df="$DOCFLOW" -v dfm="$DOCFLOWMAP" '
    function emit() {
      gsub(/[[:space:]]+/, " ", joined); sub(/^ /, "", joined); sub(/ $/, "", joined)
      if (joined != "") { print joined >> df; print file ":" blockstart >> dfm }
      joined = ""
    }
    # End of a paragraph inside a block: emit it, keep the block open, keep reporting the
    # location as the block start (a paragraph index would be a number no reader can use).
    function flush2() { if (blockstart > 0) emit() }
    # End of the block.
    function flush() { if (blockstart > 0) emit(); blockstart = 0 }
    {
      line = $0
      if (!indoc) {
        if (line !~ /^[[:space:]]*\/\*\*/) { next }
        indoc = 1; blockstart = FNR; joined = ""
        sub(/^[[:space:]]*\/\*\*/, "", line)
      }
      # THE TERMINATOR IS TESTED BEFORE THE LEADER IS STRIPPED, and that ordering is the
      # whole correctness of this extractor. Stripping first turns a closing " */" into "/"
      # (the leader pattern eats the asterisk of the terminator), the block never closes, and
      # every `//` comment and line of CODE after it is scanned as doc text. That is not
      # hypothetical: it is what the first draft of the hl7 pass did, and it reported 60
      # violations that were all real bookkeeping sitting in `//` comments this surface
      # deliberately does not cover. A gate that over-reports is not "safe": it would have
      # forced a sweep of the wrong lines.
      # TESTING THE TERMINATOR AGAINST DOC TEXT IS CORRECT, NOT A SHORTCUT: a doc comment
      # whose prose contains `*/` (a glob like `src/**/*.ts`, a regex ending `*/`) would
      # close the block early and drop the rest of it from the scan. THE CONSTRUCT IS
      # UNREACHABLE IN VALID TYPESCRIPT: block comments do not nest and cannot contain `*/`,
      # so the compiler ends the comment at exactly the same character this does, and
      # `typecheck` runs ahead of this gate on the ladder. The extractor mirrors the
      # language; it does not approximate it.
      closed = 0
      if (line ~ /\*\//) { closed = 1; sub(/\*\/.*$/, "", line) }
      # Exactly ONE leading asterisk, never `\*+`: a greedy leader would swallow the opening
      # `**` of markdown bold ("* **Fail-safe:**") and alter the scanned text.
      sub(/^[[:space:]]*\*[[:space:]]?/, "", line)
      sub(/^[[:space:]]+/, "", line)
      # The LINE pass sees the doc text with its location beside it.
      print line >> dl; print file ":" FNR >> dm
      # The FLOW pass accumulates a PARAGRAPH, not the whole block, and squeezes it the way a
      # tooltip reflows one. A BLANK doc line is a paragraph break and ends the run, for the
      # same reason the markdown pass above prints an empty line rather than joining through
      # it: joining through the break invents adjacencies that no reader ever sees. Left
      # unbroken, a doc line ending in "phase" followed by a blank line and a paragraph
      # opening with a capital letter would red as "phase X". That is an over-report rather
      # than a silent green, but a gate that reds on correct content is a gate someone
      # deletes.
      if (line ~ /^[[:space:]]*$/) { flush2() } else { joined = joined " " line }
      if (closed) { flush(); indoc = 0 }
    }
    END { if (indoc) flush() }
  ' "$f" 2>>"$ERRLOG"
done < "$SRCSCAN"
refuse_if_incomplete

# An extraction that produced nothing from a non-empty, JSDoc-heavy source tree means the
# extractor broke, not that the tree is clean. Same class as the empty-file-list refusal.
if [ ! -s "$DOCLINES" ]; then
  echo "ERROR: check-no-internal-refs - extracted no doc-comment text from ${src_scanned}" >&2
  echo "       tracked source file(s). Every public export in this package carries JSDoc," >&2
  echo "       so an empty extraction means the extractor is broken, not that the source" >&2
  echo "       is clean. Refusing to report green from a scan that read nothing." >&2
  exit 1
fi

# SCAN. Line pass first (it can name a file and a line), then the reflowed pass for
# violations that straddle a wrap. Wraps are not hypothetical here either: this package's doc
# comments are wrapped at the same column as its markdown, and a sentence ending "... this" /
# "phase adds" is exactly as invisible to a line scan in JSDoc as it is in markdown. The
# reflow models a hover tooltip: whitespace squeezed, `*` leaders already gone.
SRC_HITS=""
i=0
while [ "$i" -lt "$SRC_RULE_COUNT" ]; do
  : > "$ERRLOG"
  LINE_IDX=$(grep -nP -e "${SRC_RULE_PATTERN[$i]}" -- "$DOCLINES" 2>>"$ERRLOG" | cut -d: -f1 || true)
  refuse_if_incomplete
  if [ -n "$LINE_IDX" ]; then
    while IFS= read -r n; do
      [ -n "$n" ] || continue
      loc=$(sed -n "${n}p" "$DOCMAP")
      txt=$(sed -n "${n}p" "$DOCLINES")
      SRC_HITS="${SRC_HITS}[${SRC_RULE_NAME[$i]} / src doc comment]"$'\n'"${loc}: ${txt}"$'\n'
    done <<< "$LINE_IDX"
  fi

  : > "$ERRLOG"
  FLOW_IDX=$(grep -nP -e "${SRC_RULE_PATTERN[$i]}" -- "$DOCFLOW" 2>>"$ERRLOG" | cut -d: -f1 || true)
  refuse_if_incomplete
  if [ -n "$FLOW_IDX" ]; then
    while IFS= read -r n; do
      [ -n "$n" ] || continue
      # Report only what the line pass could not see, so a wrapped hit is not printed twice.
      # A block whose violation is on one line is already reported above.
      blockloc=$(sed -n "${n}p" "$DOCFLOWMAP")
      # DELIMITED, not a bare substring. An unanchored `*"$blockloc"*` makes `./src/x.ts:1` a
      # substring of an existing hit at `./src/x.ts:12`, so a real wrapped violation in the
      # block starting at line 1 is suppressed by an unrelated hit at line 12. It never loses
      # the RED (SRC_HITS is non-empty either way) but it loses the REPORT, which is the line
      # a remediator needs. The trailing ':' is what a location is always followed by in
      # SRC_HITS.
      case "$SRC_HITS" in
        *"${blockloc}: "*|*"${blockloc} (block): "*) continue ;;
      esac
      m=$(sed -n "${n}p" "$DOCFLOW" | grep -oP -e "${SRC_RULE_PATTERN[$i]}" | head -1)
      SRC_HITS="${SRC_HITS}[${SRC_RULE_NAME[$i]} / src doc comment, wrapped across lines]"$'\n'"${blockloc} (block): ${m}"$'\n'
    done <<< "$FLOW_IDX"
  fi
  i=$((i + 1))
done

# ---------------------------------------------------------------------------
# FOURTH PASS: `src/` STRING LITERALS, the prose that reaches a consumer's TERMINAL
# ---------------------------------------------------------------------------
#
# The argument for this pass, the measurement behind it, and its four stated boundaries are
# at STR_RULE_NAME above. In short: a CLI's stderr is the only text most of its users will
# ever read, it is neither markdown nor a doc comment, and this package shipped an item
# identifier and an ADR number through it.
#
# The extractor keeps text ONLY, never the quotes, and records `file:line` beside each
# extracted line in the same index-aligned way the doc-comment pass does. Several literals on
# one source line are joined with a space, which is safe because a rule that matched across
# the join would have to span two adjacent literals in one expression; measured zero such
# matches, and an over-report there is a maintainer reading one line.
: > "$STRLINES"; : > "$STRMAP"
: > "$ERRLOG"
while IFS= read -r -d '' f; do
  awk -v file="$f" -v sl="$STRLINES" -v sm="$STRMAP" '
    # Whole-line comments are skipped: the doc-comment pass owns `/** */`, and `//` is
    # deliberately out of scope for this gate. Matches `//`, `/*`, `/**` and a ` *`
    # continuation line.
    /^[[:space:]]*(\/\/|\/\*|\*)/ { next }
    {
      line = $0
      out = ""
      while (match(line, /"([^"\\]|\\.)*"|`([^`\\]|\\.)*`/)) {
        out = out " " substr(line, RSTART + 1, RLENGTH - 2)
        line = substr(line, RSTART + RLENGTH)
      }
      if (out != "") { print out >> sl; print file ":" FNR >> sm }
    }
  ' "$f" 2>>"$ERRLOG"
done < "$SRCSCAN"
refuse_if_incomplete

# A source tree this size cannot contain zero string literals. An empty extraction means the
# extractor broke, not that the tree is clean; same class as every other refusal here.
if [ ! -s "$STRLINES" ]; then
  echo "ERROR: check-no-internal-refs - extracted no string literals from ${src_scanned}" >&2
  echo "       tracked source file(s). This package's diagnostics, exit-code names and" >&2
  echo "       import specifiers are all string literals, so an empty extraction means the" >&2
  echo "       extractor is broken, not that the source is clean. Refusing to report green" >&2
  echo "       from a scan that read nothing." >&2
  exit 1
fi

STR_HITS=""
i=0
while [ "$i" -lt "$STR_RULE_COUNT" ]; do
  : > "$ERRLOG"
  STR_IDX=$(grep -nP -e "${STR_RULE_PATTERN[$i]}" -- "$STRLINES" 2>>"$ERRLOG" | cut -d: -f1 || true)
  refuse_if_incomplete
  if [ -n "$STR_IDX" ]; then
    while IFS= read -r n; do
      [ -n "$n" ] || continue
      loc=$(sed -n "${n}p" "$STRMAP")
      txt=$(sed -n "${n}p" "$STRLINES")
      STR_HITS="${STR_HITS}[${STR_RULE_NAME[$i]} / src string literal]"$'\n'"${loc}:${txt}"$'\n'
    done <<< "$STR_IDX"
  fi
  i=$((i + 1))
done

[ -n "$ALL_HITS" ] && fail_with_hits "the public surface listed above" "$ALL_HITS"
[ -n "$SRC_HITS" ] && fail_with_hits "src/ doc comments, which compile into dist/*.d.ts and render in every consumer's editor" "$SRC_HITS"
[ -n "$STR_HITS" ] && fail_with_hits "src/ string literals, which reach a consumer as terminal diagnostic text" "$STR_HITS"

echo "check-no-internal-refs: OK (${scanned} public-surface file(s) and the npm metadata scanned against ${RULE_COUNT} rules, line by line and paragraph-joined; ${src_scanned} source file(s) scanned against ${SRC_RULE_COUNT} rules for doc-comment bookkeeping, line by line and paragraph-reflowed, and against ${STR_RULE_COUNT} rules for string-literal bookkeeping; ${gitlinks} gitlink(s) skipped)"
