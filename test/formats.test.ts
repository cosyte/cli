/**
 * CLI-6 — the six breadth formats (x12 / astm / ccda / dicom / ncpdp / mllp) across the command
 * surface, plus multi-message/NDJSON streaming and shell completion. These exercise the **wrapper**
 * (roadmap §5): does a supported (format, op) route to the right parser and shape output faithfully;
 * does an unsupported (format, op) fail value-free (never a fake); is every secondary surface value-free.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { run } from "../src/core/run.js";
import { EXIT } from "../src/core/exit-codes.js";
import type { RunDeps } from "../src/core/io.js";

const FIX = (name: string): Uint8Array =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

const enc = new TextEncoder();
const bytesDeps = (file: Uint8Array, stdin: Uint8Array = new Uint8Array()): RunDeps => ({
  readFile: () => Promise.resolve(file),
  readStdin: () => Promise.resolve(stdin),
});

const X12 = FIX("834.edi");
const ASTM = FIX("minimal.astm");
const NCPDP = FIX("newrx.xml");
const DICOM = FIX("sample.dcm");
const CCDA = enc.encode(
  `<?xml version="1.0"?><ClinicalDocument xmlns="urn:hl7-org:v3">` +
    `<templateId root="2.16.840.1.113883.10.20.22.1.2"/>` +
    `<code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>` +
    `<component><structuredBody><component><section>` +
    `<code code="48765-2" codeSystem="2.16.840.1.113883.6.1"/><title>Allergies</title>` +
    `</section></component></structuredBody></component></ClinicalDocument>`,
);

/** A VT/FS-framed MLLP frame wrapping the given HL7 payload text. */
const frame = (hl7: string): number[] => [0x0b, ...enc.encode(hl7), 0x1c, 0x0d];
const HL7_MSG = "MSH|^~\\&|A|B|C|D|20240101||ADT^A01|1|P|2.5\rPID|1||123^^^HOSP\r";
const MLLP = new Uint8Array([...frame(HL7_MSG), ...frame(HL7_MSG)]); // two frames

describe("x12 — parse / inspect / fmt / validate", () => {
  it("parse emits the interchange model + exit 0, value-free stderr", async () => {
    const r = await run(["parse", "f.edi"], bytesDeps(X12));
    expect(r.exit).toBe(EXIT.OK);
    const env = JSON.parse(r.stdout) as { format: string; model: { groups: unknown[] } };
    expect(env.format).toBe("x12");
    expect(env.model.groups.length).toBeGreaterThan(0);
  });

  it("inspect summarises transaction-set ids value-free (834)", async () => {
    const r = await run(["inspect", "f.edi", "--json"], bytesDeps(X12));
    expect(r.exit).toBe(EXIT.OK);
    const s = JSON.parse(r.stdout) as { format: string; transactionSetIds: Record<string, number> };
    expect(s.format).toBe("x12");
    expect(s.transactionSetIds["834"]).toBeGreaterThan(0);
  });

  it("fmt re-serializes via the library serializer", async () => {
    const r = await run(["fmt", "f.edi"], bytesDeps(X12));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout.startsWith("ISA")).toBe(true);
  });

  it("validate returns a verdict (exit 0/1, never a data error on parseable input)", async () => {
    const r = await run(["validate", "f.edi", "--json"], bytesDeps(X12));
    expect([EXIT.OK, EXIT.INVALID]).toContain(r.exit);
    const v = JSON.parse(r.stdout) as { format: string; valid: boolean };
    expect(v.format).toBe("x12");
  });
});

describe("astm — parse / inspect / fmt / validate", () => {
  it("parse emits the record model", async () => {
    const r = await run(["parse", "f.astm"], bytesDeps(ASTM));
    expect(r.exit).toBe(EXIT.OK);
    const env = JSON.parse(r.stdout) as { format: string; model: { records: unknown[] } };
    expect(env.format).toBe("astm");
    expect(env.model.records.length).toBeGreaterThan(0);
  });

  it("inspect summarises record types value-free", async () => {
    const r = await run(["inspect", "f.astm", "--json"], bytesDeps(ASTM));
    const s = JSON.parse(r.stdout) as { format: string; recordTypes: Record<string, number> };
    expect(s.format).toBe("astm");
    expect(s.recordTypes["H"]).toBe(1);
  });

  it("fmt round-trips through the record serializer", async () => {
    const r = await run(["fmt", "f.astm"], bytesDeps(ASTM));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout.startsWith("H")).toBe(true);
  });

  it("validate returns a verdict", async () => {
    const r = await run(["validate", "f.astm"], bytesDeps(ASTM));
    expect([EXIT.OK, EXIT.INVALID]).toContain(r.exit);
  });
});

