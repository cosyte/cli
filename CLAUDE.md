# @cosyte/cli — Project Guide for Claude

## Project

**`@cosyte/cli`** — the **cosyte CLI**: a **`bin` package** (the `cosyte` command), not a parser and
not a library. Published under the Cosyte brand, open-source (MIT). It is the **developer-tooling
tier** — a thin, honest, PHI-safe skin over the `@cosyte/*` parsers (and, in later phases,
`@cosyte/transform` + `@cosyte/terminology`). It **wraps**; it re-implements no wire-format parsing.

**North star:** `cat adt.hl7 | cosyte parse -` → typed JSON on stdout, the right exit code, and **not
one byte of PHI on stderr** — without writing code, without reading the spec, and without ever being
handed a confident wrong value or a silent success on a malformed message. The CLI borrows the
parsers' _disciplines_ (fail-safe on ambiguity, stable diagnostics, value-free PHI posture) without
being a byte parser. Full contract: the meta-repo `operations/roadmaps/cli.md`.

## Shape (the single most important fact)

This is an **executable**, not an import surface. `package.json#bin` maps `cosyte` →
`dist/bin/cosyte.mjs` (a `#!/usr/bin/env node` shebang entry). `src/` is a **command tree** — a thin
`bin` over a testable `core` (`core/run.ts` dispatch + `commands/*`), argument-parsed with Node's
built-in **`util.parseArgs`** + a hand-rolled dispatcher — **zero third-party CLI framework**. The `.`
subpath still exports a small programmatic `core` API (`detectFormat`, `EXIT`, `CLI_CODES`, `run`).

## Status

- **Phase 5 shipped** (`operations/roadmaps/cli.md` §Phase 5). Adds the **`cosyte-mcp` MCP server** — the
  **agent front door** and the _second adapter_ over the one shared `core` (ADR 0022). A **stdio** Model
  Context Protocol server on `@modelcontextprotocol/sdk`, reachable three ways: the new **`cosyte-mcp`**
  bin, the **`cosyte mcp`** subcommand, and the **`@cosyte/cli/mcp`** subpath export. It exposes four
  tools — **`parse`/`validate`/`inspect`/`convert`** — each a thin wrapper that calls the same command
  handler the terminal uses (with `--json`), so `cosyte parse` and the MCP `parse` tool agree by
  construction; the CLI re-implements nothing. Every tool runs **value-free** (no `--unsafe-show-values`
  door on the agent surface): a tool _result_ carries the requested data, a tool _error_ carries only the
  value-free diagnostic, and a parsed-but-invalid `validate` verdict is a **successful** call reporting
  the verdict — only a hard failure sets `isError`. The **SDK is isolated and runtime-optional** (ADR
  0024): it is the CLI's first and only third-party runtime dep, declared in **`optionalDependencies`**
  (pinned `1.29.0`), imported only in `src/mcp/server.ts`, and reachable solely via the `./mcp` boundary
  — a `cosyte parse` invocation never loads it (proven by `test/mcp-isolation.test.ts`), and the core
  works with the SDK absent. Because it is not in the hard runtime closure, the umbrella `verify-policy`
  runtime-dep cap on `cli` stays **4**. `redact`/`deid` and `map-codes` are deliberately not yet exposed
  as tools. New exports (on `./mcp`): `createMcpServer`, `startStdioServer`, `dispatchTool`, `TOOL_DEFS`.
- **Phase 4 shipped** (`operations/roadmaps/cli.md` §Phase 4). Adds the two **consumer-of-consumers**
  commands, each a thin wrapper that re-implements no library logic: **`convert <file|-> --to fhir`**
  (HL7 v2 → FHIR R4 via **`@cosyte/transform`** — parse with `hl7`, `toFhir`, serialize with `fhir`;
  the `Bundle` on stdout, value-free issues on stderr, an **error-severity issue drives exit `1`**, a
  non-HL7 source is `CLI_FORMAT_UNSUPPORTED`/`65`) and **`map-codes <conceptmap|-> --code … [--system
…]`** (ConceptMap `$translate` via **`@cosyte/terminology`**, BYO ConceptMap — a match → target
  coding(s) + exit `0`; unmapped → `TERM_TRANSLATE_UNMAPPED` + exit `1`; an unloadable map → the new
  **`CLI_MAP_INVALID`**/`65`). Both siblings are **hard, first-party, lazy-loaded** runtime deps
  (vendored tarballs; the umbrella dep cap was raised **2 → 4** — ADR 0023). New exports:
  `convertCommand`, `convertOutcome`, `mapCodesCommand`.
- **Phase 3 shipped** (`operations/roadmaps/cli.md` §Phase 3). Adds three commands over the two wired
  parsers: **`validate`** (parse + the wrapped parser's own validation surface, **verdict in the exit
  code** — `0` valid / `1` invalid / `65` unparseable; findings value-free; `--profile` gated to an
  honest `CLI_NOT_IMPLEMENTED`/`69`; verdict never invented — FHIR = `validateResource().valid`, HL7 =
  parseable), **`inspect`** (a value-free structural summary — message/resource type, segment/entry
  counts, warning/issue count), and **`fmt`** (canonical re-serialization via the library's serializer;
  stdout is the data channel; no partial emit on unparseable input). Adds **`EXIT.INVALID` (`1`)** — the
  exit-code contract is now `0/1/2/65/66/69/70`. All four commands share one input+format front door
  (`core/input.ts` `resolveInput`) and one value-free parser-failure boundary (`core/wrap.ts`), so the
  value-free posture + `--unsafe-show-values` chokepoint stay uniform (`parse` refactored onto them,
  behavior-preserving).
