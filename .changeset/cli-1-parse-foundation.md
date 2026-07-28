---
"@cosyte/cli": patch
---

`cosyte parse <file|->` reads HL7 v2 and FHIR R4 with format autodetection that fails safe on
ambiguity, writes typed JSON to stdout, and keeps PHI off stderr under a documented exit-code
contract. Lazy-loaded parsers; exit codes 0/2/65/66/70; a value-free `CLI_*` diagnostic channel. Adds `@cosyte/hl7` + `@cosyte/fhir` as
hard, first-party, vendored runtime dependencies (ADR 0021) and the one-repo-two-bins decision
(ADR 0022).
