import { test, expect } from "../../app/e2e/support/fixtures";
import { TerminalE2EHarness } from "../../app/e2e/support/helpers/terminal-dsl";
import {
  buildTerminalWorkspaceUrl,
  getTerminalBufferText,
} from "../../app/e2e/support/helpers/terminal-perf";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDesktopRuntime } from "./support/runtime";
import { installUsageReportsFixture } from "../../app/e2e/support/helpers/usage-reports";

test("desktop panel tabs keep active controls visible and retain terminals across resizing", async ({
  page,
}, testInfo) => {
  const harness = await TerminalE2EHarness.create({ tempPrefix: "desktop-panels-" });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      confirmShouldAccept: true,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await installUsageReportsFixture(page, { lists: [[]] });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    const first = await harness.createTerminal({ name: "Panel verification shell" });
    const second = await harness.createTerminal({ name: "Second shell" });
    await page.goto(buildTerminalWorkspaceUrl(harness.workspaceId, first.id));
    const firstTab = page.getByTestId(`explorer-sidebar-tab-terminal_${first.id}`);
    const secondTab = page.getByTestId(`explorer-sidebar-tab-terminal_${second.id}`);
    const closeFirst = page.getByTestId(`explorer-sidebar-tab-close-terminal_${first.id}`);
    await expect(firstTab).toHaveAttribute("aria-selected", "true");
    await page.mouse.move(600, 600);
    await expect(closeFirst.locator("..")).toHaveCSS("opacity", "1");
    await expect(firstTab).toHaveCSS("border-radius", "8px");
    await secondTab.click();
    await expect(secondTab).toHaveAttribute("aria-selected", "true");
    await firstTab.click();
    await expect(harness.terminalSurface(page).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByTestId("terminal-attach-loading")).toBeHidden();
    // Explorer starts on the launcher, and launched tabs get instance ids, so read each id back.
    const selectedTab = page.locator(
      '[data-testid^="explorer-sidebar-tab-"][aria-selected="true"]',
    );
    const launchTool = async (tool: "changes" | "files", readyTestId: string) => {
      await page.getByTestId("explorer-sidebar-new-tab-button").click();
      await page.getByTestId(`workspace-new-tab-menu-${tool}`).click();
      await expect(page.getByTestId(readyTestId).filter({ visible: true })).toBeVisible();
      const testId = await selectedTab.getAttribute("data-testid");
      if (!testId) throw new Error(`Missing ${tool} tab identity`);
      return testId;
    };
    const closeTestId = (testId: string) =>
      testId.replace("explorer-sidebar-tab-", "explorer-sidebar-tab-close-");
    const changesTabId = await launchTool("changes", "changes-tree-panel");
    const filesTabId = await launchTool("files", "files-pane-header");
    const explorerRail = page.getByTestId("explorer-sidebar-tab-rail");
    const filesTab = explorerRail.getByRole("button", {
      name: "Browse workspace files",
      exact: true,
    });
    const closeFiles = page.getByTestId(closeTestId(filesTabId));
    await expect(page.getByTestId("file-explorer-tree-scroll")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("supporting-tabs-baseline.png") });
    await expect(filesTab).toHaveCSS("height", "32px");
    await expect(firstTab).toHaveCSS("height", "32px");
    await page.mouse.move(600, 600);
    await expect(closeFiles.locator("..")).toHaveCSS("opacity", "1");
    await filesTab.focus();
    await page.keyboard.press("Tab");
    await expect(closeFiles).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(filesTab).toHaveCount(0);
    await expect(secondTab).toBeVisible();
    const liveTerminals = await harness.client.listTerminals(harness.tempRepo.path, undefined, {
      workspaceId: harness.workspaceId,
    });
    expect(liveTerminals.terminals.map((terminal) => terminal.id)).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );
    await explorerRail.click({
      button: "right",
      position: { x: 20, y: 2 },
    });
    await page
      .getByTestId("explorer-sidebar-tab-configuration")
      .getByRole("menuitem", { name: "Files", exact: true })
      .click();
    await expect(page.getByTestId("files-pane-header")).toBeVisible();
    await expect(page.getByTestId("file-explorer-tree-scroll")).toBeVisible();
    await expect(filesTab).toHaveAttribute("aria-selected", "true");
    const changesTab = page.getByTestId(changesTabId);
    const closeChanges = page.getByTestId(closeTestId(changesTabId));
    await page.mouse.move(600, 600);
    await expect(closeChanges.locator("..")).toHaveCSS("opacity", "0");
    await changesTab.focus();
    await page.keyboard.press("Tab");
    await expect(closeChanges).toBeFocused();
    await expect(closeChanges.locator("..")).toHaveCSS("opacity", "1");
    await expect(filesTab).toHaveAttribute("aria-selected", "true");
    await firstTab.focus();
    await expect(closeChanges.locator("..")).toHaveCSS("opacity", "0");
    const changesBox = await changesTab.boundingBox();
    await changesTab.hover();
    await expect(closeChanges.locator("..")).toHaveCSS("opacity", "1");
    expect(await changesTab.boundingBox()).toEqual(changesBox);
    await closeChanges.hover();
    await expect(closeChanges.locator("..")).toHaveCSS("opacity", "1");
    expect(await changesTab.boundingBox()).toEqual(changesBox);
    await closeChanges.click();
    await expect(changesTab).toHaveCount(0);
    await expect(filesTab).toHaveAttribute("aria-selected", "true");
    await expect(secondTab).toBeVisible();
    await page.mouse.move(800, 400);
    await page.screenshot({ path: testInfo.outputPath("supporting-panels-wide.png") });
    await firstTab.click({ position: { x: 12, y: 13 } });
    await page.setViewportSize({ width: 900, height: 680 });
    await expect(firstTab).toBeInViewport();
    await expect(firstTab).toHaveAttribute("aria-selected", "true");
    await expect(firstTab).toHaveCSS("height", "32px");
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.getByTestId("workspace-explorer-toggle").click();
    await expect(page.getByTestId("workspace-explorer-sidebar")).toBeHidden();
    await page.getByTestId("workspace-explorer-toggle").click();
    await secondTab.click();
    await expect(secondTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("terminal-attach-loading")).toBeHidden();
    const closeSecond = page.getByTestId(`explorer-sidebar-tab-close-terminal_${second.id}`);
    await closeSecond.focus();
    await expect(closeSecond).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(secondTab).toHaveCount(0);
    await expect(firstTab).toHaveAttribute("aria-selected", "true");
    await expect(harness.terminalSurface(page).filter({ visible: true })).toHaveCount(1);
  } catch (error) {
    await page
      .screenshot({ path: testInfo.outputPath("supporting-panels-failure.png"), timeout: 5000 })
      .catch(() => {});
    throw error;
  } finally {
    await harness.cleanup();
  }
});

