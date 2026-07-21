---
"@cosyte/cli": patch
---

Phase 2 (CLI-2): harden the PHI posture and add the `redact`/`deid` command as an honest, gated stub.
Adds the global, opt-in `--unsafe-show-values` flag — resolved once and funnelled through a single
chokepoint (`core/phi.ts`) so a value reaches a secondary surface **iff** the flag is set; by default
every diagnostic stays value-free and a successful parse puts values only on stdout. Adds `redact` /
`deid` (`<file|->`, `--format`) as a typed `CLI_NOT_IMPLEMENTED` (exit `69`, `EX_UNAVAILABLE`): it is
gated on `@cosyte/deid` (unpublished), **never reads the input**, and never emits a partial Safe-Harbor
scrub dressed up as de-identified — a built-in redactor is deliberately withheld to avoid a
false-safety impression, delegating to `@cosyte/deid` via a documented seam (`core/deid.ts`) when it
ships. Also fixes the `phi-scan` fixture root (it now scans the real `test/__fixtures__/`). No new
runtime dependencies — stays within the cap of 2.
