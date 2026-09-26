---
"@cosyte/cli": patch
---

Run on the 0.1 releases of every `@cosyte` library this CLI uses except `@cosyte/deid`.

The two required dependencies, `@cosyte/hl7` and `@cosyte/terminology`, and the optional
`@cosyte/astm`, `@cosyte/ccda`, `@cosyte/dicom`, `@cosyte/mllp`, `@cosyte/ncpdp`,
`@cosyte/transform` and `@cosyte/x12` move from their 0.0.x releases to `^0.1.0`, so an install
takes their 0.1.x patch releases and stops before 0.2.0. `redact` still delegates to
`@cosyte/deid` 0.0.9. The CLI's commands, flags, exit codes and diagnostic codes are unchanged.
