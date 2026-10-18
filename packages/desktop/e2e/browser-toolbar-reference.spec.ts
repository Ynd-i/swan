import { test, expect } from "../../app/e2e/support/fixtures";
import { seedWorkspace } from "../../app/e2e/support/helpers/seed-client";
import { buildHostWorkspaceRoute } from "../../app/src/utils/host-routes";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installUsageReportsFixture } from "../../app/e2e/support/helpers/usage-reports";
import { installDesktopRuntime } from "./support/runtime";

test("macOS browser toolbar retains its address and tools when resized", async ({
  page,
}, testInfo) => {
  const workspace = await seedWorkspace({ repoPrefix: "browser-toolbar-" });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await installUsageReportsFixture(page, { lists: [[]] });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(buildHostWorkspaceRoute(getServerId(), workspace.workspaceId));
    await page.getByTestId("workspace-explorer-toggle").click();
    await page.getByTestId("explorer-sidebar-new-tab-button").click();
    // This renderer check exercises toolbar layout, not a real Electron webview.
    await page.evaluate(() => {
      if (!window.paseoDesktop) throw new Error("Desktop fixture is missing");
      window.paseoDesktop.browser = {
        profilePartition: "persist:browser-toolbar-test",
        registerAttachedBrowser: async () => {},
      };
    });
    await page.getByTestId("workspace-new-tab-menu-browser").click();

    const address = page.getByRole("textbox", { name: "Browser URL", exact: true });
    const addressFrame = address.locator("..");
    await expect(address).toBeVisible();
    await expect(addressFrame).toHaveCSS("height", "32px");
    await expect(addressFrame).toHaveCSS("border-radius", "16px");
    await address.focus();
    await expect(addressFrame).toHaveCSS("background-color", "rgb(52, 52, 52)");
    await expect(addressFrame).toHaveCSS("border-top-color", "rgb(137, 135, 129)");
    await expect(address).toHaveValue("");
    await expect
      .poll(() => address.evaluate((input) => getComputedStyle(input, "::placeholder").textAlign))
      .toBe("center");
    await expect(address).toHaveCSS("text-align", /^(left|start)$/);
    await page.screenshot({ path: testInfo.outputPath("browser-centered-placeholder.png") });
    const originalUrl = await address.inputValue();
    await expect
      .poll(() =>
        address.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd]),
      )
      .toEqual([0, originalUrl.length]);
    const webview = page.locator("webview");
    const originalSource = await webview.getAttribute("src");
    await webview.evaluate((element) => {
      element.setAttribute("data-navigation-changes", "0");
      new MutationObserver((records) => {
        const count = Number(element.getAttribute("data-navigation-changes"));
        element.setAttribute("data-navigation-changes", String(count + records.length));
      }).observe(element, { attributes: true, attributeFilter: ["src"] });
    });
    await address.fill("https://example.test/unsubmitted");
    await expect(address).toHaveCSS("text-align", /^(left|start)$/);
    await page.getByTestId("browser-tools-menu-trigger").focus();
    await expect(address).toHaveValue("https://example.test/unsubmitted");
    await expect(addressFrame).toHaveCSS("background-color", "rgb(38, 38, 38)");
    await page.keyboard.press("Meta+l");
    await expect(address).toBeFocused();
    await expect
      .poll(() =>
        address.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd]),
      )
      .toEqual([0, "https://example.test/unsubmitted".length]);
    await address.press("Escape");
    await expect(address).toHaveValue(originalUrl);
    await expect(address).not.toBeFocused();
    expect(await webview.getAttribute("src")).toBe(originalSource);
    await expect(webview).toHaveAttribute("data-navigation-changes", "0");
    await address.fill("https://example.test/retained-draft");
    await address.press("Enter");
    await expect(address).toHaveValue("https://example.test/retained-draft");
    await expect(webview).toHaveAttribute("src", "https://example.test/retained-draft");
    await expect(webview).toHaveAttribute("data-navigation-changes", "1");
    await page.mouse.move(500, 400);
    await page.screenshot({ path: testInfo.outputPath("browser-toolbar-wide.png") });

    for (const width of [900, 700, 1352]) {
      await page.setViewportSize({ width, height: 782 });
      await expect(address).toBeInViewport();
      await expect(address).toHaveValue("https://example.test/retained-draft");
      await address.focus();
      await expect(addressFrame).toHaveCSS("background-color", "rgb(52, 52, 52)");
      await address.fill("https://example.test/temporary");
      await address.press("Escape");
      await expect(address).toHaveValue("https://example.test/retained-draft");
      const more = page.getByTestId("browser-tools-menu-trigger");
      await expect(more).toBeInViewport();
      const directTools = page.getByRole("button", { name: "Screenshot element", exact: true });
      const hasDirectTools = await directTools.isVisible();
      if (hasDirectTools) {
        await expect(directTools).toBeInViewport();
        await expect(
          page.getByRole("button", { name: "Annotate element", exact: true }),
        ).toBeInViewport();
      }
      await more.click();
      await expect(
        page.getByRole("menuitem", { name: "Open browser dev tools", exact: true }),
      ).toBeVisible();
      if (!hasDirectTools) {
        await expect(
          page.getByRole("menuitem", { name: "Annotate element", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("menuitem", { name: "Screenshot element", exact: true }),
        ).toBeVisible();
      }
      await page.getByRole("menuitem", { name: "Device size", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: "Responsive", exact: true })).toBeVisible();
      await page.getByRole("menuitem", { name: "Responsive", exact: true }).click();
    }
    await page.keyboard.press("Meta+l");
    await expect(address).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("browser-toolbar-focused.png") });
  } finally {
    await workspace.cleanup();
  }
});
