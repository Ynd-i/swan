import type { TFunction } from "i18next";
import { i18n } from "@/i18n/i18next";
import { formatPct } from "./format";
import { displayPercent, usedPercent } from "./model";
import { effectiveUsagePins, type UsagePreferences } from "./preferences";
import { windowTone } from "./tone";
import type { UsageReportEntry, UsageTone } from "./types";

/** One summary window of one account, as the sidebar Usage item shows it. */
export interface PinnedUsageWindow {
  key: string;
  /** Accessible description, including the source, account, window and percent meaning. */
  label: string;
  /** The window's short name ("5h"), empty for none, or its label when the source sends none. */
  shortLabel: string;
  /** The share used, whatever the user's used/remaining preference shows. */
  usedPct: number;
  /** The share shown, under the user's used/remaining preference. */
  percent: number;
  percentText: string;
  tone: UsageTone;
}

/** One account's summary windows, under its source's icon. */
export interface PinnedUsageSource {
  key: string;
  icon: string | null;
  windows: PinnedUsageWindow[];
}

/**
 * The window closest to its limit across all sources, the one the sidebar summary shows. The
 * first wins a tie; null while no source has a window.
 */
export function mostConstrainedWindow(
  sources: readonly PinnedUsageSource[],
): { source: PinnedUsageSource; window: PinnedUsageWindow } | null {
  let best: { source: PinnedUsageSource; window: PinnedUsageWindow } | null = null;
  for (const source of sources) {
    for (const window of source.windows) {
      if (!best || window.usedPct > best.window.usedPct) best = { source, window };
    }
  }
  return best;
}

function describe(entry: UsageReportEntry, windowLabel: string): string {
  const account = entry.account.label ? ` (${entry.account.label})` : "";
  return `${entry.sourceLabel}${account} ${windowLabel}`;
}

/** Reports with every account of a source together, sources in the order they first appear. */
function groupBySource(reports: readonly UsageReportEntry[]): UsageReportEntry[] {
  const sourceIds = [...new Set(reports.map((entry) => entry.sourceId))];
  return sourceIds.flatMap((sourceId) => reports.filter((entry) => entry.sourceId === sourceId));
}

/**
 * The sidebar Usage item's summary: one group per account, grouped by source, each with its
 * windows in its report's order. Accounts with nothing to show are left out.
 */
export function resolvePinnedUsage(
  reports: readonly UsageReportEntry[],
  preferences: UsagePreferences,
  t: TFunction = i18n.t,
): PinnedUsageSource[] {
  const pins = effectiveUsagePins(preferences, reports);
  return groupBySource(reports).flatMap((entry) => {
    if (entry.report.status !== "available") return [];
    const windows = entry.report.windows
      .filter(
        (window) =>
          displayPercent(window, preferences.displayAs) !== null &&
          pins.some((pin) => pin.sourceId === entry.sourceId && pin.windowId === window.id),
      )
      .map((window) => {
        const percent = displayPercent(window, preferences.displayAs) ?? 0;
        const percentText = formatPct(percent);
        const value =
          preferences.displayAs === "remaining"
            ? t("usage.remainingBalance", { amount: percentText })
            : t("usage.usedPercent", { percent: percentText });
        return {
          key: `${entry.id}/${window.id}`,
          label: `${describe(entry, window.label)} ${value}`,
          shortLabel: window.shortLabel ?? window.label,
          usedPct: usedPercent(window) ?? 0,
          percent,
          percentText,
          tone: windowTone(window),
        };
      });
    if (windows.length === 0) return [];
    return [{ key: entry.id, icon: entry.icon ?? null, windows }];
  });
}
