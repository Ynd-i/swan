import { writeFile } from "node:fs/promises";
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
import { installUsageReportsFixture } from "../../app/e2e/support/helpers/usage-reports";

test("macOS code weight reaches files, Markdown, tool output and canvas without changing prose", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "code-weight-",
    title: "Code weight verification",
    model: "ten-second-stream",
    repo: {
      files: [
        { path: "sample.ts", content: "export const answer = 42;\n" },
        { path: "large.ts", content: "export const large = 42;\n".repeat(48_000) },
        {
          path: "weights.md",
          content:
            "# Weight heading\n\nOrdinary prose with **strong words** and `inline()`.\n\n```ts\nconst weight = 42;\n```\n",
        },
      ],
    },
  });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await installUsageReportsFixture(page, { lists: [[]] });
    await page.addInitScript(() => {
      Reflect.set(window, "__codeWeightPaints", []);
      const draw = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
        if (
          this.canvas.getAttribute("data-testid") === "git-diff-canvas" &&
          text.includes("answer")
        )
          Reflect.get(window, "__codeWeightPaints").push(this.font);
        if (maxWidth === undefined) draw.call(this, text, x, y);
        else draw.call(this, text, x, y, maxWidth);
      };
    });
    await writeFile(`${fixture.cwd}/sample.ts`, "export const answer = 43;\n");
    await fixture.client.checkoutRefresh(fixture.cwd);
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    const prompt = "Show the synthetic typography response.";
    await submitMessage(page, prompt);
    const assistant = page.getByTestId("assistant-message").last();
    await expect(assistant).toContainText("(end of synthetic stream)", { timeout: 30_000 });
    const title = page.getByTestId("desktop-chat-title");
    const userText = page.getByTestId("user-message").getByText(prompt, { exact: true });
    const composer = composerLocator(page);
    const originalWeights = await Promise.all(
      [title, userText, composer].map((locator) =>
        locator.evaluate((node) => getComputedStyle(node).fontWeight),
      ),
    );
    const inline = page
      .getByTestId("assistant-message")
      .getByText("userIsAtBottom", { exact: true })
      .first();
    await page.screenshot({ path: testInfo.outputPath("code-weight-baseline.png") });
    await expect(inline).toHaveCSS("font-weight", "400");
    const selectWeight = async (label: string) => {
      await openSettings(page);
      await openSettingsSection(page, "appearance");
      await page.getByLabel(/^Code font weight:/).click();
      await page.getByRole("menuitem", { name: label, exact: true }).click();
      await clickSettingsBackToWorkspace(page);
    };
    await selectWeight("Medium");
    await expect(inline).toHaveCSS("font-weight", "500");
    for (const [index, locator] of [title, userText, composer].entries())
      await expect(locator).toHaveCSS("font-weight", originalWeights[index]);
    await page.getByTestId("desktop-turn-activity").first().click();
    const shell = page
      .getByTestId("tool-call-badge")
      .filter({ hasText: "node scripts/simulate-stream-burst.mjs" })
      .first();
    await shell.getByRole("button").first().click();
    await expect(
      shell.getByTestId("shell-output-horizontal-scroll").getByText("$", { exact: true }),
    ).toHaveCSS("font-weight", "500");

    await page.getByTestId("workspace-explorer-toggle").click();
    await page
      .getByTestId("workspace-explorer-sidebar")
      .getByTestId("workspace-new-tab-files")
      .click();
    const dock = page.getByTestId("workspace-explorer-sidebar");
    const tree = dock.getByTestId("file-tree-rail-tree").filter({ visible: true });
    await tree.getByText("sample.ts", { exact: true }).click();
    // An opened file starts without the folder tree.
    await dock
      .getByTestId("file-tool-toolbar")
      .filter({ visible: true })
      .getByTestId("file-toggle-tree")
      .click();
    const editor = dock.locator('.cm-content[contenteditable="true"]').filter({ visible: true });
    await expect(editor).toHaveCSS("font-weight", "500");
    await expect(editor).toContainText("answer = 43");
    await tree.getByText("large.ts", { exact: true }).click();
    await expect(
      dock.locator('.cm-content[contenteditable="false"]').filter({ visible: true }),
    ).toHaveCSS("font-weight", "500");
    await tree.getByText("weights.md", { exact: true }).click();
    const preview = dock.getByTestId("markdown-preview-frame").filter({ visible: true });
    const fence = preview
      .locator('[data-paseo-markdown-tag="pre"] [data-paseo-markdown-tag="code"]')
      .first();
    await expect(fence).toHaveCSS("font-weight", "500");
    await expect(preview.getByText("inline()", { exact: true })).toHaveCSS("font-weight", "500");
    await expect(preview.getByText("strong words", { exact: true })).toHaveCSS(
      "font-weight",
      "500",
    );
    await expect(preview.getByText("Weight heading", { exact: true })).toHaveCSS(
      "font-weight",
      "700",
    );
    await page.screenshot({ path: testInfo.outputPath("code-weight-medium.png") });

    await page.getByTestId("explorer-sidebar-new-tab-button").click();
    await page.getByTestId("workspace-new-tab-menu-diff").click();
    const canvas = dock.getByTestId("git-diff-canvas").filter({ visible: true });
    await expect(canvas).toHaveCSS("font-weight", "500");
    // The painter restores context state afterward; inspect the actual draw call instead.
    const paintedFont = () => page.evaluate(() => Reflect.get(window, "__codeWeightPaints").at(-1));
    await expect.poll(paintedFont).toMatch(/^500 /);
    await page.screenshot({ path: testInfo.outputPath("code-weight-diff.png") });
    await selectWeight("Regular");
    await expect(canvas).toHaveCSS("font-weight", "400");
    // Canvas serializes normal 400 without the weight token.
    await expect.poll(paintedFont).toMatch(/^(?:400 )?12px /);
    await page.getByRole("button", { name: "Browse workspace files", exact: true }).click();
    await tree.getByText("weights.md", { exact: true }).click();
    await expect(fence).toHaveCSS("font-weight", "400");
    await expect(preview.getByText("strong words", { exact: true })).toHaveCSS(
      "font-weight",
      "500",
    );
    await expect(preview.getByText("Weight heading", { exact: true })).toHaveCSS(
      "font-weight",
      "700",
    );
    await tree.getByText("sample.ts", { exact: true }).click();
    await expect(editor).toHaveCSS("font-weight", "400");
    await selectWeight("Default");
    await expect(editor).toHaveCSS("font-weight", "600");
    await expect(inline).toHaveCSS("font-weight", "400");
    await page.reload();
    await expect(editor).toHaveCSS("font-weight", "600");
    await expect(editor).toContainText("answer = 43");
  } finally {
    await fixture.cleanup();
  }
});

