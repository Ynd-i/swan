import { test, expect } from "../../app/e2e/support/fixtures";
import { gotoAppShell, openSettings } from "../../app/e2e/support/helpers/app";
import { openSettingsSection } from "../../app/e2e/support/helpers/settings";
import {
  expectNewWorkspaceForAddedProject,
  openAddProjectFlow,
} from "../../app/e2e/support/helpers/add-project-flow";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { waitForConnectedHost } from "../../app/e2e/support/helpers/hosts";
import { expectOpenedProject } from "../../app/e2e/support/helpers/project-picker-ui";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { connectSeedClient, seedWorkspace } from "../../app/e2e/support/helpers/seed-client";
import { installDesktopRuntime, waitForDirectoryDialog } from "./support/runtime";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { composerLocator, dropFileOnComposer } from "../../app/e2e/support/helpers/composer";
import { expectAgentIdle } from "../../app/e2e/support/helpers/agent-stream";
import { installUsageReportsFixture } from "../../app/e2e/support/helpers/usage-reports";

test("desktop new chat retains project selection and creates a chat", async ({
  page,
}, testInfo) => {
  const workspace = await seedWorkspace({ repoPrefix: "desktop-new-chat-" });
  try {
    const existing = await workspace.client.createAgent({
      provider: "mock",
      cwd: workspace.repoPath,
      workspaceId: workspace.workspaceId,
      title: "Existing chat",
      model: "five-minute-stream",
      modeId: "load-test",
    });
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, { workspaceId: workspace.workspaceId, agentId: existing.id });
    await expect(page.getByTestId("desktop-chat-title")).toHaveText("Existing chat");
    // Recent and the project group both list the chat; either row opens it.
    const workspaceRow = page
      .getByTestId(`desktop-chat-${getServerId()}:${existing.id}`)
      .filter({ visible: true })
      .first();
    await expect(workspaceRow).toBeVisible();
    await expect(page.getByTestId("desktop-shell-rail")).toBeVisible();
    await page.getByTestId("sidebar-global-new-workspace").click();
    await expect(page.getByTestId("desktop-new-chat-hero")).toContainText(
      workspace.projectDisplayName,
    );
    const project = page.getByTestId("new-workspace-project-picker-trigger");
    await expect(project).toContainText(workspace.projectDisplayName);
    await project.click();
    await expect(page.getByRole("textbox", { name: "Search projects" })).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(
      page.getByTestId("combined-model-selector").filter({ visible: true }),
    ).toContainText("Ten second stream");
    await composerLocator(page).focus();
    await page.mouse.move(850, 400);
    await page.screenshot({ path: testInfo.outputPath("new-chat.png") });
    console.info("New chat visual evidence", testInfo.outputPath("new-chat.png"));
    await composerLocator(page).fill("Keep this draft when resizing.");
    await page.setViewportSize({ width: 700, height: 782 });
    await expect(page.getByTestId("desktop-shell-rail")).toHaveCount(0);
    await expect(composerLocator(page)).toHaveValue("Keep this draft when resizing.");
    await page.setViewportSize({ width: 1352, height: 782 });
    await expect(page.getByTestId("desktop-new-chat-hero")).toBeVisible();
    await expect(composerLocator(page)).toHaveValue("Keep this draft when resizing.");
    await workspaceRow.click();
    await expect(page.getByTestId("desktop-chat-title")).toHaveText("Existing chat");
    await page.getByTestId("desktop-shell-back").click();
    await expect(page.getByTestId("desktop-new-chat-hero")).toBeVisible();
    await expect(composerLocator(page)).toHaveValue("Keep this draft when resizing.");
    await page.getByTestId("desktop-shell-forward").click();
    await expect(page.getByTestId("desktop-chat-title")).toHaveText("Existing chat");
    await page.getByTestId("desktop-shell-back").click();
    await expect(composerLocator(page)).toHaveValue("Keep this draft when resizing.");
    const prompt = "Create a chat from the desktop composer.";
    await composerLocator(page).fill(prompt);
    await page.getByTestId("workspace-create-submit").click();
    await expect(page.getByTestId("user-message").filter({ hasText: prompt })).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await workspace.client.fetchWorkspaces({ filter: { projectId: workspace.projectId } })
          ).entries.filter((entry) => entry.id !== workspace.workspaceId).length,
      )
      .toBe(1);
    await page.getByRole("button", { name: "Stop agent", exact: true }).click();
    await expectAgentIdle(page);
    await page.mouse.move(850, 450);
    await page.screenshot({ path: testInfo.outputPath("first-message.png") });
    console.info("Transcript visual evidence", testInfo.outputPath("first-message.png"));
    await page.getByTestId("desktop-shell-history").click();
    await expect(page).toHaveURL(/\/sessions(?:[/?]|$)/);
    await page.getByTestId("desktop-shell-schedules").click();
    await expect(page).toHaveURL(/\/schedules(?:[/?]|$)/);
    await page.getByTestId("sidebar-settings").click();
    await expect(page).toHaveURL(/\/settings(?:[/?]|$)/);
    await expect(page.getByTestId("desktop-shell-rail")).toBeVisible();
    await page.getByTestId("desktop-shell-home").click();
    await expect(page).toHaveURL(/\/open-project(?:[/?]|$)/);
    await expect(workspaceRow).toBeVisible();
  } finally {
    await workspace.cleanup();
  }
});

