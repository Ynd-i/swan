import { test, expect } from "../../app/e2e/support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { openSettings } from "../../app/e2e/support/helpers/app";
import {
  openSettingsSection,
  clickSettingsBackToWorkspace,
} from "../../app/e2e/support/helpers/settings";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDesktopRuntime } from "./support/runtime";

test("Codex syntax is the new Mac default while explicit presets and custom fonts remain selectable", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "syntax-theme-",
    title: "Syntax theme reference",
    repo: { files: [{ path: "sample.ts", content: 'export const greeting = "Hello";\n' }] },
  });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    await page.getByTestId("workspace-explorer-toggle").click();
    await page
      .getByTestId("workspace-explorer-sidebar")
      .getByTestId("workspace-new-tab-files")
      .click();
    const dock = page.getByTestId("workspace-explorer-sidebar");
    await dock.getByText("sample.ts", { exact: true }).click();
    const editor = dock.locator('.cm-content[contenteditable="true"]').filter({ visible: true });
    const keyword = editor.locator("span").filter({ hasText: /^export$/ });
    const string = editor.locator("span").filter({ hasText: /^"Hello"$/ });
    const identifier = editor.locator("span").filter({ hasText: /^greeting$/ });
    await expect(keyword).toHaveCSS("color", "rgb(230, 104, 69)");
    await expect(string).toHaveCSS("color", "rgb(90, 196, 97)");
    await expect(identifier).toHaveCSS("color", "rgb(240, 240, 238)");
    await openSettings(page);
    await openSettingsSection(page, "appearance");
    const syntax = page.getByLabel(/^Highlight theme:/);
    await expect(syntax).toHaveAccessibleName("Highlight theme: Codex");
    await syntax.click();
    await page.getByRole("menuitem", { name: "One", exact: true }).click();
    await clickSettingsBackToWorkspace(page);
    await expect(keyword).toHaveCSS("color", "rgb(198, 120, 221)");
    await page.reload();
    await expect(keyword).toHaveCSS("color", "rgb(198, 120, 221)");
    await openSettings(page);
    await openSettingsSection(page, "appearance");
    await expect(syntax).toHaveAccessibleName("Highlight theme: One");
    await syntax.click();
    await page.getByRole("menuitem", { name: "Codex", exact: true }).click();
    await page.getByLabel(/^Theme:/).click();
    await page.getByRole("menuitem", { name: "Light", exact: true }).click();
    const font = page.getByRole("textbox", { name: "Code font family", exact: true });
    await font.fill("Courier New");
    await font.press("Tab");
    const size = page.getByRole("textbox", { name: "Code font size", exact: true });
    await size.fill("16");
    await size.press("Tab");
    await clickSettingsBackToWorkspace(page);
    await expect(keyword).toHaveCSS("color", "rgb(196, 60, 23)");
    await expect(string).toHaveCSS("color", "rgb(0, 132, 43)");
    await expect(editor).toHaveCSS("font-family", '"Courier New"');
    await expect(keyword).toHaveCSS("font-size", "16px");
    await openSettings(page);
    await openSettingsSection(page, "appearance");
    await page.getByLabel(/^Theme:/).click();
    await page.getByRole("menuitem", { name: "Dark", exact: true }).click();
    await clickSettingsBackToWorkspace(page);
    await expect(keyword).toHaveCSS("color", "rgb(230, 104, 69)");
    await expect(editor).toHaveCSS("font-family", '"Courier New"');
    await expect(keyword).toHaveCSS("font-size", "16px");
    await page.screenshot({ path: testInfo.outputPath("codex-syntax-custom-font.png") });
  } finally {
    await fixture.cleanup();
  }
});
