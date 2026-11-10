import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EXIT } from "../src/core/exit-codes.js";
import type { RunDeps } from "../src/core/io.js";
import { loadOptional } from "../src/core/parsers.js";
import { run } from "../src/core/run.js";

/**
 * The edges of each wrapped parser that the everyday fixtures do not reach: a message that leaves
 * out an optional header field, an input the library parses with a warning, a structure with no
 * identifying code. Each one is a real input a user can send, and each asserts what the CLI reports
 * for it: the fallback value, the warning code and its value-free location, the verdict.
 *
 * Every input here is synthetic.
 */

const FIX = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

const enc = new TextEncoder();
const deps = (bytes: Uint8Array): RunDeps => ({
  readFile: () => Promise.resolve(bytes),
  readStdin: () => Promise.resolve(bytes),
});

/** Run one command over `bytes` and parse its JSON data channel. */
async function json<T>(args: string[], bytes: Uint8Array): Promise<{ exit: number; body: T }> {
  const r = await run([...args, "--json"], deps(bytes));
  return { exit: r.exit, body: JSON.parse(r.stdout) as T };
}

interface ParseEnvelope {
  readonly warnings: readonly { readonly code: string }[];
}
interface ValidateBody {
  readonly valid: boolean;
  readonly findings: readonly { code: string; severity: string; location: string }[];
}

describe("hl7: a header without a message type or version", () => {
  // MSH-9 (message type) is empty and the segment stops before MSH-12 (version).
  const HL7 = enc.encode("MSH|^~\\&|A|B|C|D|20240101|||1|P\rPID|1\r");

  it("inspect reports both as null, and the text render says (unknown)", async () => {
    const { exit, body } = await json<{ messageType: unknown; version: unknown }>(
      ["inspect", "m.hl7"],
      HL7,
    );
    expect(exit).toBe(EXIT.OK);
    expect(body.messageType).toBeNull();
    expect(body.version).toBeNull();

    const text = await run(["inspect", "m.hl7"], deps(HL7));
    expect(text.stdout).toContain("message type: (unknown)");
    expect(text.stdout).toContain("version:      (unknown)");
  });
});

describe("x12: library warnings reach parse and validate, value-free", () => {
  // The 834 fixture with its IEA trailer cut off: the interchange still parses, with a warning.
  const NO_IEA = enc.encode(
    FIX("834.edi")
      .toString("latin1")
      .replace(/IEA\*[^~]*~\s*$/, ""),
  );

  it("parse carries the warning code and says so on stderr", async () => {
    const r = await run(["parse", "m.edi"], deps(NO_IEA));
    expect(r.exit).toBe(EXIT.OK);
    const env = JSON.parse(r.stdout) as ParseEnvelope;
    expect(env.warnings.map((w) => w.code)).toStrictEqual(["X12_MISSING_IEA"]);
    expect(r.stderr).toContain("with 1 warning(s)");
  });

  it("validate lists it as a warning finding at a numeric locator, and stays valid", async () => {
    const { exit, body } = await json<ValidateBody>(["validate", "m.edi"], NO_IEA);
    expect(exit).toBe(EXIT.OK);
    expect(body.valid).toBe(true);
    expect(body.findings).toStrictEqual([
      {
        code: "X12_MISSING_IEA",
        severity: "warning",
        location: "segmentIndex[28].interchangeIndex[0]",
      },
    ]);
  });

  it("inspect counts a transaction set whose ST carries no id under (unknown)", async () => {
    const isa =
      "ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       " +
      "*260601*1200*^*00501*000000001*0*P*:~";
    const x12 = enc.encode(
      `${isa}GS*BE*S*R*20260601*1200*1*X*005010X220A1~ST~SE*2*0001~GE*1*1~IEA*1*000000001~`,
    );
    const { exit, body } = await json<{ transactionSetIds: Record<string, number> }>(
      ["inspect", "m.edi"],
      x12,
    );
    expect(exit).toBe(EXIT.OK);
    expect(body.transactionSetIds).toStrictEqual({ "(unknown)": 1 });
  });
});

