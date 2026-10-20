import type { Page } from "@playwright/test";
import { test, expect } from "../../app/e2e/support/fixtures";
import { gotoAppShell, openSettings } from "../../app/e2e/support/helpers/app";
import {
  openSettingsSection,
  clickSettingsBackToWorkspace,
} from "../../app/e2e/support/helpers/settings";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installUsageReportsFixture } from "../../app/e2e/support/helpers/usage-reports";
import { installDesktopRuntime } from "./support/runtime";
import { seedLongMockAgentTimeline } from "../../app/e2e/support/helpers/timeline-pagination";
import { openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";

async function selectMotion(page: Page, option: "System" | "On" | "Off") {
  await openSettings(page);
  await openSettingsSection(page, "appearance");
  const control = page.getByTestId("appearance-reduced-motion");
  await control.getByRole("button", { name: option, exact: true }).click();
  await expect(control.getByRole("button", { name: option, exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await clickSettingsBackToWorkspace(page);
}

async function expectSidebarMotion(page: Page, reduced: boolean) {
  const sidebar = page.getByTestId("desktop-workspace-sidebar");
  const toggle = page.getByTestId("menu-button");
  await expect(sidebar).toBeVisible();
  // Hover waits for the opening transition to settle before measuring its full width.
  await sidebar.hover();
  const fullWidth = (await sidebar.boundingBox())!.width;
  const closingWidths = await page.evaluate(async () => {
    const button = document.querySelector<HTMLElement>('[data-testid="menu-button"]');
    const sidebarElement = document.querySelector<HTMLElement>(
      '[data-testid="desktop-workspace-sidebar"]',
    );
    if (!button || !sidebarElement) throw new Error("Missing sidebar controls");
    button.click();
    const widths: number[] = [];
    const started = performance.now();
    do {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      widths.push(sidebarElement.getBoundingClientRect().width);
    } while ((widths.length < 2 || widths.at(-1) !== 0) && performance.now() - started < 1_000);
    return widths;
  });
  // Observe the whole transition, not a single frame immediately after a live media change.
  if (reduced) expect(closingWidths.slice(1).every((width) => width === 0)).toBe(true);
  else expect(closingWidths.some((width) => width > 0 && width < fullWidth)).toBe(true);
  expect(closingWidths.at(-1)).toBe(0);
  await expect(sidebar).toBeHidden();
  await toggle.click();
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBe(fullWidth);
}

test("macOS reduced motion persists its override and follows live system changes", async ({
  page,
}, testInfo) => {
  await installDesktopRuntime(page, {
    serverId: getServerId(),
    manageBuiltInDaemon: false,
    daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
  });
  await installUsageReportsFixture(page, { lists: [[]] });
  await page.setViewportSize({ width: 1352, height: 782 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await gotoAppShell(page);
  await openSettings(page);
  await openSettingsSection(page, "appearance");
  const control = page.getByTestId("appearance-reduced-motion");
  await expect(control).toBeVisible();
  await expect(control.getByRole("button", { name: "System", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await control.getByRole("button", { name: "On", exact: true }).click();
  await expect(control.getByRole("button", { name: "On", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.screenshot({
    path: testInfo.outputPath("settings-reduced-motion.png"),
    animations: "disabled",
  });
  await clickSettingsBackToWorkspace(page);
  await expectSidebarMotion(page, true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await selectMotion(page, "Off");
  await expectSidebarMotion(page, false);
  await selectMotion(page, "System");
  await expectSidebarMotion(page, true);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expectSidebarMotion(page, false);
  await selectMotion(page, "On");
  await page.reload();
  await expect(page).toHaveURL(/\/open-project$/);
  await openSettings(page);
  await openSettingsSection(page, "appearance");
  await expect(control.getByRole("button", { name: "On", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByTestId("appearance-theme-modes").getByRole("button", { name: "System", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("macOS reduced motion keeps outline and streaming loader consistent with live preferences", async ({
  page,
}) => {
  const agent = await seedLongMockAgentTimeline({ turns: 3, liveTurns: "thirty-minute-stream" });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await installUsageReportsFixture(page, { lists: [[]] });
    await page.addInitScript(() =>
      localStorage.setItem("@paseo:app-settings", JSON.stringify({ reducedMotion: "on" })),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
    await openAgentRoute(page, agent);
    await agent.client.sendAgentMessage(
      agent.agentId,
      "Keep a synthetic stream running for motion checks.",
    );
    const loader = page.getByTestId("synced-loader").filter({ visible: true });
    const tick = page.getByTestId("chat-outline-rail").getByRole("tab").first();
    const pill = tick.locator(":scope > div").first();
    await expect(loader).toBeVisible();
    const sampleLoader = () =>
      loader.evaluate((node) =>
        Array.from(
          node.querySelectorAll(":scope > div > div"),
          (dot) => getComputedStyle(dot).opacity,
        ),
      );
    const expectLoader = async (reduced: boolean) => {
      const before = await sampleLoader();
      expect(before).toHaveLength(6);
      if (reduced) {
        const after = await loader.evaluate(async (node) => {
          await new Promise((resolve) => setTimeout(resolve, 250));
          return Array.from(
            node.querySelectorAll(":scope > div > div"),
            (dot) => getComputedStyle(dot).opacity,
          );
        });
        expect(after).toEqual(before);
      } else await expect.poll(sampleLoader).not.toEqual(before);
    };
    await tick.focus();
    await expect(pill).toHaveCSS("width", "10px");
    await expect(pill).toHaveCSS("transition-duration", "0s");
    await expectLoader(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await selectMotion(page, "Off");
    await tick.focus();
    await expect(pill).toHaveCSS("width", "26px");
    await expectLoader(false);
    await selectMotion(page, "System");
    await tick.focus();
    await expect(pill).toHaveCSS("width", "10px");
    await expectLoader(true);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(pill).toHaveCSS("width", "26px");
    await expectLoader(false);
    await page.getByRole("button", { name: "Stop agent", exact: true }).click();
  } finally {
    await agent.cleanup();
  }
});
