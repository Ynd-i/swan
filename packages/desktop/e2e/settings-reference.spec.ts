import { test, expect } from "../../app/e2e/support/fixtures";
import { gotoAppShell, openSettings } from "../../app/e2e/support/helpers/app";
import { openSettingsSection } from "../../app/e2e/support/helpers/settings";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDesktopRuntime } from "./support/runtime";
import { installUsageReportsFixture } from "../../app/e2e/support/helpers/usage-reports";
import { copyPluginExample } from "../../app/e2e/support/helpers/plugin-fixture";
import { connectNewWorkspaceDaemonClient } from "../../app/e2e/support/helpers/new-workspace";

const placementLabels = [
  "Clicking a file in the Explorer sidebar",
  "Clicking a change in the Explorer sidebar or a chat",
  "Clicking a file in an agent chat",
  "Clicking a file in a diff",
  "Clicking a subagent in an agent chat",
  "Clicking a pull request in the Explorer sidebar",
];

test("macOS Settings keeps navigation searchable and Appearance preferences editable", async ({
  page,
}, testInfo) => {
  await installDesktopRuntime(page, {
    serverId: getServerId(),
    manageBuiltInDaemon: false,
    daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
  });
  await page.setViewportSize({ width: 1352, height: 782 });
  await page.emulateMedia({ colorScheme: "dark" });
  await installUsageReportsFixture(page, { lists: [[]] });
  await gotoAppShell(page);
  await openSettings(page);

  const sidebar = page.getByTestId("settings-sidebar");
  const search = page.getByTestId("settings-sidebar-search");
  const shell = page.getByTestId("desktop-shell");
  const expectFrameFits = async () => {
    await expect
      .poll(() =>
        shell.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return { x: rect.x, width: rect.width, overflow: node.scrollWidth - node.clientWidth };
        }),
      )
      .toEqual({ x: 0, width: page.viewportSize()!.width, overflow: 0 });
  };
  await expectFrameFits();
  await expect(sidebar).toBeInViewport({ ratio: 1 });
  expect(await sidebar.evaluate((node) => node.getBoundingClientRect().width)).toBe(280);
  await expect(sidebar.getByText("Settings", { exact: true })).toBeVisible();
  await expect(search).toBeVisible();
  await search.fill("Appearance");
  await expect(sidebar.getByRole("button", { name: "Appearance", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "General", exact: true })).toHaveCount(0);
  await search.fill("");

  await openSettingsSection(page, "general");
  await expect(page.getByTestId("page-title")).toHaveText("General");
  for (const label of placementLabels) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  }
  const serviceUrl = page.getByRole("button", { name: /^Clicking a script's service URL:/ });
  await serviceUrl.click();
  await page.getByRole("menuitem", { name: "External browser", exact: true }).click();
  await expect(serviceUrl).toHaveAccessibleName(
    "Clicking a script's service URL: External browser",
  );
  await page.reload();
  await openSettings(page);
  await expect(serviceUrl).toHaveAccessibleName(
    "Clicking a script's service URL: External browser",
  );
  await serviceUrl.click();
  await page.getByRole("menuitem", { name: "In Swan", exact: true }).click();
  await expect(serviceUrl).toHaveAccessibleName("Clicking a script's service URL: In Swan");
  await expectFrameFits();
  await expect(sidebar).toBeInViewport({ ratio: 1 });
  await expect(search).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath("settings-general.png") });

  await openSettingsSection(page, "appearance");
  await expect(page.getByTestId("page-title")).toHaveText("Appearance");
  await expect(page.getByText("Theme", { exact: true }).first()).toBeVisible();
  const themeCard = page.getByText("Theme", { exact: true }).locator("../../..");
  expect.soft((await themeCard.boundingBox())?.width).toBe(728);
  await expect.soft(themeCard).toHaveCSS("border-radius", "16px");
  await page.screenshot({ path: testInfo.outputPath("settings-appearance.png") });
  for (const width of [900, 700, 1352]) {
    await page.setViewportSize({ width, height: 680 });
    await expectFrameFits();
    await expect(themeCard).toBeInViewport({ ratio: 1 });
    await expect(page.getByText("Theme", { exact: true }).first()).toBeInViewport({ ratio: 1 });
    if (width >= 768) {
      await expect(sidebar).toBeInViewport({ ratio: 1 });
      await expect(search).toBeInViewport({ ratio: 1 });
      await expect(sidebar.getByText("Settings", { exact: true })).toBeInViewport({ ratio: 1 });
    } else {
      await expect(sidebar).toBeHidden();
    }
  }
});

