import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMcpServer, SERVER_INFO } from "../src/mcp/server.js";

/**
 * Integration test for the MCP stdio adapter (`src/mcp/server.ts`), driven over the SDK's in-process
 * transport (cli roadmap §6 "MCP tool tests"). A real {@link Client} connects to the server through a
 * linked in-memory transport pair, lists the tools, and calls them — exercising the ListTools and
 * CallTool handlers the same way an LLM client would, without spawning a subprocess.
 */
describe("cosyte MCP server — in-process client/server", () => {
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
});