describe("ccda — inspect / fmt / validate; parse is deferred (no library JSON model)", () => {
  it("inspect reports document type + section LOINC codes (value-free)", async () => {
    const r = await run(["inspect", "c.xml", "--json"], bytesDeps(CCDA));
    const s = JSON.parse(r.stdout) as { format: string; sectionCodes: string[] };
    expect(s.format).toBe("ccda");
    expect(s.sectionCodes).toContain("48765-2");
  });

  it("fmt re-serializes to XML", async () => {
    const r = await run(["fmt", "c.xml"], bytesDeps(CCDA));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toContain("ClinicalDocument");
  });

  it("validate returns a verdict", async () => {
    const r = await run(["validate", "c.xml"], bytesDeps(CCDA));
    expect([EXIT.OK, EXIT.INVALID]).toContain(r.exit);
  });

  it("parse is a value-free CLI_FORMAT_UNSUPPORTED, never a fake JSON model", async () => {
    const r = await run(["parse", "c.xml"], bytesDeps(CCDA));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain("CLI_FORMAT_UNSUPPORTED");
    expect(r.stdout).toBe("");
  });
});

describe("dicom — inspect / validate; parse & fmt deferred (binary model)", () => {
  it("inspect reports classification UIDs + element count (value-free)", async () => {
    const r = await run(["inspect", "s.dcm", "--json"], bytesDeps(DICOM));
    expect(r.exit).toBe(EXIT.OK);
    const s = JSON.parse(r.stdout) as { format: string; transferSyntaxUid: string | null };
    expect(s.format).toBe("dicom");
    expect(s.transferSyntaxUid).toBe("1.2.840.10008.1.2.1");
  });

  it("validate returns a verdict", async () => {
    const r = await run(["validate", "s.dcm"], bytesDeps(DICOM));
    expect([EXIT.OK, EXIT.INVALID]).toContain(r.exit);
  });

  it("parse and fmt are value-free CLI_FORMAT_UNSUPPORTED", async () => {
    for (const cmd of ["parse", "fmt"]) {
      const r = await run([cmd, "s.dcm"], bytesDeps(DICOM));
      expect(r.exit).toBe(EXIT.DATAERR);
      expect(r.stderr).toContain("CLI_FORMAT_UNSUPPORTED");
    }
  });
});

describe("ncpdp — parse / inspect / fmt / validate (SCRIPT)", () => {
  it("parse emits the SCRIPT model", async () => {
    const r = await run(["parse", "rx.xml"], bytesDeps(NCPDP));
    expect(r.exit).toBe(EXIT.OK);
    const env = JSON.parse(r.stdout) as { format: string };
    expect(env.format).toBe("ncpdp");
  });

  it("inspect reports the SCRIPT message type value-free", async () => {
    const r = await run(["inspect", "rx.xml", "--json"], bytesDeps(NCPDP));
    const s = JSON.parse(r.stdout) as { format: string; standard: string; messageType: string };
    expect(s.standard).toBe("SCRIPT");
    expect(s.messageType).toBe("NewRx");
  });

  it("fmt re-serializes SCRIPT XML", async () => {
    const r = await run(["fmt", "rx.xml"], bytesDeps(NCPDP));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).toContain("Message");
  });

  it("validate returns a verdict", async () => {
    const r = await run(["validate", "rx.xml"], bytesDeps(NCPDP));
    expect([EXIT.OK, EXIT.INVALID]).toContain(r.exit);
  });
});

