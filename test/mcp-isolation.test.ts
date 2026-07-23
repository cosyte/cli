import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * SDK-isolation gate (ADR 0021 / 0022, cli roadmap §Phase 5 acceptance). The
 * `@modelcontextprotocol/sdk` is the CLI's single third-party runtime dependency and must be reachable
 * **only** through the `./mcp` subpath — so a `cosyte parse` invocation never loads it. This test
 * proves the boundary statically: no module under `src/core` or `src/commands` (the shared fast path)
 * may import the SDK or the `mcp/` tree, and the `.` barrel (`src/index.ts`) must not re-export it.
 * The `cosyte` bin reaches the server only via a **dynamic** `import()`, kept lazy on the `mcp` branch.
 */

const SRC = join(import.meta.dirname, "..", "src");

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...tsFiles(full));
    else if (e.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const SDK = "@modelcontextprotocol/sdk";

describe("MCP SDK isolation — the fast path never loads the SDK", () => {
  it("no src/core or src/commands module imports the SDK or the mcp/ tree", () => {
    const guarded = [...tsFiles(join(SRC, "core")), ...tsFiles(join(SRC, "commands"))];
    expect(guarded.length).toBeGreaterThan(0);
    for (const file of guarded) {
      const text = readFileSync(file, "utf8");
      expect(text, `${file} must not reach the SDK`).not.toContain(SDK);
      expect(text, `${file} must not import the mcp/ tree`).not.toMatch(/["']\.\.?\/mcp\//);
    }
  });

  it("the `.` barrel (src/index.ts) does not re-export the MCP surface or the SDK", () => {
    const barrel = readFileSync(join(SRC, "index.ts"), "utf8");
    expect(barrel).not.toContain(SDK);
    expect(barrel).not.toContain("/mcp");
  });

  it("the cosyte bin reaches the server only via a lazy dynamic import (not a static one)", () => {
    const bin = readFileSync(join(SRC, "bin", "cosyte.ts"), "utf8");
    // No top-level static import of the mcp server…
    expect(bin).not.toMatch(/^import[^\n]*mcp\/server/m);
    // …only a dynamic import on the `mcp` branch.
    expect(bin).toMatch(/import\(["']\.\.\/mcp\/server\.js["']\)/);
  });

  it("only the mcp/ tree statically imports the SDK", () => {
    const importsSdk = new RegExp(`import[^\\n]*from\\s+["']${SDK.replace("/", "\\/")}`);
    const sdkImporters = tsFiles(SRC).filter((f) => importsSdk.test(readFileSync(f, "utf8")));
    expect(sdkImporters.length).toBeGreaterThan(0); // the server does import it
    for (const f of sdkImporters) {
      expect(f).toContain(`${join("src", "mcp")}`);
    }
  });
});