test("content font changes conversation text and returns to the interface font when cleared", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "content-font-",
    title: "Content font verification",
    model: "ten-second-stream",
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
    const prompt = "Show a short synthetic response for typography verification.";
    await submitMessage(page, prompt);
    const assistant = page.getByTestId("assistant-message").last();
    await expect(assistant).toContainText("(end of synthetic stream)", { timeout: 30_000 });
    const userText = page.getByTestId("user-message").getByText(prompt, { exact: true });
    const title = page.getByTestId("desktop-chat-title");
    const uiFont = await title.evaluate((node) => getComputedStyle(node).fontFamily);

    await openSettings(page);
    await openSettingsSection(page, "appearance");
    const contentFont = page.getByRole("textbox", { name: "Content font family", exact: true });
    await contentFont.fill("Georgia");
    await contentFont.press("Tab");
    await clickSettingsBackToWorkspace(page);
    await expect(userText).toHaveCSS("font-family", "Georgia");
    await expect(assistant.getByText("(end of synthetic stream)", { exact: true })).toHaveCSS(
      "font-family",
      "Georgia",
    );
    await expect(composerLocator(page)).toHaveCSS("font-family", "Georgia");
    await expect(title).toHaveCSS("font-family", uiFont);
    await page.screenshot({ path: testInfo.outputPath("transcript-content-font.png") });

    await openSettings(page);
    await openSettingsSection(page, "appearance");
    await contentFont.fill("");
    await contentFont.press("Tab");
    await clickSettingsBackToWorkspace(page);
    await expect(userText).toHaveCSS("font-family", uiFont);
    await expect(composerLocator(page)).toHaveCSS("font-family", uiFont);
  } finally {
    await fixture.cleanup();
  }
});

