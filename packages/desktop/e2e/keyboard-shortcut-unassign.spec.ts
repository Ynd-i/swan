import { clickNewChat, gotoWorkspace } from "../../app/e2e/support/helpers/launcher";
import { clickSettingsBackToWorkspace } from "../../app/e2e/support/helpers/settings";
import type { Page } from "@playwright/test";
import { test, expect } from "../../app/e2e/support/fixtures";
import { gotoAppShell, openSettings } from "../../app/e2e/support/helpers/app";
import { openSettingsSection } from "../../app/e2e/support/helpers/settings";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDesktopRuntime } from "./support/runtime";

// Settings > Keyboard Shortcuts is desktop-only (`desktopOnly` in
// settings-screen.tsx), and the gate reads `getIsElectronRuntime()`, which only
// checks for `window.paseoDesktop` -- so this belongs in the desktop suite even
// though no `.electron.*` module sits in the surface's import path.
const SHORTCUTS_ROW = "show-shortcuts";

async function openShortcutsSettings(page: Page, platform: "darwin" | "win32" = "darwin") {
  await installDesktopRuntime(page, {
    platform,
    serverId: getServerId(),
    manageBuiltInDaemon: false,
    daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
  });
  if (platform === "win32") {
    // Keep the browser half of shortcut-platform consistent with the bridge.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "platform", { get: () => "Win32" });
      Object.defineProperty(navigator, "userAgent", {
        get: () => "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      });
    });
  }
  await gotoAppShell(page);
  await openSettings(page);
  await openSettingsSection(page, "shortcuts");
  await expect(page.getByText("Show keyboard shortcuts", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * Every row action lives behind the row's actions menu, so which actions a row
 * offers can only be asserted while that menu is open.
 */
async function openRowMenu(page: Page) {
  await page.getByTestId(`shortcut-actions-${SHORTCUTS_ROW}`).click();
  await expect(page.getByTestId(`shortcut-bind-${SHORTCUTS_ROW}`)).toBeVisible();
}

/** Reachable from the sidebar even when the cheat sheet's own shortcut is gone. */
async function openCheatSheet(page: Page) {
  await gotoAppShell(page);
  await page.getByTestId("desktop-shell-rail").getByTestId("sidebar-help").click();
  await expect(page.getByTestId("sidebar-help-menu")).toBeVisible();
  await page.getByTestId("sidebar-help-shortcuts").click();
  const dialog = page.getByTestId("keyboard-shortcuts-dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

async function closeRowMenu(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId(`shortcut-bind-${SHORTCUTS_ROW}`)).toHaveCount(0);
}

async function clearShortcut(page: Page, label: string, action: string) {
  await page.getByRole("button", { name: `Actions for ${label}` }).click();
  await page.getByTestId(`shortcut-clear-${action}`).click();
}

async function captureShortcut(page: Page, label: string, action: string, keys: string) {
  await page.getByRole("button", { name: `Actions for ${label}` }).click();
  await page.getByTestId(`shortcut-bind-${action}`).click();
  await page.keyboard.press(keys);
}

async function expectInterruptShortcut(page: Page, chord: string) {
  const row = page.getByText("Interrupt agent", { exact: true }).locator("..");
  await expect(row.getByText(chord, { exact: true })).toBeVisible();
}

async function finishInterruptCapture(page: Page, action: "Done" | "Cancel") {
  const row = page.getByText("Interrupt agent", { exact: true }).locator("..");
  await row.getByRole("button", { name: action }).click();
}

async function eraseLastCapturedCombo(page: Page, firstCombo: string, secondCombo: string) {
  await captureShortcut(page, "Interrupt agent", "agent-interrupt", "Alt+K");
  await page.keyboard.press("Alt+J");
  await expectInterruptShortcut(page, firstCombo);
  await expectInterruptShortcut(page, secondCombo);
  await page.keyboard.press("Backspace");
  await expectInterruptShortcut(page, firstCombo);
  const row = page.getByText("Interrupt agent", { exact: true }).locator("..");
  await expect(row.getByText(secondCombo, { exact: true })).toHaveCount(0);
}

test("unassigning a shortcut leaves it inert until it is reset", async ({ page }) => {
  await openShortcutsSettings(page);

  const clear = page.getByTestId(`shortcut-clear-${SHORTCUTS_ROW}`);
  const reset = page.getByTestId(`shortcut-reset-${SHORTCUTS_ROW}`);
  const bind = page.getByTestId(`shortcut-bind-${SHORTCUTS_ROW}`);
  const notSet = page.getByText("Not set", { exact: true });
  const dialog = page.getByTestId("keyboard-shortcuts-dialog");

  // The shortcut fires before it is cleared, so the assertion after clearing
  // measures the change rather than a shortcut that never worked.
  await page.keyboard.press("Shift+?");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });

  await openRowMenu(page);
  await expect(clear).toBeVisible();
  await expect(reset).toHaveCount(0);
  await expect(bind).toHaveText("Rebind");
  await clear.click();

  await expect(notSet).toBeVisible();
  await openRowMenu(page);
  await expect(clear).toHaveCount(0);
  await expect(reset).toBeVisible();
  // Nothing is bound now, so the item stops offering to *re*-bind.
  await expect(bind).toHaveText("Bind");
  await closeRowMenu(page);

  await page.keyboard.press("Shift+?");
  await expect(dialog).not.toBeVisible({ timeout: 5_000 });

  // The unassignment has to survive a restart, or "cleared" is only a UI state.
  // A reload lands back on the app shell, so Settings has to be reopened before
  // the section is reachable.
  await page.reload();
  await openSettings(page);
  await openSettingsSection(page, "shortcuts");
  await expect(notSet).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Shift+?");
  await expect(dialog).not.toBeVisible({ timeout: 5_000 });

  await test.step("show the cleared shortcut in help, then bind new keys", async () => {
    const help = await openCheatSheet(page);
    const row = help.getByTestId(`shortcut-help-row-${SHORTCUTS_ROW}`);
    await expect(row.getByText("Not set", { exact: true })).toBeVisible();
    await expect(help.getByText("?", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await openSettings(page);
    await openSettingsSection(page, "shortcuts");

    await openRowMenu(page);
    await bind.click();
    await page.keyboard.press("Alt+Shift+K");
    await page.getByText("Done", { exact: true }).click();
    await expect(page.getByText("⌥⇧K", { exact: true })).toBeVisible();
    const reboundHelp = await openCheatSheet(page);
    const reboundRow = reboundHelp.getByTestId(`shortcut-help-row-${SHORTCUTS_ROW}`);
    await expect(reboundRow.getByText("⌥⇧K", { exact: true })).toBeVisible();
    await expect(reboundRow.getByText("?", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await openSettings(page);
    await openSettingsSection(page, "shortcuts");
  });

  await openRowMenu(page);
  await page.getByTestId(`shortcut-reset-${SHORTCUTS_ROW}`).click();
  await expect(notSet).toHaveCount(0);
  await openRowMenu(page);
  await expect(page.getByTestId(`shortcut-clear-${SHORTCUTS_ROW}`)).toBeVisible();
  await expect(page.getByTestId(`shortcut-bind-${SHORTCUTS_ROW}`)).toHaveText("Rebind");
  await closeRowMenu(page);

  await page.keyboard.press("Shift+?");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
});

for (const { platform, keys, label, firstCombo, secondCombo } of [
  {
    platform: "darwin",
    keys: "Meta+Shift+Backspace",
    label: "⇧⌘⌫",
    firstCombo: "⌥K",
    secondCombo: "⌥J",
  },
  {
    platform: "win32",
    keys: "Control+Shift+Backspace",
    label: "Ctrl+Shift+⌫",
    firstCombo: "Alt+K",
    secondCombo: "Alt+J",
  },
] as const) {
  test(`binds modified Backspace and erases a combo with bare Backspace on ${platform}`, async ({
    page,
  }) => {
    await openShortcutsSettings(page, platform);
    await clearShortcut(page, "Archive workspace", "archive-workspace");
    await captureShortcut(page, "Interrupt agent", "agent-interrupt", keys);
    await expectInterruptShortcut(page, label);
    await finishInterruptCapture(page, "Done");
    await expectInterruptShortcut(page, label);

    await eraseLastCapturedCombo(page, firstCombo, secondCombo);
    await finishInterruptCapture(page, "Cancel");
    await expectInterruptShortcut(page, label);
  });
}

async function rebindTabNumbers(page: Page) {
  await captureShortcut(page, "Jump to tab", "workspace-tab-jump-index", "Control+1");
  await page.getByRole("button", { name: "Done", exact: true }).click();
}

async function expectTabNumberRange(page: Page) {
  const row = page.getByText("Jump to tab", { exact: true }).locator("..");
  await expect(row.getByText("⌃1-9", { exact: true })).toBeVisible();
}

async function openTwoDraftTabs(page: Page, workspaceId: string) {
  await installDesktopBridge(page);
  await gotoWorkspace(page, workspaceId);
  await clickNewChat(page);
  await clickNewChat(page);
  await expect(
    page.locator('[data-testid^="workspace-tab-draft_"]').filter({ visible: true }),
  ).toHaveCount(2);
  await openSettings(page);
  await openSettingsSection(page, "shortcuts");
}

async function expectTabNumberNavigation(page: Page) {
  const tabs = page.locator('[data-testid^="workspace-tab-draft_"]').filter({ visible: true });
  await page.keyboard.press("Control+1");
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Control+2");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
}

test("rebinding Jump to tab preserves the number group after reload", async ({
  page,
  withWorkspace,
}) => {
  const workspace = await withWorkspace({ prefix: "tab-number-rebind-" });
  await openTwoDraftTabs(page, workspace.workspaceId);
  await rebindTabNumbers(page);
  await clickSettingsBackToWorkspace(page);
  await expectTabNumberNavigation(page);
  await page.reload();
  await expectTabNumberNavigation(page);
  await openSettings(page);
  await openSettingsSection(page, "shortcuts");
  await expectTabNumberRange(page);
});

test("shortcut settings search follows current bindings and retains editing controls", async ({
  page,
}, testInfo) => {
  await openShortcutsSettings(page);
  const search = page.getByTestId("settings-shortcuts-search");
  const clearSearch = page.getByTestId("settings-shortcuts-search-clear");
  const interrupt = page.getByText("Interrupt agent", { exact: true });
  const row = interrupt.locator("..");
  const initialRows = await page.getByRole("button", { name: /^Actions for / }).count();
  const defaultRow = await row.innerText();
  await expect(search).toBeVisible();
  await search.fill("Interrupt agent");
  await expect(interrupt).toBeVisible();
  await expect(page.getByText("Archive workspace", { exact: true })).toHaveCount(0);

  await captureShortcut(page, "Interrupt agent", "agent-interrupt", "Alt+Shift+J");
  await finishInterruptCapture(page, "Done");
  await search.fill("alt+shift+j");
  await expect(interrupt).toBeVisible();
  await captureShortcut(page, "Interrupt agent", "agent-interrupt", "Alt+Shift+L");
  await finishInterruptCapture(page, "Done");
  await expect(interrupt).toHaveCount(0);
  await expect(page.getByText("No results found", { exact: true })).toBeVisible();
  await search.fill("alt+shift+l");
  await expect(interrupt).toBeVisible();
  await clearSearch.click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(initialRows);

  await search.fill("no-such-shortcut-qa");
  await expect(page.getByText("No results found", { exact: true })).toBeVisible();
  await clearSearch.click();
  await search.fill("Interrupt agent");
  await page.getByRole("button", { name: "Actions for Interrupt agent" }).click();
  await page.getByTestId("shortcut-reset-agent-interrupt").click();
  await expect(row).toHaveText(defaultRow, { useInnerText: true });

  await captureShortcut(page, "Interrupt agent", "agent-interrupt", "Alt+Shift+L");
  await search.click();
  await expect(row.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
  await search.fill("alt+shift+l");
  await expect(interrupt).toHaveCount(0);
  await clearSearch.click();
  await expect(row).toHaveText(defaultRow, { useInnerText: true });
  await expect(
    page.getByText("Unable to load desktop daemon status.", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("settings-shortcuts-search.png") });
});
