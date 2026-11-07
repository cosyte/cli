---
"@cosyte/cli": patch
---

The cosyte-mcp server now runs on the MCP TypeScript SDK 1.32, which closes six security advisories reported against the 1.29.0 it pinned.

The optional dependency `@modelcontextprotocol/sdk` moves from exactly `1.29.0` to `^1.32.2`, so an install also takes later 1.x fixes without waiting for a release of this package. The advisories it closes:

- GHSA-46jr-4wx8-v453 (CVE-2026-111768, high): one HTTP request within the default size limit could exhaust server memory during validation.
- GHSA-22jm-h49p-29qw (CVE-2026-111767, high): experimental tasks were not tied to the session that created them.
- GHSA-6qxp-vccf-f47h (CVE-2026-104850, high): the OAuth client could send credentials to an authorization server chosen by the MCP server.
- GHSA-f897-62hf-6gxq (high): HTTP server transports and handlers did not limit request body size or JSON-RPC batch length.
- GHSA-rvq5-wwqv-78pq (CVE-2026-111771, medium): server bearer authentication accepted tokens issued for another service.
- GHSA-6prh-2h8m-c8cw (CVE-2026-111769, medium): HTTP client transports and OAuth requests followed cross-origin redirects and re-sent custom headers and request bodies.

SDK 1.32 also accepts `@hono/node-server` 2.x, so an install now resolves a version that closes GHSA-rmxm-3fg6-px4f (moderate). cosyte-mcp serves stdio only and uses none of the SDK's HTTP transports, OAuth client, bearer authentication, or tasks, but these packages are part of what an install resolves, and a fresh install now audits clean. No command, tool, flag, exit code, or diagnostic code changes.
