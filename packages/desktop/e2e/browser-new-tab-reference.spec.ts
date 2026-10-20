import { BROWSER_NEW_TAB_URL } from "../../app/src/desktop/browser/new-tab-url";
import { test, expect } from "../../app/e2e/support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { composerLocator } from "../../app/e2e/support/helpers/composer";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDesktopRuntime } from "./support/runtime";

test("macOS browser new tab opens workspace tools without replacing the chat", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "browser-new-tab-",
    title: "Browser tools",
    repo: { files: [{ path: "example.ts", content: "export const answer = 42;\n" }] },
  });
  let foreign: Awaited<ReturnType<typeof seedMockAgentWorkspace>> | null = null;
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    await composerLocator(page).fill("Keep the main conversation draft.");
    await page.getByTestId("workspace-explorer-toggle").click();
    await page.evaluate(() => {
      if (!window.paseoDesktop) throw new Error("Missing desktop fixture");
      window.paseoDesktop.browser = {
        profilePartition: "persist:browser-new-tab-test",
        registerAttachedBrowser: async () => {},
      };
    });
    await page.getByTestId("explorer-sidebar-new-tab-button").click();
    await page.getByTestId("workspace-new-tab-menu-browser").click();
    const homepage = page.getByTestId("browser-new-tab-page").filter({ visible: true });
    const address = page
      .getByRole("textbox", { name: "Browser URL", exact: true })
      .filter({ visible: true });
    await expect(homepage).toBeVisible();
    await expect(address).toHaveValue("");
    await expect(address).toBeFocused();
    await address.press("Enter");
    await expect(homepage).toBeVisible();
    await expect(page.getByTestId("browser-new-tab-open-pages")).toHaveCount(0);
    const browserId = await page.locator("webview").getAttribute("data-paseo-browser-id");
    const browserTabId = await page
      .locator('[data-testid^="explorer-sidebar-tab-"][aria-selected="true"]')
      .getAttribute("data-testid");
    if (!browserTabId) throw new Error("Missing selected browser tab");
    const browserSurface = page.locator(`[data-paseo-browser-surface="${browserId}"]`);
    await expect(browserSurface).toHaveAttribute("aria-hidden", "true");
    const browserTab = page.getByTestId(browserTabId);
    await expect(browserTab).toHaveAccessibleName("New tab");
    const webviewNode = await page.locator("webview").elementHandle();
    if (!webviewNode) throw new Error("Missing resident webview");
    expect(await webviewNode.evaluate((node) => (node as HTMLElement & { src: string }).src)).toBe(
      BROWSER_NEW_TAB_URL,
    );
    await expect(homepage.getByRole("button", { name: "More tools", exact: true })).toBeVisible();
    await homepage.getByTestId("browser-new-tab-terminal").click();
    await expect(
      page
        .getByTestId("workspace-explorer-sidebar")
        .getByTestId("terminal-surface")
        .filter({ visible: true }),
    ).toHaveCount(1);
    const terminals = await fixture.client.listTerminals(fixture.cwd, undefined, {
      workspaceId: fixture.workspaceId,
    });
    expect(terminals.terminals).toHaveLength(1);
    await expect(composerLocator(page)).toHaveValue("Keep the main conversation draft.");
    await browserTab.click();
    await expect(homepage).toBeVisible();
    await homepage.getByTestId("browser-new-tab-files").click();
    await expect(
      page
        .getByTestId("workspace-explorer-sidebar")
        .getByTestId("file-explorer-tree-scroll")
        .filter({ visible: true })
        .getByText("example.ts", { exact: true }),
    ).toBeVisible();
    await browserTab.click();
    await homepage.getByTestId("browser-new-tab-diff").click();
    await expect(
      page
        .getByTestId("workspace-explorer-sidebar")
        .getByTestId("working-diff-panel")
        .filter({ visible: true }),
    ).toBeVisible();
    await browserTab.click();
    await homepage.getByTestId("browser-new-tab-more").click();
    await expect(
      page.getByTestId("workspace-new-tab-menu").getByText("Terminal profiles", { exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await address.fill("https://example.com");
    await address.press("Enter");
    await expect(homepage).toHaveCount(0);
    await expect(address).toHaveValue("https://example.com");
    await expect(browserSurface).toHaveAttribute("aria-hidden", "false");
    expect(await webviewNode.evaluate((node) => node.isConnected)).toBe(true);
    await address.fill("about:blank");
    await address.press("Enter");
    await expect(homepage).toHaveCount(0);
    await expect(address).toHaveValue("about:blank");
    await expect(browserSurface).toHaveAttribute("aria-hidden", "false");
    expect(await webviewNode.evaluate((node) => node.isConnected)).toBe(true);
    // Exercise the guest navigation event used by Back/Forward, retaining the same DOM guest.
    await webviewNode.evaluate((node, url) => {
      node.setAttribute("src", url);
      node.dispatchEvent(Object.assign(new Event("did-navigate"), { url }));
      node.dispatchEvent(new Event("did-stop-loading"));
    }, BROWSER_NEW_TAB_URL);
    await expect(homepage).toBeVisible();
    await expect(browserSurface).toHaveAttribute("aria-hidden", "true");
    await expect(address).toHaveValue("");
    expect(await webviewNode.evaluate((node) => node.isConnected)).toBe(true);
    await address.fill("about:blank#untrusted");
    await address.press("Enter");
    await expect(
      page.getByText("Blocked unsupported browser URL: about:", { exact: true }),
    ).toBeVisible();
    expect(await webviewNode.getAttribute("src")).toBe(BROWSER_NEW_TAB_URL);
    await address.fill(BROWSER_NEW_TAB_URL);
    await address.press("Enter");
    await expect(homepage).toBeVisible();
    await address.fill("https://example.test/documentation");
    await address.press("Enter");
    // The browser profile and guest events are simulated; workspace tools above use the real daemon.
    await webviewNode.evaluate((node) => {
      node.dispatchEvent(
        Object.assign(new Event("page-title-updated"), { title: "Workspace documentation" }),
      );
      node.dispatchEvent(new Event("did-stop-loading"));
    });
    await expect(browserTab).toContainText("Workspace documentation");
    await page.getByTestId("explorer-sidebar-new-tab-button").click();
    await page.getByTestId("workspace-new-tab-menu-browser").click();
    const openPage = homepage.getByTestId(`browser-new-tab-open-${browserId}`);
    await expect(openPage).toHaveAccessibleName("Workspace documentation");
    await expect(composerLocator(page)).toHaveValue("Keep the main conversation draft.");
    await page.screenshot({ path: testInfo.outputPath("browser-new-tab-open-pages.png") });
    await openPage.click();
    await expect(homepage).toHaveCount(0);
    await expect(address).toHaveValue("https://example.test/documentation");
    await address.fill(BROWSER_NEW_TAB_URL);
    await address.press("Enter");
    await expect(homepage).toBeVisible();
    const closeFirstBrowser = page.getByTestId(
      browserTabId.replace("explorer-sidebar-tab-", "explorer-sidebar-tab-close-"),
    );
    await closeFirstBrowser.focus();
    await closeFirstBrowser.press("Enter");
    await expect(homepage.getByTestId("browser-new-tab-open-pages")).toHaveCount(0);
    await expect(page.getByTestId("workspace-new-tab-button")).toHaveCount(0);
    await page.setViewportSize({ width: 900, height: 782 });
    await expect(homepage.getByTestId("browser-new-tab-terminal")).toBeInViewport();
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.screenshot({ path: testInfo.outputPath("browser-new-tab.png") });
    await address.fill("https://example.test/current-workspace-only");
    await address.press("Enter");
    await page.locator(`webview:not([data-paseo-browser-id="${browserId}"])`).evaluate((node) => {
      node.dispatchEvent(
        Object.assign(new Event("page-title-updated"), { title: "Only in the original workspace" }),
      );
      node.dispatchEvent(new Event("did-stop-loading"));
    });
    foreign = await seedMockAgentWorkspace({
      repoPrefix: "browser-other-workspace-",
      title: "Other workspace",
    });
    await openAgentRoute(page, foreign);
    await page.getByTestId("workspace-explorer-toggle").click();
    await page.evaluate(() => {
      if (!window.paseoDesktop) throw new Error("Missing desktop fixture");
      window.paseoDesktop.browser = {
        profilePartition: "persist:browser-new-tab-test",
        registerAttachedBrowser: async () => {},
      };
    });
    await page.getByTestId("explorer-sidebar-new-tab-button").click();
    await page.getByTestId("workspace-new-tab-menu-browser").click();
    await expect(homepage).toBeVisible();
    await expect(homepage.getByTestId("browser-new-tab-open-pages")).toHaveCount(0);
    await expect(homepage.getByText("Only in the original workspace", { exact: true })).toHaveCount(
      0,
    );
  } finally {
    await foreign?.cleanup();
    await fixture.cleanup();
  }
});
