# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions and publishing are managed with [Changesets](https://github.com/changesets/changesets);
this file is maintained by hand (Changesets handles the version bump and publish only).

## [Unreleased]

The first pre-alpha release (`0.0.1`) will ship the initial public API surface. The package begins
its public history at `0.0.x`, per the cosyte version ladder (`0.0.x` until first alpha).

### Added

- **Phase 6 — six more formats + streaming + shell completion (ADR 0025).** The `cosyte` CLI now wraps
  **all eight cosyte formats**, routed through a single lazy **per-format adapter registry**
  (`src/core/parsers.ts`) that replaces the old per-command `hl7 ? : fhir` branches and makes support
  **per (format, operation)**. An unsupported (format, op) is a value-free `CLI_FORMAT_UNSUPPORTED`,
  never a fake (ADR 0018).
  - **New formats and their honest capabilities.** `x12`, `astm`, `ncpdp` (SCRIPT) → **parse · inspect ·
    fmt · validate**; `ccda` → **inspect · fmt** (XML re-serialize) **· validate** (`parse` deferred — no
    library-blessed JSON model; XML is the canonical form); `dicom` → **inspect · validate** (`parse`/`fmt`
    deferred — the model is binary); `mllp` → **parse · inspect** (a transport container the CLI de-frames
    to its enclosed HL7 message(s)). Content autodetection now covers all eight (conservative + disjoint —
    a leading `0x0B` VT byte routes to `mllp`, `ISA`→`x12`, an `H`-record→`astm`, `<ClinicalDocument>`→`ccda`,
    a `<Message>` in the NCPDP namespace→`ncpdp`, `DICM`@128→`dicom`); `--format` accepts `mllp`.
  - **Streaming / multi-message.** `parse` emits **NDJSON** with per-record isolation for inherently
    multi-record inputs — an **MLLP** stream (one record per frame) and any input under the new
    **`--ndjson`** flag (one record per non-empty line — the FHIR bulk-data convention). A record that
    fails to parse becomes a value-free `{ record, error }` line and the stream continues; the overall
    exit is a data error (`65`) if any record failed. A single message is unchanged (one pretty, or
    `--json` compact, envelope + a value-free warning-count note).
  - **Shell completion.** `cosyte completion <bash|zsh|fish>` prints a static, value-free completion
    script generated from the command tree.
  - **Dependencies — the cap stays 4 (no umbrella edit).** The six breadth parsers are vendored
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

- **Phase 5 — the `cosyte-mcp` MCP server (the agent front door).** A **stdio Model Context Protocol
  server** that exposes the shared command core to an LLM/agent as callable tools — the second adapter
  over one core (ADR 0022, 0024). Reachable three ways: the new **`cosyte-mcp`** bin, the **`cosyte mcp`**
  subcommand, and the **`@cosyte/cli/mcp`** subpath export. Tools: **`parse`**, **`validate`**,
  **`inspect`**, **`convert`** — each a thin wrapper that calls the same command handler the terminal
  uses (with `--json`), so `cosyte parse` and the MCP `parse` tool agree by construction; the CLI
  re-implements nothing.
  - **PHI posture, inherited and hardened.** Every tool runs under the value-free posture — there is
    **no** `--unsafe-show-values` door on the agent surface. A tool _result_ carries the requested data
    (the parsed model / converted Bundle — the explicit request); a tool _error_ carries only the value-
    free diagnostic (a stable code + positional context), never an input value. A parsed-but-invalid
    `validate` verdict is a **successful** call reporting the verdict, not a tool error; only a hard
    failure (unparseable / no input / usage) sets `isError`.
  - **The MCP SDK is isolated and runtime-optional (ADR 0024).** `@modelcontextprotocol/sdk` — the CLI's
    first and only third-party runtime dependency — is declared in **`optionalDependencies`** (pinned
    `1.29.0`) and imported **only** in `src/mcp/server.ts`, reachable solely via the `./mcp` boundary
    (the subpath, the `cosyte-mcp` bin, and a dynamic `import()` on the `cosyte mcp` branch). A `cosyte
parse` invocation never loads it; the core works with the SDK absent (`--omit=optional`). Because it
    is not part of the hard runtime closure, the umbrella `verify-policy.json` cap on `cli` runtime
    `dependencies` stays **4** — unchanged. A static isolation test proves no `core`/`commands` module
    imports the SDK.
  - New subpath export **`@cosyte/cli/mcp`** and new **`cosyte-mcp`** bin; new programmatic exports
    (`createMcpServer`, `startStdioServer`, `dispatchTool`, `TOOL_DEFS`, and the MCP result types) on the
    `./mcp` subpath. `redact`/`deid` (gated on `@cosyte/deid`) and `map-codes` are deliberately not
    exposed as tools yet.
