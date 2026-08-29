import { describe, expect, it } from "vitest";

import type { RunDeps } from "../src/core/io.js";
import { CLI_CODES } from "../src/core/diagnostics.js";
import { EXIT } from "../src/core/exit-codes.js";
import { dispatchTool, TOOL_DEFS, type McpToolResult } from "../src/mcp/tools.js";
import { assertConforms, schemaViolations } from "./helpers/schema-conformance.js";

/**
 * Unit tests for the SDK-free MCP tool surface (`src/mcp/tools.ts`). The tools are the *second adapter*
 * over the same command core; these tests prove the dispatch/mapping without any `@modelcontextprotocol`
 * transport: the SDK wiring is covered separately in `mcp-server.test.ts`.
 *
 * The published contract is checked here in three layers: every emitted structured value is validated
 * against **its own tool's** declared `outputSchema` (with a dependency-free checker, proved able to
 * fail), the text content block is proved to be the serialization of that same structured value, and
 * the value-free posture is asserted over the whole serialized result on every failure path.
 */

// Synthetic, PHI-free fixtures (mirrors dispatch.test.ts).
const FHIR_PATIENT = '{"resourceType":"Patient","gender":"male"}';
const HL7_ADT =
  "MSH|^~\\&|A|B|C|D|20240101120000||ADT^A01|1|P|2.5\rEVN|A01|20240101120000\rPID|1||X^^^H^MR||DOE^JANE||19800101|F\r";
/** One MLLP frame around the HL7 message (VT opens it, FS + CR close it): a multi-record `parse` input. */
const MLLP_ONE_FRAME =
  String.fromCharCode(0x0b) + HL7_ADT + String.fromCharCode(0x1c) + String.fromCharCode(0x0d);
const MLLP_TWO_FRAMES = MLLP_ONE_FRAME + MLLP_ONE_FRAME;

/** The declared output schema of one advertised tool, by name. */
function outputSchemaOf(tool: string): unknown {
  const def = TOOL_DEFS.find((t) => t.name === tool);
  if (def === undefined) throw new Error(`no advertised tool named '${tool}'`);
  return def.outputSchema;
}

/** Narrow a `parse` payload to its record stream, without a cast. */
function recordsOf(data: unknown): readonly unknown[] {
  if (
    typeof data === "object" &&
    data !== null &&
    "records" in data &&
    Array.isArray(data.records)
  ) {
    return data.records;
  }
  throw new Error("expected a record-stream payload carrying `records`");
}

/**
 * The one assertion every dispatch case runs: the structured content conforms to the called tool's
 * OWN declared schema, and the text content block is the serialization of that same value.
 */
function assertPublishedContract(tool: string, r: McpToolResult, label: string): void {
  assertConforms(outputSchemaOf(tool), r.structuredContent, label);
  expect(r.content, `${label}: exactly one text content block`).toHaveLength(1);
  expect(r.content[0]?.type).toBe("text");
  expect(JSON.parse(r.content[0]?.text ?? ""), `${label}: text block round trip`).toStrictEqual(
    r.structuredContent,
  );
}

