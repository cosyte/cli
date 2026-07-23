import { describe, expect, it } from "vitest";

import type { RunDeps } from "../src/core/io.js";
import { dispatchTool, TOOL_DEFS } from "../src/mcp/tools.js";

/**
 * Unit tests for the SDK-free MCP tool surface (`src/mcp/tools.ts`). The tools are the *second adapter*
 * over the same command core; these tests prove the dispatch/mapping without any `@modelcontextprotocol`
 * transport — the SDK wiring is covered separately in `mcp-server.test.ts`.
 */

// Synthetic, PHI-free fixtures (mirrors dispatch.test.ts).
const FHIR_PATIENT = '{"resourceType":"Patient","gender":"male"}';
const HL7_ADT =
  "MSH|^~\\&|A|B|C|D|20240101120000||ADT^A01|1|P|2.5\rEVN|A01|20240101120000\rPID|1||X^^^H^MR||DOE^JANE||19800101|F\r";

describe("TOOL_DEFS", () => {
  it("advertises the four wired tools, each with a required `content` input", () => {
    expect(TOOL_DEFS.map((t) => t.name)).toEqual(["parse", "validate", "inspect", "convert"]);
    for (const t of TOOL_DEFS) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.required).toContain("content");
      expect(t.description.length).toBeGreaterThan(0);
    }
  });
});

describe("dispatchTool — success paths (shared core, value-free)", () => {
  it("parse returns the typed model, ok=true, exit 0", async () => {
    const r = await dispatchTool("parse", { content: FHIR_PATIENT });
    expect(r.isError).toBe(false);
    expect(r.structuredContent).toEqual({ exit: 0, ok: true });
    expect(r.content[0]?.text).toContain('"fhir"');
  });

  it("parse honours an explicit --format override (the fmtFlag branch)", async () => {
    const r = await dispatchTool("parse", { content: HL7_ADT, format: "hl7" });
    expect(r.isError).toBe(false);
    expect(r.content[0]?.text).toContain('"hl7"');
  });

  it("validate carries a VALID verdict as a successful call (exit 0)", async () => {
    const r = await dispatchTool("validate", { content: FHIR_PATIENT });
    expect(r.isError).toBe(false);
    expect(r.structuredContent.ok).toBe(true);
    expect(r.content[0]?.text).toContain('"valid":true');
  });

  it("validate carries an INVALID verdict as a successful call (exit 1, not a tool error)", async () => {
    const r = await dispatchTool("validate", {
      content: '{"resourceType":"Patient","gender":"purple"}',
    });
    expect(r.isError).toBe(false); // the tool worked; the verdict is negative
    expect(r.structuredContent.exit).toBe(1);
    expect(r.content[0]?.text).toContain('"valid":false');
  });

  it("inspect returns a value-free structural summary", async () => {
    const r = await dispatchTool("inspect", { content: HL7_ADT });
    expect(r.isError).toBe(false);
    expect(r.content[0]?.text).toContain('"hl7"');
  });

  it("convert (HL7 v2 → FHIR) returns the Bundle, ok=true", async () => {
    const r = await dispatchTool("convert", { content: HL7_ADT });
    expect(r.isError).toBe(false);
    expect(r.content[0]?.text).toContain('"resourceType":"Bundle"');
  });
});

describe("dispatchTool — value-free error paths", () => {
  it("a missing `content` argument is a value-free usage error", async () => {
    const r = await dispatchTool("parse", {});
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toEqual({ exit: 2, ok: false });
    expect(r.content[0]?.text).toContain("CLI_USAGE");
  });

  it("a non-string `content` argument is a usage error (never coerced)", async () => {
    const r = await dispatchTool("parse", { content: 123 });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("CLI_USAGE");
  });

  it("an unknown tool name is a value-free usage error naming the tool, not the input", async () => {
    const r = await dispatchTool("frobnicate", { content: FHIR_PATIENT });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("unknown tool 'frobnicate'");
  });

  it("an unparseable input is a hard tool error (isError, exit 65) with a value-free code", async () => {
    const r = await dispatchTool("parse", { content: "this is not a healthcare message" });
    expect(r.isError).toBe(true);
    expect(r.structuredContent.exit).toBe(65);
    expect(r.content[0]?.text).toContain("CLI_FORMAT_UNDETECTED");
  });

  it("convert with an unsupported --to target is a hard tool error (usage), never a fake conversion", async () => {
    const r = await dispatchTool("convert", { content: HL7_ADT, to: "x12" });
    expect(r.isError).toBe(true);
    expect(r.structuredContent.ok).toBe(false);
  });
});

describe("dispatchTool — PHI posture (no value ever reaches a tool error)", () => {
  const SENTINEL = "ZZZSENTINELPHI";

  it("an invalid resource's value-free findings never echo a field value", async () => {
    const r = await dispatchTool("validate", {
      content: `{"resourceType":"Patient","gender":"purple","name":[{"family":"${SENTINEL}"}]}`,
    });
    // A negative verdict, reported with value-free findings (codes + FHIRPath only).
    expect(r.structuredContent.exit).toBe(1);
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
  });

  it("a hard parse error never echoes the offending input (no unsafe door on the agent surface)", async () => {
    const r = await dispatchTool("parse", { content: `garbage ${SENTINEL} bytes` });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
  });

  it("an unexpected exception is scrubbed to a value-free CLI_INTERNAL (never surfaced to the client)", async () => {
    // Mirror of the terminal dispatcher boundary: a non-CliError throw from a command must not reach
    // the SDK (which surfaces the raw message). Inject a dep that throws a value-bearing error.
    const boom: RunDeps = {
      readFile: () => Promise.reject(new Error(`SECRET ${SENTINEL} IN MESSAGE`)),
      readStdin: () => Promise.reject(new Error(`SECRET ${SENTINEL} IN MESSAGE`)),
    };
    const r = await dispatchTool("parse", { content: "anything" }, boom);
    expect(r.isError).toBe(true);
    expect(r.structuredContent.exit).toBe(70);
    expect(r.content[0]?.text).toContain("CLI_INTERNAL");
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
  });
});