- **Phase 4 — `convert` / `map-codes` (the consumer-of-consumers commands).** Two commands that wrap
  the higher-layer libraries; the CLI adds **no** mapping or terminology logic of its own.
  - **`convert <file|-> --to fhir [--json] [--quiet]`** — **HL7 v2 → FHIR R4** via
    **`@cosyte/transform`**. Parses the input with `@cosyte/hl7`, hands the parsed message to
    `transform.toFhir`, and emits the serialized FHIR **message `Bundle`** (the library's canonical
    serialization) on **stdout** — `cosyte convert` equals `transform`'s programmatic output. The
    conversion's value-free issues (a stable code + a v2-index → FHIRPath locator, never a field value)
    render on stderr (or as a JSON envelope under `--json`); `--quiet` suppresses them. The
    load-bearing rule mirrors `validate`: an **error-severity** transform issue drives exit **`1`**,
    never `0`. `--to fhir` is required (the only target); a **non-HL7 source** (e.g. a FHIR document) is
    a value-free `CLI_FORMAT_UNSUPPORTED` data error (`65`), never a fake conversion; an unparseable
    HL7 input is `CLI_PARSE_FAILED` (`65`).
  - **`map-codes <conceptmap|-> --code <code> [--system <uri>] [--version] [--display] [--json]
[--quiet]`** — translate a single source coding through a **BYO FHIR R4 ConceptMap** via
    **`@cosyte/terminology`** (`$translate`). The positional is the ConceptMap document; the source
    coding is named by flags. A ConceptMap and a code are **reference data, not PHI**, so the
    translation result goes to **stdout**: a **match** → the target coding(s) + exit **`0`**; an
    **unmapped** code → the never-fabricate `TERM_TRANSLATE_UNMAPPED` signal + exit **`1`**. A map that
    is not valid JSON or not a loadable ConceptMap is the new value-free **`CLI_MAP_INVALID`** data
    error (`65`), surfacing the stable terminology-loader code (e.g. `TERM_CONCEPTMAP_MALFORMED`) —
    never the map's bytes.
  - New **`CLI_MAP_INVALID`** diagnostic code. New programmatic exports: `convertCommand`,
    `convertOutcome`, `mapCodesCommand`. New runtime dependencies (ADR 0023): **`@cosyte/transform`**
    (`e6c4531`, v0.0.0) and **`@cosyte/terminology`** (`e5ed368`, v0.0.1) as **hard, first-party,
    lazy-loaded** deps — vendored as `pnpm pack` tarballs under `vendor/` until PUB-FLIP
    (`pnpm vendor:refresh`; umbrella ADR 0008). The umbrella `verify-policy.json` cap on `cli` runtime
    deps was raised **2 → 4**; third-party CLI-core runtime deps stay **zero** (both siblings are
    lazy-loaded per command, so the `parse` fast path never loads them).
  - **ADR `0023`** — wire `@cosyte/transform` + `@cosyte/terminology`; the deliberate 2 → 4 cap raise
    (amends ADR 0021).
