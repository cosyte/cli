# @cosyte/cli: Project Guide for Claude

> **The narrative lives in [`documentation/agent-notes.md`](documentation/agent-notes.md). Read it before
> you touch anything a rule below tells you not to touch.** This file is always-read, so the write-ups,
> the shipped-phase histories and the long rationales were relocated there **verbatim**; nothing was
> deleted, and every rule below is also stated at its uncompressed length in
> [agent-notes § The rules as they stood](documentation/agent-notes.md#the-rules-as-they-stood-before-the-trim).
> What stays here is the cursor, the rules, and **every** trap, each compressed to a one-line imperative
> with a link to the section that proves it. **"I did not read the reason" is not a licence to discount
> the rule.** Every one of these lines cost a defect to learn. **A heading below that carries only a
> pointer is not a downgrade**: those rules stand in full, under the same headings, in
> [`documentation/repo-gates.md`](documentation/repo-gates.md) and
> [`documentation/packaging.md`](documentation/packaging.md).

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
  from the installed package's types, never from the subpath list.** **The default policy is a KEYED
  transform**, so the CLI keys each invocation with an **ephemeral random key** and **discloses that
  surrogates are not stable across runs**; **never remove that disclosure**, and **never substitute an
  unkeyed fallback**.
- **`redact` deliberately does NOT honour `--unsafe-show-values`.** Do not "restore consistency".
  **The stderr manifest is the LIBRARY's**, value-free by contract and rendered verbatim; the PHI-leak
  matrix carries a redact row per mode. **ADRs** `documentation/decisions/0021` through `0025` govern
  the dependency tiers and the two bins. Summaries:
  [agent-notes § ADRs](documentation/agent-notes.md#adrs).

### The published package, and the FHIR hole (live, unresolved)

Rules in full:
[packaging § The published package](documentation/packaging.md#the-published-package-and-the-fhir-hole-live-unresolved).

### Hard runtime deps

Rules in full: [packaging § Hard runtime deps](documentation/packaging.md#hard-runtime-deps).

### The docs sidebar is bound by an IA spine nothing here checks

Rules in full:
[repo-gates § The docs sidebar](documentation/repo-gates.md#the-docs-sidebar-is-bound-by-an-ia-spine-nothing-here-checks).

### The pre-commit PHI scanner

Rules in full:
[repo-gates § The pre-commit PHI scanner](documentation/repo-gates.md#the-pre-commit-phi-scanner).

### The em-dash brand gate

Rules in full: [repo-gates § The em-dash brand gate](documentation/repo-gates.md#the-em-dash-brand-gate).

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

Rules in full:
[repo-gates § Branch protection](documentation/repo-gates.md#branch-protection-and-the-limits-of-this-claim).

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

Rules in full: [repo-gates § The `attw` gate](documentation/repo-gates.md#the-attw-gate).

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
