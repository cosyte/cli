import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMcpServer, SERVER_INFO } from "../src/mcp/server.js";
import { CLI_CODES } from "../src/core/diagnostics.js";
import { EXIT } from "../src/core/exit-codes.js";
import { TOOL_DEFS, type McpToolDef } from "../src/mcp/tools.js";
import { assertConforms } from "./helpers/schema-conformance.js";

/**
 * Integration test for the MCP stdio adapter (`src/mcp/server.ts`), driven over the SDK's in-process
 * transport. A real {@link Client} connects to the server through a linked in-memory transport pair,
 * lists the tools, and calls them: exercising the ListTools and CallTool handlers the same way an LLM
 * client would, without spawning a subprocess.
 *
 * Both handlers copy fields by an explicit allow-list, so this is the suite that proves the published
 * output schema and the whole structured result actually reach the wire rather than stopping at
 * `tools.ts`. Where a test calls `listTools()` before `callTool()`, the SDK client also validates the
 * reply against the advertised schema itself, so the server is checked by the protocol's own client
 * as well as by this repo's checker.
 */
describe("cosyte MCP server, in-process client/server", () => {
  let client: Client;
  let closeAll: () => Promise<void>;

  beforeEach(async () => {
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    closeAll = async () => {
      await client.close();
      await server.close();
    };
  });

  afterEach(async () => {
    await closeAll();
  });

  it("advertises the identity and the four wired tools over tools/list", async () => {
    expect(SERVER_INFO.name).toBe("cosyte");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["convert", "inspect", "parse", "validate"]);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("advertises an output schema and a title for EVERY tool; none lacks one", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(TOOL_DEFS.length);
    for (const t of tools) {
      expect(t.title, `${t.name} carries a title`).toBeTruthy();
      expect(t.outputSchema, `${t.name} carries an output schema`).toBeDefined();
      expect(t.outputSchema?.type, `${t.name} output schema root type`).toBe("object");
      expect(Object.keys(t.outputSchema?.properties ?? {}).sort()).toEqual([
        "code",
        "data",
        "exit",
        "ok",
        "status",
      ]);
      expect(t.outputSchema?.required).toEqual(["ok", "status", "exit"]);
    }
    // The advertised schema is the declared one, not a truncated copy made by the handler.
    for (const def of TOOL_DEFS) {
      const wire = tools.find((t) => t.name === def.name);
      expect(wire?.outputSchema).toEqual(def.outputSchema);
    }
  });

  it("parse over tools/call returns the typed model and is not an error", async () => {
    const res = await client.callTool({
      name: "parse",
      arguments: { content: '{"resourceType":"Patient","gender":"male"}' },
    });
    expect(res.isError).toBeFalsy();
    const content = res.content as { type: string; text: string }[];
    expect(content[0]?.text).toContain('"fhir"');
  });

  it("convert over tools/call returns a FHIR Bundle from an HL7 v2 message", async () => {
    const res = await client.callTool({
      name: "convert",
      arguments: {
        content:
          "MSH|^~\\&|A|B|C|D|20240101120000||ADT^A01|1|P|2.5\rEVN|A01|20240101120000\rPID|1||X^^^H^MR||DOE^JANE||19800101|F\r",
      },
    });
    expect(res.isError).toBeFalsy();
    const content = res.content as { type: string; text: string }[];
    expect(content[0]?.text).toContain('"resourceType":"Bundle"');
  });

  it("an unparseable input surfaces as a value-free tool error", async () => {
    const res = await client.callTool({
      name: "parse",
      arguments: { content: "definitely not a healthcare message" },
    });
    expect(res.isError).toBe(true);
    const content = res.content as { type: string; text: string }[];
    expect(content[0]?.text).toContain("CLI_FORMAT_UNDETECTED");
  });

  it("every tool's reply over the wire conforms to that tool's advertised schema", async () => {
    const HL7 =
      "MSH|^~\\&|A|B|C|D|20240101120000||ADT^A01|1|P|2.5\rEVN|A01|20240101120000\rPID|1||X^^^H^MR||DOE^JANE||19800101|F\r";
    const cases: { tool: string; label: string; args: Record<string, unknown> }[] = [
      { tool: "parse", label: "success", args: { content: '{"resourceType":"Patient"}' } },
      { tool: "parse", label: "hard failure", args: { content: "not a healthcare message" } },
      { tool: "validate", label: "success", args: { content: '{"resourceType":"Patient"}' } },
      {
        tool: "validate",
        label: "negative verdict",
        args: { content: '{"resourceType":"Patient","gender":"purple"}' },
      },
      { tool: "validate", label: "hard failure", args: { content: "" } },
      { tool: "inspect", label: "success", args: { content: HL7 } },
      { tool: "inspect", label: "hard failure", args: { content: "" } },
      { tool: "convert", label: "success", args: { content: HL7 } },
      { tool: "convert", label: "hard failure", args: { content: HL7, to: "x12" } },
    ];

    // listTools() first: it is what caches the SDK client's own validator for each advertised
    // schema, so every callTool below is validated by the protocol client as well as here.
    const { tools } = await client.listTools();
    for (const c of cases) {
      const res = await client.callTool({ name: c.tool, arguments: c.args });
      const schema = tools.find((t) => t.name === c.tool)?.outputSchema;
      assertConforms(schema, res.structuredContent, `${c.tool}/${c.label} over the wire`);
      // The text block is the serialization of that same structured value.
      const content = res.content as { type: string; text: string }[];
      expect(content, `${c.tool}/${c.label}: one text block`).toHaveLength(1);
      expect(JSON.parse(content[0]?.text ?? ""), `${c.tool}/${c.label}`).toStrictEqual(
        res.structuredContent,
      );
    }
  });

  it("ignores an input property the tool's schema does not declare (the server does not enforce it)", async () => {
    const hl7 =
      "MSH|^~\\&|A|B|C|D|20240101120000||ADT^A01|1|P|2.5\rEVN|A01|20240101120000\rPID|1||X^^^H^MR||DOE^JANE||19800101|F\r";
    for (const [name, declared, extra] of [
      ["parse", { content: hl7 }, { bogus: 1 }],
      // `convert` declares no `format`: one sent anyway changes nothing.
      ["convert", { content: hl7 }, { format: "fhir" }],
    ] as const) {
      const def = TOOL_DEFS.find((t) => t.name === name);
      expect(def?.inputSchema.additionalProperties, name).toBe(false);
      for (const key of Object.keys(extra)) {
        expect(Object.keys(def?.inputSchema.properties ?? {}), name).not.toContain(key);
      }
      const plain = await client.callTool({ name, arguments: declared });
      const withExtra = await client.callTool({ name, arguments: { ...declared, ...extra } });
      expect(withExtra.isError, name).toBeFalsy();
      expect(withExtra.structuredContent, name).toMatchObject({ ok: true, status: "success" });
      // A converted Bundle mints a fresh `urn:uuid:` per entry on every call, so those are masked.
      const masked = (v: unknown): string =>
        JSON.stringify(v).replace(/urn:uuid:[0-9a-f-]{36}/g, "urn:uuid:*");
      expect(masked(withExtra.structuredContent), name).toBe(masked(plain.structuredContent));
    }
  });

  it("a tools/call with no arguments object is a value-free usage error, not a crash", async () => {
    const res = await client.callTool({ name: "parse" });
    expect(res.isError).toBe(true);
    expect(res.structuredContent).toStrictEqual({
      ok: false,
      status: "failed",
      exit: EXIT.USAGE,
      code: CLI_CODES.CLI_USAGE,
    });
  });

  it("an input schema that leaves out `required` and `additionalProperties` is advertised without them", async () => {
    // TOOL_DEFS is an exported array, and the input schema's type declares both keys optional. A
    // definition without them must reach the wire without them, never as keys set to undefined.
    const parse = TOOL_DEFS.find((t) => t.name === "parse");
    if (parse === undefined) throw new Error("no advertised parse tool");
    const bare: McpToolDef = {
      ...parse,
      name: "bare",
      inputSchema: { type: "object", properties: { content: { type: "string" } } },
    };
    const defs = TOOL_DEFS as McpToolDef[];
    defs.push(bare);
    try {
      const { tools } = await client.listTools();
      const wire = tools.find((t) => t.name === "bare");
      expect(wire?.inputSchema).toStrictEqual({
        type: "object",
        properties: { content: { type: "string" } },
      });
      expect(Object.keys(wire?.inputSchema ?? {})).not.toContain("required");
    } finally {
      defs.splice(defs.indexOf(bare), 1);
    }
  });

  it("passes the WHOLE structured result to the wire, payload included", async () => {
    await client.listTools();
    const res = await client.callTool({
      name: "validate",
      arguments: { content: '{"resourceType":"Patient","gender":"purple"}' },
    });
    // Not truncated to the outcome fields: the verdict an agent came for is still reachable.
    expect(res.structuredContent).toMatchObject({
      ok: true,
      status: "verdict",
      exit: 1,
      data: { format: "fhir", valid: false },
    });
  });
});