describe("mllp — de-framed to HL7, multi-frame is the streaming surface", () => {
  it("parse de-frames every frame → NDJSON records (one per frame)", async () => {
    const r = await run(["parse", "s.mllp"], bytesDeps(MLLP));
    expect(r.exit).toBe(EXIT.OK);
    const lines = r.stdout.trim().split("\n");
    expect(lines).toHaveLength(2);
    const rec0 = JSON.parse(String(lines[0])) as { record: number; format: string };
    expect(rec0.record).toBe(0);
    expect(rec0.format).toBe("hl7");
    expect(r.stderr).toContain("[mllp]");
  });

  it("inspect reports the frame count (value-free)", async () => {
    const r = await run(["inspect", "s.mllp", "--json"], bytesDeps(MLLP));
    const s = JSON.parse(r.stdout) as { format: string; frameCount: number };
    expect(s.format).toBe("mllp");
    expect(s.frameCount).toBe(2);
  });

  it("fmt is a value-free CLI_FORMAT_UNSUPPORTED", async () => {
    const r = await run(["fmt", "s.mllp"], bytesDeps(MLLP));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain("CLI_FORMAT_UNSUPPORTED");
  });

  it("an MLLP stream with no complete frame is a data error, never a silent success", async () => {
    const r = await run(
      ["parse", "-", "--format", "mllp"],
      bytesDeps(new Uint8Array(), new Uint8Array([0x0b, 0x4d])),
    );
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain("CLI_PARSE_FAILED");
  });
});

describe("streaming — --ndjson multi-record parse with per-record isolation", () => {
  const A = '{"resourceType":"Patient","id":"a"}';
  const B = '{"resourceType":"Observation","id":"b","status":"final","code":{}}';

  it("parses each non-empty line as a record → NDJSON out, exit 0", async () => {
    const r = await run(["parse", "f.ndjson", "--ndjson"], bytesDeps(enc.encode(`${A}\n${B}\n`)));
    expect(r.exit).toBe(EXIT.OK);
    const lines = r.stdout.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect((JSON.parse(String(lines[1])) as { record: number }).record).toBe(1);
    expect(r.stderr).toContain("[ndjson]");
  });

  it("isolates a failing record (value-free error line) and exits 65", async () => {
    const bad = "this is not json";
    const r = await run(
      ["parse", "f.ndjson", "--ndjson", "--format", "fhir"],
      bytesDeps(enc.encode(`${A}\n${bad}\n`)),
    );
    expect(r.exit).toBe(EXIT.DATAERR);
    const lines = r.stdout.trim().split("\n");
    const rec1 = JSON.parse(String(lines[1])) as {
      record: number;
      error?: string;
      model?: unknown;
    };
    expect(rec1.error).toBeDefined();
    expect(rec1.model).toBeUndefined();
    // The offending bytes never appear on stderr.
    expect(r.stderr).not.toContain("not json");
  });
});

describe("inspect — the human (non-JSON) render for every breadth format", () => {
  const cases: { name: string; bytes: Uint8Array; needles: string[] }[] = [
    { name: "x12", bytes: X12, needles: ["format:", "groups:", "transaction sets:", "834"] },
    { name: "astm", bytes: ASTM, needles: ["format:", "message kind:", "records:"] },
    {
      name: "ccda",
      bytes: CCDA,
      needles: ["format:", "document type:", "section codes:", "48765-2"],
    },
    { name: "dicom", bytes: DICOM, needles: ["format:", "sop class uid:", "elements:"] },
    { name: "ncpdp", bytes: NCPDP, needles: ["format:", "SCRIPT", "message type:", "NewRx"] },
    { name: "mllp", bytes: MLLP, needles: ["format:", "frames:"] },
  ];
  for (const c of cases) {
    it(`renders ${c.name} as value-free text`, async () => {
      const r = await run(["inspect", `f.${c.name}`], bytesDeps(c.bytes));
      expect(r.exit).toBe(EXIT.OK);
      for (const n of c.needles) expect(r.stdout).toContain(n);
    });
  }
});

