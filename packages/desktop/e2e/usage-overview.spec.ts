import type { UsageReportEntry } from "@getpaseo/protocol/messages";
import { test, expect } from "../../app/e2e/support/fixtures";
import { gotoAppShell, openSettings } from "../../app/e2e/support/helpers/app";
import {
  openSettingsSection,
  clickSettingsBackToWorkspace,
} from "../../app/e2e/support/helpers/settings";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installUsageReportsFixture } from "../../app/e2e/support/helpers/usage-reports";
import { buildUsageRoute } from "../../app/src/utils/host-routes";
import { installDesktopRuntime } from "./support/runtime";

test("usage reset countdown advances on the shared clock without replacing its label", async ({
  page,
}) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  await installDesktopRuntime(page, {
    serverId: getServerId(),
    manageBuiltInDaemon: false,
    daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
  });
  const usage = await installUsageReportsFixture(page, {
    lists: [
      [
        {
          id: "clock:quota",
          sourceId: "clock",
          sourceLabel: "Clock quota",
          account: {},
          fetchedAt: new Date(now).toISOString(),
          report: {
            status: "available",
            windows: [
              {
                id: "soon",
                label: "Quota",
                usedPct: 20,
                resetsAt: new Date(now + 120_000).toISOString(),
              },
            ],
          },
        },
      ],
    ],
  });
  await page.setViewportSize({ width: 1352, height: 782 });
  await gotoAppShell(page);
  await page.goto(buildUsageRoute());
  const card = page.getByTestId("usage-report-clock:quota");
  const label = card.getByText("resets 1m", { exact: true });
  await expect(label).toBeVisible();
  // Reports are loaded, yet the Mac sidebar has no Usage summary; the rail shows usage.
  await expect(page.getByTestId("sidebar-usage")).toHaveCount(0);
  const element = await label.elementHandle();
  if (!element) throw new Error("Missing reset countdown label");
  await page.clock.fastForward("03:00");
  await expect(card.getByText("Reset due", { exact: true })).toBeVisible();
  expect(await element.evaluate((node) => node.isConnected)).toBe(true);
  expect(usage.listRequests().some((request) => request.forceRefresh)).toBe(false);
});

test("desktop usage keeps provider data through refresh failures and language changes", async ({
  page,
}, testInfo) => {
  await installDesktopRuntime(page, {
    serverId: getServerId(),
    manageBuiltInDaemon: false,
    daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
  });
  const available = (usedPct: number): UsageReportEntry => ({
    id: "alpha:plan",
    sourceId: "alpha",
    sourceLabel: "Provider Alpha",
    account: { label: "Development account" },
    fetchedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    report: {
      status: "available",
      planLabel: "Pro",
      windows: [
        {
          id: "weekly",
          label: "Weekly allowance",
          usedPct,
          resetsAt: new Date(Date.now() + 3 * 86400_000 + 17 * 3600_000).toISOString(),
        },
        { id: "unknown", label: "Additional allowance" },
      ],
      balances: [{ id: "credits", label: "Credits", remaining: 1250, unit: "credits" }],
    },
  });
  const unavailable: UsageReportEntry = {
    id: "beta:plan",
    sourceId: "beta",
    sourceLabel: "Provider Beta",
    account: {},
    fetchedAt: new Date().toISOString(),
    report: { status: "unavailable", windows: [] },
  };
  let usedPct = 31;
  let forcedRefreshCount = 0;
  await installUsageReportsFixture(page, {
    lists: [
      ({ forceRefresh }) => {
        if (forceRefresh) {
          forcedRefreshCount += 1;
          if (forcedRefreshCount === 1) return { error: "Fixture usage unavailable" };
          usedPct = 52;
        }
        return [available(usedPct), unavailable];
      },
    ],
  });
  await page.setViewportSize({ width: 1352, height: 782 });
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoAppShell(page);
  await page.goto(buildUsageRoute());
  const screen = page.getByTestId("usage-screen").filter({ visible: true }).first();
  const alpha = screen.getByTestId("usage-report-alpha:plan");
  await expect(alpha.getByText("69% remaining", { exact: true })).toBeVisible();
  await expect(alpha.getByText("31% used", { exact: true })).toBeVisible();
  await expect(alpha.getByRole("progressbar")).toHaveCount(1);
  // The upstream preference defaults to used; explicitly choose the Mac remaining view.
  await expect(alpha.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "31");
  await screen.getByTestId("usage-options-menu").click();
  await page.getByTestId("usage-display-remaining").filter({ visible: true }).click();
  await expect(alpha.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "69");
  await alpha.getByTestId("usage-refresh").click();
  await expect(alpha.getByTestId("usage-refresh-error")).toBeVisible();
  await expect(alpha.getByText("69% remaining", { exact: true })).toBeVisible();
  await alpha.getByTestId("usage-refresh").click();
  await expect(alpha.getByText("48% remaining", { exact: true })).toBeVisible();
  await expect(alpha.getByTestId("usage-refresh-error")).toHaveCount(0);
  await openSettings(page);
  await openSettingsSection(page, "general");
  await page.getByRole("button", { name: "System", exact: true }).click();
  await page.getByRole("menuitem", { name: "简体中文 - Simplified Chinese", exact: true }).click();
  await clickSettingsBackToWorkspace(page);
  await page.goto(buildUsageRoute());
  await expect(screen.getByTestId("page-title")).toHaveText("使用情况");
  await screen.getByTestId("usage-options-menu").click();
  await expect(page.getByTestId("usage-display-used").filter({ visible: true })).toHaveText("已用");
  await expect(page.getByTestId("usage-display-remaining").filter({ visible: true })).toHaveText(
    "剩余",
  );
  await page.keyboard.press("Escape");
  await expect(alpha.getByText("剩余 48%", { exact: true })).toBeVisible();
  await expect(alpha.getByText("剩余 1,250", { exact: true })).toBeVisible();
  await expect(
    screen.getByTestId("usage-report-beta:plan").getByText("不可用", { exact: true }),
  ).toBeVisible();
  await expect(alpha.getByText(/3天 16小时后重置/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("desktop-usage-zh.png") });
  await page.setViewportSize({ width: 900, height: 680 });
  await expect(alpha.getByText("剩余 48%", { exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 700, height: 680 });
  await expect(alpha.getByText(/^剩余 48% · /)).toBeVisible();
  await expect(
    alpha.getByRole("progressbar", { name: "Weekly allowance", exact: true }),
  ).toHaveAttribute("aria-valuenow", "48");
  await page.getByTestId("usage-options-menu").filter({ visible: true }).click();
  await page.getByTestId("usage-display-used").filter({ visible: true }).click();
  await expect(alpha.getByText(/^52% · /)).toBeVisible();
  await expect(
    alpha.getByRole("progressbar", { name: "Weekly allowance", exact: true }),
  ).toHaveAttribute("aria-valuenow", "52");
  await page.setViewportSize({ width: 1352, height: 782 });
  await expect(alpha.getByText("剩余 48%", { exact: true })).toBeVisible();
  await expect(
    alpha.getByRole("progressbar", { name: "Weekly allowance", exact: true }),
  ).toHaveAttribute("aria-valuenow", "52");
});
