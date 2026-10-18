import { test, expect } from "../../app/e2e/support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { composerLocator } from "../../app/e2e/support/helpers/composer";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installUsageReportsFixture } from "../../app/e2e/support/helpers/usage-reports";
import { installDesktopRuntime, waitForDirectoryDialog } from "./support/runtime";
import { openSettingsSection } from "../../app/e2e/support/helpers/settings";
import { expectAddProjectPage } from "../../app/e2e/support/helpers/add-project-flow";

const FILE_PATH = "src/quick-search.ts";

test("macOS chat search keeps compact geometry and real chat and file navigation", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "chat-search-reference-",
    title: "Quick chat 00",
    repo: { files: [{ path: FILE_PATH, content: "export const searchReference = true;\n" }] },
  });
  try {
    for (let index = 1; index < 12; index += 1) {
      await fixture.client.createAgent({
        provider: "mock",
        cwd: fixture.cwd,
        workspaceId: fixture.workspaceId,
        title: `Quick chat ${String(index).padStart(2, "0")}`,
        modeId: "load-test",
        model: "e2e-fast-stream",
      });
    }
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await installUsageReportsFixture(page, { lists: [[]] });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    const composer = composerLocator(page);
    await composer.fill("Preserve this local draft while searching chats.");
    await page.keyboard.press("Meta+k");
    const panel = page.getByTestId("command-center-panel");
    const input = panel.getByTestId("command-center-input");
    await expect(panel).toBeVisible();
    expect(await panel.boundingBox()).toEqual({ x: 416, y: 140, width: 520, height: 486 });
    await expect(input).toHaveAttribute("placeholder", "Search chats");
    await expect(panel.getByText("Chats", { exact: true })).toBeVisible();
    const chats = panel
      .locator('[data-testid^="command-center-agent-"]')
      .filter({ has: page.getByText(/^Quick chat \d+$/) });
    await expect(chats).toHaveCount(9);
    await expect(panel.getByText("New chat", { exact: true })).toBeVisible();
    await expect(panel.getByText("Open folder", { exact: true })).toBeVisible();
    await expect(panel.getByText("Search files", { exact: true })).toBeVisible();
    await expect(panel.getByText("Settings", { exact: true })).toBeInViewport({ ratio: 1 });
    await expect(panel.getByText("History", { exact: true })).toHaveCount(0);
    await expect(panel).toHaveCSS("background-color", "rgb(38, 38, 38)");
    await expect(panel).toHaveCSS("border-color", "rgb(52, 52, 52)");
    await expect(chats.first().locator("..")).toHaveCSS("height", "30px");
    await page.mouse.move(20, 30);
    await page.screenshot({
      path: testInfo.outputPath("command-center-chats.png"),
      animations: "disabled",
    });

    const ninthTitle = await chats
      .nth(8)
      .getByText(/^Quick chat \d+$/)
      .innerText();
    await page.keyboard.press("Control+9");
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("desktop-chat-title")).toHaveText(ninthTitle);
    await page.keyboard.press("Meta+k");
    await input.fill("Quick chat 00");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("desktop-chat-title")).toHaveText("Quick chat 00");
    await expect(composer).toHaveValue("Preserve this local draft while searching chats.");
    await page.keyboard.press("Meta+k");
    await input.fill("Quick chat");
    await expect(chats).toHaveCount(12);
    for (let index = 0; index < 11; index += 1) await page.keyboard.press("ArrowDown");
    await expect(chats.nth(11)).toBeInViewport({ ratio: 1 });
    const lastTitle = await chats
      .nth(11)
      .getByText(/^Quick chat \d+$/)
      .innerText();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("desktop-chat-title")).toHaveText(lastTitle);

    await page.keyboard.press("Meta+k");
    await input.fill("main");
    await expect(
      panel.getByTestId(`command-center-workspace-${getServerId()}:${fixture.workspaceId}`),
    ).toBeVisible();
    await input.fill("history");
    await expect(panel.getByText("History", { exact: true })).toBeVisible();
    await input.fill("Search files");
    await panel.getByText("Search files", { exact: true }).click();
    await expect(panel.getByTestId("command-center-files-scope")).toBeVisible();
    await expect(input).toHaveValue("");
    await input.fill("quick-search");
    const file = panel.getByTestId(`command-center-file-row-${FILE_PATH}`);
    await expect(file).toBeVisible();
    await file.click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("workspace-tabs-row").filter({ visible: true })).toHaveCount(0);
    await expect(page.getByTestId("workspace-explorer-sidebar")).toBeVisible();
    await expect(
      page.getByTestId("file-path-menu-trigger").filter({ visible: true }),
    ).toContainText("quick-search.ts");
    await page.keyboard.press("Meta+p");
    await expect(panel.getByTestId("command-center-files-scope")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});

test("macOS chat search primary actions retain project selection and theme tokens", async ({
  page,
}) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "chat-search-actions-",
    title: "Action chat",
  });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
      dialogOpenResult: null,
    });
    await installUsageReportsFixture(page, { lists: [[]] });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    await expect(page.getByTestId("desktop-chat-title")).toHaveText("Action chat");
    const panel = page.getByTestId("command-center-panel");
    await page.keyboard.press("Meta+k");
    await panel.getByText("New chat", { exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("desktop-new-chat-hero")).toBeVisible();
    await composerLocator(page).fill("Keep the new chat draft.");
    await page.keyboard.press("Meta+k");
    await panel.getByText("Search files", { exact: true }).click();
    const projects = page.getByRole("textbox", { name: "Search projects", exact: true });
    await expect(projects).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(projects).toHaveCount(0);
    await expect(composerLocator(page)).toHaveValue("Keep the new chat draft.");
    await page.keyboard.press("Meta+k");
    await panel.getByText("Open folder", { exact: true }).click();
    await expectAddProjectPage(page, "method");
    await page.getByRole("button", { name: /^Browse/ }).click();
    expect(await waitForDirectoryDialog(page)).toEqual({
      createDirectory: true,
      directory: true,
      multiple: false,
    });
    await expectAddProjectPage(page, "method");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("add-project-flow")).toHaveCount(0);
    await page.keyboard.press("Meta+k");
    await panel.getByText("Settings", { exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/general$/);
    await openSettingsSection(page, "appearance");
    await page.getByLabel(/^Theme:/).click();
    await page.getByRole("menuitem", { name: "Light", exact: true }).click();
    await page.keyboard.press("Meta+k");
    await expect(panel).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await page.setViewportSize({ width: 700, height: 782 });
    await expect(panel).toBeInViewport({ ratio: 1 });
    expect((await panel.boundingBox())?.width).toBe(520);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});