describe("streaming — per-record isolation + quiet on multi-record", () => {
  it("an MLLP stream with one unparseable frame isolates it and exits 65", async () => {
    const stream = new Uint8Array([...frame(HL7_MSG), ...frame("NOT AN HL7 MESSAGE")]);
    const r = await run(["parse", "s.mllp"], bytesDeps(stream));
    expect(r.exit).toBe(EXIT.DATAERR);
    const lines = r.stdout.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect((JSON.parse(String(lines[0])) as { model?: unknown }).model).toBeDefined();
    expect((JSON.parse(String(lines[1])) as { error?: string }).error).toBeDefined();
    expect(r.stderr).not.toContain("NOT AN HL7");
  });

  it("--quiet suppresses the multi-record stderr summary", async () => {
    const r = await run(["parse", "s.mllp", "--quiet"], bytesDeps(MLLP));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stderr).toBe("");
  });

  it("a truncated trailing MLLP frame is a data error (65), never a silent-dropped message", async () => {
    // One complete frame, then a VT that opens a second message with no closing FS/CR — the streaming
    // de-framer would buffer and silently drop it. It must be a value-free data error, not exit 0.
    const truncated = new Uint8Array([...frame(HL7_MSG), 0x0b, ...enc.encode("MSH|^~\\&|C|D\r")]);
    const r = await run(["parse", "s.mllp"], bytesDeps(truncated));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain("CLI_PARSE_FAILED");
    expect(r.stdout).toBe("");
  });

  it("inspect rejects a truncated MLLP stream too (never a fake frame count + exit 0)", async () => {
    const truncated = new Uint8Array([...frame(HL7_MSG), 0x0b, ...enc.encode("MSH|^~\\&|C")]);
    const r = await run(["inspect", "s.mllp"], bytesDeps(truncated));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain("CLI_PARSE_FAILED");
  });

  it("a malformed MLLP frame (FS without CR) is a value-free data error, no partial emit", async () => {
    // VT + MSH + FS but no trailing CR → the de-framer rejects the stream (strict framing).
    const bad = new Uint8Array([0x0b, 0x4d, 0x53, 0x48, 0x1c, 0x0b, 0x4d, 0x53, 0x48, 0x1c, 0x0d]);
    const r = await run(["parse", "s.mllp"], bytesDeps(bad));
    expect(r.exit).toBe(EXIT.DATAERR);
    expect(r.stderr).toContain("CLI_PARSE_FAILED");
    expect(r.stdout).toBe("");
  });
});

describe("inspect is value-free for the PHI-bearing breadth formats", () => {
  it("ncpdp inspect never leaks the patient/prescriber name onto stdout", async () => {
    const r = await run(["inspect", "rx.xml"], bytesDeps(NCPDP));
    expect(r.exit).toBe(EXIT.OK);
    for (const name of ["Testpatient", "Avery", "Testprescriber", "Jordan"]) {
      expect(r.stdout).not.toContain(name);
      expect(r.stderr).not.toContain(name);
    }
    // But it DID classify the message (so the test is not vacuous).
    expect(r.stdout).toContain("NewRx");
  });

  it("dicom inspect never leaks the patient name onto stdout", async () => {
    const r = await run(["inspect", "s.dcm"], bytesDeps(DICOM));
    expect(r.exit).toBe(EXIT.OK);
    expect(r.stdout).not.toContain("DOE");
    expect(r.stdout).not.toContain("JANE");
    // But it DID surface the classification UID.
    expect(r.stdout).toContain("1.2.840.10008");
  });
});

describe("completion — a static, value-free script per shell", () => {
  for (const shell of ["bash", "zsh", "fish"]) {
    it(`emits a ${shell} completion script (exit 0)`, async () => {
      const r = await run(["completion", shell], bytesDeps(new Uint8Array()));
      expect(r.exit).toBe(EXIT.OK);
      expect(r.stdout).toContain("cosyte");
      expect(r.stdout).toContain("parse");
    });
  }

  it("a missing shell is a usage error (2)", async () => {
    const r = await run(["completion"], bytesDeps(new Uint8Array()));
    expect(r.exit).toBe(EXIT.USAGE);
  });

  it("an unknown shell is a usage error (2)", async () => {
    const r = await run(["completion", "powershell"], bytesDeps(new Uint8Array()));
    expect(r.exit).toBe(EXIT.USAGE);
    expect(r.stderr).toContain("CLI_USAGE");
  });
});
