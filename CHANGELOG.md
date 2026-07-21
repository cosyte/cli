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

- **`phi-scan` now scans the real fixture directory.** The scanner's fixture root pointed at a
  nonexistent `test/fixtures/`; it now walks `test/__fixtures__/` (and the same path in the staged
  filter), so the PHI commit-gate actually covers the CLI's synthetic fixtures.

### Security

[Unreleased]: https://github.com/cosyte/cli/commits/main
