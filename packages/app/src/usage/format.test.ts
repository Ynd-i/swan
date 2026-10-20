import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n/i18next";
import { usageCopy } from "./copy";
import { formatAmount, formatDisplayPct, formatResetLabel, formatUsageDeadline } from "./format";
import { displayPercent, formatUsageFreshness, remainingPercent } from "./model";

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  await i18n.changeLanguage("en");
  vi.useRealTimers();
});

it("keeps reset and exhaustion deadlines distinct through the due time", () => {
  const deadline = "2026-10-04T17:00:00Z";
  expect(formatUsageDeadline(deadline)).toBe("resets 3d 17h");
  expect(formatUsageDeadline(deadline, "runOut")).toBe("runs out 3d 17h");
  vi.setSystemTime(new Date("2026-10-04T16:59:30Z"));
  expect(formatUsageDeadline(deadline)).toBe("resets <1m");
  vi.setSystemTime(new Date(deadline));
  expect(formatUsageDeadline(deadline)).toBe("Reset due");
  expect(formatUsageDeadline(deadline, "runOut")).toBe("Runs out now");
  expect(formatUsageDeadline(null)).toBeNull();
  expect(formatUsageDeadline("invalid")).toBeNull();
});

it("localizes relative labels and keeps credit amounts separate from dollars", async () => {
  expect(formatAmount(1234.5, "usd")).toBe("$1,234.50");
  expect(formatAmount(1234.5, "credits")).toBe("1,234.5");
  await i18n.changeLanguage("zh-CN");
  expect(formatUsageDeadline("2026-10-01T01:25:00Z")).toBe("1小时 25分钟后重置");
  expect(formatUsageFreshness("3m")).toBe("3分钟前更新");
  expect(formatUsageFreshness("now")).toBe("刚刚更新");
  expect(formatUsageFreshness("Jan 15", i18n.t, "2026-01-15T12:00:00Z")).toBe("1月15日更新");
});

it("preserves reported remaining allowance and distinguishes unknown from zero", () => {
  const window = { id: "quota", label: "Quota" };
  expect(remainingPercent(window)).toBeNull();
  expect(remainingPercent({ ...window, usedPct: 0 })).toBe(100);
  expect(remainingPercent({ ...window, remainingPct: 0 })).toBe(0);
  expect(remainingPercent({ ...window, usedPct: 20, remainingPct: 70 })).toBe(70);
});

it("combines used/remaining preferences with localized durations and unknown allowance", async () => {
  const window = { id: "weekly", label: "Weekly", usedPct: 20, remainingPct: 70 };
  expect(displayPercent(window, "used")).toBe(20);
  expect(displayPercent(window, "remaining")).toBe(70);
  expect(displayPercent({ id: "unknown", label: "Unknown" }, "used")).toBeNull();
  expect(formatDisplayPct(70, "remaining")).toBe("70% left");
  expect(formatDisplayPct(20, "used")).toBe("20%");
  expect(formatResetLabel("2026-10-04T17:00:00Z")).toBe("resets 3d 17h");
  await i18n.changeLanguage("zh-CN");
  expect(formatDisplayPct(70, "remaining")).toBe("剩余 70%");
  expect(formatDisplayPct(0, "used")).toBe("0%");
  expect(formatResetLabel("2026-10-01T01:25:00Z")).toBe("1小时 25分钟后重置");
});

it("resolves sidebar copy against the current language and preserves the host name", async () => {
  expect(usageCopy.title).toBe("Usage");
  expect(usageCopy.hostUnavailable("Laptop")).toBe("Connect to Laptop to see usage");
  expect(usageCopy.hostUpgradeRequired("Laptop")).toBe("Update Laptop to see usage");
  await i18n.changeLanguage("zh-CN");
  expect(usageCopy.title).toBe("使用情况");
  expect(usageCopy.hostUnavailable("Laptop")).toContain("Laptop");
  expect(usageCopy.hostUnavailable("Laptop")).toContain("连接");
  expect(usageCopy.hostUpgradeRequired("Laptop")).toContain("更新");
  expect(usageCopy.displayUsed).toBe("已用");
  expect(usageCopy.displayRemaining).toBe("剩余");
});

describe("formatAmount", () => {
  it("groups thousands in the app's language", () => {
    expect(formatAmount(12345, "credits", "en")).toBe("12,345");
    expect(formatAmount(12345, "requests", "en")).toBe("12,345");
    expect(formatAmount(12345, "credits", "fr").replace(/\s/g, " ")).toBe("12 345");
  });

  it("formats dollars as the language writes currency", () => {
    expect(formatAmount(1234.5, "usd", "en")).toBe("$1,234.50");
    expect(formatAmount(1234.5, "usd", "fr").replace(/\s/g, " ")).toBe("1 234,50 $US");
  });
});

it("retained reset times that have passed do not claim the quota is resetting", () => {
  const past = "2000-01-01T00:00:00.000Z";
  expect(formatResetLabel(past, true)).toBe("Reset time passed");
  expect(formatResetLabel(past)).toBe("Reset due");
  expect(formatResetLabel(null, true)).toBeNull();
});
