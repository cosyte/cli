# @cosyte/cli: Project Guide for Claude

> **The narrative lives in [`documentation/agent-notes.md`](documentation/agent-notes.md). Read it before
> you touch anything a rule below tells you not to touch.** This file is always-read, so the write-ups,
> the shipped-phase histories and the long rationales were relocated there **verbatim**; nothing was
> deleted, and every rule below is also stated at its uncompressed length in
> [agent-notes § The rules as they stood](documentation/agent-notes.md#the-rules-as-they-stood-before-the-trim).
> What stays here is the cursor, the rules, and **every** trap, each compressed to a one-line imperative
> with a link to the section that proves it. **"I did not read the reason" is not a licence to discount
> the rule.** Every one of these lines cost a defect to learn.

> **The pair is gated** (`pnpm check:agent-notes`, enforced by `test/scripts/agent-notes.test.ts`, so it
> rides `ci / verify` and `prepublishOnly`): the narrative file must be tracked, every section must have
> a body (a container's is its subsections), and every pointer at it **in a file it opened** must
> resolve. **A NUL-bearing file is skipped: a disclosed miss, not a pass**, told by the skipped count.
> **Only the BASENAME is compared, so moving the file keeps this green while every link 404s.** It
> matches the **QUALIFIED spelling only**, a **bare** backticked anchor anywhere **REFUSES the run at
> exit 2**, and it asserts **this repo's promise, not a universal**. **Never port a sibling's matcher
> without re-counting both spellings here**, and **never clear a red by deleting the pointer or the
> heading.**
> Why: [agent-notes § The gate](documentation/agent-notes.md#the-two-file-contract-gate).

## Project

**`@cosyte/cli`**: the **cosyte CLI**, a **`bin` package** (the `cosyte` command), not a parser and not a
library. It is the **developer-tooling tier**: a thin, honest, PHI-safe skin over the `@cosyte/*`
parsers. It **wraps**; it re-implements no wire-format parsing.
**North star:** `cat adt.hl7 | cosyte parse -` → typed JSON on stdout, the right exit code, and **not one
byte of PHI on stderr**, never a confident wrong value and never a silent success on a malformed message.
Full contract: the meta-repo `operations/roadmaps/cli.md`.

## Shape (the single most important fact)

This is an **executable**, not an import surface. `package.json#bin` maps `cosyte` →
`dist/bin/cosyte.mjs`. `src/` is a **command tree**: a thin `bin` over a testable `core`, argument-parsed
with Node's built-in **`util.parseArgs`** plus a hand-rolled dispatcher, so there is **zero third-party
CLI framework**. The `.` subpath still exports a small programmatic `core` API.

## Status

**Feature-complete.** No new runtime command surface is planned. The CLI wraps **all eight** cosyte
formats through one lazy per-format adapter registry (`src/core/parsers.ts`), exposes the same `core`
through the `cosyte` and `cosyte-mcp` bins and the `.` / `./mcp` exports, and states support **per
(format, operation)** via `OP_SUPPORT`: an unsupported cell is a value-free `CLI_FORMAT_UNSUPPORTED`,
never a fake. Exit-code contract: `0/1/2/65/66/69/70`. **Deferred, honestly and never faked:** `dicom`
`parse`/`fmt`, `ccda` `parse`, `mllp` `fmt`/`validate`; `redact`/`deid` and `map-codes` MCP tools and
remote/HTTP MCP; `validate --profile` (reserved, `CLI_NOT_IMPLEMENTED`/`69`). Per-phase histories:
[agent-notes § Shipped phases](documentation/agent-notes.md#shipped-phases); the deferred list in detail:
[agent-notes § Deferred](documentation/agent-notes.md#deferred).

### `redact` delegates to `@cosyte/deid`, and every refusal is load-bearing

Why: [agent-notes § The redact delegation](documentation/agent-notes.md#the-redact-delegation-and-its-refusals).

- **The CLI adds NO de-identification logic. Ever.** No policy, no locus map, no transform, no fallback
  scrub: `src/core/deid.ts` delegates or refuses, and **anything short of a clean, fully-handled pass
  is non-zero with EMPTY stdout**. **Two refusals, two codes, never interchangeable**: no adapter
  is `CLI_NOT_IMPLEMENTED`/`69`, `dicom` is `CLI_FORMAT_UNSUPPORTED`/`65` because it is the CLI's own
  channel limit (**never blame the library for our channel**), and a `blocked` locus is
  `CLI_DEID_INCOMPLETE`/`1`.
- **`@cosyte/deid/ncpdp` is NCPDP Telecom, not SCRIPT**, so it is NOT coverage: **re-derive coverage
  from the installed package's types, never from the subpath list.** The default policy REMOVES MRN /
  account / member numbers (`DEID_CATEGORY_REMOVED`) rather than surrogating them, and a keyed
  transform with no key is a fatal there, so the CLI still keys each invocation with an **ephemeral
  random key** and **discloses that surrogates are not stable across runs**; **never remove that
  disclosure**, **never drop the key context**, and **never substitute an unkeyed fallback**.
- **`redact` deliberately does NOT honour `--unsafe-show-values`.** Do not "restore consistency".
  **The stderr manifest is the LIBRARY's**, value-free by contract and rendered verbatim; the PHI-leak
  matrix carries a redact row per mode. **ADRs** `documentation/decisions/0021` through `0025` govern
  the dependency tiers and the two bins. Summaries:
  [agent-notes § ADRs](documentation/agent-notes.md#adrs).

### The published package, and the FHIR hole (live, unresolved)

Why: [agent-notes § The vendor to npm dependency swap](documentation/agent-notes.md#the-vendor-to-npm-dependency-swap).

- **`@cosyte/fhir` is deliberately NOT in the manifest, in any form, and you must not add it**: it cannot
  publish, and declaring it alongside `@cosyte/transform` fails the whole install with `ERESOLVE`. **This
  is not a manifest bug to fix**, and **do not explain that `ERESOLVE` with a missing
  `peerDependenciesMeta.optional` flag**: measured, that flag does not decide the outcome. **An installed
  copy therefore has NO FHIR support**, stated on every consumer surface rather than discovered: those
  commands degrade to a value-free `CLI_PARSER_UNAVAILABLE` (`69`), and `@cosyte/fhir` survives only as a
  **`devDependency`** on its registry range.
- **Never quote the published version in this file** (derive it: `npm view @cosyte/cli version`), and
  **never move a published version backwards**: `0.0.1` and `0.0.2` are permanently broken on npm and
  both printed `VERSION = "0.0.0"`. **Fix the ASSERTION, not just the value**: `test/sanity.test.ts`
  pins the `: string` declaration shape `scripts/sync-version.mjs` keys on.
- **Never write "any new call site" of the `absent-sibling` static guard: a refuter falsified that
  wording.** It reds only on a NEW **single-line, unwrapped** dynamic `import()`, so **never drop the
  word `type` from `src/core/parsers.ts`'s `import type` of `@cosyte/fhir`**: it loads eagerly and
  breaks every command in an installed copy, unseen.
- **The two unavailable-parser diagnostics deliberately do NOT say "install it"**, and so do not use
  `loadOptional()`'s stock wording: that install fails `E404` on its own `fhir` peer. **Verify a release
  by INSTALLING the packed tarball outside the repo, never by `--dry-run`**, and **never make the
  `install-gate` job skippable**; its limits are in `RELEASING.md`, and the version-string check stays
  checklist step 6, a human one.
- **`npx @cosyte/cli …` fails**; use `npx --package @cosyte/cli cosyte …`. **A `cli` bin alias would fix
  it and is deliberately not added**: founder call. **Flipping a repo's visibility is never waived**, the
  public-flip stop is already behind this package, and the `npm publish` half is a founder directive.

### Hard runtime deps

- **Two hard `dependencies`, `@cosyte/hl7` + `@cosyte/terminology`**, real registry ranges, lazy-loaded
  per command: **2** against a cap of **4**, under it and not at it. Third-party runtime deps: **zero**.
- **`@cosyte/deid` is an `optionalDependency`, outside the cap**, reached only by `redact`; an absent
  copy degrades to `CLI_PARSER_UNAVAILABLE`/`69` before any input is read. **Never promote it to
  `dependencies`**: a hard dep a registry cannot resolve makes the whole CLI uninstallable.
- **Do not "restore" `@cosyte/transform` to `dependencies` or declare `@cosyte/fhir`** without reading
  the swap note first. **No `vendor/` tarball is wired to anything**: `@cosyte/fhir` is a registry
  devDependency, and removing the nine tarballs left is a separate cleanup. Detail:
  [agent-notes § Hard runtime deps](documentation/agent-notes.md#hard-runtime-deps).

### The docs sidebar is bound by an IA spine nothing here checks

Why: [agent-notes § The docs sidebar and the IA spine](documentation/agent-notes.md#the-docs-sidebar-and-the-ia-spine).

- **An off-spine top-level label in `docs-content/sidebars.json` stops the WHOLE docs site deploying**.
  Categories are **optional**; the rule is that
  whatever you have is labelled and ordered canonically, so `{"docs":["intro"]}` is compliant.
- **🔴 NEVER AUTHOR AN `API Reference` CATEGORY**: the docs site injects it, and a hand-authored one is a
  distinct, **harder** error. **Never claim where the injected category lands.** **"Verified against
  the linter" is not evidence about placement.**
- **Verify a sidebar edit against the site's own linter**, `docs/scripts/check-ia-conformance.ts`
  (`NODE_ENV=test` is required to call `lintSidebar`). **Nothing in `verify.sh` or this repo's CI can
  catch this**, so **use the previously shipped sidebar as a negative control.** Keep `limitations` under
  `Troubleshooting` and `mcp`/`reference-commands` under `Guides`, and **do not copy `synth`**, the lone
  counter-example. **Only a NEW RELEASE clears the gate**, and archived versions never gate, so **do not
  try to fix history.**

### The pre-commit PHI scanner

Why: [agent-notes § The pre-commit PHI gate and git mv](documentation/agent-notes.md#the-pre-commit-phi-gate-and-git-mv).

- **Never re-introduce rename detection into `scripts/phi-scan.ts --staged`**: `--no-renames` is the
  whole remedy and a strict **SUPERSET**. **Do NOT re-derive this as "needs the two-path record shape, a
  scope decision"**: that framing is false, measured twice.
- **Keep the `--raw -z` two-field stride, the `T` status, the destination-mode read, and the exit 2
  refusal of a non-blob mode**, and **keep each scan root's own path in scope.**
- **Keep the two routes' refusals identical**, **the `.md` exemption deliberately does not reach a
  link**, **a refusal NEVER prints the link target** while naming every offender's own path, and **that
  guarantee is about a REFUSAL and does not extend to a hit.**
- **Exit `1` means "hits found", so a broken invocation must never exit `1`**: an unreadable allow-list,
  **override log** or scan root is **exit 2**.
- **A declared scan root the all-mode walk never OBSERVED refuses at exit 2**, on two `git ls-files`
  reconciliation conditions neither of which subsumes the other. **Never add a denominator instead**,
  **never let a failing `git ls-files` answer the empty set**, and keep it **one-directional** and
  **all-mode only**: widening `--staged` changes what a COMMIT is blocked on.
- **A target the run ENUMERATED and never read refuses at exit 2, and the HITS ARE REPORTED FIRST** so a
  refusal cannot swallow a finding. **It is a SET DIFFERENCE, never a count.** Withdrawing a file with
  `--allow-fixture` buys a no-answer: **declare its identifiers in the allow-list instead.**
- **Never state a refusal rule unqualified**, and **three escapes remain, NARROWED not closed**: a scan
  root that is itself a live link, an **ancestor** of a root, and a link named in paths mode. **Never
  describe one as closed**, and **do not "fix" them inside an unrelated slice.**
- **Walk roots are `src`, `test`, `scripts`, re-derived, and must stay DISJOINT.** **`scripts/` IS SWEPT:
  name a PHI shape, never SPELL a literal**, and an `ID` in dashed shape reds `phi-allow-list.txt`:
  respell `MRN-`. **`test/scripts/phi-scan.test.ts` is the ONE exempt path**, at the **scan**,
  **all-mode only**, **per path**; `EMAILDOMAIN` is global, so never allow-list a file green.
- **🛑 THE WIDENING BOUGHT THE SSN/EMAIL FLOOR OVER 38 MORE FILES AND NOTHING ELSE**, **the recogniser
  was NOT widened, on measurement**, and **a tripwire reds if that changes**: widen **in addition to**
  the raw pass, never instead of it. **Other residuals:** `D` and `U` are unenumerated. **Give every
  `test/scripts/*.test.ts` case an explicit timeout**, and **assert the premise, not only the remedy**:
  two vacuity traps already sprang in this suite.

### The em-dash brand gate

Why: [agent-notes § The em-dash brand gate](documentation/agent-notes.md#the-em-dash-brand-gate).

- **The `U+2014` ban is absolute** (founder directive). `scripts/check-no-emdash.sh` +
  `.github/workflows/no-emdash.yml` gate **both** halves: every tracked file, **and** the PR title, body
  and commit messages. **▶ READ THIS BEFORE PORTING THE GATE OR SWEEPING ANY REPO: AN EM DASH IS
  SOMETIMES A VALUE, NOT PUNCTUATION.** **Grep for a cell or list-marker em dash first**
  (`\|\s*\x{2014}\s*[\|\(]`) and convert
  each to a **WORD**, by hand, before any bulk transform.
- **CUT, do not rewrite**, and **revert a rewrite verbatim rather than repair it**. **Nothing in this
  repo's CI could have caught that**, because the doc tests execute only runnable blocks and prettier's
  glob does **not** cover `docs-content/`.
- **Never drop the NUL exclusion and never add `grep -I` instead**: both have measured failure modes
  with no remediation. **The disclosed cost is a miss, not a pass** (a tracked **text** file holding a
  NUL is silently exempt), **the tell is the excluded count on the OK line, and if it moves, revisit
  the partition, never the ban.** **`test/__fixtures__/adt-a01.hl7` and `minimal.astm` stay in scope**.
- **Fix the script's shared known limits in the shared copies, not here**, and **re-derive every number
  before writing it down; never quote one from a sibling's copy.**
- **What lands on `main` here differs from `mllp`: all three merge methods are enabled**, so the **branch
  commit messages** are the one text that lands under every method and **the PR body lands under none**
  (scanned anyway, deliberate over-strictness). **Do not repeat `ncpdp`'s copy** claiming the title and
  body are what lands. **Not retroactive:** history is not rewritten.

## Tech Stack (the shared `@cosyte/*` standard)

Inherited by depending on the published `@cosyte/*` config packages, not by copying files; the source of
truth is the meta-repo's `documentation/conventions.md`.

- **Language/build:** TypeScript 5.9.x strict (full rigor set), **ES2023**, `NodeNext`, dual ESM + CJS +
  `.d.ts` via `tsup`, with `attw` as a publish gate whose script is **`node scripts/attw.mjs --profile
node16`, never the bare CLI**: see the guardrail below. **License:** MIT.
- **Node:** **>= 22, < 26** (CI matrix 22 + 24); `test/node-support.test.ts` reds when the range, the
  matrix and this line disagree. **Widen it only after the required-context ruleset has the new cell**,
  never before. **Package manager:** `pnpm@10`, with `pnpm-workspace.yaml` carrying the install
  hardening (`minimumReleaseAge`, `trustPolicy`); **never move the pin below the release that honours
  both keys**, or the settings file decorates rather than defends.
- **Lint/format:** **ESLint 10** + type-checked `typescript-eslint`, Prettier, lint at
  `--max-warnings=0`. **Testing:** **Vitest 4** + v8 coverage with per-directory >= 90 gates on
  `src/core` + `src/commands`, plus contract snapshots, an autodetection corpus, a fast-check property,
  the `parse == library-parse` equivalence, a **PHI-leak matrix**, an **argv+stdin+MCP fuzz** gate, an
  **exit-code golden matrix** and a built-package **`smoke`**.
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows, and **the checks BIND**.
  **Runtime deps:** **`@cosyte/hl7` + `@cosyte/terminology` only** as hard deps against a cap of **4**;
  everything else is optional and outside it, and **`@cosyte/fhir` is undeclared**.

## Branch protection (and the limits of this claim)

Full ruleset, the required-context table and the per-check reasoning:
[agent-notes § Branch protection](documentation/agent-notes.md#branch-protection-and-the-limits-of-this-claim).

- `main` is protected by the repository ruleset **`ci-required-checks`** (id `19907924`), every required
  context pinned to **`integration_id: 15368`**. **Never quote the context count without re-deriving
  it**, and **read a required context off a REAL check run, never off a workflow's `name:` field**:
  requiring a context nothing emits leaves a PR **pending and unmergeable forever**.
- **▶ A `ci / *` CONTEXT CAN APPEAR HERE WITH NO COMMIT IN THIS REPO, AND IT ARRIVES NOT REQUIRED**, so
  an upstream job shows **a red X that does not block a merge**. **Census `ci / *` against a real check
  run whenever `.github` moves**, then require it or write down why not.
- **`no-internal-refs` and `no-emdash` are bare JOB IDS**, not `<workflow> / <job>`: **rename the job and
  the ruleset together, or neither.** **A required job gates all of its steps**, so splitting a step out
  of `ci / verify` into its own job silently un-requires it, and **never add a `paths:` filter** to
  `ci.yml`, `codeql.yml`, `no-internal-refs.yml` or `no-emdash.yml`.
- **Confirm a ruleset write with the `PUT` itself, never a `GET`**: an Organization-sourced ruleset
  answers `200` to a `GET` and `404` to an identical-payload `PUT`.
- **Never require `scorecard / analysis`, `fuzz`, or `release / release`** (none runs on `pull_request`,
  so each strands every PR pending forever), and **never require the Advanced Security `CodeQL` check**:
  it reports **alert state**, not whether the analysis ran.
- **▶ Scope of the claim: a ruleset makes a red check BLOCK a merge. It does not make the check correct,
  and nothing inside this repository can observe its own ruleset.** Verify it the only way that works:
  `gh api repos/cosyte/cli/rulesets`. Recorded **unproven** rather than fine.

## Engineering Guardrails

- No `any`. No unjustified `as` casts. Use `unknown` and narrow. Short, testable functions; keep the
  `bin` trivial and push all logic into the covered `core`. JSDoc (with `@example`) on every public
  export: the lint rule is an **error** there, so it is enforced.
- No `console.*` in `core`/`commands`. Return a `RunResult` (`{ stdout, stderr, exit }`); only the thin
  `bin` writes to process streams. Coverage: per-directory >= 90% via `pnpm test:coverage`.
- **Fail-safe routing:** an unrecognised or ambiguous format is a typed error + non-zero exit, **never a
  guessed parser**, and the CLI adds no tolerance of its own. **The exit-code contract**
  (`core/exit-codes.ts`) is a designed, documented surface CI depends on: **never exit `0` on input the
  CLI could not handle.**
- **Value-free diagnostics (load-bearing):** every `stderr`/error/log line is code + position only,
  **never** an input value. `stdout` is the data channel, a caught exception's message is discarded
  rather than echoed, and the CLI writes no temp file and logs to no file.

### The `attw` gate

Why, with every measurement: [agent-notes § The attw wrapper](documentation/agent-notes.md#the-attw-wrapper).

- **▶ `attw` SAYS "does not contain types" AND EXITS 0, so `pnpm attw` is `node scripts/attw.mjs
--profile node16` and NEVER the bare CLI**, because no flag or config setting reaches its early return.
- **The race only supplies the condition; the answer is NOT a lock, a lease or a build queue**, and
  **do not quote the measured interval as a constant**; the ordering does not move. **Keep the preflight
  walking `bin` as well as `exports`**: `attw` never reads `bin`. **`--profile node16` is load-bearing
  and is forwarded, never reinterpreted**, or `@cosyte/cli/mcp` fails `node10` resolution.
- **Only a TOTAL loss of declarations is the false green; a PARTIAL one `attw` catches itself**, so the
  preflight must report both outcomes and **must not assert the exit 0**. **Re-measure before shortening.**
- **The post-check reads a string, so what would hide that string is refused**: `--quiet`, `-q`,
  `--format`, `-f`, `--config-path`, and a `.attw.json` setting `quiet` or `format`. **Say "exact argv
  token" of the ARGV refusal, never "wholesale"**; the `.attw.json` refusal **is** wholesale.
- **Two holes are disclosed and deliberately left open**: clustered short forms `-fjson` / `-Pf json`,
  and a declared path not starting with `.`. `test/scripts/attw-gate.test.ts` pins both nets, the
  upstream exit 0 and a negative control.

## Standing disciplines (every change)

Mirrors the three disciplines in the meta-repo's `documentation/conventions.md`. They bind here too:

1. **Documentation follows code**: a change to the public surface/stack/status isn't done until the docs
   are: `README.md`, `docs-content/`, the meta-repo `documentation/repos/cli.md` (bump its "last
   verified" date), and the `ecosystem-map.md` table.
2. **Version + changelog**: a Changeset (`patch` on the `0.0.x` ladder) + a `CHANGELOG.md` `[Unreleased]`
   entry per meaningful change. Renaming a stable `CLI_*` diagnostic code or an exit code is a
   **breaking change** (scripts branch on them).
3. **Crew + knowledgebase loop**, if the command surface, `CLI_*` codes, or exit-code map change,
   flag/update the matching `crew` healthcare skill + the KB product doc.
4. **No internal project bookkeeping on a public surface** (founder directive). What a consumer reads
   (`README.md`, `docs-content/`, the npm `description`, a release body, **the JSDoc their editor renders
   on hover, and the diagnostic their terminal prints**) says what the software does and what changed.
   Item identifiers, phase and wave language, ADR numbers, roadmap citations, meta-repo paths and "how
   this got built" commentary belong in the changeset, `CHANGELOG.md`, the commit, the PR and the
   roadmap. It is a **translation** at the boundary, not a deletion. Gated by
   `pnpm check:no-internal-refs`. Why, in full: [agent-notes § No internal project bookkeeping on a
   public surface](documentation/agent-notes.md#no-internal-project-bookkeeping-on-a-public-surface).
   - **Doc comments and string literals ARE gated**; **line comments and plain block comments are NOT
     gated, and identifiers are welcome in them.** **Do not justify that boundary from what reaches
     `dist/`**: four drafts tried it and a refuter proved each false. **The boundary rests on the
     convention**: not what a consumer _receives_, but what a consumer is **shown**.
   - **Never re-key the gate on the `WORD-N` shape**, which is widest here: the self-tests make that red.
   - **Repair the head**: a sentence with an identifier stripped off the front reads worse than the text
     it replaced. **CUT, do not rewrite**: **delete the claim rather than replace it, and revert a
     rewrite verbatim.**
   - **The gate catches identifiers, not English sentences about our process**, and it reads `src/`,
     never `dist/`. A new programme prefix has to be added by hand. **The reviewer still owns half the
     rule.**
