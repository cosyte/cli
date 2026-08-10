# @cosyte/cli: Project Guide for Claude

> **The narrative lives in [`documentation/agent-notes.md`](documentation/agent-notes.md). Read it
> before you touch anything a rule below tells you not to touch.** This file is always-read by every
> worker that enters this repo, so the per-incident write-ups, the shipped-phase histories and the
> long rationales were relocated there **verbatim**; nothing was deleted.
>
> What stays here is the cursor, the rules, and **every** trap, each compressed to a one-line
> imperative with a link to the section that proves it. **"I did not read the reason" is not a licence
> to discount the rule.** Every one of these lines cost a defect to learn.

> **The pair is gated** (`pnpm check:agent-notes`, enforced by `test/scripts/agent-notes.test.ts`, so
> it rides `ci / verify` and `prepublishOnly`): the narrative file must be tracked, every section must
> have a body (a container's is its subsections), and every pointer at it **in a file it opened** must
> resolve. **A NUL-bearing file is skipped: a disclosed miss, not a pass**; the tell is the skipped
> count. It matches the **QUALIFIED spelling only**; a **bare** backticked anchor in either half
> **REFUSES the run**: the measurement that scoped the matcher has gone stale. **Never port a
> sibling's matcher without re-counting both spellings here.** It asserts **this repo's promise, not a
> universal**, and **refuses (exit 2) rather than reporting green over a corpus it never opened**.
> **Never clear a red by deleting the pointer or the heading.** Why, and every miss:
> [agent-notes § The gate](documentation/agent-notes.md#the-two-file-contract-gate).

## Project

**`@cosyte/cli`**: the **cosyte CLI**: a **`bin` package** (the `cosyte` command), not a parser and
not a library. Published under the Cosyte brand, open-source (MIT). It is the **developer-tooling
tier**: a thin, honest, PHI-safe skin over the `@cosyte/*` parsers (and, in later phases,
`@cosyte/transform` + `@cosyte/terminology`). It **wraps**; it re-implements no wire-format parsing.

**North star:** `cat adt.hl7 | cosyte parse -` → typed JSON on stdout, the right exit code, and **not
one byte of PHI on stderr**, without writing code, without reading the spec, and without ever being
handed a confident wrong value or a silent success on a malformed message. The CLI borrows the
parsers' _disciplines_ (fail-safe on ambiguity, stable diagnostics, value-free PHI posture) without
being a byte parser. Full contract: the meta-repo `operations/roadmaps/cli.md`.

## Shape (the single most important fact)

This is an **executable**, not an import surface. `package.json#bin` maps `cosyte` →
`dist/bin/cosyte.mjs` (a `#!/usr/bin/env node` shebang entry). `src/` is a **command tree**: a thin
`bin` over a testable `core` (`core/run.ts` dispatch + `commands/*`), argument-parsed with Node's
built-in **`util.parseArgs`** + a hand-rolled dispatcher: **zero third-party CLI framework**. The `.`
subpath still exports a small programmatic `core` API (`detectFormat`, `EXIT`, `CLI_CODES`, `run`).

## Status

**Feature-complete.** The roadmap's final phase shipped; no new runtime command surface is planned.
The CLI wraps **all eight** cosyte formats through one lazy
per-format adapter registry (`src/core/parsers.ts`), exposes the same `core` through a terminal bin
(`cosyte`), an MCP server bin (`cosyte-mcp`) and the `.` / `./mcp` subpath exports, and states support
**per (format, operation)** via `OP_SUPPORT`: an unsupported cell is a value-free
`CLI_FORMAT_UNSUPPORTED`, never a fake. Exit-code contract: `0/1/2/65/66/69/70`. Per-phase histories:
[agent-notes § Shipped phases](documentation/agent-notes.md#shipped-phases).

**Deferred, honestly and never faked:** `dicom` `parse`/`fmt`, `ccda` `parse`, `mllp`
`fmt`/`validate`; `redact`/`deid` and `map-codes` MCP tools and remote/HTTP MCP; `redact`'s real
de-identification (gated stub + seam landed, waiting on `@cosyte/deid`, and **never a built-in
partial scrub**, which would risk a false-safety impression); `validate --profile` (reserved,
`CLI_NOT_IMPLEMENTED`/`69`). Detail:
[agent-notes § Deferred](documentation/agent-notes.md#deferred).

**ADRs:** `documentation/decisions/0021` (a `bin` hard-deps first-party siblings), `0022` (two bins,
one core), `0023` (wire `transform` + `terminology`; 2 → 4 dep cap), `0024` (MCP SDK isolated and
runtime-optional), `0025` (breadth parsers optional, outside the cap).
Summaries: [agent-notes § ADRs](documentation/agent-notes.md#adrs).

### The published package, and the FHIR hole (live, unresolved)

Why: [agent-notes § The vendor to npm dependency swap](documentation/agent-notes.md#the-vendor-to-npm-dependency-swap).

- **`@cosyte/fhir` is deliberately NOT in the manifest, in any form, and you must not add it.**
  `fhir` cannot publish at all (`FHIR-NPM-NAME`), and, measured here, declaring it alongside
  `@cosyte/transform` fails the whole install with `ERESOLVE`. **This is not a manifest bug to fix.**
- **Do not explain that `ERESOLVE` with a missing `peerDependenciesMeta.optional` flag.** Measured
  across the suite: that flag does not decide the outcome, and the mechanism is unexplained.
- **An installed copy therefore has NO FHIR support**, stated on every consumer surface rather than
  discovered: FHIR `parse`/`inspect`/`fmt`/`validate` and `convert` degrade to a value-free
  `CLI_PARSER_UNAVAILABLE` (`69`). `@cosyte/fhir` survives only as a **`devDependency`** on the
  vendored tarball, so this repo's own FHIR tests run.
- **Never quote the published version in this file.** Derive it: `npm view @cosyte/cli version`. A
  `0.0.3` pin was still being quoted elsewhere on 2026-08-04 after `0.0.4` had shipped, which is the
  exact defect ADR 0023 deleted the umbrella's version list over.
- **`0.0.1` and `0.0.2` are permanently broken on npm** (`file:vendor/*.tgz` specifiers, `ENOENT` on
  every install route) and both printed `VERSION = "0.0.0"`. Never move a published version backwards.
- **Fix the ASSERTION, not just the value.** The installation doc asserted `typeof VERSION`, true of
  every wrong value, and green-lit both bad releases. `scripts/sync-version.mjs` rewrites two targets
  and `test/sanity.test.ts` pins the `: string` declaration shape the script keys on.
- **Never write "any new call site" of the `absent-sibling` static guard: a refuter falsified that
  wording.** It reds only on a NEW **single-line, unwrapped** dynamic `import()`; it misses a
  multi-line import and a static one. `src/core/parsers.ts` holds an `import type` of `@cosyte/fhir`:
  **dropping the word `type` loads it eagerly and breaks every command in an installed copy, unseen.**
- **The two unavailable-parser diagnostics deliberately do NOT say "install it"** (and so do not go
  through `loadOptional()`'s stock wording): `npm install @cosyte/transform` fails `E404` on its own
  `fhir` peer, so that advice sends a user at a command that cannot succeed.
- **Verify a release by INSTALLING the packed tarball outside the repo, never by `--dry-run`.** It is
  checklist step 6 in `RELEASING.md`; keep it.
- **`npx @cosyte/cli …` fails** with `could not determine executable to run` (the bins are `cosyte`
  and `cosyte-mcp`). Use `npx --package @cosyte/cli cosyte …`. **A `cli` bin alias would fix it and is
  deliberately not added** (`npm install -g` would claim the name `cli` on the user's `PATH`): founder
  call, not an oversight.
- **The public-flip stop is not yours to cross, and both original stops are already behind this
  package.** It is **public** (`gh repo view cosyte/cli --json visibility`) and it has published, so
  the "founder-gated tail (NOT crossed)" note is superseded, not pending. **Flipping a repo's
  visibility is never waived**, so an agent still does not touch it; the `npm publish` half is
  covered by a standing founder directive. The vendored `file:` deps that gated a publish are already
  real npm ranges, except `@cosyte/fhir`, a `file:` **devDependency** no consumer install resolves.

### Hard runtime deps

- **Two hard `dependencies`: `@cosyte/hl7` (`^0.0.7`) + `@cosyte/terminology` (`^0.0.9`)**, real
  registry ranges, lazy-loaded per command. That is **2** against the umbrella `verify-policy.json`
  cap of **4**: under it, not at it. On the `0.0.x` ladder those ranges are effectively exact pins.
- **Do not "restore" `@cosyte/transform` to `dependencies` or declare `@cosyte/fhir`** without reading
  the swap note first. Everything else (`transform`, the six breadth parsers, the MCP SDK) is an
  `optionalDependency` outside the cap. Third-party CLI-core runtime deps: **zero**.
- `vendor/` survives only to supply `@cosyte/fhir` as a devDependency; the other nine tarballs are
  refreshed by `pnpm vendor:refresh` but wired to nothing. Removing them is a separate cleanup.
  Detail: [agent-notes § Hard runtime deps](documentation/agent-notes.md#hard-runtime-deps).

### The docs sidebar is bound by an IA spine nothing here checks

Why: [agent-notes § The docs sidebar and the IA spine](documentation/agent-notes.md#the-docs-sidebar-and-the-ia-spine).

- **An off-spine top-level label in `docs-content/sidebars.json` stops the WHOLE docs site
  deploying**, and this package once held it down for four days. Canonical top-level order (verbatim
  in the linked section, starting `Overview` as the `intro` **doc reference**, not a category).
  Categories are **optional**; the rule is that whatever you have is labelled and ordered
  canonically, so `{"docs":["intro"]}` is compliant.
- **🔴 NEVER AUTHOR AN `API Reference` CATEGORY.** The docs site injects it. A hand-authored one is a
  distinct, **harder** error than the off-spine label it would be replacing.
- **Never claim where that injected category lands.** A refuter falsified "just before
  Troubleshooting" here: two code paths disagree and the served one **appends**. It is a `docs`
  defect, cosmetic, affecting every released package. State only that this package neither authors nor
  positions it. **"Verified against the linter" is not evidence about placement**, because the linter
  refuses `versioned_sidebars/`.
- **Verify a sidebar edit against the site's own linter**, `docs/scripts/check-ia-conformance.ts`
  (self-executes on import, so `NODE_ENV=test` is required to call `lintSidebar`). **Nothing in
  `verify.sh` or this repo's CI can catch this**: `pack:docs` checks only that the files EXIST.
  **Use the previously shipped sidebar as a negative control**: if it reports no errors, the probe is
  wrong, not the sidebar.
- Keep `limitations` under `Troubleshooting` and `mcp`/`reference-commands` under `Guides`. **Do not
  copy `synth`**, which is the lone counter-example.
- **Only a NEW RELEASE clears the gate.** It reads the shipped artifact and releases are immutable, so
  every published version keeps its sidebar forever. Archived versions are reported at `info` and
  never gate, so **do not try to fix history.**

### The pre-commit PHI scanner

Why: [agent-notes § The pre-commit PHI gate and git mv](documentation/agent-notes.md#the-pre-commit-phi-gate-and-git-mv).

- **Never re-introduce rename detection into `scripts/phi-scan.ts --staged`.** Detection is on by
  default, a `git mv` into a fixture directory stages as a two-path `R100`/`C100` that the status
  filter drops, and both a regular file and a link passed the hook at **exit 0**. `--no-renames` is
  the whole remedy and is a strict **SUPERSET**, verified under `diff.renames` = `true` / `copies` /
  `false` / `1` and `diff.renameLimit=1` (no `R` or `C` survives any of them, which is what makes the
  `--raw -z` stride structural rather than conditional; `copies` is not hypothetical here and emits a
  live `C100`).
- **Do NOT re-derive this as "needs the two-path record shape, a scope decision".** That framing was
  ported from a sibling, is false, and has now been measured twice (`dicom`, then here).
- **Keep the `--raw -z` two-field stride, the `T` status, the destination-mode read, and the
  **exit 2** refusal of a non-blob mode.** `git show :<path>` answers a link with its **target path as
  though it were content**, so a mode-blind scan reads path text and never the target's bytes.
- **Each scan root's own path is in scope**, because git records no index entry for a directory.
- **Keep the two routes' refusals identical.** The all-mode walk got the same link refusal as
  `--staged`, because a scanner whose pre-commit half refuses a link while its CI half silently drops
  one cannot be reasoned about. **The `.md` exemption deliberately does not reach a link.**
- **A refusal NEVER prints the link target** (a target path is itself a PHI surface); the entry's own
  path is printed deliberately and every offender is named. **That guarantee is about a REFUSAL and
  does not extend to a hit.**
- **Exit `1` means "hits found", so a broken invocation must never exit `1`.** An unreadable
  allow-list, **override log** or scan root is **exit 2**; all three threw past every handler and
  read as a finding.
- **A declared scan root the all-mode walk never OBSERVED refuses at exit 2**, reconciled per root
  against `git ls-files`: it opened nothing, or git tracks an in-scope file it did not open. **Both
  conditions ship, neither subsumes the other** (an emptied root opens nothing, a swapped one opens
  plenty). **The dangling link is why a kind check cannot stand in**: `existsSync` follows it and
  answers false, so `walk()` returns before `readdirSync` and nothing is ever inspected. **Never add
  a denominator instead** (a count counts the roots that DID exist). **Exit 2 is derived from this
  contract, never ported from a sibling.** `git ls-files` failing REFUSES, never the empty set.
  **One-directional**: an untracked file the walk found is not a refusal. **All-mode only**;
  widening `--staged` changes what a COMMIT is blocked on.
- **Never state the refusal rule unqualified.** It is scoped to an **enumerated** entry; a refuter
  falsified "neither route follows such an entry" using this very file.
- **Three escapes remain, NARROWED not closed** (a scan root that is itself a live link is still
  followed, and **never say it survives "only where git tracks nothing"**: the reconciliation
  compares PATH SETS, so a target mirroring the tracked NAMES passes at exit 0, decoy bytes and all,
  measured; an **ancestor** of a scan root is in neither route's scope; paths mode follows a named
  link). **Do not "fix" them inside an unrelated slice**: what is left needs a decision about how far
  ABOVE a root to look.
- **Walk roots are `src`, `test`, `scripts`, re-derived; `test` REPLACED `test/__fixtures__` and roots
  must stay DISJOINT** (a nested one double-reports). `scripts` is in, so **an example SSN in a
  comment there reds the gate**. `test/scripts/phi-scan.test.ts` is the **ONE** exempt path: at the
  **scan** (still read + reconciled), **all-mode only** (paths mode must still report it or a
  detection is DELETED), **per path**. `EMAILDOMAIN` is global; never allow-list to green a file.
- **`scripts/` IS SWEPT: name a PHI shape, never SPELL a literal** (a draft banner red the gate on
  itself). The SSN check reads **no** allow-list, so an `ID` in dashed shape reds
  `phi-allow-list.txt`: respell `MRN-`.
- **🛑 THE WIDENING BOUGHT THE SSN/EMAIL FLOOR OVER 38 MORE FILES AND NOTHING ELSE** (an
  enumeration gap, not exposure). **The recogniser was NOT widened, on measurement**, and **a tripwire
  reds if that changes**: widen **in addition to** the raw pass, never instead of it.
- **Other residuals:** `D` and `U` are unenumerated (`U` reaches no commit: `git commit` refuses an
  unmerged index, exit 128); the two routes now differ widely.
- **Give every `test/scripts/*.test.ts` case an explicit timeout.** Each spawns `tsx` cold: **3.7s
  under contention**, against a shared 10s default.
- **Assert the premise, not only the remedy.** Two vacuity traps already sprang in this suite: a
  fixture whose `git merge` refused on an identity-less runner so every later assertion held over an
  empty result, and a loop that asserted only the detection-OFF side.

### The em-dash brand gate

Why: [agent-notes § The em-dash brand gate](documentation/agent-notes.md#the-em-dash-brand-gate).

- **The `U+2014` ban is absolute** (founder directive; `knowledgebase/06-brand/voice-and-tone.md`).
  `scripts/check-no-emdash.sh` + `.github/workflows/no-emdash.yml` gate **both** halves: every tracked
  file, **and** the PR title, body and commit messages, on the `edited` trigger.
- **▶ READ THIS BEFORE PORTING THE GATE OR SWEEPING ANY REPO: AN EM DASH IS SOMETIMES A VALUE, NOT
  PUNCTUATION.** `docs-content/limitations.md` used a bare `U+2014` as a support-matrix **cell value
  meaning "not supported"**; the sweep rewrote it as punctuation and turned **"support absent" into
  "support unstated"**, on the one page whose whole job is honest capability disclosure.
  **Grep for a cell or list-marker em dash first**
  (`\|\s*\x{2014}\s*[\|\(]`) and convert each to a **WORD**, by hand, before any bulk transform.
- **CUT, do not rewrite.** Softening a stated limit into an implied capability while tidying a
  sentence is a worse defect than the thing being removed. Revert a rewrite verbatim rather than
  repair it. (Same rule as the public-surface gate below.)
- **Nothing in this repo's CI could have caught that**: `test/docs-content.test.ts` executes only
  ` ```ts runnable ` blocks, and prettier's glob does **not** cover `docs-content/`.
- **Never drop the NUL exclusion and never add `grep -I` instead.** A vendored tarball already
  contains the bytes `E2 80 94` inside a DEFLATE stream, so a text-only port reds today with **no
  remediation**, and a gate whose red has no fix is a gate someone disables. `grep -I` skips a
  qualifying text file in **total silence** and prints OK.
- **The disclosed cost is a miss, not a pass, and is not hypothetical here:** a tracked **text** file
  holding a NUL byte is silently exempt. **The tell is the excluded count on the OK line: it reads 11
  today.** If it moves, revisit the partition, **never the ban**.
- **`test/__fixtures__/adt-a01.hl7` and `minimal.astm` stay in scope**: git calls them binary on its
  lone-CR branch (an HL7 v2 / ASTM terminator is `CR` with no `LF`) but they hold zero NULs, proved by
  seeding each with a live em dash. A red on those echoes a whole synthetic message into a public CI
  log: deliberate and acceptable.
- **Fix the script's shared known limits in the shared copies, not here.** A divergent copy is worse
  than a shared known limit; the script is composed from three siblings' fixes.
- **Re-derive every number before writing it down and never quote one from a sibling's copy.** A draft
  of these notes stated a wrong count _inside the sentence arguing for measurement rigor_.
- **What lands on `main` here differs from `mllp`: all three merge methods are enabled**, so the
  **branch commit messages** are the one text that lands under every method and **the PR body lands
  under none** (scanned anyway, deliberate over-strictness). **Do not repeat `ncpdp`'s copy** claiming
  the title and body are what lands.
- **Not retroactive:** commit subjects already on `main` may carry `U+2014`. History is not rewritten.

## Tech Stack (the shared `@cosyte/*` standard)

This repo inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files. The source of truth is the meta-repo's `documentation/conventions.md`. This is
a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`. TypeScript 5.9.x, exact-pinned.
- **Build:** dual ESM + CJS + `.d.ts` via `tsup` (`@cosyte/tsup-config`); `attw` is a publish gate
  (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`). The `attw` script is
  **`node scripts/attw.mjs --profile node16`, not the bare CLI**: see the guardrail below.
- **Node:** **>= 22** (CI matrix 22 + 24).
- **Package manager:** `pnpm@10`.
- **Lint/format:** **ESLint 10** + unified `typescript-eslint` (type-checked) via
  `@cosyte/eslint-config`; Prettier via `@cosyte/prettier-config`. Lint at `--max-warnings=0`.
- **Testing:** **Vitest 4** + v8 coverage (`@cosyte/vitest-config`), per-directory >= 90 gates on
  `src/core` + `src/commands`. Command-contract snapshots, an autodetection corpus + a fast-check
  property, the `parse == library-parse` equivalence, and a **PHI-leak matrix** (sentinel values
  never on stderr, across `--json`/`--quiet`/verbose). Plus an **argv+stdin+MCP fuzz** gate
  (`test:fuzz`, nightly-scaled by `CLI_FUZZ_RUNS`), an **exit-code golden matrix**, and a built-package
  **`smoke`** (dual ESM/CJS `.` + `./mcp` subpaths and both bins under `node`). The thin `bin/` process
  adapter is coverage-excluded at source (a `/* v8 ignore */` block over the argv/stdin/exit glue).
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows. **The checks BIND**; see
  "Branch protection" below.
- **Runtime deps:** **`@cosyte/hl7` + `@cosyte/terminology` only** as hard deps (ADR 0021 + 0023),
  against a cap of **4**. `@cosyte/transform`, the six breadth parsers and the MCP
  `@modelcontextprotocol/sdk` are `optionalDependencies`, lazy-loaded and **outside** that cap (ADR
  0024 + 0025); **`@cosyte/fhir` is undeclared**, see Status. **Zero third-party** in the CLI core
  (`util.parseArgs`, no framework).
- **License:** MIT.

## Branch protection (and the limits of this claim)

Full ruleset, the required-context table and the per-check reasoning:
[agent-notes § Branch protection](documentation/agent-notes.md#branch-protection-and-the-limits-of-this-claim).

- `main` is protected by the repository ruleset **`ci-required-checks`** (id `19907924`); before it
  existed every check here was advisory, on the branch that publishes. Every required context is
  pinned to **`integration_id: 15368`** so a same-named status from another actor cannot satisfy it.
  **Never quote the context count without re-deriving it**
  (`gh api repos/cosyte/cli/rulesets/19907924`): it moves when the called workflow does.
- **Read a required context off a REAL check run, never off a workflow's `name:` field.** Requiring a
  context nothing emits does not fail a PR: it leaves it **pending and unmergeable forever**.
- **▶ A `ci / *` CONTEXT CAN APPEAR HERE WITH NO COMMIT IN THIS REPO, AND IT ARRIVES NOT REQUIRED**
  (`ci.yml` calls the reusable workflow unpinned), so an upstream job shows **a red X that does not
  block a merge**. **Census `ci / *` against a real check run whenever `.github` moves**, then require
  it or write down why not.
- **`no-internal-refs` and `no-emdash` are bare JOB IDS**, not `<workflow> / <job>`. **Renaming the job
  silently detaches the required check**: rename the job and the ruleset together, or neither.
- **A required job gates all of its steps**, so splitting a step out of `ci / verify` into its own job
  silently un-requires it. **Never add a `paths:` filter** to `ci.yml`, `codeql.yml`,
  `no-internal-refs.yml` or `no-emdash.yml`: none carries one, which is what stops a PR skipping a
  required check.
- **Confirm a ruleset write with the `PUT` itself, never a `GET`**: an Organization-sourced ruleset
  answers `200` to a `GET` and `404` to an identical-payload `PUT`.
- **Never require `scorecard / analysis`, `fuzz`, or `release / release`**: none runs on
  `pull_request`, so each strands every PR pending forever. **Never require the Advanced Security
  `CodeQL` check** (app id `57789`): it reports **alert state**, not whether the analysis ran.
- **▶ Scope of the claim: a ruleset makes a red check BLOCK a merge. It does not make the check
  correct, and nothing inside this repository can observe its own ruleset.** Verify the only way that
  works: `gh api repos/cosyte/cli/rulesets`. Recorded **unproven** rather than fine: no fork PR has
  ever run here, so neither the first-time-contributor gate nor whether `codeql / analyze` can report
  on a fork token has been observed.

## Engineering Guardrails

- No `any`. No unjustified `as` casts. Use `unknown` and narrow.
- JSDoc (with `@example`) on every public export: the JSDoc lint rule is an **error** on public
  exports, so this is enforced, not optional.
- No `console.*` in `core`/`commands`. Return a `RunResult` (`{ stdout, stderr, exit }`); only the
  thin `bin` writes to process streams.
- Short, testable functions; keep the `bin` trivial and push all logic into the covered `core`.
- **Fail-safe routing:** an unrecognised/ambiguous format is a typed error + non-zero exit, **never a
  guessed parser**. The CLI adds no tolerance of its own: it surfaces the wrapped parser's warnings.
- **The exit-code contract** (`core/exit-codes.ts`) is a designed, documented surface CI depends on:
  never exit `0` on input the CLI could not handle.
- **Value-free diagnostics (load-bearing):** every `stderr`/error/log line is code + position only,
  **never** an input value. `stdout` is the data channel (the parsed model, the user's request). A
  caught exception's message is discarded, never echoed. The CLI writes no temp file, logs to no file.
- Coverage: per-directory >= 90% (lines/branches/functions/statements), enforced by
  `pnpm test:coverage`.

### The `attw` gate

Why, with every measurement: [agent-notes § The attw wrapper](documentation/agent-notes.md#the-attw-wrapper).

- **▶ `attw` SAYS "does not contain types" AND EXITS 0, so `pnpm attw` is `node scripts/attw.mjs
--profile node16` and NEVER the bare CLI.** `getExitCode.js` opens with `if (!analysis.types)
return 0`, so no `--profile`, `--ignore-rules` or config setting reaches that early return, and a
  broken publish is reported as a pass that `verify.sh` propagates.
- **The race only supplies the condition; the answer is NOT a lock, a lease or a build queue.**
  `tsup` writes JS in one pass and declarations in a later one, so every build has the window.
  **Do not quote the measured interval as a constant** (it moves with load); the ordering does not.
- **Keep the preflight walking `bin` as well as `exports`**: `attw` never reads `bin`, and with
  `dist/bin/cosyte.mjs` deleted it printed every subpath green over a tarball with no `cosyte` in it.
- **`--profile node16` is load-bearing and is forwarded, never reinterpreted.** Without it
  `@cosyte/cli/mcp` fails `node10` resolution.
- **Only a TOTAL loss of declarations is the false green; a PARTIAL one `attw` catches itself**, so
  the preflight must report both outcomes and **must not assert the exit 0**. Six packed-but-undeclared
  declarations decide which silence you get, and the obvious two-line version of this is false: a
  refuter falsified a first draft of it in one run. **Re-measure before you shorten it.**
- **The post-check reads a string, so what would hide that string is refused**: `--quiet`, `-q`,
  `--format`, `-f`, `--config-path`, and a `.attw.json` setting `quiet` or `format`. **Say "exact argv
  token" of the ARGV refusal, never "wholesale"** (the stronger wording was live and was refuted); the
  `.attw.json` refusal **is** wholesale, and the two messages differ on purpose.
- **Two holes are disclosed and deliberately left open**: clustered short forms `-fjson` / `-Pf json`,
  and a declared path not starting with `.`. Left open on purpose; the reasoning is in the linked
  section.
- `test/scripts/attw-gate.test.ts` pins both nets, the upstream exit 0 itself, a negative control, and
  that a real `attw` failure still fails with `attw`'s own status.

## Standing disciplines (every change)

Mirrors the three disciplines in the meta-repo's `documentation/conventions.md`. They bind here too:

1. **Documentation follows code**: a change to the public surface/stack/status isn't done until the
   docs are: this repo's docs content (`README.md`, `docs-content/`), the meta-repo
   `documentation/repos/cli.md` (bump its "last verified" date), and the `ecosystem-map.md`
   status table.
2. **Version + changelog**: a Changeset (`patch` on the `0.0.x` ladder) + a `CHANGELOG.md`
   `[Unreleased]` entry per meaningful change. Renaming a stable `CLI_*` diagnostic code or an exit
   code is a **breaking change** (scripts branch on them).
3. **Crew + knowledgebase loop**, if the command surface, `CLI_*` codes, or exit-code map change,
   flag/update the matching `crew` healthcare skill + the KB product doc.
4. **No internal project bookkeeping on a public surface** (founder directive, 2026-07-27). What a
   consumer reads (`README.md`, `docs-content/`, the npm `description`, a release body, **the JSDoc
   their editor renders on hover, and the diagnostic their terminal prints**) says what the software
   does and what changed. Item identifiers (`CLI-6`), phase and wave language, ADR numbers, roadmap
   citations (`cli roadmap §7`), meta-repo paths and "how this got built" commentary belong in the
   changeset,
   `CHANGELOG.md`, the commit, the PR and the roadmap. It is a **translation** at the boundary, not a
   deletion. Gated by `pnpm check:no-internal-refs`.

   Why, in full: [agent-notes § No internal project bookkeeping on a public
   surface](documentation/agent-notes.md#no-internal-project-bookkeeping-on-a-public-surface).
   - **Doc comments and string literals ARE gated.** A `/** */` comment compiles into `dist/*.d.ts`
     and renders on a consumer's hover; a string literal reaches their terminal (this package printed
     a work item inside `CLI_NOT_IMPLEMENTED` and an ADR number inside `CLI_PARSER_UNAVAILABLE`
     before that pass existed). **Line comments and plain block comments are NOT gated and
     identifiers are welcome in them** (those two shapes are `//` and `/* */`), because the
     convention says source comments are a place identifiers belong.
   - **Do not justify that boundary from what reaches `dist/`.** Two drafts of a sibling's copy tried
     and a refuter proved both false; two drafts of ours made the same mistake again. **The boundary
     rests on the convention.** The line is not what a consumer _receives_; it is what a consumer is
     **shown**. Two sentences that read well and are **false**: "everything in `src/` ships", and
     "the bundles carry `//` comments verbatim".
   - **Never re-key the gate on the `WORD-N` shape.** This repo is where that trap is widest, because
     the CLI reaches for all eight formats' vocabularies at once, and every designation, segment,
     element and code-system reference among them (listed in the linked section) is material a
     consumer came here for. The negative self-tests exist to make that attempt red.
   - **Repair the head**: a sentence with an identifier stripped off the front reads worse than the
     text it replaced.
   - **CUT, do not rewrite.** This package's posture is honesty about what it _cannot_ do (gated
     stubs at `69`, value-free stderr, `OP_SUPPORT`). Softening a stated limit into an implied
     capability while tidying is worse than the bookkeeping removed. **Delete the claim rather than
     replace it, and revert a rewrite verbatim.**
   - **The gate catches identifiers, not English sentences about our process**, and it reads `src/`,
     never `dist/`. A new programme prefix has to be added by hand. **The reviewer still owns half the
     rule.**
