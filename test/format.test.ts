import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  asCosyteFormat,
  classifyCandidates,
  detectFormat,
  detectionError,
  KNOWN_FORMATS,
  WIRED_FORMATS,
} from "../src/core/format.js";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("detectFormat — confident matches route right", () => {
  it("detects HL7 from an MSH-framed message", () => {
    const r = detectFormat(enc("MSH|^~\\&|A|B|C|D|20240101||ADT^A01|1|P|2.5\r"));
    expect(r).toStrictEqual({ format: "hl7", confidence: "certain", candidates: ["hl7"] });
  });

  it("detects HL7 through leading whitespace and MLLP VT framing", () => {
    expect(detectFormat(enc("\x0bMSH|^~\\&|A")).format).toBe("hl7");
    expect(detectFormat(enc("  MSH|^~\\&|A")).format).toBe("hl7");
  });

  it("detects FHIR from a JSON object with resourceType", () => {
    const r = detectFormat(enc('{"resourceType":"Patient","id":"x"}'));
    expect(r).toStrictEqual({ format: "fhir", confidence: "certain", candidates: ["fhir"] });
  });

  it("detects FHIR with leading whitespace and spaced key", () => {
    expect(detectFormat(enc('\n\t{ "resourceType" : "Bundle" }')).format).toBe("fhir");
  });

  it("strips a UTF-8 BOM before sniffing", () => {
    expect(detectFormat(enc('﻿{"resourceType":"Patient"}')).format).toBe("fhir");
  });
});

describe("detectFormat — HL7 field-separator edge cases", () => {
  it("does NOT claim a bare 'MSH' with no following field separator", () => {
    expect(detectFormat(enc("MSH")).confidence).toBe("none");
  });

  it("does NOT claim MSH followed by a digit (not a separator)", () => {
    expect(detectFormat(enc("MSH1|^~\\&|")).confidence).toBe("none");
  });

  it("strips an explicit U+FEFF BOM code unit before sniffing (hl7)", () => {
    expect(detectFormat(enc("﻿MSH|^~\\&|A")).format).toBe("hl7");
  });
});

describe("classifyCandidates — the routing contract, incl. the ambiguity branch", () => {
  it("exactly one candidate → certain", () => {
    expect(classifyCandidates(["hl7"])).toStrictEqual({
      format: "hl7",
      confidence: "certain",
      candidates: ["hl7"],
    });
  });

  it("zero candidates → none", () => {
    expect(classifyCandidates([])).toStrictEqual({
      format: null,
      confidence: "none",
      candidates: [],
    });
  });

  it("two or more candidates → ambiguous, format null, candidates named (value-free)", () => {
    const r = classifyCandidates(["hl7", "fhir"]);
    expect(r.confidence).toBe("ambiguous");
    expect(r.format).toBeNull();
    expect(r.candidates).toStrictEqual(["hl7", "fhir"]);
  });
});

describe("detectionError — value-free data errors for non-certain detection", () => {
  it("none → CLI_FORMAT_UNDETECTED (exit 65)", () => {
    const e = detectionError(classifyCandidates([]));
    expect(e.code).toBe("CLI_FORMAT_UNDETECTED");
    expect(e.exit).toBe(65);
  });

  it("ambiguous → CLI_FORMAT_AMBIGUOUS naming the candidates (exit 65)", () => {
    const e = detectionError(classifyCandidates(["hl7", "fhir"]));
    expect(e.code).toBe("CLI_FORMAT_AMBIGUOUS");
    expect(e.exit).toBe(65);
    expect(e.message).toContain("hl7");
    expect(e.message).toContain("fhir");
  });
});

describe("detectFormat — fail-safe on ambiguity/no-match/empty", () => {
  it("returns none for empty input", () => {
    expect(detectFormat(new Uint8Array())).toStrictEqual({
      format: null,
      confidence: "none",
      candidates: [],
    });
  });

  it("returns none for unrecognised content", () => {
    expect(detectFormat(enc("just some text")).confidence).toBe("none");
    expect(detectFormat(enc("hello")).format).toBeNull();
  });

  it("does NOT claim a bare JSON object without resourceType as FHIR", () => {
    expect(detectFormat(enc('{"foo":"bar"}')).confidence).toBe("none");
  });

  it("does NOT claim MSH followed by a letter (not a separator) as HL7", () => {
    expect(detectFormat(enc("MSHX not hl7")).confidence).toBe("none");
  });
});

describe("detectFormat — property: never throws, never guesses a non-wired format", () => {
  it("returns a well-formed result for arbitrary bytes and never a certain non-candidate", () => {
    fc.assert(
      fc.property(fc.uint8Array(), (bytes) => {
        const r = detectFormat(bytes);
        if (r.confidence === "certain") {
          expect(r.format).not.toBeNull();
          expect(r.candidates).toHaveLength(1);
          expect(r.candidates[0]).toBe(r.format);
        } else {
          expect(r.format).toBeNull();
        }
      }),
    );
  });
});

describe("format helpers", () => {
  it("asCosyteFormat narrows known names and rejects the rest", () => {
    expect(asCosyteFormat("hl7")).toBe("hl7");
    expect(asCosyteFormat("fhir")).toBe("fhir");
    expect(asCosyteFormat("dicom")).toBe("dicom");
    expect(asCosyteFormat("nope")).toBeNull();
    expect(asCosyteFormat("")).toBeNull();
  });

  it("WIRED_FORMATS is a subset of KNOWN_FORMATS (only hl7+fhir this phase)", () => {
    expect([...WIRED_FORMATS].sort()).toStrictEqual(["fhir", "hl7"]);
    for (const f of WIRED_FORMATS) expect(KNOWN_FORMATS).toContain(f);
  });
});