describe("astm: an unknown record type is a warning, not a failure", () => {
  const ASTM = enc.encode("H|\\^&|||\rP|1\rZZZ|1\rL|1|N\r");

  it("parse carries the warning code", async () => {
    const r = await run(["parse", "m.astm"], deps(ASTM));
    expect(r.exit).toBe(EXIT.OK);
    const env = JSON.parse(r.stdout) as ParseEnvelope;
    expect(env.warnings.map((w) => w.code)).toStrictEqual(["ASTM_RECORD_UNKNOWN_TYPE"]);
  });

  it("validate reports it at the record's index and stays valid", async () => {
    const { exit, body } = await json<ValidateBody>(["validate", "m.astm"], ASTM);
    expect(exit).toBe(EXIT.OK);
    expect(body).toMatchObject({ valid: true });
    expect(body.findings).toStrictEqual([
      { code: "ASTM_RECORD_UNKNOWN_TYPE", severity: "warning", location: "recordIndex[2]" },
    ]);
  });
});

describe("ncpdp: a SCRIPT message with an empty header and body", () => {
  const SCRIPT = enc.encode("<Message><Header></Header><Body></Body></Message>");
  const CODES = ["NCPDP_SCRIPT_VERSION_ABSENT", "NCPDP_SCRIPT_UNSUPPORTED_TRANSACTION"];

  it("parse carries both warning codes", async () => {
    const r = await run(["parse", "m.xml", "--format", "ncpdp"], deps(SCRIPT));
    expect(r.exit).toBe(EXIT.OK);
    expect((JSON.parse(r.stdout) as ParseEnvelope).warnings.map((w) => w.code)).toStrictEqual(
      CODES,
    );
  });

  it("inspect reports no version (null) and the unsupported body kind", async () => {
    const { exit, body } = await json<{ version: unknown; messageType: unknown }>(
      ["inspect", "m.xml", "--format", "ncpdp"],
      SCRIPT,
    );
    expect(exit).toBe(EXIT.OK);
    expect(body.version).toBeNull();
    expect(body.messageType).toBe("unsupported");
  });

  it("validate lists both warnings with the no-position locator and stays valid", async () => {
    const { exit, body } = await json<ValidateBody>(
      ["validate", "m.xml", "--format", "ncpdp"],
      SCRIPT,
    );
    expect(exit).toBe(EXIT.OK);
    expect(body.valid).toBe(true);
    expect(body.findings.map((f) => [f.code, f.location])).toStrictEqual(
      CODES.map((c) => [c, "?"]),
    );
  });
});

describe("ccda: a document with no templateId and a section with no code", () => {
  const CCDA = enc.encode(
    `<?xml version="1.0"?><ClinicalDocument xmlns="urn:hl7-org:v3"><component><structuredBody>` +
      `<component><section><title>Notes</title></section></component>` +
      `</structuredBody></component></ClinicalDocument>`,
  );

  it("inspect reports no document type and counts the section without listing a code", async () => {
    const { exit, body } = await json<{
      documentType: unknown;
      sectionCount: number;
      sectionCodes: string[];
    }>(["inspect", "d.xml", "--format", "ccda"], CCDA);
    expect(exit).toBe(EXIT.OK);
    expect(body.documentType).toBeNull();
    expect(body.sectionCount).toBe(1);
    expect(body.sectionCodes).toStrictEqual([]);
  });
});

/** One Explicit VR Little Endian element with a short (16-bit) length, padded to an even length. */
function dicomElement(group: number, element: number, vr: string, value: string): Buffer {
  const v = Buffer.from(value.length % 2 === 0 ? value : `${value}\0`, "latin1");
  const head = Buffer.alloc(8);
  head.writeUInt16LE(group, 0);
  head.writeUInt16LE(element, 2);
  head.write(vr, 4, "latin1");
  head.writeUInt16LE(v.length, 6);
  return Buffer.concat([head, v]);
}

