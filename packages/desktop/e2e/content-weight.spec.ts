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

test("macOS content weight changes prose and drafts independently of UI and code", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "content-weight-",
    title: "Content weight",
    featureValues: {
      mockAssistantResponse:
        "# Heading weight\n\nOrdinary paragraph with **strong words** and `inline()`.\n\n- List item\n\n1. Numbered item\n\n> Quoted content\n\n```ts\nconst codeWeight = 42;\n```\n",
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
    await submitMessage(page, "Check content weights.");
    const assistant = page.getByTestId("assistant-message");
    const prose = assistant.getByText("Ordinary paragraph with", { exact: true });
    const strong = assistant.getByText("strong words", { exact: true });
    const inline = assistant.getByText("inline()", { exact: true });
    const heading = assistant.getByText("Heading weight", { exact: true });
    const user = page
      .getByTestId("user-message")
      .getByText("Check content weights.", { exact: true });
    const composer = composerLocator(page);
    await composer.fill("Keep this draft while changing fonts.");
    const title = page.getByTestId("desktop-chat-title");
    const titleWeight = await title.evaluate((node) => getComputedStyle(node).fontWeight);
    const selectWeight = async (name: string) => {
      await openSettings(page);
      await openSettingsSection(page, "appearance");
      await page.getByLabel(/^Content font weight:/).click();
      await page.getByRole("menuitem", { name, exact: true }).click();
      await clickSettingsBackToWorkspace(page);
    };
    await expect(prose).toHaveCSS("font-weight", "400");
    await selectWeight("SemiBold");
    for (const node of [
      user,
      composer,
      prose,
      assistant.getByText("List item", { exact: true }),
      assistant.getByText("Numbered item", { exact: true }),
      assistant.getByText("Quoted content", { exact: true }),
    ])
      await expect(node).toHaveCSS("font-weight", "600");
    await expect(strong).toHaveCSS("font-weight", "700");
    await expect(heading).toHaveCSS("font-weight", "700");
    await expect(inline).toHaveCSS("font-weight", "400");
    await expect(assistant.getByText("42", { exact: true })).toHaveCSS("font-weight", "400");
    await expect(title).toHaveCSS("font-weight", titleWeight);
    await expect(composer).toHaveValue("Keep this draft while changing fonts.");
    await page.screenshot({ path: testInfo.outputPath("content-weight-semibold.png") });
    await page.reload();
    await expect(prose).toHaveCSS("font-weight", "600");
    await expect(composer).toHaveValue("Keep this draft while changing fonts.");
    await selectWeight("Medium");
    await expect(prose).toHaveCSS("font-weight", "500");
    await expect(strong).toHaveCSS("font-weight", "600");
    await selectWeight("Default");
    await expect(prose).toHaveCSS("font-weight", "400");
    await expect(strong).toHaveCSS("font-weight", "500");
    await expect(user).toHaveCSS("font-weight", "400");
    await expect(inline).toHaveCSS("font-weight", "400");
  } finally {
    await fixture.cleanup();
  }
});
