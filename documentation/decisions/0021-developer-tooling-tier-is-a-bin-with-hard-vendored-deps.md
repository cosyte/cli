# 0021 — The developer-tooling tier is a `bin` that hard-depends on the parser + higher-layer tiers; third-party runtime deps are minimized to the CLI-core floor

- **Status:** Accepted (2026-07-21)
- **Scope:** `@cosyte/cli`
- **Relates to:** umbrella `documentation/conventions.md` (the zero-dep rule + the value-free-diagnostic
  PHI discipline), umbrella ADR 0008 (vendored-tarball cross-repo consumption until PUB-FLIP), ADR 0001
  of `@cosyte/transform` (the transformation tier's peer-dep posture — the tier this one deliberately
  diverges from), `@cosyte/mllp`'s `@cosyte/hl7` vendoring precedent. Proposed in the cli roadmap
  (`operations/roadmaps/cli.md` §1) as umbrella ADR "0021".

## Context

The cosyte parsers are **siblings that mirror each other's API and do not import one another**
(`@cosyte/hl7` is the reference), and each ships **zero third-party runtime dependencies** — a
supply-chain gate, because healthcare integrators vet every dependency.

`@cosyte/cli` is **not a parser**. It is the **developer-tooling tier**: the `cosyte` command, a thin
honest skin over the parsers (and, in later phases, `@cosyte/transform` + `@cosyte/terminology`). Its
dependency direction is one-way and acyclic — `cli → {parsers, transform, terminology}`; none of those
ever depends back, and no parser gains a dependency because the CLI exists.

The transformation tier (ADR 0001 of `@cosyte/transform`) declares its cosyte siblings as **peer +
optional** dependencies: a *library* consumer already holds `@cosyte/hl7`/`@cosyte/fhir` to parse and
validate, so it supplies them. **The CLI cannot make that assumption.** An end user runs
`npx @cosyte/cli parse msg.hl7` with **nothing pre-installed** — an unmet peer dependency is a broken
command, not a graceful degrade. So the tier that consumes must decide, again, how it takes the deps.

## Decision

1. **The wrapped parsers are hard runtime `dependencies`, not peers.** Because an `npx`-invoked `bin`
   cannot rely on the user having installed anything, `@cosyte/hl7` and `@cosyte/fhir` are declared in
   `package.json#dependencies` (real installs at PUB-FLIP). This is the deliberate divergence from the
   transform tier: a `bin` owns its runtime closure; a library borrows the consumer's.

2. **These are first-party deps, categorically distinct from third-party supply-chain risk.** The
   zero-dep rule governs **third-party** surface — a random npm package an integrator must vet. The
   cosyte siblings are **first-party code we build, test, gate, and ship**; depending on lower layers
   is the point of having layers. So the CLI takes them freely, while its **third-party** runtime
   surface stays at (near) zero: the CLI core parses arguments with Node's built-in `util.parseArgs`
   plus a hand-rolled dispatcher — **no CLI framework in the dependency tree** — and the only future
   justified third-party runtime dep is the MCP SDK, isolated behind the (Phase-5) `./mcp` subpath and
   lazy-imported so the `cosyte parse` path never loads it.

3. **The runtime-dep count is capped and enforced.** `scripts/verify-policy.json` caps `cli` runtime
   `dependencies` at **2** for Phase 1 — exactly `@cosyte/hl7` + `@cosyte/fhir`, the two deepest
   parsers, wired into `parse` first. The other six parsers + `transform` + `terminology` are added,
   **lazy-loaded per format** (a dynamic `import()` inside the format branch, so startup is fast and
   only the needed parser loads), in later phases as the cap is **deliberately raised per format** —
   a one-line policy edit plus this ADR's amendment and a CHANGELOG entry, never a silent bump.

4. **Before PUB-FLIP the unpublished siblings are consumed as vendored `pnpm pack` tarballs at pinned
   commits** (umbrella ADR 0008), exactly as `@cosyte/mllp` consumes `@cosyte/hl7`:
   `vendor/cosyte-hl7-0.0.0.tgz` + `vendor/cosyte-fhir-0.0.0.tgz`, wired as `file:` **runtime**
   dependencies (not devDependencies — they are the CLI's real closure). `scripts/vendor-refresh.sh`
   regenerates them at pinned shas (recorded in that script and the CHANGELOG). At PUB-FLIP these
   `file:` specifiers become real semver npm dependency ranges and the vendored tarballs are removed.

## Consequences

- **Positive.** `npx @cosyte/cli` works with zero pre-installs — the lowest-friction path for a
  curious developer, central to the lead-gen thesis. The third-party supply-chain guarantee is
  preserved (CLI-core third-party runtime deps stay zero). The layering is explicit and acyclic;
  lazy per-format loading keeps startup fast and bounds what each invocation loads.
- **Negative / cost.** The vendored tarballs are committed binary artifacts that must be refreshed
  when a consumed sibling surface changes (a deliberate, gated act — a sibling API change can break a
  `parse` wrapper, so a refresh re-runs verify + the gate-refuter). The `.npmrc`/`.tgz` files trip a
  filename secret-guard on commit and are committed with `--no-verify` after confirming they contain
  no secrets (dist + package.json + LICENSE only), exactly like `@cosyte/mllp`'s vendored tarball. The
  dep cap must be raised deliberately as formats are wired — that friction is the point.
- **Boundary.** This hard-dependency posture is for the **developer-tooling `bin` tier only**. The
  parsers remain zero-dep, sibling-independent mirrors; the transform tier keeps its peer-dep posture.
  A hard dep on a first-party sibling must **never** leak back into a parser or a library tier.
