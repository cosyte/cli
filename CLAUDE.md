# @cosyte/cli: Project Guide for Claude

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
- **Hard runtime deps (ADR 0021 + 0023):** `@cosyte/hl7` + `@cosyte/fhir` (parsers) and
  `@cosyte/transform` + `@cosyte/terminology` (the higher-layer libs `convert`/`map-codes` wrap) are
  **real `dependencies`** (an `npx` bin can't peer-depend), vendored as `pnpm pack` tarballs in
  `vendor/` until PUB-FLIP: refresh with `pnpm vendor:refresh`. Pinned shas: hl7 `46d50eb`, fhir
  `7a099b2`, transform `e6c4531`, terminology `e5ed368`. **Lazy-loaded per command.** Umbrella
  `verify-policy.json` caps `cli` runtime deps at **4** (raised 2 → 4 for CLI-4, ADR 0023).
  Third-party CLI-core runtime deps: **zero**. The MCP server's **`@modelcontextprotocol/sdk`** is the
  CLI's only third-party runtime dep: declared in **`optionalDependencies`** (not `dependencies`),
  isolated behind `./mcp`, so it is outside the hard-closure cap (ADR 0024).
- **Deferred:** the roadmap's build phases are complete (P7 release hardening shipped). Per-(format, op)
  cells remain deferred honestly (never faked): `dicom`
  `parse`/`fmt` (binary model), `ccda` `parse` (XML is the canonical `fmt` surface), `mllp` `fmt`/`validate`.
  The MCP tool set covers `parse`/`validate`/`inspect`/`convert`; `redact`/`map-codes` tools and
  remote/HTTP MCP are later. `redact`'s real de-identification is deferred to when `@cosyte/deid` ships
  (P2 landed the gated stub + seam). `validate --profile` is reserved but gated (`CLI_NOT_IMPLEMENTED`/`69`)
  until the CLI can load a profile, no profiles are bundled.
- **ADRs:** `documentation/decisions/0021` (dependency-tier: a `bin` hard-deps first-party siblings),
  `0022` (one-repo-two-bins: CLI + MCP over one core; web playground out of scope), `0023` (wire
  `transform` + `terminology` for `convert`/`map-codes`; the deliberate 2 → 4 dep-cap raise), `0024`
  (the Phase-5 MCP server; the SDK as an isolated, runtime-optional dependency: hard-dep cap stays 4),
  and `0025` (the Phase-6 breadth parsers as runtime-optional lazy deps outside the cap; the cap stays 4).

## Tech Stack (the shared `@cosyte/*` standard)

This repo inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files. The source of truth is the meta-repo's `documentation/conventions.md`. This is
a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`. TypeScript 5.9.x, exact-pinned.
- **Build:** dual ESM + CJS + `.d.ts` via `tsup` (`@cosyte/tsup-config`); `attw` is a publish gate
  (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`).
- **Node:** **>= 22** (CI matrix 22 + 24).
- **Package manager:** `pnpm@10`.
- **Lint/format:** **ESLint 10** + unified `typescript-eslint` (type-checked) via
  `@cosyte/eslint-config`; Prettier via `@cosyte/prettier-config`. Lint at `--max-warnings=0`.
- **Testing:** **Vitest 4** + v8 coverage (`@cosyte/vitest-config`), per-directory >= 90 gates on
  `src/core` + `src/commands`. Command-contract snapshots, an autodetection corpus + a fast-check
  property, the `parse == library-parse` equivalence, and a **PHI-leak matrix** (sentinel values
  never on stderr, across `--json`/`--quiet`/verbose). CLI-7 adds an **argv+stdin+MCP fuzz** gate
  (`test:fuzz`, nightly-scaled by `CLI_FUZZ_RUNS`), an **exit-code golden matrix**, and a built-package
  **`smoke`** (dual ESM/CJS `.` + `./mcp` subpaths and both bins under `node`). The thin `bin/` process
  adapter is coverage-excluded at source (a `/* v8 ignore */` block over the argv/stdin/exit glue).
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows. **The checks BIND**; see
  "Branch protection" below.
- **Runtime deps:** `@cosyte/hl7` + `@cosyte/fhir` + `@cosyte/transform` + `@cosyte/terminology`
  (first-party, hard, vendored: ADR 0021 + 0023), capped at **4**. The six CLI-6 breadth parsers
  (`dicom`/`x12`/`ccda`/`ncpdp`/`astm`/`mllp`) are vendored **`optionalDependencies`**, lazy-loaded per
  format and **outside** that cap (ADR 0025); the MCP `@modelcontextprotocol/sdk` is likewise optional
  (ADR 0024). **Zero third-party** in the CLI core (`util.parseArgs`, no framework).
- **License:** MIT.

## Branch protection (and the limits of this claim)

`main` is protected by the repository ruleset **`ci-required-checks`** (id `19907924`,
`source_type: Repository`, `enforcement: active`, conditions `~DEFAULT_BRANCH`). Rules: `deletion`,
`non_fast_forward`, `required_status_checks`. Before it existed, every check this repo ran was
advisory: `ci`, `codeql`, `scorecard` and `fuzz` could all be red and the merge still landed on
`main`, and `main` is the branch that publishes.

Required contexts, each pinned to **`integration_id: 15368`** (the `github-actions` app) so that a
commit status of the same name posted by any other actor with write access cannot satisfy it:

| context                                    |
| ------------------------------------------ |
| `ci / verify (22, ubuntu-latest)`          |
| `ci / verify (24, ubuntu-latest)`          |
| `ci / actionlint`                          |
| `codeql / analyze (javascript-typescript)` |
| `no-internal-refs`                         |
| `no-emdash`                                |

These are the names GitHub actually reports, read off real check runs, **not** off a workflow's
`name:` field. Requiring a context nothing emits does not fail a PR; it leaves it pending and
unmergeable forever. None of `ci.yml`, `codeql.yml`, `no-internal-refs.yml` or `no-emdash.yml`
carries a `paths:` filter, so no PR can skip one.

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
   changeset, `CHANGELOG.md`, the commit, the PR and the roadmap. It is a **translation** at the
   boundary, not a deletion. Gated by `pnpm check:no-internal-refs`.

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
