import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CliError, errorResult } from "../src/core/diagnostics.js";
import { EXIT } from "../src/core/exit-codes.js";
import { loadMcpSdk, MCP_SDK_UNAVAILABLE } from "../src/mcp/launch.js";

/**
 * `@modelcontextprotocol/sdk` is an `optionalDependency`, so an install can lack it: npm's
 * `--omit=optional` leaves it out. Before this suite existed, such an install could not run `cosyte`
 * at all, not even `--version`: the bins are bundled without code splitting, the bundler inlined the
 * server module the `cosyte mcp` branch reached by a dynamic `import()`, and hoisted that module's
 * static SDK imports to the top of the bin, so every command loaded the SDK at startup and died on a
 * raw `ERR_MODULE_NOT_FOUND` with a stack trace.
 *
 * Two guards, as for the absent `@cosyte/*` siblings:
 *
 * 1. The **mapping**: the launcher turns an absent SDK into a value-free `CLI_PARSER_UNAVAILABLE`
 *    (exit `69`) that says what to install, and lets any other failure through.
 * 2. The **graph**: nothing either bin can reach, by a static or a dynamic relative import (the
 *    bundler inlines both), imports the SDK as a value at the top level. That is the regression
 *    that matters and the one a behavioural test in the dev tree, where the SDK is installed, cannot
 *    see.
 *
 * The end-to-end proof is `pnpm smoke`, which runs both built bins with the SDK hidden from the
 * resolver, and the clean-room `--omit=optional` install in `RELEASING.md`.
 */

/** The error Node's ESM resolver raises for a package that is not installed. */
function moduleNotFound(specifier: string): Error {
  const e = new Error(`Cannot find package '${specifier}' imported from /app/dist/bin/cosyte.mjs`);
  (e as NodeJS.ErrnoException).code = "ERR_MODULE_NOT_FOUND";
  return e;
}

const SDK = "@modelcontextprotocol/sdk";

describe("an absent MCP SDK degrades to a value-free CLI_PARSER_UNAVAILABLE", () => {
  it("maps the resolver error to CLI_PARSER_UNAVAILABLE / 69", async () => {
    const err = await loadMcpSdk(() => Promise.reject(moduleNotFound(SDK))).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).code).toBe("CLI_PARSER_UNAVAILABLE");
    expect((err as CliError).exit).toBe(EXIT.UNAVAILABLE);
    expect((err as CliError).message).toBe(MCP_SDK_UNAVAILABLE);
  });

  it("says what is missing and what to install", () => {
    expect(MCP_SDK_UNAVAILABLE).toContain("the MCP server is unavailable in this install");
    expect(MCP_SDK_UNAVAILABLE).toContain("--omit=optional");
    expect(MCP_SDK_UNAVAILABLE).toMatch(
      /install @modelcontextprotocol\/sdk alongside @cosyte\/cli$/,
    );
  });

  it("renders as exit 69 with no stack frame, no resolver text and nothing on stdout", () => {
    const r = errorResult(
      new CliError("CLI_PARSER_UNAVAILABLE", EXIT.UNAVAILABLE, MCP_SDK_UNAVAILABLE),
    );
    expect(r.exit).toBe(EXIT.UNAVAILABLE);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe(`cosyte: CLI_PARSER_UNAVAILABLE: ${MCP_SDK_UNAVAILABLE}\n`);
    expect(r.stderr).not.toMatch(/\s+at\s+\S+:\d+/);
    expect(r.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
  });

  it("propagates any other failure unchanged (a broken SDK is not an absent one)", async () => {
    await expect(loadMcpSdk(() => Promise.reject(new Error("a real SDK bug")))).rejects.toThrow(
      "a real SDK bug",
    );
  });

  it("loads the real SDK when it IS installed (the dev tree has it)", async () => {
    const sdk = await loadMcpSdk();
    expect(sdk.Server).toBeTypeOf("function");
    expect(sdk.StdioServerTransport).toBeTypeOf("function");
    expect(sdk.CallToolRequestSchema).toBeDefined();
    expect(sdk.ListToolsRequestSchema).toBeDefined();
  });

  it("the SDK really is optional in the manifest, so an install can lack it", () => {
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
    ) as { dependencies: Record<string, string>; optionalDependencies: Record<string, string> };
    expect(Object.keys(manifest.optionalDependencies)).toContain(SDK);
    expect(Object.keys(manifest.dependencies)).not.toContain(SDK);
  });
});

describe("nothing a bin can reach imports the SDK statically", () => {
  const SRC = join(import.meta.dirname, "..", "src");

  /** The specifier of every top-level import in `source` that is not an `import type`. */
  function valueImports(source: string): string[] {
    const imports = source.matchAll(/^import\s+(?!type\s)[^;]*?["']([^"']+)["']/gm);
    return [...imports].map((m) => m[1] ?? "");
  }

  /** Every relative module `source` reaches: static imports, re-exports and dynamic `import()`. */
  function relativeEdges(source: string): string[] {
    const specs = [
      ...source.matchAll(/^(?:import|export)\s[^;]*?from\s+["'](\.[^"']+)["']/gm),
      ...source.matchAll(/^import\s+["'](\.[^"']+)["']/gm),
      ...source.matchAll(/\bimport\(\s*["'](\.[^"']+)["']\s*\)/g),
    ];
    return specs.map((m) => m[1] ?? "");
  }

  /** The `.ts` source files reachable from `entry` the way the bundler follows them. */
  function reachable(entry: string): string[] {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const spec of relativeEdges(readFileSync(file, "utf8"))) {
        queue.push(resolve(dirname(file), spec.replace(/\.js$/, ".ts")));
      }
    }
    return [...seen];
  }

  /** Files reachable from `entry` that import the SDK as a value at the top level. */
  function sdkImporters(entry: string): string[] {
    return reachable(entry).filter((file) =>
      valueImports(readFileSync(file, "utf8")).some((s) => s === SDK || s.startsWith(`${SDK}/`)),
    );
  }

  for (const bin of ["cosyte", "cosyte-mcp"]) {
    it(`the ${bin} bin reaches the server, and no static SDK import`, () => {
      const entry = join(SRC, "bin", `${bin}.ts`);
      const files = reachable(entry);
      // The premise: the walk really follows the bin into the server's launcher and wiring.
      expect(files).toContain(join(SRC, "mcp", "launch.ts"));
      expect(files).toContain(join(SRC, "mcp", "wire.ts"));
      expect(files).toContain(join(SRC, "core", "parsers.ts"));
      expect(sdkImporters(entry)).toStrictEqual([]);
    });
  }

  it("the walk has teeth: the `./mcp` subpath entry does reach a static SDK import", () => {
    // `@cosyte/cli/mcp` is a library import, so it may need the SDK: and the guard must see that.
    expect(sdkImporters(join(SRC, "mcp", "index.ts"))).toStrictEqual([
      join(SRC, "mcp", "server.ts"),
    ]);
  });

  it("the edge detector follows a dynamic import, which the bundler inlines", () => {
    expect(relativeEdges('  import("../mcp/launch.js")\n    .then(() => 0);')).toStrictEqual([
      "../mcp/launch.js",
    ]);
    expect(relativeEdges('export { SERVER_INFO } from "./wire.js";')).toStrictEqual(["./wire.js"]);
    expect(valueImports('import type * as M from "@modelcontextprotocol/sdk/types.js";')).toEqual(
      [],
    );
  });
});
