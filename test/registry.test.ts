import { describe, expect, it } from "vitest";

import {
  deframeMllp,
  fmtFormat,
  formatsSupporting,
  parseFormat,
  supportsOp,
  validateFormat,
  valueFreeLocator,
} from "../src/core/parsers.js";
import { CliError } from "../src/core/diagnostics.js";

/**
 * Direct unit tests of the per-format registry's guards and value-free helpers — the defensive
 * `supportsOp`-guarded branches and the position formatter that keeps findings value-free.
 */

const enc = new TextEncoder();

describe("the capability matrix + its guards", () => {
  it("supportsOp reflects the honest matrix", () => {
    expect(supportsOp("dicom", "parse")).toBe(false);
    expect(supportsOp("ccda", "parse")).toBe(false);
    expect(supportsOp("mllp", "fmt")).toBe(false);
    expect(supportsOp("x12", "fmt")).toBe(true);
  });

  it("formatsSupporting lists the supporting formats, sorted", () => {
    expect(formatsSupporting("fmt")).toStrictEqual(["astm", "ccda", "fhir", "hl7", "ncpdp", "x12"]);
    expect(formatsSupporting("parse")).toStrictEqual([
      "astm",
      "fhir",
      "hl7",
      "mllp",
      "ncpdp",
      "x12",
    ]);
  });

  it("calling an unsupported (format, op) directly is a value-free CLI_FORMAT_UNSUPPORTED", async () => {
    const b = enc.encode("x");
    await expect(parseFormat("dicom", b)).rejects.toMatchObject({ code: "CLI_FORMAT_UNSUPPORTED" });
    await expect(fmtFormat("dicom", b)).rejects.toBeInstanceOf(CliError);
    await expect(validateFormat("mllp", b)).rejects.toBeInstanceOf(CliError);
  });
});

describe("valueFreeLocator — indices only, never a value", () => {
  it("builds a dotted locator from number-valued props", () => {
    expect(valueFreeLocator({ segmentIndex: 3, elementIndex: 2 })).toBe(
      "segmentIndex[3].elementIndex[2]",
    );
  });

  it("drops non-number fields (a stray value can never reach a diagnostic)", () => {
    expect(valueFreeLocator({ segmentIndex: 1, raw: "PID|secret" })).toBe("segmentIndex[1]");
  });

  it("falls back to '?' when there is no numeric index", () => {
    expect(valueFreeLocator({})).toBe("?");
    expect(valueFreeLocator(null)).toBe("?");
    expect(valueFreeLocator("nope")).toBe("?");
  });
});

describe("deframeMllp — transport de-framing", () => {
  it("de-frames each VT/FS frame into its HL7 payload", async () => {
    const f = (s: string): number[] => [0x0b, ...enc.encode(s), 0x1c, 0x0d];
    const stream = new Uint8Array([...f("MSH|^~\\&|A"), ...f("MSH|^~\\&|B")]);
    const { payloads } = await deframeMllp(stream);
    expect(payloads).toHaveLength(2);
    expect(payloads[0]?.toString("latin1")).toContain("MSH|^~\\&|A");
  });

  it("rejects a truncated (never-closed) trailing frame as a data error, never a silent drop", async () => {
    // one complete frame, then a VT that opens a frame with no closing FS/CR
    const f = (s: string): number[] => [0x0b, ...enc.encode(s), 0x1c, 0x0d];
    const truncated = new Uint8Array([...f("MSH|^~\\&|A"), 0x0b, ...enc.encode("MSH|^~\\&|B")]);
    await expect(deframeMllp(truncated)).rejects.toMatchObject({ code: "CLI_PARSE_FAILED" });
    // a lone unterminated frame likewise
    await expect(deframeMllp(new Uint8Array([0x0b, 0x4d, 0x53, 0x48]))).rejects.toBeInstanceOf(
      CliError,
    );
  });
});
