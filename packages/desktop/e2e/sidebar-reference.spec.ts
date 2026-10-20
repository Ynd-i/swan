import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../../app/e2e/support/fixtures";
import { gotoAppShell } from "../../app/e2e/support/helpers/app";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { seedWorkspace } from "../../app/e2e/support/helpers/seed-client";
import { installUsageReportsFixture } from "../../app/e2e/support/helpers/usage-reports";
import { openAgentRoute, seedMockAgentWorkspace } from "../../app/e2e/support/helpers/mock-agent";
import { submitMessage } from "../../app/e2e/support/helpers/composer";
import { expectChatHistoryAttachment } from "../../app/e2e/support/helpers/assistant-fork";
import { installDesktopRuntime } from "./support/runtime";

async function waitForTwoFrames(page: Page): Promise<void> {
  const nextFrame = () =>
    page.evaluate(() => new Promise<void>((frameDone) => requestAnimationFrame(frameDone)));
  await nextFrame();
  await nextFrame();
}

test("desktop navigation rail stays visible and marks the current destination", async ({
  page,
}) => {
  const workspace = await seedWorkspace({ repoPrefix: "desktop-sidebar-transition-" });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
    await gotoAppShell(page);

    const rail = page.getByTestId("desktop-shell-rail");
    const workspaceSidebar = page.getByTestId("desktop-workspace-sidebar");
    const projectList = page.getByTestId("sidebar-project-list");
    const home = page.getByTestId("desktop-shell-home");
    const history = page.getByTestId("desktop-shell-history");
    const homeIconPath = home.locator("svg path").first();
    const historyIconPath = history.locator("svg path").first();
    await expect(rail).toBeVisible();
    // The rail carries the sidebar footer actions, so the footer drops its icon line.
    for (const testID of ["sidebar-usage-icon", "sidebar-hosts-trigger"])
      await expect(rail.getByTestId(testID)).toBeVisible();
    await expect(page.locator('[data-testid="sidebar-footer-bottom-line"]:visible')).toHaveCount(0);
    await expect(workspaceSidebar).toBeVisible();
    await expect(projectList).toBeVisible();
    await expect(home).toHaveAttribute("aria-current", "page");
    await expect(history).not.toHaveAttribute("aria-current");
    const selectedIconStroke = await homeIconPath.evaluate((path) => getComputedStyle(path).stroke);

    const sidebarToggle = page.getByTestId("menu-button");
    const expandedWidth = await workspaceSidebar.evaluate(
      (node) => node.getBoundingClientRect().width,
    );
    await sidebarToggle.focus();
    await expect(sidebarToggle).toBeFocused();
    await sidebarToggle.press("Enter");
    await expect(sidebarToggle).toHaveAttribute("aria-expanded", "false");
    await expect(sidebarToggle).toBeFocused();
    await waitForTwoFrames(page);
    const closingWidth = await workspaceSidebar.evaluate(
      (node) => node.getBoundingClientRect().width,
    );
    expect(closingWidth).toBeGreaterThan(0);
    expect(closingWidth).toBeLessThan(expandedWidth);
    await expect(projectList).toBeVisible();

    await sidebarToggle.press("Enter");
    await expect(sidebarToggle).toHaveAttribute("aria-expanded", "true");
    await expect(sidebarToggle).toBeFocused();
    await expect
      .poll(async () => workspaceSidebar.evaluate((node) => node.getBoundingClientRect().width))
      .toBeGreaterThan(expandedWidth * 0.95);

    await sidebarToggle.press("Enter");
    await expect(sidebarToggle).toHaveAttribute("aria-expanded", "false");
    await expect(sidebarToggle).toBeFocused();
    await expect(workspaceSidebar).toBeHidden();
    await expect(projectList).toBeHidden();
    await expect(rail).toBeVisible();

    await history.click();
    await expect(page).toHaveURL(/\/sessions(?:[/?]|$)/);
    await expect(rail).toBeVisible();
    await expect(home).not.toHaveAttribute("aria-current");
    await expect(history).toHaveAttribute("aria-current", "page");
    expect(await home.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(
      await history.evaluate((node) => getComputedStyle(node).backgroundColor),
    );
    expect(await historyIconPath.evaluate((path) => getComputedStyle(path).stroke)).toBe(
      selectedIconStroke,
    );
    expect(await homeIconPath.evaluate((path) => getComputedStyle(path).stroke)).not.toBe(
      selectedIconStroke,
    );

    const screenshotPath = resolve(
      process.cwd(),
      "../../docs/qa-evidence/codex-desktop/sidebar-navigation-selection.png",
    );
    await mkdir(dirname(screenshotPath), { recursive: true });
    await page.mouse.move(900, 400);
    await page.screenshot({ path: screenshotPath });
  } finally {
    await workspace.cleanup();
  }
});

