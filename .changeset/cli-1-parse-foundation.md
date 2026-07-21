---
"@cosyte/cli": patch
---

Phase 1 (CLI-1): reshape the scaffold into a `bin` package and ship the `cosyte parse` foundation —
`cosyte parse <file|->` with content-based format autodetection (HL7 v2 + FHIR R4, fail-safe on
ambiguity), lazy-loaded parsers, typed-JSON stdout, a documented exit-code contract (0/2/65/66/70),
and a value-free `CLI_*` diagnostic channel (no PHI on stderr). Adds `@cosyte/hl7` + `@cosyte/fhir` as
hard, first-party, vendored runtime dependencies (ADR 0021) and the one-repo-two-bins decision
(ADR 0022).
