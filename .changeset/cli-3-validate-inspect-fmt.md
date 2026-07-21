---
"@cosyte/cli": patch
---

Phase 3 (CLI-3): add `validate`, `inspect`, and `fmt` over the two wired parsers (HL7 v2 + FHIR R4),
each a thin, PHI-safe wrapper that re-implements no library logic.

- **`validate <file|-> [--profile] [--json] [--quiet]`** — parse + run the wrapped parser's own
  validation surface, with the **verdict in the exit code**: `0` valid, `1` invalid (parseable but
  non-conformant), `65` unparseable, `66` no input, `2` usage. The load-bearing rule holds — a
  validation failure is **never** exit `0`, and "unparseable" (`65`) is a distinct signal from
  "parsed but invalid" (`1`). The CLI invents no verdict: FHIR validity is `@cosyte/fhir`'s
  `validateResource().valid` (plus any error-severity read issue); HL7 validity is "parseable" (its
  warnings are non-fatal by the library's design — surfaced, never failing). `--profile` is gated to
  an honest `CLI_NOT_IMPLEMENTED` (exit `69`) — the CLI bundles no profiles yet, so it never fakes or
  silently drops a profile verdict.
- **`inspect <file|-> [--json]`** — a value-free structural summary: HL7 message type + version +
  per-segment-type counts + warning count; FHIR `resourceType`, Bundle entry counts by type, and
  issue count. Counts and structural type codes only — never a field value.
- **`fmt <file|->`** — canonical re-serialization via the wrapped library's spec-clean serializer
  (`Hl7Message.toString()` / `serializeResource`). Its stdout **is** the data channel; an unparseable
  input is a data error (`65`) with **no partial emit**.

New `EXIT.INVALID` (`1`) — the `validate` verdict code. All four commands share one input + format
front door (`core/resolveInput`) and one value-free parser-failure boundary (`core/wrap`), so the
value-free-by-default posture and `--unsafe-show-values` chokepoint apply uniformly (`parse` was
refactored onto the shared helpers, behavior-preserving). New programmatic exports: `validateCommand`,
`inspectCommand`, `fmtCommand`, `resolveInput`, `parseFailureResult`, `formatHl7Position`,
`errorResult`. No new runtime dependencies — stays within the cap of 2.
