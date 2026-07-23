import { describe, expect, it } from "vitest";

import { loadOptional } from "../src/core/parsers.js";
import { CliError } from "../src/core/diagnostics.js";
import { EXIT } from "../src/core/exit-codes.js";

/**
 * The graceful-degradation path for the six `optionalDependencies` breadth parsers (ADR 0025): if an
 * optional parser package is **absent**, the dynamic import is caught and mapped to a value-free
 * `CLI_PARSER_UNAVAILABLE` (exit `69`) — the CLI core never crashes on a missing optional parser.
 */
describe("loadOptional — an absent optional parser becomes a value-free CLI error (exit 69)", () => {
  const notFound = (msg: string, code?: string): Error => {
    const e = new Error(msg);
    if (code !== undefined) (e as NodeJS.ErrnoException).code = code;
    return e;
  };

  it("maps a Node ERR_MODULE_NOT_FOUND (by code) to CLI_PARSER_UNAVAILABLE / 69", async () => {
    const err = await loadOptional("x12", () =>
      Promise.reject(notFound("boom", "ERR_MODULE_NOT_FOUND")),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).code).toBe("CLI_PARSER_UNAVAILABLE");
    expect((err as CliError).exit).toBe(EXIT.UNAVAILABLE);
  });

  it("maps a resolver 'Cannot find package' message (no code) likewise", async () => {
    const err = await loadOptional("ccda", () =>
      Promise.reject(notFound("Cannot find package '@cosyte/ccda' imported from …")),
    ).catch((e: unknown) => e);
    expect((err as CliError).code).toBe("CLI_PARSER_UNAVAILABLE");
  });

  it("propagates an unrelated error unchanged (not every failure is 'unavailable')", async () => {
    await expect(
      loadOptional("astm", () => Promise.reject(new Error("a real parser bug"))),
    ).rejects.toThrow("a real parser bug");
  });

  it("passes a successful import straight through", async () => {
    const mod = await loadOptional("x12", () => Promise.resolve({ ok: true }));
    expect(mod).toStrictEqual({ ok: true });
  });
});
