# 0022 — One repo, two bins: the `cosyte` CLI and the (future) `cosyte-mcp` MCP server share one core

- **Status:** Accepted (2026-07-21)
- **Scope:** `@cosyte/cli`
- **Relates to:** ADR 0021 (the dependency-tier decision), the cli roadmap
  (`operations/roadmaps/cli.md` §1, §4.2, §8 Phase 5). Proposed in the roadmap as umbrella ADR "0022".

## Context

The developer-tooling surface has two natural front doors over the same wrapped-parser capability:

- a **terminal** front door — the `cosyte` command a developer runs in a shell; and
- an **agent** front door — an **MCP server** an LLM/agent calls to parse/validate/convert healthcare
  messages, spawned as a stdio subprocess and registered in a client's `mcpServers` config.

Both are Node executables consuming the **same** wrapped libraries over the **same** internal `core`
(format autodetection + operation wrappers + the exit-code + value-free-diagnostic disciplines). A
third candidate — a hosted **web playground** (an online inspector/validator/de-id) — is a *different*
shape (a browser bundle / hosted site), a *different* threat model (an untrusted-upload de-id service
is a hosted-PHI surface, not a local CLI), and a *different* owner.

The question: one repo shipping both executables, or split repos?

## Decision

1. **One repo (`cosyte/cli`), one published package (`@cosyte/cli`), shipping TWO executables from ONE
   codebase** — the `cosyte` CLI (`dist/bin/cosyte.mjs`, shipping now) and, in Phase 5, a `cosyte-mcp`
   MCP server (also reachable as the `cosyte mcp` subcommand and the `./mcp` subpath export). Both are
   **thin adapters over one shared `core`**: a terminal adapter and a JSON-RPC/stdio adapter. The
   `bin` package is organised as a command tree (`core/` + `commands/`) precisely so a second adapter
   slots in as a third tsup entry without duplicating routing, autodetection, or the PHI posture.

2. **Splitting into two repos is rejected.** The two adapters share the entire core, so a split buys
   **no isolation** while doubling the maintenance: two release trains, two vendored-tarball refresh
   scripts, two docs registrations, two supply-chain audits. The MCP-specific dependency (the MCP SDK)
   is isolated **behind the `./mcp` subpath and lazy-imported** (ADR 0021), so the `cosyte parse` path
   never loads it — the isolation a split would provide is achieved within one repo at the module
   boundary, at a fraction of the cost.

3. **The web playground is explicitly out of scope for this package.** It needs a different stack,
   threat model, and owner (it belongs with `website`/`docs` or its own repo, and is likely a separate
   founder decision). The CLI's `core` is written so a playground *could* later import the same
   format-autodetect + operation functions where the underlying parser compiles to the browser — but
   building, hosting, and securing that surface is **not** in `@cosyte/cli`.

## Consequences

- **Positive.** One core, one test suite, one release train, one PHI posture proven once and inherited
  by both adapters. The agent front door is cheap *because* it reuses the core — the whole argument
  for the tooling tier being on-brand lead-gen (the parsers reachable from an LLM) rather than a second
  product. Adding the MCP adapter is additive, not a rebuild.
- **Negative / cost.** One package carries two `bin` entries and (eventually) one isolated third-party
  runtime dep (the MCP SDK); the `attw` + dual-condition gates must cover the `.` and `./mcp` subpath
  exports both. The MCP SDK's isolation must be *tested* (a `cosyte parse` invocation must not load it),
  not merely asserted.
- **Boundary.** Two adapters, one core, one repo — but a **hosted** surface (a remote/Streamable-HTTP
  MCP deployment, or the web playground) is a separate, security-reviewed concern, never smuggled into
  this local-stdio-only package.
