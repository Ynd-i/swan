import { test, expect } from "../../app/e2e/support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { composerLocator, submitMessage } from "../../app/e2e/support/helpers/composer";
import { openSettings } from "../../app/e2e/support/helpers/app";
import {
  openSettingsSection,
  clickSettingsBackToWorkspace,
} from "../../app/e2e/support/helpers/settings";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDesktopRuntime } from "./support/runtime";

test("interface weight updates default UI text without flattening content or code", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "interface-weight-",
    title: "Interface weight",
    featureValues: {
      mockAssistantResponse:
        "# Authored heading\n\nDefault prose and **strong words** with `inline()`.\n\n1. Numbered prose\n\n```ts\nconst fixedWeight = 42;\n```\n",
    },
  });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await page.setViewportSize({ width: 1352, height: 900 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    await submitMessage(page, "Check interface weight.");
    const assistant = page.getByTestId("assistant-message");
    const prose = assistant.getByText("Default prose and", { exact: true });
    await expect(prose).toBeVisible();
    const composer = composerLocator(page);
    await composer.fill("Keep this draft unchanged.");
    const title = page.getByTestId("desktop-chat-title");
    const sidebar = page.getByTestId("desktop-workspace-sidebar");
    const sidebarWidth = (await sidebar.boundingBox())!.width;
    await openSettings(page);
    await openSettingsSection(page, "appearance");
    const weight = page.getByLabel(/^Interface font weight:/);
    const rowTitle = page.getByText("Interface font style", { exact: true });
    await expect(rowTitle).toHaveCSS("font-weight", "400");
    await weight.click();
    await page.getByRole("menuitem", { name: "Medium", exact: true }).click();
    await expect(rowTitle).toHaveCSS("font-weight", "500");
    await expect(
      page.getByRole("textbox", { name: "Interface font family", exact: true }),
    ).toHaveCSS("font-weight", "500");
    await page.getByLabel(/^Code font weight:/).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("interface-weight-settings.png") });
    await clickSettingsBackToWorkspace(page);
    await expect(title).toHaveCSS("font-weight", "500");
    await expect(prose).toHaveCSS("font-weight", "400");
    await expect(assistant.getByText("strong words", { exact: true })).toHaveCSS(
      "font-weight",
      "500",
    );
    await expect(assistant.getByText("Authored heading", { exact: true })).toHaveCSS(
      "font-weight",
      "700",
    );
    await expect(assistant.getByText("inline()", { exact: true })).toHaveCSS("font-weight", "400");
    await expect(assistant.getByText("42", { exact: true })).toHaveCSS("font-weight", "400");
    await expect(composer).toHaveCSS("font-weight", "400");
    await expect(composer).toHaveValue("Keep this draft unchanged.");
    await page.reload();
    await expect(title).toHaveCSS("font-weight", "500");
    await expect(prose).toHaveCSS("font-weight", "400");
    await openSettings(page);
    await openSettingsSection(page, "appearance");
    await weight.click();
    await page.getByRole("menuitem", { name: "SemiBold", exact: true }).click();
    await expect(rowTitle).toHaveCSS("font-weight", "600");
    await page.getByLabel(/^Content font weight:/).click();
    await page.getByRole("menuitem", { name: "Medium", exact: true }).click();
    await clickSettingsBackToWorkspace(page);
    await expect(title).toHaveCSS("font-weight", "600");
    await expect
      .poll(async () => (await sidebar.boundingBox())!.width)
      .toBeCloseTo(sidebarWidth, 0);
    await expect(prose).toHaveCSS("font-weight", "500");
    await expect(assistant.getByText("strong words", { exact: true })).toHaveCSS(
      "font-weight",
      "600",
    );
    await expect(assistant.getByText("inline()", { exact: true })).toHaveCSS("font-weight", "400");
    await page.screenshot({ path: testInfo.outputPath("interface-weight-surfaces.png") });
    await openSettings(page);
    await openSettingsSection(page, "appearance");
    await weight.click();
    await page.getByRole("menuitem", { name: "Default", exact: true }).click();
    await expect(rowTitle).toHaveCSS("font-weight", "400");
    await clickSettingsBackToWorkspace(page);
    await expect(title).toHaveCSS("font-weight", "400");
    await expect(prose).toHaveCSS("font-weight", "500");
  } finally {
    await fixture.cleanup();
  }
});
