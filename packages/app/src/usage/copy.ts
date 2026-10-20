import type { UsageProblem } from "@getpaseo/protocol/messages";
import { i18n } from "@/i18n/i18next";
import { formatCompactTimeAgo } from "@/utils/time";
import { formatUsageTimeAgo } from "./format";

// Preserve the sidebar copy contract while resolving the current language at render time.
export const usageCopy = {
  problem: (problem: UsageProblem, now: Date = new Date()): string => {
    if (problem.kind === "no_quota") return problem.detail;
    const remedy = problem.refreshedBy
      ? i18n.t("usage.problemRunToRefresh", { command: problem.refreshedBy })
      : i18n.t("usage.problemSignInAgain");
    if (problem.kind === "rejected") {
      return i18n.t("usage.problemRejected", { status: problem.status, remedy });
    }
    const ago = formatUsageTimeAgo(formatCompactTimeAgo(new Date(problem.expiresAt), now));
    return i18n.t("usage.problemExpired", { ago, remedy });
  },
  get options() {
    return i18n.t("usage.options");
  },
  get displayAs() {
    return i18n.t("usage.displayAs");
  },
  get showInSidebar() {
    return i18n.t("usage.showInSidebar");
  },
  get title() {
    return i18n.t("usage.title");
  },
  get planUsage() {
    return i18n.t("usage.planUsage");
  },
  get refresh() {
    return i18n.t("usage.refresh");
  },
  get refreshing() {
    return i18n.t("usage.refreshing");
  },
  get refreshFailed() {
    return i18n.t("usage.refreshFailed");
  },
  get loading() {
    return i18n.t("usage.loading");
  },
  get empty() {
    return i18n.t("usage.empty");
  },
  get noHosts() {
    return i18n.t("usage.noHosts");
  },
  get errorTitle() {
    return i18n.t("usage.errorTitle");
  },
  get clientUnavailable() {
    return i18n.t("usage.clientUnavailable");
  },
  get updated() {
    return i18n.t("usage.updated", { time: "" }).trim();
  },
  hostUnavailable: (host: string) => i18n.t("usage.hostUnavailableNamed", { host }),
  hostUpgradeRequired: (host: string) => i18n.t("usage.hostUpgradeRequiredNamed", { host }),
  get retry() {
    return i18n.t("common.actions.retry");
  },
  get pin() {
    return i18n.t("usage.pin");
  },
  get displayUsed() {
    return i18n.t("usage.displayUsed");
  },
  get displayRemaining() {
    return i18n.t("usage.displayRemaining");
  },
  get refreshAll() {
    return i18n.t("usage.refreshAll");
  },
  get unpin() {
    return i18n.t("usage.unpin");
  },
  get showInSidebarHint() {
    return i18n.t("usage.showInSidebarHint");
  },
  agentError: (reason: string) => i18n.t("usage.agentError", { reason }),
} as const;
