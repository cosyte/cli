# 0024 — The Phase-5 MCP server: the SDK is an isolated, runtime-optional dependency, not a hard-closure dep

- **Status:** Accepted (2026-07-23)
- **Scope:** `@cosyte/cli`
- **Implements:** ADR 0022 (one repo, two bins — the `cosyte` CLI and a `cosyte-mcp` MCP server over one
  shared `core`); the cli roadmap `operations/roadmaps/cli.md` §Phase 5 (CLI-5).
- **Amends the mechanism of:** ADR 0021 §2 (which anticipated "the only future justified third-party
  runtime dep is the MCP SDK, isolated behind the (Phase-5) `./mcp` subpath and lazy-imported"). This
  decision records **how** it is taken — as an `optionalDependency`, not a hard `dependency` — and why
  that is the more faithful expression of the isolation invariant, not merely a cap workaround.

## Context

CLI-5 adds the second adapter ADR 0022 designed for: a **stdio MCP server** (`cosyte-mcp`, also the
`cosyte mcp` subcommand and the `./mcp` subpath export) exposing the shared command core to an LLM/agent
as callable tools. It is built on the official **`@modelcontextprotocol/sdk`** — the CLI's **first and
only** third-party runtime dependency (the CLI core stays `util.parseArgs` + a hand-rolled dispatcher,
third-party-zero).

Two facts shape how the SDK is taken:

1. **The isolation invariant is a runtime-load invariant.** ADR 0021 and the roadmap §Phase 5 both state
   the guarantee as *loading*: "a `cosyte parse` invocation never **loads** the SDK," and the acceptance
   test is "the SDK failing to load → the CLI core still works (isolation proven)." The core must
   function with the SDK **absent**.

2. **The umbrella hard-dep cap counts `dependencies` only.** `scripts/verify-policy.json` caps `cli`
   runtime `dependencies` at **4** — the four first-party siblings (ADR 0021 + 0023). That cap is the
   *hard closure* every invocation may load. The SDK is, by invariant (1), explicitly **not** part of
   that closure.

## Decision

1. **`@modelcontextprotocol/sdk` is declared in `optionalDependencies`, pinned exact (`1.29.0`).** It is
   installed by default — so `npx @cosyte/cli mcp`, the `cosyte-mcp` bin, and `import "@cosyte/cli/mcp"`
   work out of the box — but the package's core (`parse`/`validate`/`inspect`/`fmt`/`convert`/`map-codes`
   and the `.` programmatic API) functions fully **without** it. A minimal consumer may install with
   `--omit=optional` and every non-MCP surface still works. This is the accurate package.json category
   for "needed only by the MCP feature; the core degrades gracefully if it is missing," and it is exactly
   what invariant (1) requires. It is **not** a hard-closure dependency, so it does **not** count against
   the `maxRuntimeDeps: 4` cap and the umbrella policy is **unchanged** (no cap raise, no umbrella edit).

2. **The SDK is reachable only through the `./mcp` boundary, enforced three ways.**
   - Only **`src/mcp/server.ts`** statically imports the SDK. It is imported solely by the `./mcp`
     subpath barrel (`src/mcp/index.ts`), the `cosyte-mcp` bin, and a **dynamic** `import("../mcp/server.js")`
     on the `cosyte mcp` branch of the `cosyte` bin — never from `core`/`commands`.
   - The `.` barrel (`src/index.ts`) never re-exports the MCP surface, so `import "@cosyte/cli"` never
     pulls the SDK.
   - `test/mcp-isolation.test.ts` proves it statically: no module under `src/core` or `src/commands`
     imports the SDK or the `mcp/` tree, and the only static SDK importer is under `src/mcp/`.

3. **The tools are a thin adapter over the same core, value-free by construction.** The `parse` /
   `validate` / `inspect` / `convert` tools (`src/mcp/tools.ts`, SDK-free and unit-tested) each invoke the
   existing command handler with `--json` under the always-on `VALUE_FREE` posture — so `cosyte parse`
   and the MCP `parse` tool agree, and there is **no `--unsafe-show-values` door on the agent surface**. A
   tool *result* carries the requested data (the parsed model / converted Bundle — the explicit request);
   a tool *error* carries only the command's value-free diagnostic (a stable code + positional context),
   never an input value. `dispatchTool` also **inherits the terminal dispatcher's value-free exception
   boundary** (`core/run.ts`'s `try/catch → toCliError`): any unexpected throw from a command is mapped
   to a value-free `CLI_INTERNAL` result rather than propagated to the SDK, which would otherwise surface
   the raw `error.message` to the client — so the "both adapters inherit the posture" guarantee is
   enforced in code, not by trusting the wrapped libraries never to throw. `redact`/`deid` (gated on
   `@cosyte/deid`) and `map-codes` are deliberately not exposed as tools yet.

4. **stdio, local subprocess only.** The server is a local stdio subprocess implicitly trusted by the
   user/agent that launched it — never a hosted/HTTP endpoint (roadmap §2 non-goal). Each call is
   stateless.

## Consequences

- **Positive.** The isolation invariant is expressed *in the manifest*, not just at the module boundary:
  the SDK is optional because the core genuinely does not need it. The umbrella hard-dep cap stays 4 and
  needs no edit. The agent front door is additive — one shared core, one PHI posture proven once, two
  adapters (ADR 0022). The SDK's full transitive **license closure is allowlisted** (MIT/BSD/ISC) and
  `pnpm audit --prod` is clean at the `high` gate.
- **Negative / cost.** `optionalDependencies` are installed by **default**, so the SDK's transitive tree
  (a larger surface than the CLI core's zero-third-party posture — it carries HTTP transports the stdio
  server never uses) is in the default install closure; the isolation is a **runtime-load** isolation
  (never loaded on the `parse` path) plus an install **escape hatch** (`--omit=optional`), not an
  install-time exclusion. The SDK version must be refreshed deliberately, like any dependency.
- **Boundary.** This remains the developer-tooling `bin` tier only. A **hosted** MCP surface
  (remote/Streamable-HTTP) is a separate, security-reviewed concern (roadmap §10 Q5), never smuggled into
  this local-stdio-only package. The parsers stay zero-dep; a third-party runtime dep on the MCP SDK must
  never leak back into a parser or a library tier.
