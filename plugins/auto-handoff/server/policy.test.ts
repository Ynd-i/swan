import { expect, test } from "vitest";
import { autoHandoffSettings } from "../shared/settings.js";
import {
  afterFailedBriefing,
  applyEnvOverrides,
  effectiveThreshold,
  shouldHandoff,
} from "./policy.js";

const settings = autoHandoffSettings.schema.parse({});
const request = { used: 400_000, max: 1_000_000, threshold: 350_000, lastUserRequest: "Fix it" };

function decide(overrides: Partial<Parameters<typeof shouldHandoff>[0]> = {}) {
  return shouldHandoff({
    settings,
    outcome: "completed",
    status: "idle",
    pendingPermissions: 0,
    usage: { contextWindowUsedTokens: 400_000, contextWindowMaxTokens: 1_000_000 },
    handoffChildFirstTurn: false,
    subagent: false,
    ...overrides,
  });
}

test("threshold is the smaller of the absolute cap and the window fraction", () => {
  expect(effectiveThreshold(settings, 1_000_000)).toBe(350_000);
  expect(effectiveThreshold(settings, 200_000)).toBe(150_000);
  expect(effectiveThreshold(settings, undefined)).toBe(350_000);
});

test("hands off after a clean turn past the threshold", () => {
  expect(decide()).toEqual({ ok: true, used: 400_000, max: 1_000_000, threshold: 350_000 });
});

test.each([
  ["disabled", { settings: { ...settings, enabled: false } }],
  ["subagent", { subagent: true }],
  ["handoff child's first turn", { handoffChildFirstTurn: true }],
  ["turn failed", { outcome: "failed" as const }],
  ["turn canceled", { outcome: "canceled" as const }],
  ["agent running", { status: "running" }],
  ["permission pending", { pendingPermissions: 1 }],
  ["context usage unknown", { usage: null }],
  ["context usage unknown", { usage: { inputTokens: 10 } }],
  [
    "below threshold",
    { usage: { contextWindowUsedTokens: 140_000, contextWindowMaxTokens: 200_000 } },
  ],
])("skips: %s", (reason, overrides) => {
  expect(decide(overrides)).toEqual({ ok: false, reason });
});

test("a 200k window hands off at 150k", () => {
  const usage = { contextWindowUsedTokens: 150_000, contextWindowMaxTokens: 200_000 };
  expect(decide({ usage })).toMatchObject({ ok: true, threshold: 150_000 });
});

test("environment overrides win over stored settings", () => {
  const env = {
    PASEO_AUTO_HANDOFF_ENABLED: "0",
    PASEO_AUTO_HANDOFF_THRESHOLD_TOKENS: "5000",
    PASEO_AUTO_HANDOFF_WINDOW_FRACTION: "0.5",
  };
  expect(applyEnvOverrides(settings, env)).toEqual({
    ...settings,
    enabled: false,
    absoluteThresholdTokens: 5000,
    windowFraction: 0.5,
  });
  expect(applyEnvOverrides(settings, { PASEO_AUTO_HANDOFF_THRESHOLD_TOKENS: "nope" })).toEqual(
    settings,
  );
});

test("a bad briefing retries until the attempt cap, then fails", () => {
  const first = { kind: "requested" as const, attempt: 1, request };
  expect(afterFailedBriefing(first, 2, "junk")).toEqual({ ...first, attempt: 2 });
  expect(afterFailedBriefing({ ...first, attempt: 2 }, 2, "junk")).toEqual({
    kind: "failed",
    reason: "junk",
  });
  expect(afterFailedBriefing(first, 1, "junk")).toEqual({ kind: "failed", reason: "junk" });
});
