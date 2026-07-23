---
"@cosyte/cli": patch
---

Phase 5 (CLI-5): the `cosyte-mcp` **MCP server** — the agent front door (ADR 0022, 0024). A stdio Model
Context Protocol server exposing the shared command core to an LLM/agent as callable tools (`parse`,
`validate`, `inspect`, `convert`), reachable as the new `cosyte-mcp` bin, the `cosyte mcp` subcommand,
and the `@cosyte/cli/mcp` subpath export. Each tool calls the same command handler the terminal uses
(with `--json`), so `cosyte parse` and the MCP `parse` tool agree; the CLI re-implements nothing. Every
tool runs value-free — there is no `--unsafe-show-values` door on the agent surface; a tool result
carries the requested data, a tool error carries only value-free diagnostics, and a parsed-but-invalid
`validate` verdict is a successful call reporting the verdict (not a tool error). The
`@modelcontextprotocol/sdk` — the CLI's first and only third-party runtime dependency — is declared in
`optionalDependencies` (pinned `1.29.0`), imported only in `src/mcp/server.ts`, and reachable solely via
the `./mcp` boundary, so a `cosyte parse` invocation never loads it and the core works with the SDK
absent. Because the SDK is not part of the hard runtime closure, the umbrella runtime-dep cap stays 4.