describe("dicom: File Meta edges", () => {
  it("inspect reports a missing Media Storage SOP Class UID as null", async () => {
    // Preamble + DICM + a File Meta group with only the Transfer Syntax UID, then one dataset element.
    const file = Buffer.concat([
      Buffer.alloc(128),
      Buffer.from("DICM", "latin1"),
      dicomElement(0x0002, 0x0010, "UI", "1.2.840.10008.1.2.1"),
      dicomElement(0x0008, 0x0020, "DA", "19000101"),
    ]);
    const { exit, body } = await json<{ sopClassUid: unknown; transferSyntaxUid: unknown }>(
      ["inspect", "f.dcm", "--format", "dicom"],
      file,
    );
    expect(exit).toBe(EXIT.OK);
    expect(body.sopClassUid).toBeNull();
    expect(body.transferSyntaxUid).toBe("1.2.840.10008.1.2.1");
  });

  it("validate reports a missing preamble as a warning at its byte offset", async () => {
    // The fixture without its 128-byte preamble and DICM magic: a bare File Meta group.
    const bare = FIX("sample.dcm").subarray(132);
    const { exit, body } = await json<ValidateBody>(
      ["validate", "f.dcm", "--format", "dicom"],
      bare,
    );
    expect(exit).toBe(EXIT.OK);
    expect(body.findings).toStrictEqual([
      { code: "DICOM_MISSING_PREAMBLE", severity: "warning", location: "byteOffset[0]" },
    ]);
  });
});

describe("fhir: an invariant failure names its constraint in the location", () => {
  it("validate appends the constraint id to the path, and the verdict is invalid (exit 1)", async () => {
    // pat-1: a Patient.contact needs a name, telecom, address or organization.
    const patient = enc.encode(
      JSON.stringify({ resourceType: "Patient", contact: [{ gender: "male" }] }),
    );
    const { exit, body } = await json<ValidateBody>(["validate", "p.json"], patient);
    expect(exit).toBe(EXIT.INVALID);
    expect(body.valid).toBe(false);
    expect(body.findings).toContainEqual({
      code: "INVARIANT_VIOLATED",
      severity: "error",
      location: "Patient.contact[0] (pat-1)",
    });
  });
});

describe("mllp: a frame restarted part way through", () => {
  // VT, one payload byte, then a second VT before any FS: the reader warns, discards the partial
  // payload, and reads the frame that the second VT opens.
  const HL7 = "MSH|^~\\&|A|B|C|D|20240101||ADT^A01|1|P|2.5\rPID|1\r";
  const RESTARTED = new Uint8Array([0x0b, 0x41, 0x0b, ...enc.encode(HL7), 0x1c, 0x0d]);

  it("inspect counts one frame and one framing warning", async () => {
    const { exit, body } = await json<{ frameCount: number; warningCount: number }>(
      ["inspect", "s.mllp"],
      RESTARTED,
    );
    expect(exit).toBe(EXIT.OK);
    expect(body).toMatchObject({ frameCount: 1, warningCount: 1 });
  });

  it("parse emits the one complete message, not the discarded fragment", async () => {
    const r = await run(["parse", "s.mllp"], deps(RESTARTED));
    expect(r.exit).toBe(EXIT.OK);
    const lines = r.stdout.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "") as { record: number; format: string }).toMatchObject({
      record: 0,
      format: "hl7",
    });
  });
});

describe("loadOptional: only a module-not-found failure means unavailable", () => {
  it("propagates a rejection that is not an object unchanged", async () => {
    // A JavaScript module can reject with any value; a string has no code to read.
    const reason: unknown = "a bare string";
    const failingImport = (): Promise<never> =>
      Promise.resolve().then(() => {
        throw reason;
      });
    await expect(loadOptional("x12", failingImport)).rejects.toBe(reason);
  });

  it("propagates an error with an unrelated code and a non-string message unchanged", async () => {
    const thrown = Object.assign(new Error(), { code: "EACCES", message: 42 });
    await expect(loadOptional("x12", () => Promise.reject(thrown))).rejects.toBe(thrown);
  });
});
