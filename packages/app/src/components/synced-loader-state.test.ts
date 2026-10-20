import { describe, expect, test } from "vitest";
import { getSyncedLoaderStep } from "./synced-loader-state";

describe("synced loader state", () => {
  test("advances through 110 wall-clock-aligned frames at 30fps", () => {
    const sampleTimes = [0, 33, 34, 1010, 3633, 3634, 3666, 3667];

    const steps = sampleTimes.map(getSyncedLoaderStep);

    expect(steps).toEqual([0, 0, 1, 30, 108, 109, 109, 0]);
  });
});