test("desktop composer keeps send and stop reachable with attachments", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "desktop-composer-",
    title: "Composer layout check",
    model: "five-minute-stream",
  });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await installUsageReportsFixture(page, { lists: [[]] });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    await expect(page.getByTestId("desktop-chat-title")).toHaveText("Composer layout check");
    await expect(page.getByRole("button", { name: "Start dictation", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Enable Voice mode", exact: true })).toHaveCount(
      0,
    );
    const mode = page.getByTestId("mode-control").filter({ visible: true });
    const model = page.getByTestId("combined-model-selector").filter({ visible: true });
    await expect(mode).toBeVisible();
    await expect(model).toContainText("Five minute stream");
    const [modeBox, modelBox] = await Promise.all([mode.boundingBox(), model.boundingBox()]);
    if (!modeBox || !modelBox) throw new Error("Composer controls did not render");
    expect(modeBox.x + modeBox.width).toBeLessThanOrEqual(modelBox.x);
    await model.click();
    const effort = page.getByTestId("desktop-thinking-range");
    await expect(effort).toHaveAttribute("aria-valuetext", "Low");
    const effortPopover = effort.locator(
      "xpath=ancestor::div[.//*[@data-testid='desktop-model-browse']][1]",
    );
    const effortIcon = effortPopover.locator("svg").first();
    const effortLevel = effortPopover.getByText("Low", { exact: true });
    await expect(effort).toHaveCSS("accent-color", "rgb(217, 119, 87)");
    await expect(effortIcon).toHaveCSS("stroke", "rgb(217, 119, 87)");
    await expect(effortLevel).toHaveCSS("color", "rgb(217, 119, 87)");
    const [levelBox, modelNameBox] = await Promise.all([
      effortLevel.boundingBox(),
      effortPopover.getByText("Five minute stream", { exact: true }).boundingBox(),
    ]);
    if (!levelBox || !modelNameBox) throw new Error("Effort header did not render");
    expect(
      Math.abs(levelBox.x + levelBox.width / 2 - (modelNameBox.x + modelNameBox.width / 2)),
    ).toBeLessThan(1);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(effort).toHaveCount(0);
    await model.click();
    await expect(effort).toHaveCSS("accent-color", "rgb(249, 115, 22)");
    await expect(effortIcon).toHaveCSS("stroke", "rgb(249, 115, 22)");
    await expect(effortLevel).toHaveCSS("color", "rgb(249, 115, 22)");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(effort).toHaveCount(0);
    await model.click();
    await expect(effort).toHaveCSS("accent-color", "rgb(217, 119, 87)");
    await expect(effortIcon).toHaveCSS("stroke", "rgb(217, 119, 87)");
    await expect(effortLevel).toHaveCSS("color", "rgb(217, 119, 87)");
    await page.getByTestId("desktop-model-browse").click();
    await page.getByRole("textbox", { name: /search model/i }).fill("Ten second stream");
    await page.getByText("Ten second stream", { exact: true }).click();
    await expect
      .poll(
        async () => (await fixture.client.fetchAgent({ agentId: fixture.agentId }))?.agent.model,
      )
      .toBe("ten-second-stream");
    await model.click();
    await effort.press("ArrowUp");
    await expect(effort).toHaveAttribute("aria-valuetext", "Medium");
    await effort.press("ArrowDown");
    await expect(effort).toHaveAttribute("aria-valuetext", "Low");
    await effort.press("End");
    await expect
      .poll(
        async () =>
          (await fixture.client.fetchAgent({ agentId: fixture.agentId }))?.agent.thinkingOptionId,
      )
      .toBe("high");
    await expect(effort).toHaveAttribute("aria-valuetext", "High");
    await page.getByTestId("desktop-thinking-reset").click();
    await expect
      .poll(
        async () =>
          (await fixture.client.fetchAgent({ agentId: fixture.agentId }))?.agent.thinkingOptionId,
      )
      .toBe("low");
    const sliderBox = await effort.boundingBox();
    if (!sliderBox) throw new Error("Reasoning slider did not render");
    await page.mouse.move(sliderBox.x + 8, sliderBox.y + sliderBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sliderBox.x + sliderBox.width - 8, sliderBox.y + sliderBox.height / 2);
    expect(
      (await fixture.client.fetchAgent({ agentId: fixture.agentId }))?.agent.thinkingOptionId,
    ).toBe("low");
    await page.mouse.up();
    await expect
      .poll(
        async () =>
          (await fixture.client.fetchAgent({ agentId: fixture.agentId }))?.agent.thinkingOptionId,
      )
      .toBe("high");
    await expect(effort).toHaveAttribute("aria-valuetext", "High");
    await page.screenshot({ path: testInfo.outputPath("model-effort-popover.png") });
    await page.getByTestId("desktop-model-browse").click();
    await page.getByRole("textbox", { name: /search model/i }).fill("Max-only thinking stream");
    await page.getByText("Max-only thinking stream", { exact: true }).click();
    await expect(model).toContainText("Max-only thinking stream");
    await model.click();
    await expect(effort).toHaveAttribute("aria-valuetext", "Max");
    await expect(effort).toBeDisabled();
    await page.getByTestId("desktop-model-browse").click();
    await page.getByRole("textbox", { name: /search model/i }).fill("Thirty minute stream");
    await page.getByText("Thirty minute stream", { exact: true }).click();
    await expect(model).toContainText("Thirty minute stream");
    await model.click();
    await expect(page.getByRole("textbox", { name: /search model/i })).toBeVisible();
    await expect(effort).toHaveCount(0);
    await page.keyboard.press("Escape");
    await composerLocator(page).fill("Check the attached layout fixture.");
    await dropFileOnComposer(page, {
      name: "layout-fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"layout":"desktop"}'),
    });
    const attachment = page.getByTestId("composer-file-attachment-pill");
    await expect(attachment).toContainText("layout-fixture.json");
    await page.screenshot({ path: testInfo.outputPath("composer-wide.png") });

    await page.setViewportSize({ width: 900, height: 680 });
    await composerLocator(page).fill("Check the attached layout fixture.\n".repeat(40));
    const send = page.getByRole("button", { name: "Send message", exact: true });
    await expect(send).toBeInViewport();
    await expect(attachment).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("composer-narrow.png") });
    console.info("Composer visual evidence", {
      wide: testInfo.outputPath("composer-wide.png"),
      narrow: testInfo.outputPath("composer-narrow.png"),
      modelEffort: testInfo.outputPath("model-effort-popover.png"),
    });
    await send.click();
    const stop = page.getByRole("button", { name: "Stop agent", exact: true });
    await expect(stop).toBeInViewport();
    await expect(attachment).toHaveCount(0);
    await stop.click();
    await expectAgentIdle(page);
    await composerLocator(page).fill("Keep typing without voice shortcuts.");
    await composerLocator(page).press("Meta+d");
    await composerLocator(page).press("Meta+Shift+d");
    await expect(composerLocator(page)).toHaveValue("Keep typing without voice shortcuts.");
    await openSettings(page);
    await openSettingsSection(page, "shortcuts");
    await expect(page.getByTestId("shortcut-actions-focus-message-input")).toBeVisible();
    for (const action of ["voice-toggle", "dictation-toggle", "voice-mute-toggle"]) {
      await expect(page.getByTestId(`shortcut-actions-${action}`)).toHaveCount(0);
    }
    await openSettingsSection(page, "diagnostics");
    await expect(page.getByTestId("app-diagnostic-row")).toBeVisible();
    await expect(page.getByText("Test audio", { exact: true })).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});

