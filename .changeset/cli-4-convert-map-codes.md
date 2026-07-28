---
"@cosyte/cli": patch
---

`cosyte convert` turns HL7 v2 into FHIR R4 and `cosyte map-codes` translates a code through a
ConceptMap you supply, with no mapping or terminology logic of the CLI's own. `convert` runs via
`@cosyte/transform`; `map-codes` runs `$translate` via `@cosyte/terminology`. `convert <file> --to fhir` parses with `@cosyte/hl7`, converts via `transform.toFhir`, and
emits the serialized FHIR message `Bundle` on stdout; the library's value-free issues go to stderr and
an error-severity issue drives a non-zero exit (`1`), never exit `0`. `map-codes <conceptmap> --code …
[--system …]` loads the user's FHIR ConceptMap and forwards `terminology.translate` faithfully —
mapped → the target coding(s) + exit `0`, unmapped → the value-free `TERM_TRANSLATE_UNMAPPED` signal +
exit `1`, an unloadable map → the new `CLI_MAP_INVALID` data error (`65`). The CLI adds no mapping or
terminology logic of its own. Adds `@cosyte/transform` + `@cosyte/terminology` as hard, lazy-loaded,
first-party runtime deps (vendored tarballs; umbrella dep cap raised 2 → 4 — ADR 0023).