- **Phase 3 — `validate` / `inspect` / `fmt`.** Three commands over the two wired parsers
  (HL7 v2 + FHIR R4), each a thin wrapper that re-implements no library logic.
  - **`validate <file|-> [--profile] [--json] [--quiet]`** — parse + run the wrapped parser's own
    validation surface, with the **verdict in the exit code**: `0` valid, **`1` invalid** (parseable
    but non-conformant), `65` unparseable, `66` no input, `2` usage. The load-bearing rule: a
    validation failure is **never** exit `0`; "unparseable" (`65`) is a distinct signal from "parsed
    but invalid" (`1`). Findings are **value-free** — a stable code, a severity, and a positional
    locator (a FHIRPath, or an HL7 segment/field index) — on stderr by default, or as value-free JSON
    on stdout under `--json`; `--quiet` makes the exit code the whole signal. The CLI invents **no**
    verdict: FHIR validity is `@cosyte/fhir`'s `validateResource().valid` (plus any error-severity
    read issue); HL7 validity is "parseable" (its warnings are non-fatal by the library's design —
    surfaced, never failing). **`--profile` is gated** to an honest `CLI_NOT_IMPLEMENTED` (exit `69`):
    the CLI bundles no profiles yet, so it never fakes or silently drops a profile verdict.
  - **`inspect <file|-> [--json]`** — a **value-free structural summary**: HL7 message type, version,
    per-segment-type counts, and a warning count; FHIR `resourceType`, Bundle entry counts by type, and
    a read-issue count. Counts and structural type codes only — never a field value.
  - **`fmt <file|->`** — **canonical re-serialization** via the wrapped library's spec-clean
    serializer (`Hl7Message.toString()` / `serializeResource`); its stdout **is** the data channel. An
    unparseable input is a data error (`65`) with **no partial emit**.
  - New `EXIT.INVALID` (`1`) — the `validate` verdict code (the exit-code contract is now
    `0/1/2/65/66/69/70`). All four commands share one input + format front door (`core/resolveInput`)
    and one value-free parser-failure boundary (`core/wrap`), so the value-free-by-default posture and
    the `--unsafe-show-values` chokepoint apply uniformly; `parse` was refactored onto the shared
    helpers (behavior-preserving). New programmatic exports: `validateCommand`, `inspectCommand`,
    `fmtCommand`, `resolveInput`, `parseFailureResult`, `formatHl7Position`, `errorResult`. No new
    runtime dependencies — stays within the cap of 2.
- **Phase 2 — PHI posture hardened + `redact`/`deid` + `--unsafe-show-values`.**
  - **`--unsafe-show-values`** — a global, opt-in, PHI-exposing flag, resolved once and order-
    independently and funnelled through a **single chokepoint** (`core/phi.ts`), so the "a value
    reaches a secondary surface **iff** the flag is set" property holds in one place. Off by default;
    with it set, a `CLI_PARSE_FAILED` diagnostic appends a bounded, single-line excerpt of the
    offending input. Every other surface stays value-free, and a successful parse still puts values
    only on the stdout data channel.
  - **`redact` / `deid` (`<file|->`, `--format`)** — the de-identification command, shipped as an
    **honest, typed `CLI_NOT_IMPLEMENTED`** (new exit code `69`, `EX_UNAVAILABLE`). It is **gated on
    `@cosyte/deid`** (unpublished, `DEID-1` in flight), **never reads the input**, and never emits a
    partial Safe-Harbor scrub presented as de-identified. A built-in redactor is **deliberately
    withheld** — a partial scrub over only the obvious PHI loci would leave PHI behind and present a
    false-safety impression (the cardinal hazard). It delegates to `@cosyte/deid` via a documented
    seam (`core/deid.ts`) when that library ships and is vetted.
  - **Never a PHI temp file / never a file log** — proven by test (no command creates a file in the
    working directory) and by design (commands return a `RunResult`; only the thin `bin` writes to
    process streams).
  - New `CLI_NOT_IMPLEMENTED` diagnostic code and `EXIT.UNAVAILABLE` (`69`); new programmatic exports
    (`PhiPosture`, `VALUE_FREE`/`SHOW_VALUES`, `extractPhiPosture`, `unsafeInputSuffix`, `deidStatus`,
    `redactCommand`).
