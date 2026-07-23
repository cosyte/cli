import { cosyteTsup } from "@cosyte/tsup-config";

/**
 * tsup build for `@cosyte/cli` — a **`bin` package**, not a library.
 *
 * Entry points from the shared @cosyte/tsup-config standard (ES2023, Node platform, dual
 * ESM + CJS, `.mjs`/`.cjs` out-extensions):
 *
 *   - `index`          — the programmatic API (the `.` subpath export), consumed via `import`.
 *   - `bin/cosyte`     — the `cosyte` executable. tsup preserves its `#!/usr/bin/env node` shebang and
 *                        marks it executable; `package.json#bin` points at `dist/bin/cosyte.mjs`.
 *   - `mcp`            — the MCP server surface (the `./mcp` subpath export, ADR 0022). The only entry
 *                        that pulls `@modelcontextprotocol/sdk`, so the SDK stays isolated from the
 *                        `.` / `cosyte parse` path (ADR 0021).
 *   - `bin/cosyte-mcp` — the `cosyte-mcp` executable: the stdio MCP server's process entry.
 */
export default cosyteTsup({
  entry: {
    index: "src/index.ts",
    "bin/cosyte": "src/bin/cosyte.ts",
    mcp: "src/mcp/index.ts",
    "bin/cosyte-mcp": "src/bin/cosyte-mcp.ts",
  },
});