- **Phase 2 shipped** (`operations/roadmaps/cli.md` §Phase 2). Pre-alpha `0.0.x`, unpublished. On top
  of Phase 1's `cosyte parse` (HL7 v2 + FHIR R4, content autodetection, exit-code contract, value-free
  `CLI_*` diagnostics), Phase 2 hardens the PHI posture: the global opt-in **`--unsafe-show-values`**
  (the single door to a value on a secondary surface, funnelled through one chokepoint in
  `core/phi.ts`), a proven **never-a-PHI-temp-file** guarantee, and the **`redact`/`deid`** command as
  an honest, `@cosyte/deid`-gated `CLI_NOT_IMPLEMENTED` (exit `69`) — never a built-in partial scrub
  that would risk a false-safety impression. Exit-code contract is now `0/2/65/66/69/70`.
- **Phase 1 shipped** (§Phase 1). `cosyte parse <file|->` for **HL7 v2** + **FHIR R4**, **content
  format autodetection** (conservative, fail-safe — never a guessed parser), the documented
  **exit-code contract**, and the **value-free diagnostic** channel with stable `CLI_*` codes.
- **Hard runtime deps (ADR 0021 + 0023):** `@cosyte/hl7` + `@cosyte/fhir` (parsers) and
  `@cosyte/transform` + `@cosyte/terminology` (the higher-layer libs `convert`/`map-codes` wrap) are
  **real `dependencies`** (an `npx` bin can't peer-depend), vendored as `pnpm pack` tarballs in
  `vendor/` until PUB-FLIP — refresh with `pnpm vendor:refresh`. Pinned shas: hl7 `46d50eb`, fhir
  `7a099b2`, transform `e6c4531`, terminology `e5ed368`. **Lazy-loaded per command.** Umbrella
  `verify-policy.json` caps `cli` runtime deps at **4** (raised 2 → 4 for CLI-4, ADR 0023).
  Third-party CLI-core runtime deps: **zero**. The MCP server's **`@modelcontextprotocol/sdk`** is the
  CLI's only third-party runtime dep — declared in **`optionalDependencies`** (not `dependencies`),
  isolated behind `./mcp`, so it is outside the hard-closure cap (ADR 0024).
- **Deferred:** the other six parsers + streaming (P6), release hardening (P7). The MCP tool set covers
  `parse`/`validate`/`inspect`/`convert`; `redact`/`map-codes` tools and remote/HTTP MCP are later.
  `redact`'s real de-identification is deferred to when `@cosyte/deid` ships (P2 landed the gated stub +
  seam). `validate --profile` is reserved but gated (`CLI_NOT_IMPLEMENTED`/`69`) until the CLI can load
  a profile — no profiles are bundled.
- **ADRs:** `documentation/decisions/0021` (dependency-tier: a `bin` hard-deps first-party siblings),
  `0022` (one-repo-two-bins: CLI + MCP over one core; web playground out of scope), `0023` (wire
  `transform` + `terminology` for `convert`/`map-codes`; the deliberate 2 → 4 dep-cap raise), and `0024`
  (the Phase-5 MCP server; the SDK as an isolated, runtime-optional dependency — hard-dep cap stays 4).

## Tech Stack (the shared `@cosyte/*` standard)

This repo inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files. The source of truth is the meta-repo's `documentation/conventions.md` — this is
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
  never on stderr, across `--json`/`--quiet`/verbose). The thin `bin/` process adapter is
  coverage-excluded at source (a `/* v8 ignore */` block over the argv/stdin/exit glue).
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows.
- **Runtime deps:** `@cosyte/hl7` + `@cosyte/fhir` + `@cosyte/transform` + `@cosyte/terminology`
  (first-party, hard, vendored — ADR 0021 + 0023), capped at **4**. **Zero third-party** in the CLI
  core (`util.parseArgs`, no framework).
- **License:** MIT.

## Engineering Guardrails

- No `any`. No unjustified `as` casts. Use `unknown` and narrow.
- JSDoc (with `@example`) on every public export — the JSDoc lint rule is an **error** on public
  exports, so this is enforced, not optional.
- No `console.*` in `core`/`commands`. Return a `RunResult` (`{ stdout, stderr, exit }`); only the
  thin `bin` writes to process streams.
- Short, testable functions; keep the `bin` trivial and push all logic into the covered `core`.
- **Fail-safe routing:** an unrecognised/ambiguous format is a typed error + non-zero exit, **never a
  guessed parser**. The CLI adds no tolerance of its own — it surfaces the wrapped parser's warnings.
- **The exit-code contract** (`core/exit-codes.ts`) is a designed, documented surface CI depends on:
  never exit `0` on input the CLI could not handle.
- **Value-free diagnostics (load-bearing):** every `stderr`/error/log line is code + position only —
  **never** an input value. `stdout` is the data channel (the parsed model, the user's request). A
  caught exception's message is discarded, never echoed. The CLI writes no temp file, logs to no file.
- Coverage: per-directory >= 90% (lines/branches/functions/statements), enforced by
  `pnpm test:coverage`.

## Standing disciplines (every change)

Mirrors the three disciplines in the meta-repo's `documentation/conventions.md` — they bind here too:

1. **Documentation follows code** — a change to the public surface/stack/status isn't done until the
   docs are: this repo's docs content (`README.md`, `docs-content/`), the meta-repo
   `documentation/repos/cli.md` (bump its "last verified" date), and the `ecosystem-map.md`
   status table.
2. **Version + changelog** — a Changeset (`patch` on the `0.0.x` ladder) + a `CHANGELOG.md`
   `[Unreleased]` entry per meaningful change. Renaming a stable `CLI_*` diagnostic code or an exit
   code is a **breaking change** (scripts branch on them).
3. **Crew + knowledgebase loop** — if the command surface, `CLI_*` codes, or exit-code map change,
   flag/update the matching `crew` healthcare skill + the KB product doc.
