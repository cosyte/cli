# 0025 — The CLI-6 breadth format parsers are runtime-optional, lazy dependencies, not hard-closure deps

- **Status:** Accepted (2026-07-23)
- **Scope:** `@cosyte/cli`
- **Implements:** the cli roadmap `operations/roadmaps/cli.md` §Phase 6 (CLI-6 — "pipeline & format
  breadth: streaming, NDJSON/multi-message, shell completion, all eight formats").
- **Extends the mechanism of:** ADR 0024 (the MCP SDK as an isolated, runtime-optional dependency, kept
  out of the hard-closure cap). This decision applies the **same isolation shape** to the six breadth
  format parsers, and records why that is the faithful expression of the CLI's dependency invariant —
  not a cap workaround.
- **Amends the framing of:** ADR 0021 (the developer-tooling tier is a `bin` that hard-depends on its
  first-party siblings). ADR 0021's "hard `dependencies`, an `npx` bin can't peer-depend" reasoning
  still governs the **core** parsers the CLI's north star rests on (`hl7`, `fhir`) and the two
  higher-layer libs (`transform`, `terminology`); this ADR distinguishes the **breadth** parsers, which
  the core genuinely does not need to function.

## Context

CLI-6 wires the remaining six cosyte parsers — `dicom`, `x12`, `ccda`, `ncpdp`, `astm`, `mllp` — into
the command surface. Two facts shape how they are taken as dependencies:

1. **The umbrella hard-dep cap counts `dependencies` only, and is fixed at 4.** `scripts/verify-policy.json`
   caps `cli` runtime `dependencies` at **4** — the four first-party siblings the core always needs
   (`hl7` + `fhir` for the default-wired formats; `transform` + `terminology` for `convert`/`map-codes`,
   ADR 0021 + 0023). Adding six more parsers as hard `dependencies` would take the closure to ten and
   require raising an umbrella cap. **The cap is not raised** for CLI-6 — deliberately, as the two-rules
   discipline demands a raise be its own argued decision, not a side effect of adding a feature.

2. **The breadth parsers are per-format and lazy — the core does not need any one of them.** The CLI's
   core (dispatch, format autodetection, the exit-code contract, the PHI posture) and its north-star
   commands function fully with **any** breadth parser absent. Each is loaded only when an invocation
   actually routes to that format (`cosyte parse msg.hl7` never loads the DICOM or X12 code). This is
   exactly the isolation invariant ADR 0024 expressed for the MCP SDK: a runtime-**load** isolation.

## Decision

1. **The six breadth parsers are declared in `optionalDependencies`** (`@cosyte/dicom`, `@cosyte/x12`,
   `@cosyte/ccda`, `@cosyte/ncpdp`, `@cosyte/astm`, `@cosyte/mllp`), vendored as `pnpm pack` tarballs
   until PUB-FLIP exactly as the hard siblings are (ADR 0008), each pinned to a known-good sibling
   commit and refreshed by `pnpm vendor:refresh`. They are installed by default — so `npx @cosyte/cli
   parse study.dcm` works out of the box — but the CLI core functions without any of them. This is the
   accurate package.json category for "needed only when the user routes to that format; the core
   degrades gracefully if it is missing." They are **not** part of the hard-runtime closure, so they do
   **not** count against `maxRuntimeDeps: 4` and the umbrella policy is **unchanged** (no cap raise, no
   umbrella edit).

2. **The hard closure stays 4; the split is by necessity, not by convenience.** `hl7`, `fhir`,
   `transform`, `terminology` remain hard `dependencies` — the core's north star (`cat adt.hl7 | cosyte
   parse`) and the `convert`/`map-codes` commands genuinely require them, and a `bin` cannot peer-depend
   (ADR 0021). The six breadth parsers are opt-in reach the core never requires; that is what makes
   `optional` truthful here rather than a dodge.

3. **A single lazy adapter registry is the one wrapper boundary.** All per-format wrapping lives in
   `src/core/parsers.ts`, which dynamically imports each parser inside its branch through one
   `loadOptional` helper. Capability is **per (format, operation)** (`OP_SUPPORT`): a (format, op) the
   parser does not faithfully support is a value-free `CLI_FORMAT_UNSUPPORTED`, never a fake result
   (ADR 0018) — `dicom parse`/`fmt` (binary model), `ccda parse` (no library-blessed JSON model; XML is
   the canonical `fmt` surface), `mllp fmt`/`validate` (a transport container the CLI de-frames to HL7)
   are deferred honestly, not stubbed.

4. **An absent optional parser degrades to a value-free `CLI_PARSER_UNAVAILABLE` (exit `69`), never a
   crash.** `loadOptional` maps a "module not found" import failure to that new stable diagnostic
   (positional/structural context only — the format name, never input bytes). A minimal consumer may
   install with `--omit=optional`; every core surface still works, and routing to an un-installed format
   is a clean, documented unavailable signal. `test/parser-unavailable.test.ts` proves the mapping.

5. **The PHI posture is preserved uniformly.** Every breadth `parse` emits the wrapped library's model
   on the **data channel** (the user's explicit request); every secondary surface (the `inspect`
   summary, `validate` findings, per-record streaming errors, warnings) is **value-free** — counts,
   classification codes (an X12 transaction-set id, a DICOM SOP Class UID, an NCPDP `NewRx`, a C-CDA
   section LOINC code), and index-only positional locators (`valueFreeLocator`), never a field value.
   The PHI-leak suite is extended to the PHI-bearing breadth fixtures (`inspect` of a DICOM PN and an
   NCPDP patient name proven value-free).

## Consequences

- **Positive.** The isolation invariant is expressed *in the manifest*: the breadth parsers are optional
  because the core genuinely does not need them. The umbrella hard-dep cap stays 4 and needs no edit —
  the CLI-6 breadth ships without recruiting an umbrella policy change. The wrapper boundary is one file
  the `gate-refuter` can read whole; adding a ninth format is one adapter branch + one `OP_SUPPORT` row.
- **Negative / cost.** `optionalDependencies` install by **default**, so all six vendored tarballs are in
  the default install closure; the isolation is a runtime-**load** isolation (never loaded off a
  different format's path) plus an install escape hatch (`--omit=optional`), not an install-time
  exclusion. Each pin is refreshed deliberately, like any dependency — a sibling API change can break an
  adapter, so a pin bump re-runs verify + the gate-refuter. At PUB-FLIP the `file:vendor/*.tgz`
  specifiers become real semver npm ranges.
- **Boundary.** This remains the developer-tooling `bin` tier only; the parsers stay zero-dep and never
  gain a dependency because the CLI wraps them. `validate` for the breadth formats is the parsers'
  Postel's-Law "parseable ⇒ valid, recovered deviations are non-fatal warnings" (FHIR keeps its
  `validateResource` verdict) — the CLI invents no stricter verdict of its own (roadmap §5).
