import { describe, expect, it } from "vitest";

import { formatHl7Position } from "../src/core/findings.js";

describe("formatHl7Position — value-free positional locator (indices only)", () => {
  it("renders just the segment when only the segment index is present", () => {
    expect(formatHl7Position({ segmentIndex: 0 })).toBe("seg[0]");
  });

  it("appends field / repetition / component / subcomponent as they are present", () => {
    expect(formatHl7Position({ segmentIndex: 3, fieldIndex: 5 })).toBe("seg[3].field[5]");
    expect(
      formatHl7Position({
        segmentIndex: 3,
        fieldIndex: 5,
        repetitionIndex: 1,
        componentIndex: 2,
        subcomponentIndex: 4,
      }),
    ).toBe("seg[3].field[5].rep[1].comp[2].sub[4]");
  });

  it("contains only digits and structural tokens — never a value", () => {
    const loc = formatHl7Position({ segmentIndex: 1, fieldIndex: 2 });
    expect(loc).toMatch(/^seg\[\d+\](\.\w+\[\d+\])*$/);
  });
});
