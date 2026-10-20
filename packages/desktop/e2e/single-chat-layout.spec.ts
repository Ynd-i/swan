import { test, expect } from "../../app/e2e/support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { composerLocator, submitMessage } from "../../app/e2e/support/helpers/composer";
import { seedTerminalProfiles } from "../../app/e2e/support/helpers/new-workspace-launch";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDesktopRuntime } from "./support/runtime";
import { openSettings } from "../../app/e2e/support/helpers/app";
import { clickSettingsBackToWorkspace } from "../../app/e2e/support/helpers/settings";

test("macOS keeps one main conversation while tools open in the right sidebar", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "single-chat-layout-",
    title: "One main conversation",
    model: "ten-second-stream",
    repo: {
      files: [
        { path: "example.ts", content: "export const answer = 42;\n" },
        { path: "next.ts", content: "export const next = true;\n" },
      ],
    },
  });
  const profiles = await seedTerminalProfiles([
    { id: "codex-test-profile", name: "Codex", command: "/bin/echo", args: ["profile"] },
    { id: "claude-test-profile", name: "Claude Code", command: "/bin/echo", args: ["profile"] },
  ]);
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    await submitMessage(page, "Keep this conversation in the main area.");
    await expect(page.getByTestId("assistant-message").last()).toContainText(
      "(end of synthetic stream)",
      { timeout: 30_000 },
    );
    const draft = "Keep this draft while opening tools.";
    await composerLocator(page).fill(draft);
    const chatTitle = page.getByTestId("desktop-chat-title");
    const originalTitle = await chatTitle.textContent();
    // A project chat shows the folder before its title, as in the reference titlebar.
    await expect(page.getByTestId("desktop-chat-project-icon")).toBeVisible();
    await expect(page.getByTestId("workspace-new-tab-button")).toHaveCount(0);
    await expect(page.getByTestId("desktop-shell-rail")).toBeVisible();

    await page.getByTestId("workspace-explorer-toggle").click();
    const right = page.getByTestId("workspace-explorer-sidebar");
    const toolbar = page.getByTestId("desktop-explorer-toolbar");
    const plus = toolbar.getByTestId("explorer-sidebar-new-tab-button");
    await expect(plus).toBeVisible();
    // Explorer slides open over 220ms; measure once the dock and its toolbar have settled.
    await expect
      .poll(async () => {
        const [bar, dock] = await Promise.all([toolbar.boundingBox(), right.boundingBox()]);
        return bar && dock ? Math.abs(bar.x - dock.x) : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(1);
    const barBox = await toolbar.boundingBox();
    const dockBox = await right.boundingBox();
    if (!barBox || !dockBox) throw new Error("Missing right panel geometry");
    expect(Math.abs(barBox.width - dockBox.width)).toBeLessThanOrEqual(1);
    expect(barBox.y).toBeLessThanOrEqual(1);
    expect(Math.abs(barBox.y + barBox.height - dockBox.y)).toBeLessThanOrEqual(1);
    await expect(right.getByTestId("explorer-sidebar-tab-rail")).toHaveCount(0);
    await plus.click();
    const menu = page.getByTestId("workspace-new-tab-menu");
    await expect(menu.getByText("Terminal profiles", { exact: true })).toHaveCount(0);
    await expect(menu.getByText("Edit profiles", { exact: true })).toHaveCount(0);
    await expect(menu.getByText("Codex", { exact: true })).toHaveCount(0);
    await expect(menu.getByText("Claude Code", { exact: true })).toHaveCount(0);
    await menu.getByTestId("workspace-new-tab-menu-terminal").click();
    await expect(right.getByTestId("terminal-surface").filter({ visible: true })).toHaveCount(1);
    await expect(composerLocator(page)).toHaveValue(draft);
    await expect(chatTitle).toHaveText(originalTitle ?? "");

    // Only the Electron profile bridge is simulated; no external website is loaded.
    await page.evaluate(() => {
      if (!window.paseoDesktop) throw new Error("Missing desktop fixture");
      window.paseoDesktop.browser = {
        profilePartition: "persist:single-chat-test",
        registerAttachedBrowser: async () => {},
      };
    });
    await plus.click();
    await menu.getByTestId("workspace-new-tab-menu-browser").click();
    await expect(right.getByRole("textbox", { name: "Browser URL", exact: true })).toBeVisible();
    await expect(composerLocator(page)).toHaveValue(draft);

    await plus.click();
    await menu.getByTestId("workspace-new-tab-menu-files").click();
    await right
      .getByTestId("file-explorer-tree-scroll")
      .getByText("example.ts", { exact: true })
      .click();
    await expect(right.getByTestId("workspace-file-pane").filter({ visible: true })).toHaveCount(1);
    const tree = right.getByTestId("file-tree-rail-tree").filter({ visible: true });
    const treeToggle = right.getByTestId("file-toggle-tree").filter({ visible: true });
    // An opened file starts without the folder tree.
    await expect(tree).toHaveCount(0);
    await treeToggle.click();
    await expect(tree).toBeVisible();
    const editor = right.locator('.cm-content[contenteditable="true"]').filter({ visible: true });
    await expect(editor).toBeVisible();
    await editor.fill("export const answer = 43;");
    const editorNode = await editor.elementHandle();
    if (!editorNode) throw new Error("Missing live file editor");
    await treeToggle.click();
    await expect(tree).toHaveCount(0);
    expect(await editorNode.evaluate((node) => node.isConnected)).toBe(true);
    await expect(editor).toContainText("answer = 43");
    await treeToggle.click();
    await expect(tree).toBeVisible();
    expect(await editorNode.evaluate((node) => node.isConnected)).toBe(true);
    await expect(editor).toContainText("answer = 43");
    await page.screenshot({ path: testInfo.outputPath("file-tool-with-tree.png") });
    await tree.getByText("next.ts", { exact: true }).click();
    await expect(
      right.locator('.cm-content[contenteditable="true"]').filter({ visible: true }),
    ).toContainText("next = true");
    await expect(composerLocator(page)).toHaveValue(draft);

    await plus.click();
    await menu.getByTestId("workspace-new-tab-menu-diff").click();
    await expect(right.getByTestId("working-diff-panel").filter({ visible: true })).toHaveCount(1);
    await expect(chatTitle).toHaveText(originalTitle ?? "");
    await expect(composerLocator(page)).toHaveValue(draft);
    await expect(page.getByTestId("workspace-new-tab-button")).toHaveCount(0);
    await page.getByTestId("workspace-explorer-toggle").click();
    await expect(toolbar).toHaveCount(0);
    await page.getByTestId("workspace-explorer-toggle").click();
    await expect(toolbar).toHaveCount(1);
    await expect(right.getByTestId("working-diff-panel").filter({ visible: true })).toHaveCount(1);
    await openSettings(page);
    await expect(toolbar).toHaveCount(0);
    await clickSettingsBackToWorkspace(page);
    await expect(toolbar).toHaveCount(1);
    await expect(page.getByTestId("desktop-shell-rail")).toBeVisible();
    await expect(composerLocator(page)).toHaveValue(draft);
    const terminalsBeforeShortcut = await fixture.client.listTerminals(fixture.cwd, undefined, {
      workspaceId: fixture.workspaceId,
    });
    await composerLocator(page).focus();
    await page.keyboard.press("Meta+Shift+t");
    await expect(right.getByTestId("terminal-surface").filter({ visible: true })).toHaveCount(1);
    await expect
      .poll(
        async () =>
          (
            await fixture.client.listTerminals(fixture.cwd, undefined, {
              workspaceId: fixture.workspaceId,
            })
          ).terminals.length,
      )
      .toBe(terminalsBeforeShortcut.terminals.length + 1);
    await expect(chatTitle).toHaveText(originalTitle ?? "");
    await expect(composerLocator(page)).toHaveValue(draft);
    await page.setViewportSize({ width: 900, height: 782 });
    const composerBox = await page
      .getByTestId("message-input-root")
      .filter({ visible: true })
      .boundingBox();
    const sendBox = await page
      .getByRole("button", { name: "Send message", exact: true })
      .boundingBox();
    if (!composerBox || !sendBox) throw new Error("Missing narrow composer geometry");
    expect(sendBox.x + sendBox.width).toBeLessThanOrEqual(composerBox.x + composerBox.width);
    await expect(page.getByTestId("workspace-tabs-row").filter({ visible: true })).toHaveCount(0);
    await page.setViewportSize({ width: 1352, height: 782 });
    await toolbar.getByRole("button", { name: "next.ts", exact: true }).click();
    await page.mouse.move(800, 400);
    await page.screenshot({ path: testInfo.outputPath("single-main-chat-right-tools.png") });
  } finally {
    await profiles.restore();
    await fixture.cleanup();
  }
});