describe("TOOL_DEFS", () => {
  it("advertises the four wired tools, each with a required `content` input", () => {
    expect(TOOL_DEFS.map((t) => t.name)).toEqual(["parse", "validate", "inspect", "convert"]);
    for (const t of TOOL_DEFS) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.required).toContain("content");
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it("declares an output schema and a title for every advertised tool (none lacks one)", () => {
    for (const t of TOOL_DEFS) {
      expect(t.title.length, `${t.name} has a title`).toBeGreaterThan(0);
      expect(t.outputSchema.type, `${t.name} output schema root type`).toBe("object");
      // Every tool's result carries the same branchable outcome properties.
      expect([...t.outputSchema.required].sort()).toEqual(["exit", "ok", "status"]);
      expect(t.outputSchema.additionalProperties).toBe(false);
      expect(Object.keys(t.outputSchema.properties).sort()).toEqual([
        "code",
        "data",
        "exit",
        "ok",
        "status",
      ]);
    }
  });

  it("gives each tool its OWN payload schema (not one schema shared under four names)", () => {
    const payloads = TOOL_DEFS.map((t) => JSON.stringify(t.outputSchema.properties["data"]));
    expect(new Set(payloads).size).toBe(TOOL_DEFS.length);
  });

  it("does NOT advertise redact/deid: wiring it terminal-side does not put it on the agent surface", () => {
    // The de-identification command is deliberately terminal-only. An agent that could call it would
    // be handed a document the CLI asserts nothing about, over a channel with no human in it.
    const names = TOOL_DEFS.map((t) => t.name);
    expect(names).not.toContain("redact");
    expect(names).not.toContain("deid");
    for (const t of TOOL_DEFS) {
      expect(t.description).not.toMatch(/redact|de-identif/i);
    }
  });

  it("`redact` is an unknown tool name, answered value-free", async () => {
    for (const name of ["redact", "deid"]) {
      const r = await dispatchTool(name, { content: HL7_ADT });
      expect(r.isError).toBe(true);
      expect(r.structuredContent.ok).toBe(false);
      expect(r.structuredContent.status).toBe("failed");
      expect(r.structuredContent.code).toBe(CLI_CODES.CLI_USAGE);
      // Value-free now reaches the tool name too: the result says the call failed and why, without
      // repeating any of what the caller sent.
      expect(JSON.stringify(r)).not.toContain(name);
      for (const t of TOOL_DEFS) assertPublishedContract(t.name, r, `${name} vs ${t.name}`);
    }
  });
});

describe("schema conformance checker (the dependency-free validator itself)", () => {
  const SCHEMA = {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      status: { type: "string", enum: ["success", "failed"] },
      exit: { type: "integer" },
    },
    required: ["ok", "status", "exit"],
    additionalProperties: false,
  };
  const VALID = { ok: true, status: "success", exit: 0 };

  it("passes a conforming value", () => {
    expect(schemaViolations(SCHEMA, VALID)).toEqual([]);
  });

  it("says NO to a deliberately corrupted value, one way per declared constraint", () => {
    // A required property removed.
    expect(schemaViolations(SCHEMA, { status: "success", exit: 0 })).toHaveLength(1);
    // A declared type violated.
    expect(schemaViolations(SCHEMA, { ...VALID, exit: "0" })).toHaveLength(1);
    // A declared enum violated.
    expect(schemaViolations(SCHEMA, { ...VALID, status: "not-a-status" })).toHaveLength(1);
    // An undeclared property, with additionalProperties: false.
    expect(schemaViolations(SCHEMA, { ...VALID, surprise: 1 })).toHaveLength(1);
    // The root itself the wrong type.
    expect(schemaViolations(SCHEMA, [])).toHaveLength(1);
  });

  it("REFUSES a schema keyword or type it does not implement (never a silent pass)", () => {
    expect(() => schemaViolations({ type: "object", patternProperties: {} }, {})).toThrow(
      /unimplemented JSON-Schema keyword 'patternProperties'/,
    );
    expect(() => schemaViolations({ type: "tuple" }, [])).toThrow(
      /unimplemented JSON-Schema type 'tuple'/,
    );
  });

  it("names the path and the expectation in a violation, never the value at that path", () => {
    const secret = "ZZZNEVERPRINTED";
    const violations = schemaViolations(SCHEMA, { ...VALID, status: secret });
    expect(violations).toHaveLength(1);
    expect(violations.join("\n")).not.toContain(secret);
    expect(violations[0]).toContain("$.status");
  });

  it("does not mistake an inherited property for a declared or a present one", () => {
    expect(schemaViolations({ type: "object", required: ["toString"] }, {})).toHaveLength(1);
    expect(
      schemaViolations(
        { type: "object", properties: {}, additionalProperties: false },
        { constructor: 1 },
      ),
    ).toHaveLength(1);
  });
});

