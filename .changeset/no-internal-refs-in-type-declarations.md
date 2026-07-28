---
"@cosyte/cli": patch
---

The published type declarations no longer carry internal project references, so editor tooltips
describe only what the software does.

`dist/index.d.ts` and `dist/mcp.d.ts` (and their `.d.cts` twins) are compiled from the JSDoc on
every exported symbol, and that JSDoc was citing internal tracking identifiers, internal decision
records, an internal planning document and its section numbers, and internal sequencing language.
None of it meant anything outside this project, and all of it was rendering on hover for anyone who
installed the package. Every one of those citations is gone; the surrounding statements about what
the CLI guarantees are unchanged.

One factual correction came with the sweep: the `CosyteFormat` type was documented as though content
autodetection recognised only HL7 v2 and FHIR, with the other six formats accepted by `--format` but
not wired. That has not been true since all eight formats gained signatures, and the stale sentence
is removed rather than restated.

No command, flag, exit code or `CLI_*` diagnostic changed.
