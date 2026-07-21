import { cosyteTsup } from "@cosyte/tsup-config";

/**
 * tsup build for `@cosyte/cli` — a **`bin` package**, not a library.
 *
 * Two entry points from the shared @cosyte/tsup-config standard (ES2023, Node platform, dual
 * ESM + CJS, `.mjs`/`.cjs` out-extensions):
 *
 *   - `index`      — the programmatic API (the `.` subpath export), consumed via `import`.
 *   - `bin/cosyte` — the `cosyte` executable. tsup preserves its `#!/usr/bin/env node` shebang and
 *                    marks it executable; `package.json#bin` points at `dist/bin/cosyte.mjs`.
 *
 * The future `cosyte-mcp` bin (Phase 5) slots in here as a third entry over the same core.
 */
export default cosyteTsup({
  entry: { index: "src/index.ts", "bin/cosyte": "src/bin/cosyte.ts" },
});