describe("dispatchTool: success paths (shared core, value-free)", () => {
  it("parse returns the typed model, ok=true, exit 0, conforming to parse's schema", async () => {
    const r = await dispatchTool("parse", { content: FHIR_PATIENT });
    expect(r.isError).toBe(false);
    expect(r.structuredContent.ok).toBe(true);
    expect(r.structuredContent.status).toBe("success");
    expect(r.structuredContent.exit).toBe(EXIT.OK);
    expect(r.structuredContent.code).toBeUndefined();
    // The data an agent gets today is still there, now under a declared property.
    expect(r.structuredContent.data).toMatchObject({ format: "fhir" });
    expect(r.content[0]?.text).toContain('"fhir"');
    assertPublishedContract("parse", r, "parse/success");
  });

  it("parse honours an explicit --format override (the fmtFlag branch)", async () => {
    const r = await dispatchTool("parse", { content: HL7_ADT, format: "hl7" });
    expect(r.isError).toBe(false);
    expect(r.content[0]?.text).toContain('"hl7"');
    assertPublishedContract("parse", r, "parse/format-override");
  });

  it("parse of a multi-record (MLLP) input carries the record stream, still conforming", async () => {
    for (const [label, content, count] of [
      ["one frame", MLLP_ONE_FRAME, 1],
      ["two frames", MLLP_TWO_FRAMES, 2],
    ] as const) {
      const r = await dispatchTool("parse", { content });
      expect(r.isError, label).toBe(false);
      expect(recordsOf(r.structuredContent.data), label).toHaveLength(count);
      assertPublishedContract("parse", r, `parse/mllp ${label}`);
    }
  });

  it("validate carries a VALID verdict as a successful call (exit 0)", async () => {
    const r = await dispatchTool("validate", { content: FHIR_PATIENT });
    expect(r.isError).toBe(false);
    expect(r.structuredContent.ok).toBe(true);
    expect(r.structuredContent.status).toBe("success");
    expect(r.structuredContent.data).toMatchObject({ valid: true });
    expect(r.content[0]?.text).toContain('"valid":true');
    assertPublishedContract("validate", r, "validate/valid");
  });

  it("validate carries an INVALID verdict as a successful call (exit 1, not a tool error)", async () => {
    const r = await dispatchTool("validate", {
      content: '{"resourceType":"Patient","gender":"purple"}',
    });
    expect(r.isError).toBe(false); // the tool worked; the verdict is negative
    expect(r.structuredContent.ok).toBe(true);
    expect(r.structuredContent.status).toBe("verdict");
    expect(r.structuredContent.exit).toBe(EXIT.INVALID);
    expect(r.structuredContent.data).toMatchObject({ valid: false });
    expect(r.content[0]?.text).toContain('"valid":false');
    assertPublishedContract("validate", r, "validate/invalid");
  });

  it("inspect returns a value-free structural summary", async () => {
    for (const [format, content] of [
      ["hl7", HL7_ADT],
      ["fhir", FHIR_PATIENT],
    ] as const) {
      const r = await dispatchTool("inspect", { content });
      expect(r.isError, format).toBe(false);
      expect(r.structuredContent.data, format).toMatchObject({ format });
      expect(r.content[0]?.text, format).toContain(`"${format}"`);
      assertPublishedContract("inspect", r, `inspect/${format}`);
    }
  });

  it("convert (HL7 v2 to FHIR) returns the Bundle, ok=true", async () => {
    const r = await dispatchTool("convert", { content: HL7_ADT });
    expect(r.isError).toBe(false);
    expect(r.structuredContent.status).toBe("success");
    expect(r.structuredContent.data).toMatchObject({ format: "fhir" });
    expect(r.content[0]?.text).toContain('"resourceType":"Bundle"');
    assertPublishedContract("convert", r, "convert/success");
  });
});