test("desktop chat navigation preserves sibling drafts and scopes pinning", async ({
  page,
}, testInfo) => {
  // Allow the real host liveness check to detect a dropped browser connection.
  test.setTimeout(120_000);
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "desktop-chat-navigation-",
    title: "First chat",
  });
  try {
    const second = await fixture.client.createAgent({
      provider: "mock",
      cwd: fixture.cwd,
      workspaceId: fixture.workspaceId,
      title: "Second chat",
      model: "e2e-fast-stream",
      modeId: "load-test",
    });
    const serverId = getServerId();
    await installDesktopRuntime(page, {
      serverId,
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await installUsageReportsFixture(page, { lists: [[]] });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    const title = page.getByTestId("desktop-chat-title");
    const search = page.getByTestId("command-center-panel");
    const selectChat = async (agentId: string, query: string) => {
      await page.keyboard.press("Meta+K");
      await expect(search).toBeVisible();
      await search.getByTestId("command-center-input").fill(query);
      await search.getByTestId(`command-center-agent-${serverId}:${agentId}`).click();
      await expect(search).toBeHidden();
    };
    await expect(title).toHaveText("First chat");
    await expect(page.getByTestId("desktop-shell-back")).toBeDisabled();
    await composerLocator(page).fill("Draft stays with first chat");
    await selectChat(second.id, "Second chat");
    await expect(title).toHaveText("Second chat");
    await expect(composerLocator(page)).toHaveValue("");
    await page.getByTestId("desktop-shell-back").click();
    await expect(title).toHaveText("First chat");
    await expect(composerLocator(page)).toHaveValue("Draft stays with first chat");
    await page.getByTestId("desktop-shell-forward").click();
    await expect(title).toHaveText("Second chat");
    const toolbarMenu = page.getByTestId("desktop-chat-toolbar-menu");
    await expect(toolbarMenu).toBeVisible({ timeout: 5_000 });
    await toolbarMenu.click();
    await page.getByText("Rename", { exact: true }).click();
    const renameId = `desktop-chat-rename-${serverId}:${second.id}`;
    await page.getByTestId(`${renameId}-input`).fill("Renamed second chat");
    await page.context().setOffline(true);
    const attachButton = page.getByTestId("message-input-attach-button").filter({ visible: true });
    await expect(attachButton).toBeDisabled({ timeout: 75_000 });
    await page.getByTestId(`${renameId}-submit`).click();
    await expect(page.getByTestId(`${renameId}-error`)).toHaveText("Daemon client unavailable");
    await expect(page.getByTestId(`${renameId}-input`)).toHaveValue("Renamed second chat");
    await expect(page.getByTestId(`${renameId}-submit`)).toBeEnabled();
    expect((await fixture.client.fetchAgent({ agentId: second.id }))?.agent.title).toBe(
      "Second chat",
    );
    await page.context().setOffline(false);
    await expect(attachButton).toBeEnabled({ timeout: 30_000 });
    await expect(title).toHaveText("Second chat");
    await page.getByTestId(`${renameId}-submit`).click();
    await expect(title).toHaveText("Renamed second chat", { timeout: 20_000 });
    await expect(page.getByTestId(`${renameId}-input`)).toHaveCount(0, { timeout: 15_000 });
    expect((await fixture.client.fetchAgent({ agentId: fixture.agentId }))?.agent.title).toBe(
      "First chat",
    );
    await toolbarMenu.click();
    await page.getByText("Pin to top", { exact: true }).click();
    await expect
      .poll(
        async () =>
          (await fixture.client.fetchAgent({ agentId: second.id }))?.agent.labels[
            "codex-ui.pinned-at"
          ] ?? "",
      )
      .toMatch(/^\d{4}-\d\d-\d\dT/);
    expect((await fixture.client.fetchAgent({ agentId: fixture.agentId }))?.agent.labels).toEqual(
      {},
    );
    await toolbarMenu.click();
    await page.getByText("Unpin", { exact: true }).click();
    await expect
      .poll(
        async () =>
          (await fixture.client.fetchAgent({ agentId: second.id }))?.agent.labels[
            "codex-ui.pinned-at"
          ],
      )
      .toBe("");
    // The chat sidebar's pin shortcut targets the current chat, not its workspace.
    const pinnedAt = async () =>
      (await fixture.client.fetchAgent({ agentId: second.id }))?.agent.labels[
        "codex-ui.pinned-at"
      ] ?? "";
    await page.keyboard.press("Meta+Shift+P");
    await expect.poll(pinnedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect((await fixture.client.fetchAgent({ agentId: fixture.agentId }))?.agent.labels).toEqual(
      {},
    );
    await page.keyboard.press("Meta+Shift+P");
    await expect.poll(pinnedAt).toBe("");
    await selectChat(fixture.agentId, "First chat");
    await expect(title).toHaveText("First chat");
    await expect(composerLocator(page)).toHaveValue("Draft stays with first chat");
    await selectChat(second.id, "Renamed second chat");
    await toolbarMenu.click();
    await page.getByText("Archive", { exact: true }).click();
    await expect
      .poll(async () => (await fixture.client.fetchAgent({ agentId: second.id }))?.agent.archivedAt)
      .toMatch(/^\d{4}-\d\d-\d\dT/);
    await expect
      .poll(async () =>
        (await fixture.client.fetchAgents({ scope: "active" })).entries.map(
          ({ agent }) => agent.id,
        ),
      )
      .not.toContain(second.id);
    await page.keyboard.press("Meta+K");
    await expect(search).toBeVisible();
    await search.getByTestId("command-center-input").fill("Renamed second chat");
    await expect(search.getByText("No matches", { exact: true })).toBeVisible();
    await expect(search.getByTestId(`command-center-agent-${serverId}:${second.id}`)).toHaveCount(
      0,
    );
    await page.keyboard.press("Escape");
    await selectChat(fixture.agentId, "First chat");
    await expect(title).toHaveText("First chat");
    await expect(composerLocator(page)).toHaveValue("Draft stays with first chat");
    expect((await fixture.client.fetchAgent({ agentId: fixture.agentId }))?.agent.archivedAt).toBe(
      null,
    );
  } catch (error) {
    await page
      .screenshot({ path: testInfo.outputPath("before-cleanup.png") })
      .catch(() => undefined);
    throw error;
  } finally {
    await page.context().setOffline(false);
    await fixture.cleanup();
  }
});

test("Browse opens the folder selected by the desktop dialog", async ({
  page,
  projectPickerFixture,
}) => {
  await installDesktopRuntime(page, {
    serverId: getServerId(),
    manageBuiltInDaemon: false,
    dialogOpenResult: projectPickerFixture.projectPath,
  });
  await gotoAppShell(page);
  await waitForConnectedHost(page, {
    serverId: getServerId(),
    endpoint: `localhost:${getE2EDaemonPort()}`,
  });

  await openAddProjectFlow(page);
  const browse = page.getByRole("button", { name: /^Browse/ });
  await expect(browse).toBeVisible({ timeout: 30_000 });
  await browse.click();
  const dialogOptions = await waitForDirectoryDialog(page);
  expect(dialogOptions).toEqual({
    createDirectory: true,
    directory: true,
    multiple: false,
  });

  const projectId = await expectOpenedProject(page);
  projectPickerFixture.rememberProjectId(projectId);
  await expectNewWorkspaceForAddedProject(page, {
    serverId: getServerId(),
    projectId,
    projectName: projectPickerFixture.projectName,
    projectPath: projectPickerFixture.projectPath,
  });
  const client = await connectSeedClient();
  try {
    expect((await client.fetchWorkspaces({ filter: { projectId } })).entries).toEqual([]);
  } finally {
    await client.close();
  }
});

test("canceling Browse returns to the Add Project methods", async ({
  page,
  projectPickerFixture,
}) => {
  await installDesktopRuntime(page, {
    serverId: getServerId(),
    manageBuiltInDaemon: false,
    dialogOpenResult: null,
  });
  await gotoAppShell(page);
  await waitForConnectedHost(page, {
    serverId: getServerId(),
    endpoint: `localhost:${getE2EDaemonPort()}`,
  });

  await openAddProjectFlow(page);
  const browse = page.getByRole("button", { name: /^Browse/ });
  await expect(browse).toBeVisible({ timeout: 30_000 });
  await browse.click();

  const dialogOptions = await waitForDirectoryDialog(page);
  expect(dialogOptions).toEqual({
    createDirectory: true,
    directory: true,
    multiple: false,
  });
  await expect(browse).toBeVisible();
  await expect(
    page
      .locator('[data-testid^="sidebar-project-row-"]')
      .filter({ hasText: projectPickerFixture.projectName }),
  ).toHaveCount(0);
});