- **Phase 1 — the `cosyte parse` foundation.** Reshaped the scaffold from a library skeleton into a
  **`bin` package**: `package.json#bin` maps `cosyte` → `dist/bin/cosyte.mjs` (a shebang entry over a
  testable `core`), argument-parsed with Node's built-in `util.parseArgs` + a hand-rolled subcommand
  dispatcher (**no third-party CLI framework**).
- **`cosyte parse <file|->`** — reads a file argument or stdin (`-`); **autodetects the format by
  content** (HL7 v2 `MSH` framing, FHIR JSON `resourceType`) — conservative and fail-safe (a confident
  single match parses; ambiguity/no-match is a data error asking for `--format`, never a guess); routes
  to the wrapped parser (**lazy-loaded** per format); emits the parsed model as **typed JSON on
  stdout**. Flags: `--format`, `--json`, `--quiet`, `--no-color`.
- **The exit-code contract** (`sysexits.h`-grounded, documented, tested): `0` success · `2` usage ·
  `65` data/parse error (`EX_DATAERR`) · `66` no input (`EX_NOINPUT`) · `70` internal (`EX_SOFTWARE`).
  The CLI never exits `0` on input it could not handle.
- **Value-free diagnostic channel** with stable `CLI_*` codes (`CLI_FORMAT_UNDETECTED`,
  `CLI_FORMAT_AMBIGUOUS`, `CLI_FORMAT_UNSUPPORTED`, `CLI_NO_INPUT`, `CLI_EMPTY_INPUT`,
  `CLI_PARSE_FAILED`, `CLI_USAGE`, `CLI_INTERNAL`). **stdout is the data channel; every stderr line is
  value-free** — code + position only, never a field value. No temp files, no file logging.
- **Programmatic `core` API** (the `.` subpath): `detectFormat` / `classifyCandidates` /
  `detectionError`, `EXIT`, `CLI_CODES` / `CliError`, `run`, `parseCommand`, `VERSION`.
- **Runtime dependencies (ADR 0021):** `@cosyte/hl7` (`46d50eb`, v0.0.1) and `@cosyte/fhir` (`7a099b2`,
  v0.0.0) as **hard, first-party** deps — an `npx` bin cannot peer-depend — vendored as `pnpm pack`
  tarballs under `vendor/` until PUB-FLIP (`pnpm vendor:refresh`; umbrella ADR 0008). Capped at **2**
  by the umbrella `verify-policy.json`; third-party CLI-core runtime deps stay **zero**.
- **ADRs:** `0021` (developer-tooling tier is a `bin` that hard-depends on first-party siblings;
  third-party runtime deps minimized) and `0022` (one repo, two bins — the CLI and the future
  `cosyte-mcp` MCP server over one core; the web playground is out of scope).

### Changed

- **Reshaped the package from the parser-library scaffold to a `bin` package.** Removed the archetype
  stubs (`parseCli`, `WARNING_CODES`, `FATAL_CODES`); replaced the library `src/index.ts` and the
  round-trip property test with the command tree, the programmatic `core` API, and command-contract /
  autodetection / PHI-leak / equivalence tests. Rewrote `docs-content/` and `README.md` for the CLI.

### Deprecated

### Removed

### Fixed

- **README + guides now describe the shipped Phase-3 command surface.** The `README.md` and
  `docs-content/guides-overview.md` "Status" blurbs read as a Phase-1-forward roadmap ("Phase 1 ships
  `parse`…"); they now state the current surface directly — `parse` / `validate` / `inspect` / `fmt`
  and the gated `redact`/`deid` — over the two wired parsers (HL7 v2 + FHIR R4). The pre-alpha,
  not-yet-published-to-npm status is unchanged (accurate), and the `npx`/`npm install -g` examples now
  carry a "not on npm yet" caveat (docs-only; README-ORG-SWEEP).
- **`phi-scan` now scans the real fixture directory.** The scanner's fixture root pointed at a
  nonexistent `test/fixtures/`; it now walks `test/__fixtures__/` (and the same path in the staged
  filter), so the PHI commit-gate actually covers the CLI's synthetic fixtures.

### Security

[Unreleased]: https://github.com/cosyte/cli/commits/main
