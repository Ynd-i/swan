import type { Page } from "@playwright/test";
import { test, expect } from "../../app/e2e/support/fixtures";
import { gotoAppShell, openSettings } from "../../app/e2e/support/helpers/app";
import { openSettingsSection } from "../../app/e2e/support/helpers/settings";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installUsageReportsFixture } from "../../app/e2e/support/helpers/usage-reports";
import { installDesktopRuntime } from "./support/runtime";

const SETTINGS_KEY = "@paseo:app-settings";

function storedThemeColors(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}").themeColors,
    SETTINGS_KEY,
  );
}

async function openAppearance(page: Page) {
  await gotoAppShell(page);
  await openSettings(page);
  await openSettingsSection(page, "appearance");
}

test("macOS dark uses the Claude palette and applies, persists and resets custom colors", async ({
  page,
}) => {
  await installDesktopRuntime(page, {
    serverId: getServerId(),
    manageBuiltInDaemon: false,
    daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
  });
  await installUsageReportsFixture(page, { lists: [[]] });
  await page.addInitScript((key) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({ theme: "dark", language: "en" }));
    }
  }, SETTINGS_KEY);
  await page.setViewportSize({ width: 1352, height: 782 });
  await page.emulateMedia({ colorScheme: "dark" });
  await openAppearance(page);

  const sidebar = page.getByTestId("settings-sidebar");
  await expect(sidebar).toHaveCSS("background-color", "rgb(17, 17, 17)");
  const section = page.getByTestId("appearance-theme-colors");
  await expect(section.getByText("Dark colors", { exact: true })).toBeVisible();
  const sidebarField = page.getByTestId("appearance-color-sidebar");
  await expect(sidebarField).toHaveAttribute("placeholder", "#111111");

  await sidebarField.fill("000000");
  await sidebarField.press("Enter");
  await expect(sidebar).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect.poll(() => storedThemeColors(page)).toEqual({ dark: { sidebar: "#000000" } });

  await sidebarField.fill("#zzzzzz");
  await sidebarField.press("Enter");
  await expect(sidebarField).toHaveValue("#000000");

  await page.reload();
  await openAppearance(page);
  await expect(page.getByTestId("settings-sidebar")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(page.getByTestId("appearance-color-sidebar")).toHaveValue("#000000");

  await page.getByTestId("appearance-theme-colors-reset").click();
  await expect(page.getByTestId("settings-sidebar")).toHaveCSS(
    "background-color",
    "rgb(17, 17, 17)",
  );
  await expect.poll(() => storedThemeColors(page)).toEqual({});
});