test("macOS terminal content inset retains PTY input through resize and reopening", async ({
  page,
}, testInfo) => {
  const harness = await TerminalE2EHarness.create({ tempPrefix: "desktop-terminal-content-" });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await installUsageReportsFixture(page, { lists: [[]] });
    await page.setViewportSize({ width: 1352, height: 781 });
    await page.emulateMedia({ colorScheme: "dark" });
    const terminal = await harness.createTerminal({
      name: "Terminal content verification",
      command: "bash",
      args: ["--noprofile", "--norc"],
    });
    await harness.openTerminal(page, { terminalId: terminal.id });
    await harness.setupPrompt(page, "TERMINAL_CONTENT_READY");
    const surface = harness.terminalSurface(page).filter({ visible: true });
    const dock = page.getByTestId("workspace-explorer-sidebar");
    const terminalTab = page.getByTestId(`explorer-sidebar-tab-terminal_${terminal.id}`);
    await surface.pressSequentially(
      "printf '\\033[2J\\033[H'; printf '%s\\n' 'TERMINAL_WIDE_OK'\n",
      { delay: 0 },
    );
    await expect.poll(() => getTerminalBufferText(page)).toMatch(/^TERMINAL_WIDE_OK$/m);
    // Save the actual baseline before any visual assertion can fail.
    await page.screenshot({ path: testInfo.outputPath("terminal-content-wide.png") });
    await expect(surface).toHaveCSS("background-color", "rgb(38, 38, 38)");
    await expect(surface.locator("..")).toHaveCSS("background-color", "rgb(38, 38, 38)");
    const dockBox = await dock.boundingBox();
    const surfaceBox = await surface.boundingBox();
    const screenBox = await surface.locator(".xterm-screen").boundingBox();
    if (!dockBox || !surfaceBox || !screenBox) throw new Error("Missing terminal content geometry");
    expect(Math.abs(screenBox.x - dockBox.x - 16)).toBeLessThanOrEqual(1);
    expect(Math.abs(screenBox.y - dockBox.y - 8)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(dockBox.x + dockBox.width - surfaceBox.x - surfaceBox.width - 16),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(dockBox.y + dockBox.height - surfaceBox.y - surfaceBox.height - 8),
    ).toBeLessThanOrEqual(1);
    expect(screenBox.width).toBeLessThanOrEqual(surfaceBox.width);

    await page.setViewportSize({ width: 900, height: 781 });
    await expect(surface).toBeInViewport();
    await surface.click();
    await surface.pressSequentially("printf '%s\\n' 'TERMINAL_NARROW_OK'\n", { delay: 0 });
    await expect.poll(() => getTerminalBufferText(page)).toMatch(/^TERMINAL_NARROW_OK$/m);
    const narrowDock = await dock.boundingBox();
    const narrowScreen = await surface.locator(".xterm-screen").boundingBox();
    if (!narrowDock || !narrowScreen) throw new Error("Missing resized terminal geometry");
    expect(Math.abs(narrowScreen.x - narrowDock.x - 16)).toBeLessThanOrEqual(1);
    expect(Math.abs(narrowScreen.y - narrowDock.y - 8)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("terminal-content-narrow.png") });
    await page.getByTestId("workspace-explorer-toggle").click();
    await expect(dock).toBeHidden();
    await page.getByTestId("workspace-explorer-toggle").click();
    await expect(terminalTab).toHaveAttribute("aria-selected", "true");
    await expect(surface).toBeVisible();
    await surface.click();
    await surface.pressSequentially("printf '%s\\n' 'TERMINAL_REOPENED_OK'\n", { delay: 0 });
    await expect.poll(() => getTerminalBufferText(page)).toMatch(/^TERMINAL_REOPENED_OK$/m);
    const live = await harness.client.listTerminals(harness.tempRepo.path, undefined, {
      workspaceId: harness.workspaceId,
    });
    expect(live.terminals.map((entry) => entry.id)).toEqual([terminal.id]);
  } finally {
    await harness.cleanup();
  }
});