describe("dispatchTool: value-free error paths", () => {
  it("a missing `content` argument is a value-free usage error", async () => {
    const r = await dispatchTool("parse", {});
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toStrictEqual({
      ok: false,
      status: "failed",
      exit: EXIT.USAGE,
      code: CLI_CODES.CLI_USAGE,
    });
    expect(r.content[0]?.text).toContain("CLI_USAGE");
    assertPublishedContract("parse", r, "parse/missing-content");
  });

  it("a non-string `content` argument is a usage error (never coerced)", async () => {
    const r = await dispatchTool("parse", { content: 123 });
    expect(r.isError).toBe(true);
    expect(r.structuredContent.status).toBe("failed");
    expect(r.structuredContent.code).toBe(CLI_CODES.CLI_USAGE);
    expect(r.structuredContent.data).toBeUndefined();
    assertPublishedContract("parse", r, "parse/non-string-content");
  });

  it("an EMPTY `content` string is a failed call, never a successful parse of nothing", async () => {
    for (const tool of ["parse", "validate", "inspect", "convert"]) {
      const r = await dispatchTool(tool, { content: "" });
      expect(r.isError, tool).toBe(true);
      expect(r.structuredContent.ok, tool).toBe(false);
      expect(r.structuredContent.status, tool).toBe("failed");
      expect(r.structuredContent.data, tool).toBeUndefined();
      expect(r.structuredContent.code, tool).toBe(CLI_CODES.CLI_EMPTY_INPUT);
      expect(r.structuredContent.exit, tool).toBe(EXIT.DATAERR);
      assertPublishedContract(tool, r, `${tool}/empty-content`);
    }
  });

  it("an unknown tool name is a failed call that does not echo the caller's tool name", async () => {
    const r = await dispatchTool("frobnicate", { content: FHIR_PATIENT });
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toStrictEqual({
      ok: false,
      status: "failed",
      exit: EXIT.USAGE,
      code: CLI_CODES.CLI_USAGE,
    });
    // The tool name is caller-supplied text: it must not come back on any channel.
    expect(JSON.stringify(r)).not.toContain("frobnicate");
    // The shared outcome fields are declared by every tool's schema, so an unroutable call still
    // conforms to whichever tool schema a client reaches for.
    for (const t of TOOL_DEFS) assertPublishedContract(t.name, r, `unknown-tool vs ${t.name}`);
  });

  it("an unparseable input is a hard tool error (isError, exit 65) with a value-free code", async () => {
    const r = await dispatchTool("parse", { content: "this is not a healthcare message" });
    expect(r.isError).toBe(true);
    expect(r.structuredContent.status).toBe("failed");
    expect(r.structuredContent.exit).toBe(EXIT.DATAERR);
    expect(r.structuredContent.code).toBe(CLI_CODES.CLI_FORMAT_UNDETECTED);
    expect(r.structuredContent.data).toBeUndefined();
    expect(r.content[0]?.text).toContain("CLI_FORMAT_UNDETECTED");
    assertPublishedContract("parse", r, "parse/undetected");
  });

  it("an operation its parser does not support is a hard tool error carrying its own code", async () => {
    const r = await dispatchTool("parse", { content: FHIR_PATIENT, format: "dicom" });
    expect(r.isError).toBe(true);
    expect(r.structuredContent.status).toBe("failed");
    expect(r.structuredContent.code).toBe(CLI_CODES.CLI_FORMAT_UNSUPPORTED);
    assertPublishedContract("parse", r, "parse/unsupported-op");
  });

  it("convert with an unsupported --to target is a hard tool error (usage), never a fake conversion", async () => {
    const r = await dispatchTool("convert", { content: HL7_ADT, to: "x12" });
    expect(r.isError).toBe(true);
    expect(r.structuredContent.ok).toBe(false);
    expect(r.structuredContent.status).toBe("failed");
    expect(r.structuredContent.code).toBe(CLI_CODES.CLI_USAGE);
    expect(r.structuredContent.data).toBeUndefined();
    // The rejected target is a caller argument: it must not reach the result.
    expect(JSON.stringify(r)).not.toContain("x12");
    assertPublishedContract("convert", r, "convert/bad-target");
  });
});