test("macOS composer hides its focus hint while retaining shortcut and narrow draft layout", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "composer-focus-hint-",
    title: "Composer focus verification",
  });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await installUsageReportsFixture(page, { lists: [[]] });
    await page.setViewportSize({ width: 1352, height: 781 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    const input = composerLocator(page);
    const composer = page.getByTestId("message-input-root").filter({ visible: true });
    const attach = composer.getByTestId("message-input-attach-button");
    await expect(input).toHaveValue("");
    await input.focus();
    await expect(input).toBeFocused();
    await attach.focus();
    await expect(input).not.toBeFocused();
    await expect(composer.getByText(/to focus$/)).toHaveCount(0);

    await page.getByTestId("workspace-explorer-toggle").click();
    await expect(page.getByTestId("workspace-explorer-sidebar")).toBeVisible();
    await page
      .getByTestId("workspace-explorer-sidebar")
      .getByTestId("workspace-new-tab-files")
      .click();
    await expect(
      page.getByTestId("file-explorer-tree-scroll").filter({ visible: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 900, height: 781 });
    await input.focus();
    await attach.focus();
    await expect(input).toHaveValue("");
    await expect(composer.getByText(/to focus$/)).toHaveCount(0);
    const composerBox = await composer.boundingBox();
    const inputBox = await input.boundingBox();
    if (!composerBox || !inputBox) throw new Error("Missing narrow composer geometry");
    expect(inputBox.x).toBeGreaterThanOrEqual(composerBox.x);
    expect(inputBox.y).toBeGreaterThanOrEqual(composerBox.y);
    expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(composerBox.x + composerBox.width);
    expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(composerBox.y + composerBox.height);
    await page.mouse.move(500, 300);
    await page.screenshot({ path: testInfo.outputPath("composer-empty-narrow.png") });
    await page.keyboard.press("Meta+l");
    await expect(input).toBeFocused();
    const draft = "Keep this draft while resizing the composer.";
    await input.fill(draft);
    const send = composer.getByRole("button", { name: "Send message", exact: true });
    await expect(send).toBeVisible();
    const draftBox = await composer.boundingBox();
    const sendBox = await send.boundingBox();
    if (!draftBox || !sendBox) throw new Error("Missing narrow send control geometry");
    expect(sendBox.x).toBeGreaterThanOrEqual(draftBox.x);
    expect(sendBox.y).toBeGreaterThanOrEqual(draftBox.y);
    expect(sendBox.x + sendBox.width).toBeLessThanOrEqual(draftBox.x + draftBox.width);
    expect(sendBox.y + sendBox.height).toBeLessThanOrEqual(draftBox.y + draftBox.height);
    await page.setViewportSize({ width: 1352, height: 781 });
    await expect(input).toHaveValue(draft);
    await expect(composer.getByText(/to focus$/)).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});

test("macOS composer placeholder follows the default dark override through theme changes", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "composer-placeholder-",
    title: "Placeholder theme verification",
  });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await installUsageReportsFixture(page, { lists: [[]] });
    await page.setViewportSize({ width: 1352, height: 781 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    const input = composerLocator(page);
    const placeholderColor = () =>
      input.evaluate((node) => getComputedStyle(node, "::placeholder").color);
    await expect(input).toHaveValue("");
    await expect(input).toHaveAttribute("placeholder", "Ask anything");
    await expect.poll(placeholderColor).toBe("rgb(132, 132, 129)");
    await page.getByTestId("workspace-explorer-toggle").click();
    await page
      .getByTestId("workspace-explorer-sidebar")
      .getByTestId("workspace-new-tab-files")
      .click();
    await expect(
      page.getByTestId("file-explorer-tree-scroll").filter({ visible: true }),
    ).toBeVisible();
    await page.mouse.move(500, 300);
    await page.screenshot({ path: testInfo.outputPath("composer-placeholder-dark-wide.png") });
    await page.setViewportSize({ width: 900, height: 781 });
    await expect(input).toBeInViewport();
    await expect.poll(placeholderColor).toBe("rgb(132, 132, 129)");
    await page.screenshot({ path: testInfo.outputPath("composer-placeholder-dark-narrow.png") });
    await page.setViewportSize({ width: 1352, height: 781 });

    await openSettings(page);
    await openSettingsSection(page, "appearance");
    const font = page.getByRole("textbox", { name: "Content font family", exact: true });
    await font.fill("Georgia");
    await font.press("Tab");
    await clickSettingsBackToWorkspace(page);
    await expect(input).toHaveCSS("font-family", "Georgia");
    // Non-default colors are the existing surface4 tokens in styles/theme.ts.
    for (const [theme, color] of [
      ["Light", "rgb(212, 212, 216)"],
      ["Pure black", "rgb(45, 45, 45)"],
      ["Dark", "rgb(132, 132, 129)"],
      ["Pure black", "rgb(45, 45, 45)"],
      ["Dark", "rgb(132, 132, 129)"],
    ]) {
      await openSettings(page);
      await openSettingsSection(page, "appearance");
      await page.getByLabel(/^Theme:/).click();
      await page.getByRole("menuitem", { name: theme, exact: true }).click();
      await clickSettingsBackToWorkspace(page);
      await expect.poll(placeholderColor).toBe(color);
      await expect(input).toHaveValue("");
      await expect(input).toHaveCSS("font-family", "Georgia");
    }
    await openSettings(page);
    await openSettingsSection(page, "general");
    await page.getByRole("button", { name: "System", exact: true }).click();
    await page
      .getByRole("menuitem", { name: "简体中文 - Simplified Chinese", exact: true })
      .click();
    await clickSettingsBackToWorkspace(page);
    const chineseInput = page
      .getByTestId("message-input-root")
      .filter({ visible: true })
      .getByRole("textbox");
    await expect(chineseInput).toHaveAttribute("placeholder", "随心输入");
    await expect(chineseInput).toHaveValue("");
    await expect(chineseInput).toHaveCSS("font-family", "Georgia");
    await expect
      .poll(() => chineseInput.evaluate((node) => getComputedStyle(node, "::placeholder").color))
      .toBe("rgb(132, 132, 129)");
  } finally {
    await fixture.cleanup();
  }
});
