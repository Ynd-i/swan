import { test, expect } from "../../app/e2e/support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import {
  observeForkAttachment,
  forkMostRecentAssistantTurnToNewTab,
  expectChatHistoryAttachment,
} from "../../app/e2e/support/helpers/assistant-fork";
import { installDesktopRuntime } from "./support/runtime";
import { submitMessage } from "../../app/e2e/support/helpers/composer";
import { waitForSettledPosition } from "../../app/e2e/support/helpers/sheet-layout";

test("desktop completed activity preserves copy, search and fork content", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const needle = "hardcoded at 80px";
  const fork = observeForkAttachment(page);
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "desktop-turn-activity-",
    title: "Activity disclosure check",
    model: "ten-second-stream",
  });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await page.addInitScript(() => {
      Object.assign(globalThis, {
        __PASEO_E2E_WEB_PARTIAL_VIRTUALIZATION_THRESHOLD: 1,
        __PASEO_E2E_WEB_MOUNTED_RECENT_STREAM_ITEMS: 3,
      });
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    await submitMessage(page, "Show a synthetic activity sequence.");
    await expect(page.getByTestId("turn-working-indicator")).toBeVisible();
    await expect(page.getByTestId("desktop-turn-activity")).toHaveCount(0);
    await expect(page.getByTestId("tool-call-badge").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("desktop-turn-activity")).toHaveCount(0);
    await expect(page.getByTestId("assistant-message").last()).toContainText(
      "(end of synthetic stream)",
      { timeout: 30_000 },
    );
    const activity = page.getByTestId("desktop-turn-activity").first();
    await expect(activity).toHaveAttribute("aria-expanded", "false");
    await expect(activity).toContainText("Worked for");
    await page.setViewportSize({ width: 700, height: 680 });
    await expect(activity).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Worked for/ })).toHaveCount(1);
    await page.setViewportSize({ width: 1352, height: 782 });
    await expect(activity).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("tool-call-badge")).toHaveCount(0);
    await expect(page.getByTestId("assistant-message").filter({ hasText: needle })).toHaveCount(0);
    await page.getByRole("button", { name: "Copy turn", exact: true }).last().click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(needle);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      "(end of synthetic stream)",
    );
    await page.screenshot({ path: testInfo.outputPath("activity-collapsed.png") });
    await activity.scrollIntoViewIfNeeded();
    await waitForSettledPosition(activity);
    const beforeExpansion = await activity.boundingBox();
    if (!beforeExpansion) throw new Error("Missing activity header");
    await activity.click();
    await expect(activity).toHaveAttribute("aria-expanded", "true");
    await waitForSettledPosition(activity);
    await expect(activity).toBeInViewport();
    const afterExpansion = await activity.boundingBox();
    if (!afterExpansion) throw new Error("Missing expanded activity header");
    expect(Math.abs(afterExpansion.y - beforeExpansion.y)).toBeLessThan(2);
    await expect(page.getByTestId("tool-call-badge").first()).toBeVisible();
    await activity.click();
    await expect(activity).toHaveAttribute("aria-expanded", "false");
    await page.getByTestId("assistant-message").last().click();
    await page.keyboard.press("Meta+f");
    const find = page.getByRole("textbox", { name: "Find in pane", exact: true });
    await expect(find).toBeFocused();
    await find.fill(needle);
    await expect(page.getByRole("status", { name: "Find matches" })).toHaveText(/1 of [1-9]/);
    await expect(activity).toHaveAttribute("aria-expanded", "true");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const matches: string[] = [];
          for (const highlight of CSS.highlights.values()) {
            for (const range of highlight) matches.push(range.toString());
          }
          return matches;
        }),
      )
      .toContain(needle);
    await find.press("Escape");
    await page.screenshot({ path: testInfo.outputPath("activity-expanded.png") });
    await activity.click();
    await expect(activity).toHaveAttribute("aria-expanded", "false");
    await forkMostRecentAssistantTurnToNewTab(page);
    await expectChatHistoryAttachment(page);
    const attachment = await fork.waitForText();
    expect(attachment).toContain(needle);
    expect(attachment).toContain("(end of synthetic stream)");
  } catch (error) {
    await page.screenshot({ path: testInfo.outputPath("activity-failure.png") });
    throw error;
  } finally {
    await fixture.cleanup();
  }
});