test("desktop workspace sidebar skips its transition for reduced motion", async ({ page }) => {
  await installDesktopRuntime(page, {
    serverId: getServerId(),
    manageBuiltInDaemon: false,
    daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
  });
  await page.setViewportSize({ width: 1352, height: 782 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await gotoAppShell(page);

  const sidebar = page.getByTestId("desktop-workspace-sidebar");
  const toggle = page.getByTestId("menu-button");
  const width = () => sidebar.evaluate((node) => node.getBoundingClientRect().width);
  await expect(sidebar).toBeVisible();
  const expandedWidth = await width();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await waitForTwoFrames(page);
  const closedWidth = await width();
  expect(closedWidth).toBe(0);
  await expect(sidebar).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await waitForTwoFrames(page);
  const reopenedWidth = await width();
  expect(reopenedWidth).toBe(expandedWidth);
});

test("macOS rail usage opens its summary beside the rail", async ({ page }, testInfo) => {
  const now = Date.now();
  await installDesktopRuntime(page, {
    serverId: getServerId(),
    manageBuiltInDaemon: false,
    daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
  });
  await installUsageReportsFixture(page, {
    lists: [
      [
        {
          id: "monthly:quota",
          sourceId: "monthly",
          sourceLabel: "Monthly plan",
          account: {},
          fetchedAt: new Date(now).toISOString(),
          report: {
            status: "available",
            windows: [
              {
                id: "month",
                label: "1 month",
                usedPct: 99,
                resetsAt: new Date(now + 29 * 86_400_000).toISOString(),
              },
            ],
          },
        },
      ],
    ],
  });
  await page.setViewportSize({ width: 1352, height: 782 });
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoAppShell(page);
  const rail = page.getByTestId("desktop-shell-rail");
  await rail.getByTestId("sidebar-usage-icon").click();
  // Like the reference account menu, usage opens in place instead of leaving the chat.
  const summary = page.getByTestId("sidebar-usage-sheet");
  await expect(summary.getByTestId("usage-report-monthly:quota")).toBeVisible();
  await expect(page).not.toHaveURL(/\/usage(?:[/?]|$)/);
  const railBox = (await rail.boundingBox())!;
  expect((await summary.boundingBox())!.x).toBeGreaterThanOrEqual(railBox.x + railBox.width);
  await page.screenshot({ path: testInfo.outputPath("rail-usage-popover.png") });
  await page.keyboard.press("Escape");
  await expect(summary).toHaveCount(0);
});

test("macOS chat sections sort, reorder, collapse and add projects from their headers", async ({
  page,
}) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "chat-sections-",
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
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    // Recent lists each chat before the project groups do, so the first row is Recent's.
    const firstRow = page.getByTestId(`desktop-chat-${serverId}:${fixture.agentId}`).first();
    const secondRow = page.getByTestId(`desktop-chat-${serverId}:${second.id}`).first();
    const top = async (row: typeof firstRow) => (await row.boundingBox())!.y;
    await expect.poll(async () => (await top(secondRow)) < (await top(firstRow))).toBe(true);

    const recent = page.getByTestId("desktop-section-recent");
    await recent.hover();
    await recent.getByTestId("desktop-section-recent-menu").click();
    await page.getByTestId("desktop-section-recent-sort-manual").click();
    await expect(page.getByTestId("desktop-section-recent-sort-manual")).toHaveCount(0);
    // Drag the newer chat below the older one; manual order keeps it there.
    const from = (await secondRow.boundingBox())!;
    const to = (await firstRow.boundingBox())!;
    await page.mouse.move(from.x + 40, from.y + from.height / 2);
    await page.mouse.down();
    for (let step = 1; step <= 8; step += 1)
      await page.mouse.move(from.x + 40, from.y + from.height / 2 + (step * (to.height + 6)) / 4);
    await page.mouse.up();
    await expect.poll(async () => (await top(firstRow)) < (await top(secondRow))).toBe(true);
    await page.reload();
    await expect(secondRow).toBeVisible();
    await expect.poll(async () => (await top(firstRow)) < (await top(secondRow))).toBe(true);

    // Collapsing Recent leaves only the project group's row for each chat.
    const secondRows = page.getByTestId(`desktop-chat-${serverId}:${second.id}`);
    await page.getByTestId("desktop-section-recent-toggle").click();
    await expect(secondRows).toHaveCount(1);
    await page.getByTestId("desktop-section-recent-toggle").click();
    await expect(secondRows).toHaveCount(2);

    const projects = page.getByTestId("desktop-section-projects");
    await projects.hover();
    await projects.getByTestId("desktop-section-projects-add").click();
    await expect(page.getByTestId("add-project-flow")).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

test("macOS custom sections hold chats and return them when removed", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "custom-sections-",
    title: "Filed chat",
  });
  try {
    const serverId = getServerId();
    await installDesktopRuntime(page, {
      serverId,
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    const recent = page.getByTestId("desktop-section-recent");
    const chatKey = `${serverId}:${fixture.agentId}`;
    const firstRow = page.getByTestId(`desktop-chat-${chatKey}`).first();
    const above = async (row: typeof firstRow, header: typeof recent) =>
      (await row.boundingBox())!.y < (await header.boundingBox())!.y;

    // Right-clicking Recent offers the reference's sort, Show and New section entries.
    await recent.click({ button: "right" });
    const recentMenu = page.getByTestId("desktop-section-recent-context");
    await expect(recentMenu.getByText("Sort chats", { exact: true })).toBeVisible();
    await recentMenu.getByTestId("desktop-section-recent-new-section").click();
    await expect(page.getByTestId("desktop-section-create")).toContainText(
      "Organize chats and projects your way",
    );
    await page.getByTestId("desktop-section-create-input").fill("Work");
    await page.screenshot({ path: testInfo.outputPath("new-section-dialog.png") });
    await page.getByTestId("desktop-section-create-submit").click();
    const work = page.getByTestId("sidebar-project-list").getByText("Work", { exact: true });
    await expect(work).toBeVisible();

    // Hover actions are Pin and Archive; the full menu is the right-click menu. Pinned hides when empty.
    await expect(page.getByTestId(`desktop-chat-pin-${chatKey}`).first()).toBeAttached();
    await expect(page.getByTestId(`desktop-chat-archive-${chatKey}`).first()).toBeAttached();
    await expect(page.getByTestId("desktop-section-pinned")).toHaveCount(0);
    await firstRow.click({ button: "right" });
    await page.getByText("Section", { exact: true }).click();
    await page
      .locator('[data-testid^="desktop-section-move-"]')
      .filter({ hasText: "Work" })
      .click();
    await expect.poll(() => above(firstRow, recent)).toBe(true);
    await page.reload();
    await expect(work).toBeVisible();
    await expect.poll(() => above(firstRow, recent)).toBe(true);
    await recent.click({ button: "right" });
    await page.screenshot({ path: testInfo.outputPath("custom-section.png") });
    await page.keyboard.press("Escape");

    await recent.click({ button: "right" });
    await page.getByTestId("desktop-section-recent-show-projects").click();
    await expect(page.getByTestId("desktop-section-projects")).toHaveCount(0);
    await recent.click({ button: "right" });
    await page.getByTestId("desktop-section-recent-show-projects").click();
    await expect(page.getByTestId("desktop-section-projects")).toBeVisible();

    await work.click({ button: "right" });
    await page.locator('[data-testid$="-remove"]').click();
    await expect(work).toHaveCount(0);
    await expect.poll(() => above(firstRow, recent)).toBe(false);
  } finally {
    await fixture.cleanup();
  }
});

// Presses the row, then moves in steps so dnd-kit's 6px activation and collision both see it.
async function dragOnto(page: Page, from: Locator, to: Locator): Promise<void> {
  const start = (await from.boundingBox())!;
  const end = (await to.boundingBox())!;
  const x = start.x + 40;
  const fromY = start.y + start.height / 2;
  const toY = end.y + end.height / 2;
  await page.mouse.move(x, fromY);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1)
    await page.mouse.move(x, fromY + ((toY - fromY) * step) / 10);
  await page.mouse.up();
}

test("macOS sections reorder by their headers and projects drag between sections", async ({
  page,
}) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "section-drag-",
    title: "Dragged chat",
  });
  try {
    const serverId = getServerId();
    await installDesktopRuntime(page, {
      serverId,
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    const list = page.getByTestId("sidebar-project-list");
    const recent = page.getByTestId("desktop-section-recent");
    const projects = page.getByTestId("desktop-section-projects");
    const project = list.locator('[data-testid^="sidebar-project-row-"]').first();
    const top = async (locator: Locator) => (await locator.boundingBox())!.y;

    await recent.click({ button: "right" });
    await page.getByTestId("desktop-section-recent-new-section").click();
    await page.getByTestId("desktop-section-create-input").fill("Work");
    await page.getByTestId("desktop-section-create-submit").click();
    const work = list.getByText("Work", { exact: true });
    await expect(work).toBeVisible();
    // A new section starts above Recent; dragging Recent's header onto it gives Recent, Work, Projects.
    await expect.poll(async () => (await top(work)) < (await top(recent))).toBe(true);
    await dragOnto(page, recent, work);
    await expect.poll(async () => (await top(recent)) < (await top(work))).toBe(true);
    await page.reload();
    await expect(work).toBeVisible();
    await expect.poll(async () => (await top(recent)) < (await top(work))).toBe(true);
    await expect.poll(async () => (await top(work)) < (await top(projects))).toBe(true);

    // Dropping the project on Work files it there; dropping it on Projects returns it.
    await expect.poll(async () => (await top(projects)) < (await top(project))).toBe(true);
    await dragOnto(page, project, work);
    await expect.poll(async () => (await top(project)) < (await top(projects))).toBe(true);
    await expect.poll(async () => (await top(work)) < (await top(project))).toBe(true);
    await dragOnto(page, project, projects);
    await expect.poll(async () => (await top(projects)) < (await top(project))).toBe(true);
  } finally {
    await fixture.cleanup();
  }
});