describe("dispatchTool: PHI posture (no value ever reaches a tool error)", () => {
  const SENTINEL = "ZZZSENTINELPHI";
  /** Every value a failed call's structured result may carry, as fixed sets a value cannot join. */
  const ENUMERATED = new Set<unknown>([
    ...Object.values(CLI_CODES),
    ...Object.values(EXIT),
    "success",
    "verdict",
    "failed",
    true,
    false,
  ]);

  it("an invalid resource's value-free findings never echo a field value", async () => {
    const r = await dispatchTool("validate", {
      content: `{"resourceType":"Patient","gender":"purple","name":[{"family":"${SENTINEL}"}]}`,
    });
    // A negative verdict, reported with value-free findings (codes + FHIRPath only).
    expect(r.structuredContent.exit).toBe(EXIT.INVALID);
    expect(r.structuredContent.status).toBe("verdict");
    expect(r.structuredContent.ok).toBe(true);
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
    expect(JSON.stringify(r.structuredContent)).not.toContain(SENTINEL);
    assertPublishedContract("validate", r, "validate/sentinel");
  });

  it("a negative verdict and a failed call differ in a declared, branchable property", async () => {
    const verdict = await dispatchTool("validate", {
      content: `{"resourceType":"Patient","gender":"purple","name":[{"family":"${SENTINEL}"}]}`,
    });
    const failed = await dispatchTool("parse", { content: `garbage ${SENTINEL} bytes` });
    // `status` and `ok` are declared properties of both tools' schemas; either settles it with no
    // text parsing at all.
    expect(verdict.structuredContent.status).toBe("verdict");
    expect(failed.structuredContent.status).toBe("failed");
    expect(verdict.structuredContent.ok).not.toBe(failed.structuredContent.ok);
    for (const r of [verdict, failed]) expect(JSON.stringify(r)).not.toContain(SENTINEL);
  });

  it("a hard parse error never echoes the offending input (no unsafe door on the agent surface)", async () => {
    const r = await dispatchTool("parse", { content: `garbage ${SENTINEL} bytes` });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
    assertPublishedContract("parse", r, "parse/sentinel");
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
    expect(r.structuredContent.exit).toBe(EXIT.SOFTWARE);
    expect(r.structuredContent.status).toBe("failed");
    expect(r.structuredContent.code).toBe(CLI_CODES.CLI_INTERNAL);
    expect(r.structuredContent.data).toBeUndefined();
    expect(r.content[0]?.text).toContain("CLI_INTERNAL");
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
    assertPublishedContract("parse", r, "parse/internal-error");
  });

  it("EVERY failed-call structured result is built only from enumerated, value-free tokens", async () => {
    const boom: RunDeps = {
      readFile: () => Promise.reject(new Error(`SECRET ${SENTINEL} IN MESSAGE`)),
      readStdin: () => Promise.reject(new Error(`SECRET ${SENTINEL} IN MESSAGE`)),
    };
    const failures: [string, McpToolResult][] = [
      ["missing content", await dispatchTool("parse", {})],
      ["non-string content", await dispatchTool("parse", { content: 1 })],
      ["unknown tool", await dispatchTool(`frobnicate-${SENTINEL}`, { content: FHIR_PATIENT })],
      ["empty content", await dispatchTool("validate", { content: "" })],
      ["unparseable", await dispatchTool("parse", { content: `garbage ${SENTINEL}` })],
      ["unsupported target", await dispatchTool("convert", { content: HL7_ADT, to: SENTINEL })],
      ["unsupported op", await dispatchTool("parse", { content: FHIR_PATIENT, format: "dicom" })],
      ["internal error", await dispatchTool("parse", { content: "anything" }, boom)],
    ];
    for (const [label, r] of failures) {
      const sc = r.structuredContent;
      expect(sc.status, label).toBe("failed");
      expect(sc.data, label).toBeUndefined();
      // Exactly these four properties, each drawn from a fixed set no input value can join.
      expect(Object.keys(sc).sort(), label).toEqual(["code", "exit", "ok", "status"]);
      expect(ENUMERATED.has(sc.ok), `${label}: ok`).toBe(true);
      expect(ENUMERATED.has(sc.status), `${label}: status`).toBe(true);
      expect(ENUMERATED.has(sc.exit), `${label}: exit`).toBe(true);
      expect(ENUMERATED.has(sc.code), `${label}: code`).toBe(true);
      expect(JSON.stringify(r), label).not.toContain(SENTINEL);
    }
  });
});
