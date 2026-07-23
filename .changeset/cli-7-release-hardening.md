---
"@cosyte/cli": patch
---

Phase 7 (CLI-7): **release hardening** — the final roadmap phase; the CLI is feature-complete. No new
runtime command surface. This phase makes the package publish-ready and locks its contracts.

- **Fuzz gate over the two input boundaries.** `test/fuzz.property.test.ts` fuzzes the terminal (`run`,
  over arbitrary argv vectors + stdin bytes) and the agent surface (`dispatchTool`, over an arbitrary
  tool name + arguments): neither ever throws an unhandled exception, both always resolve to a
  documented exit code, and no raw stack frame ever reaches a secondary channel. Scaled by
  `CLI_FUZZ_RUNS`; run nightly by `.github/workflows/fuzz.yml` and on demand via `pnpm test:fuzz`.
- **Exit-code golden matrix.** `test/exit-code-matrix.test.ts` pins one representative invocation for
  every code in the `0/1/2/65/66/69/70` contract, driven end-to-end through `run`, so a regression that
  turns an invalid-input exit `1` into a `0` (or renumbers a code) fails CI. The exit-code map and the
  stable `CLI_*` diagnostic codes are a stability surface — renaming one is a breaking change.
- **Publish dry-run proven.** A new `smoke` gate (`scripts/smoke.mjs`, wired into `verify.sh`) exercises
  the built dual ESM/CJS `.` and `./mcp` subpaths and **both** `cosyte` / `cosyte-mcp` bins under
  `node`; `npm publish --dry-run` assembles a clean tarball; `attw` stays a publish gate.
- **Honesty + release docs.** `docs-content/limitations.md`, a man-page-style
  `docs-content/reference-commands.md`, and `RELEASING.md` (the one-package-two-bins publish,
  provenance/OIDC, the vendored-`file:`→npm dep swap, and the two standing founder stops — public-flip
  and `npm publish`).
