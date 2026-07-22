---
"@cosyte/cli": patch
---

Phase 4 (CLI-4): the consumer-of-consumers commands — `cosyte convert` (HL7 v2 → FHIR R4 via
`@cosyte/transform`) and `cosyte map-codes` (ConceptMap `$translate` via `@cosyte/terminology`, BYO
ConceptMap). `convert <file> --to fhir` parses with `@cosyte/hl7`, converts via `transform.toFhir`, and
emits the serialized FHIR message `Bundle` on stdout; the library's value-free issues go to stderr and
an error-severity issue drives a non-zero exit (`1`), never exit `0`. `map-codes <conceptmap> --code …
[--system …]` loads the user's FHIR ConceptMap and forwards `terminology.translate` faithfully —
mapped → the target coding(s) + exit `0`, unmapped → the value-free `TERM_TRANSLATE_UNMAPPED` signal +
exit `1`, an unloadable map → the new `CLI_MAP_INVALID` data error (`65`). The CLI adds no mapping or
terminology logic of its own. Adds `@cosyte/transform` + `@cosyte/terminology` as hard, lazy-loaded,
first-party runtime deps (vendored tarballs; umbrella dep cap raised 2 → 4 — ADR 0023).
