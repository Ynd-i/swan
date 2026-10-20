import { describe, expect, test } from "vitest";
import { forkTitle } from "./fork-title.js";

describe("forkTitle", () => {
  test("numbers forks after the highest existing number", () => {
    expect(forkTitle({ sourceTitle: "Plan", sourceIsFork: false, existingTitles: ["Plan"] })).toBe(
      "Plan (2)",
    );
    expect(
      forkTitle({
        sourceTitle: "Plan",
        sourceIsFork: false,
        existingTitles: ["Plan", "Plan (2)", "Plan (4)", "Other (9)"],
      }),
    ).toBe("Plan (5)");
  });

  test("numbers a fork of a fork from its base title", () => {
    expect(
      forkTitle({
        sourceTitle: "Plan (2)",
        sourceIsFork: true,
        existingTitles: ["Plan", "Plan (2)"],
      }),
    ).toBe("Plan (3)");
  });

  test("keeps a number that belongs to the source's own title", () => {
    expect(
      forkTitle({ sourceTitle: "Budget (2026)", sourceIsFork: false, existingTitles: [] }),
    ).toBe("Budget (2026) (2)");
  });
});