test("macOS notification bell lists what needs attention, then finished chats by day", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "chat-inbox-",
    title: "Inbox chat",
    featureValues: { mockAssistantResponse: "Finished the **inbox** check." },
  });
  try {
    const serverId = getServerId();
    await installDesktopRuntime(page, {
      serverId,
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    await submitMessage(page, "Check the inbox.");
    await expect(page.getByTestId("assistant-message")).toContainText("Finished the inbox check.");

    const bell = page.getByTestId("desktop-chat-inbox-toggle");
    await bell.click();
    await expect(page.getByTestId("desktop-section-recent")).toHaveCount(0);
    await expect(page.getByTestId("desktop-inbox-priority")).toBeVisible();
    await expect(page.getByText("No tasks need attention", { exact: true })).toBeVisible();
    const row = page
      .getByTestId("desktop-inbox-today")
      .getByTestId(`desktop-inbox-${serverId}:${fixture.agentId}`);
    // The reply preview comes from the timeline this window already loaded.
    await expect(row).toContainText("Finished the inbox check.");
    await page.screenshot({ path: testInfo.outputPath("notification-inbox.png") });
    await bell.click();
    await expect(page.getByTestId("desktop-section-recent")).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

test("macOS project and chat menus carry the reference's entries", async ({ page }, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "project-menu-",
    title: "Menu chat",
    featureValues: { mockAssistantResponse: "Ready to fork." },
  });
  try {
    const serverId = getServerId();
    const recordPath = testInfo.outputPath("finder.jsonl");
    await installDesktopRuntime(page, {
      serverId,
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
      confirmShouldAccept: true,
      editorTargets: [
        {
          id: "finder",
          label: "Finder",
          kind: "file-manager",
          icon: { kind: "symbol", name: "folder" },
        },
      ],
      editorRecordPath: recordPath,
    });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    await submitMessage(page, "Say something to fork.");
    await expect(page.getByTestId("assistant-message")).toContainText("Ready to fork.");
    const chatKey = `${serverId}:${fixture.agentId}`;
    // One row in Recent and one under the project.
    const chatRows = page.getByTestId(`desktop-chat-${chatKey}`);
    await expect(chatRows).toHaveCount(2);
    const recent = page.getByTestId("desktop-section-recent");
    const header = page.locator('[data-testid^="sidebar-project-row-"]').first();
    const viewKey = (await header.getAttribute("data-testid"))!.replace("sidebar-project-row-", "");
    const aboveRecent = async () =>
      (await header.boundingBox())!.y < (await recent.boundingBox())!.y;

    await header.hover();
    await page.getByTestId(`desktop-project-menu-${viewKey}`).click();
    for (const name of [
      "Pin to top",
      "Edit",
      "Section",
      "Show in Finder",
      "Archive chats",
      "Remove project",
    ])
      await expect(page.getByRole("menuitem", { name })).toBeVisible();
    // Screenshots wait out the menu fade-in.
    await page.waitForTimeout(300);
    await page.screenshot({ path: testInfo.outputPath("project-menu.png") });
    await page.getByRole("menuitem", { name: "Show in Finder" }).click();
    await expect
      .poll(() => readFile(recordPath, "utf8").catch(() => ""))
      .toContain('"editorId":"finder"');

    // A pinned project moves to Pinned; a right click unpins it.
    await header.hover();
    await page.getByTestId(`desktop-project-menu-${viewKey}`).click();
    await page.getByTestId(`desktop-project-pin-${viewKey}`).click();
    await expect.poll(aboveRecent).toBe(true);
    await header.click({ button: "right" });
    await page.getByTestId(`desktop-project-pin-${viewKey}`).click();
    await expect.poll(aboveRecent).toBe(false);

    // Merged keeps the chat in Recent only.
    await recent.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Organize sidebar" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: testInfo.outputPath("organize-menu.png") });
    await page.getByTestId("desktop-section-organize-merged").click();
    await expect(chatRows).toHaveCount(1);
    await recent.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Organize sidebar" }).click();
    await page.getByTestId("desktop-section-organize-projects").click();
    await expect(chatRows).toHaveCount(2);

    await chatRows.first().click({ button: "right" });
    const fork = page.getByRole("menuitem", { name: "Fork", exact: true });
    // The row menu keeps the reference's order; the titlebar order is checked in chat-menu-copy.
    await expect(
      page.locator('[data-menu-surface="true"]').filter({ has: fork }).getByRole("menuitem"),
    ).toHaveText(["Rename", "Pin to top", "Mark as read", "Section", "Fork", "Archive"]);
    await fork.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: testInfo.outputPath("chat-fork-menu.png") });
    await page.getByTestId("desktop-chat-fork-chat").click();
    await expectChatHistoryAttachment(page);

    await header.hover();
    await page.getByTestId(`desktop-project-menu-${viewKey}`).click();
    await page.getByTestId(`desktop-project-archive-${viewKey}`).click();
    await expect(chatRows).toHaveCount(0);
    await header.hover();
    await page.getByTestId(`desktop-project-menu-${viewKey}`).click();
    await page.getByTestId(`desktop-project-remove-${viewKey}`).click();
    await expect(header).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});
