import { describe, expect, it } from "vitest";
import { getIntralineRanges } from "./intraline-ranges";

describe("getIntralineRanges", () => {
  it("returns separate ranges for several replacements", () => {
    expect(getIntralineRanges("alpha beta gamma", "alpha zeta delta")).toEqual({
      before: [
        { start: 6, end: 7 },
        { start: 11, end: 12 },
        { start: 13, end: 16 },
      ],
      after: [
        { start: 6, end: 7 },
        { start: 11, end: 15 },
      ],
    });
  });

  it("marks insertions and deletions only on the changed side", () => {
    expect(getIntralineRanges("one three", "one two three")).toEqual({
      before: [],
      after: [{ start: 5, end: 9 }],
    });
    expect(getIntralineRanges("one two three", "one three")).toEqual({
      before: [{ start: 5, end: 9 }],
      after: [],
    });
  });

  it("keeps surrogate pairs, ZWJ sequences, and combining marks whole", () => {
    const before = "a👨‍👩‍👧‍👦éz";
    const after = "a👩‍💻èz";

    expect(getIntralineRanges(before, after)).toEqual({
      before: [{ start: 1, end: 14 }],
      after: [{ start: 1, end: 8 }],
    });
  });

  it("uses UTF-16 offsets for tabs and ordinary text", () => {
    expect(getIntralineRanges("\tconst old = 1", "\tconst next = 1")).toEqual({
      before: [{ start: 7, end: 10 }],
      after: [{ start: 7, end: 11 }],
    });
  });

  it("keeps line-level highlighting when there is no safe fine-grained comparison", () => {
    expect(getIntralineRanges("same", "same")).toEqual({ before: [], after: [] });
    expect(getIntralineRanges("a".repeat(8193), "b")).toEqual({ before: [], after: [] });
    expect(getIntralineRanges("a".repeat(257), "b".repeat(257))).toEqual({ before: [], after: [] });
  });
});