test("Windows Settings retains editable panel placement preferences", async ({ page }) => {
  await installDesktopRuntime(page, {
    serverId: getServerId(),
    platform: "win32",
    manageBuiltInDaemon: false,
    daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
  });
  await installUsageReportsFixture(page, { lists: [[]] });
  await gotoAppShell(page);
  await openSettings(page);
  for (const label of placementLabels) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  const files = page.getByRole("button", { name: /^Clicking a file in the Explorer sidebar:/ });
  await files.click();
  await page.getByRole("menuitem", { name: "On the side", exact: true }).click();
  await expect(files).toHaveAccessibleName("Clicking a file in the Explorer sidebar: On the side");
  const pullRequests = page.getByRole("button", {
    name: /^Clicking a pull request in the Explorer sidebar:/,
  });
  await pullRequests.click();
  await expect(page.getByRole("menuitem", { name: "Explorer sidebar", exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Main panel", exact: true }).click();
  await page.reload();
  await openSettings(page);
  await expect(files).toHaveAccessibleName("Clicking a file in the Explorer sidebar: On the side");
  await expect(pullRequests).toHaveAccessibleName(
    "Clicking a pull request in the Explorer sidebar: Main panel",
  );
  await openSettingsSection(page, "appearance");
  const card = page.getByText("Theme", { exact: true }).last().locator("../../..");
  expect((await card.boundingBox())?.width).toBe(688);
  await expect(card).toHaveCSS("border-radius", "8px");
  await expect(page.getByTestId("appearance-theme-modes")).toHaveCount(0);
});

test("macOS Appearance mode previews preserve theme choices and keyboard editing", async ({
  page,
}, testInfo) => {
  await installDesktopRuntime(page, {
    serverId: getServerId(),
    manageBuiltInDaemon: false,
    daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
  });
  await installUsageReportsFixture(page, { lists: [[]] });
  await page.setViewportSize({ width: 1352, height: 782 });
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoAppShell(page);
  await openSettings(page);
  await openSettingsSection(page, "appearance");
  const modes = page.getByTestId("appearance-theme-modes");
  await expect(modes).toBeVisible();
  const system = modes.getByRole("button", { name: "System", exact: true });
  const light = modes.getByRole("button", { name: "Light", exact: true });
  const dark = modes.getByRole("button", { name: "Dark", exact: true });
  const registeredDarkBackground = await page
    .getByTestId("settings-detail-pane")
    .locator(":scope > div")
    .first()
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  await expect(dark.getByTestId("appearance-mode-preview-dark")).toHaveCSS(
    "background-color",
    registeredDarkBackground,
  );
  await expect(system).toHaveAttribute("aria-pressed", "true");
  for (const mode of [system, light, dark]) {
    expect(await mode.boundingBox()).toMatchObject({ width: 80, height: 60 });
  }
  const modeBounds = await modes.boundingBox();
  const themeBounds = await page
    .getByText("Theme", { exact: true })
    .locator("../../..")
    .boundingBox();
  if (!modeBounds || !themeBounds) throw new Error("Missing appearance card geometry");
  expect(modeBounds.height).toBe(78);
  expect(themeBounds.y - modeBounds.y - modeBounds.height).toBe(16);
  await system.focus();
  await page.keyboard.press("Tab");
  await expect(light).toBeFocused();
  await expect(light).toHaveCSS("outline-width", "2px");
  await page.keyboard.press("Enter");
  await expect(light).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Theme: Light", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/open-project$/);
  await openSettings(page);
  await openSettingsSection(page, "appearance");
  await expect(light).toHaveAttribute("aria-pressed", "true");
  await light.focus();
  await page.keyboard.press("Tab");
  await expect(dark).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Theme: Dark", { exact: true })).toBeVisible();
  await expect(dark).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Theme: Dark", { exact: true }).click();
  await page.getByRole("menuitem", { name: "Claude", exact: true }).click();
  await expect(page.getByLabel("Theme: Claude", { exact: true })).toBeVisible();
  for (const mode of [system, light, dark])
    await expect(mode).toHaveAttribute("aria-pressed", "false");

  const plugin = await copyPluginExample("catppuccin");
  const client = await connectNewWorkspaceDaemonClient({ ownProjects: false });
  const previous = await client.getDaemonConfig();
  try {
    await client.patchDaemonConfig({ pluginsEnabled: true });
    await client.installDirectoryPlugin(plugin.directory);
    await page.getByLabel("Theme: Claude", { exact: true }).click();
    await page.getByRole("menuitem", { name: "Catppuccin Mocha", exact: true }).click();
    await expect(page.getByLabel("Theme: Catppuccin Mocha", { exact: true })).toBeVisible();
    for (const mode of [system, light, dark])
      await expect(mode).toHaveAttribute("aria-pressed", "false");
    await page.reload();
    await expect(page).toHaveURL(/\/open-project$/);
    await openSettings(page);
    await openSettingsSection(page, "appearance");
    await expect(page.getByLabel("Theme: Catppuccin Mocha", { exact: true })).toBeVisible();
    for (const mode of [system, light, dark])
      await expect(mode).toHaveAttribute("aria-pressed", "false");
    await dark.click();
    await expect(page.getByLabel("Theme: Dark", { exact: true })).toBeVisible();
    await expect(dark).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(450, 100);
    await light.hover();
    await expect(light).not.toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
    await page.mouse.move(450, 100);
    await page.screenshot({
      path: testInfo.outputPath("settings-appearance-modes.png"),
      animations: "disabled",
    });
    await page.setViewportSize({ width: 700, height: 782 });
    await expect(modes).toBeInViewport({ ratio: 1 });
    for (const mode of [system, light, dark]) await expect(mode).toBeInViewport({ ratio: 1 });
    await system.click();
    await expect(page.getByLabel("Theme: System", { exact: true })).toBeVisible();
    await expect(system).toHaveAttribute("aria-pressed", "true");
  } finally {
    await client.removePlugin("catppuccin").catch(() => undefined);
    await client.patchDaemonConfig({ pluginsEnabled: previous.config.pluginsEnabled ?? false });
    await client.close();
    await plugin.cleanup();
  }
});
