import { describe, expect, it } from "vitest";

import { renderSummary } from "../src/commands/inspect.js";
import type { InspectSummary } from "../src/core/parsers.js";

/**
 * Exhaustive branch coverage of the value-free `inspect` render — every format variant, and both the
 * present and the null/`(unknown)` fallbacks of each classification field. Hand-built summaries let us
 * hit the display branches deterministically without crafting a null-producing fixture per format.
 */
describe("renderSummary — every variant, present + (unknown) fallbacks, always value-free", () => {
  const cases: { name: string; summary: InspectSummary; needles: string[] }[] = [
    {
      name: "hl7 present",
      summary: {
        format: "hl7",
        messageType: "ADT^A01",
        version: "2.5",
        segmentCount: 2,
        segments: { MSH: 1, PID: 1 },
        warningCount: 1,
      },
      needles: ["ADT^A01", "2.5", "MSH: 1"],
    },
    {
      name: "hl7 unknown",
      summary: {
        format: "hl7",
        messageType: null,
        version: null,
        segmentCount: 0,
        segments: {},
        warningCount: 0,
      },
      needles: ["message type: (unknown)", "version:      (unknown)"],
    },
    {
      name: "fhir non-bundle",
      summary: { format: "fhir", resourceType: "Patient", issueCount: 0 },
      needles: ["resource type: Patient", "issues:"],
    },
    {
      name: "fhir bundle unknown type",
      summary: {
        format: "fhir",
        resourceType: "Bundle",
        bundleType: null,
        entryCount: 1,
        entryResourceTypes: { Patient: 1 },
        issueCount: 0,
      },
      needles: ["bundle type:   (unknown)", "entries:", "Patient: 1"],
    },
    {
      name: "fhir resourceType null",
      summary: { format: "fhir", resourceType: null, issueCount: 2 },
      needles: ["resource type: (unknown)"],
    },
    {
      name: "x12",
      summary: {
        format: "x12",
        groupCount: 1,
        transactionCount: 1,
        transactionSetIds: { "834": 1 },
        segmentCount: 5,
        warningCount: 0,
      },
      needles: ["groups:", "transaction sets:", "834: 1"],
    },
    {
      name: "astm",
      summary: {
        format: "astm",
        messageKind: "results",
        recordCount: 3,
        recordTypes: { H: 1, R: 2 },
        warningCount: 0,
      },
      needles: ["message kind: results", "R: 2"],
    },
    {
      name: "ccda with codes",
      summary: {
        format: "ccda",
        documentType: "ccd",
        sectionCount: 1,
        sectionCodes: ["48765-2"],
        warningCount: 2,
      },
      needles: ["document type: ccd", "section codes: 48765-2"],
    },
    {
      name: "ccda unknown, no codes",
      summary: {
        format: "ccda",
        documentType: null,
        sectionCount: 0,
        sectionCodes: [],
        warningCount: 0,
      },
      needles: ["document type: (unknown)"],
    },
    {
      name: "dicom present",
      summary: {
        format: "dicom",
        sopClassUid: "1.2.840.10008.5.1.4.1.1.7",
        transferSyntaxUid: "1.2.840.10008.1.2.1",
        elementCount: 20,
        warningCount: 0,
      },
      needles: ["sop class uid:  1.2.840.10008.5.1.4.1.1.7", "elements:"],
    },
    {
      name: "dicom unknown",
      summary: {
        format: "dicom",
        sopClassUid: null,
        transferSyntaxUid: null,
        elementCount: 0,
        warningCount: 0,
      },
      needles: ["sop class uid:  (unknown)"],
    },
    {
      name: "ncpdp present",
      summary: {
        format: "ncpdp",
        standard: "SCRIPT",
        messageType: "NewRx",
        version: "2017071",
        warningCount: 0,
      },
      needles: ["message type: NewRx", "version:      2017071"],
    },
    {
      name: "ncpdp unknown",
      summary: {
        format: "ncpdp",
        standard: "SCRIPT",
        messageType: null,
        version: null,
        warningCount: 0,
      },
      needles: ["message type: (unknown)", "version:      (unknown)"],
    },
    {
      name: "mllp",
      summary: { format: "mllp", frameCount: 2, warningCount: 0 },
      needles: ["frames:"],
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const out = renderSummary(c.summary);
      for (const n of c.needles) expect(out).toContain(n);
      expect(out.endsWith("\n")).toBe(true);
    });
  }
});
