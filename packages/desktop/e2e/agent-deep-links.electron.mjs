import path from "node:path";
import { expect } from "playwright/test";

const longCode = 'const message = "' + "long code content ".repeat(14) + '";';
export const styledResponse =
  "例如，带格式的回复会显示成这样：\n\n> 这是一段引用文字。\n\n这部分是**加粗**，这部分是*斜体*，这部分是~~删除线~~，这里是`行内代码`。\n\n- 项目一\n- 项目二\n\n代码块也可以这样显示：\n\n```\n这是一段代码或纯文本\n```\n\n```ts\n" +
  longCode +
  "\n```\n\n路径 `src/app/index.ts` 在这里。\n";

/** Runs against the harness's packaged Custom process; no OS protocol registration is involved. */
export async function runAgentDeepLinksRegression({
  page,
  serverId,
  workspaceId,
  agentA,
  agentB,
  styledAgent,
  userData,
  artifactDir,
  evaluateMain,
  launchSecondInstance,
}) {
  const appState = () =>
    evaluateMain(`(() => {
    const { app, BrowserWindow } = process.mainModule.require('electron');
    return { name: app.getName(), packaged: app.isPackaged, userData: app.getPath('userData'), windows: BrowserWindow.getAllWindows().map(win => win.webContents.id) };
  })()`);
  const initial = await appState();
  expect(initial.name).toBe("Swan");
  expect(initial.packaged).toBe(true);
  expect(initial.userData).toBe(userData);
  expect(initial.windows).toHaveLength(1);

  const title = page.getByTestId("desktop-chat-title");
  const composer = page
    .getByRole("textbox", { name: "Message agent...", exact: true })
    .filter({ visible: true });
  const expectChat = async (letter) => {
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(`/h/${serverId}/workspace/${workspaceId}`);
    await expect(title).toHaveText(`Deep link chat ${letter}`, { timeout: 60_000 });
    await expect(composer).toBeEditable();
    await expect(page.getByTestId("workspace-tabs-row").filter({ visible: true })).toHaveCount(0);
    await expect(
      page.getByTestId("workspace-new-tab-button").filter({ visible: true }),
    ).toHaveCount(0);
  };
  await expectChat("A");
  await page.screenshot({ path: path.join(artifactDir, "agent-link-cold-argv.png") });
  const draft = "Keep chat A's unsent draft while opening chat B.";
  await composer.fill(draft);
  await page.getByTestId("desktop-chat-toolbar-menu").click();
  const copyMenu = page.getByRole("menuitem", { name: "Copy", exact: true });
  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toBeFocused();
  await copyMenu.focus();
  await page.keyboard.press("ArrowRight");
  const copyId = page.getByRole("menuitem", { name: "Copy agent id", exact: true });
  await expect(copyId).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(copyId).toBeHidden();
  await expect(copyMenu).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(copyId).toBeFocused();
  await expect(
    page.getByRole("menuitem", { name: "Copy resume command", exact: true }),
  ).toBeDisabled();
  // Inspect availability only; this packaged check never writes the user's clipboard.
  await page.keyboard.press("Escape");
  await expect(copyId).toBeHidden();
  if (await copyMenu.isVisible()) await page.keyboard.press("Escape");
  await expect(copyMenu).toBeHidden();
  await page.keyboard.press("Meta+k");
  const search = page.getByTestId("command-center-panel");
  await expect(search.getByTestId("command-center-input")).toHaveAttribute(
    "placeholder",
    "Search chats",
  );
  await expect(search.getByText("Deep link chat A", { exact: true })).toBeVisible();
  await expect(search.getByText("Deep link chat B", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(artifactDir, "packaged-chat-search.png") });
  await page.keyboard.press("Escape");
  await expect(search).toHaveCount(0);
  await expect(composer).toHaveValue(draft);

  await page.getByTestId("workspace-explorer-toggle").click();
  await page
    .getByTestId("workspace-explorer-sidebar")
    .getByTestId("workspace-new-tab-files")
    .click();
  // A tab launched from the launcher keeps the launcher's id, so find Files by its label.
  const filesTab = page.getByRole("button", { name: "Browse workspace files", exact: true });
  await expect(filesTab).toHaveCSS("height", "32px");
  const files = page.getByTestId("workspace-explorer-sidebar");
  await expect(files.getByTestId("file-tool-toolbar").filter({ visible: true })).toBeVisible();
  await expect(files.getByTestId("files-empty-editor").filter({ visible: true })).toBeVisible();
  await expect(files.getByTestId("files-filter").filter({ visible: true })).toBeEditable();
  await expectChat("A");
  await expect(composer).toHaveValue(draft);
  await page.screenshot({ path: path.join(artifactDir, "packaged-single-chat-files.png") });
  await page.getByTestId("explorer-sidebar-new-tab-button").click();
  await page.getByTestId("workspace-new-tab-menu-browser").click();
  const address = page.getByRole("textbox", { name: "Browser URL", exact: true });
  await expect(address).toHaveValue("");
  await expect
    .poll(() => address.evaluate((input) => getComputedStyle(input, "::placeholder").textAlign))
    .toBe("center");
  await expect(address).toHaveCSS("text-align", /^(left|start)$/);
  await page.screenshot({ path: path.join(artifactDir, "packaged-browser-placeholder.png") });
  await address.fill("https://example.test/unsubmitted");
  await expect(address).toHaveCSS("text-align", /^(left|start)$/);
  await expect(composer).toHaveValue(draft);
  const browserTab = page.locator('[data-testid^="explorer-sidebar-tab-"][aria-selected="true"]');
  await expect(browserTab).toContainText("New tab");
  const closeBrowserId = (await browserTab.getAttribute("data-testid"))?.replace(
    "explorer-sidebar-tab-",
    "explorer-sidebar-tab-close-",
  );
  if (!closeBrowserId) throw new Error("New browser tab has no UI identity");
  await page.getByTestId(closeBrowserId).click();
  await expect(address).toHaveCount(0);
  await filesTab.click();
  await expect(files.getByTestId("files-empty-editor").filter({ visible: true })).toBeVisible();
  await page.evaluate(async () => {
    window.__agentLinkEvents = [];
    window.__stopAgentLinkEvents = await window.paseoDesktop.events.on("open-agent", (target) => {
      window.__agentLinkEvents.push({ serverId: target.serverId, agentId: target.agentId });
    });
  });

  const link = (agentId) =>
    `paseo-custom://h/${encodeURIComponent(serverId)}/agent/${encodeURIComponent(agentId)}`;
  const targetA = { serverId, agentId: agentA };
  const targetB = { serverId, agentId: agentB };
  const events = () => page.evaluate(() => window.__agentLinkEvents);
  const second = launchSecondInstance(link(agentB));
  await expect.poll(() => second.exitCode, { timeout: 30_000 }).toBe(0);
  await expect.poll(events).toEqual([targetB]);
  await expectChat("B");
  await expect(composer).toHaveValue("");
  expect((await appState()).windows).toEqual(initial.windows);
  await page.screenshot({ path: path.join(artifactDir, "agent-link-second-instance.png") });

  const openUrl = (url) =>
    `process.mainModule.require('electron').app.emit('open-url', { preventDefault() {} }, ${JSON.stringify(url)});`;
  await evaluateMain(openUrl(link(agentA)));
  await expect.poll(events).toEqual([targetB, targetA]);
  await expectChat("A");
  await expect(composer).toHaveValue(draft);
  await expect(files.getByTestId("files-empty-editor").filter({ visible: true })).toBeVisible();

  // A valid same-chat event is a delivery barrier: an invalid B event must never reach preload.
  await evaluateMain(openUrl(`${link(agentB)}?message=not-allowed`) + openUrl(link(agentA)));
  await expect.poll(events).toEqual([targetB, targetA, targetA]);
  await expectChat("A");
  await expect(composer).toHaveValue(draft);
  expect((await appState()).windows).toEqual(initial.windows);
  await page.screenshot({ path: path.join(artifactDir, "agent-link-preserved-draft.png") });
  await page.evaluate(() => window.__stopAgentLinkEvents());

  await page.keyboard.press("Meta+,");
  await page
    .getByTestId("settings-sidebar")
    .getByRole("button", { name: "Appearance", exact: true })
    .click();
  const modes = page.getByTestId("appearance-theme-modes");
  await expect(modes).toBeVisible();
  await modes.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(modes.getByRole("button", { name: "Dark", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Theme: Dark", { exact: true })).toBeVisible();
  const advanced = page.getByTestId("appearance-advanced-toggle");
  await expect(advanced).toHaveAttribute("aria-expanded", "true");
  await advanced.focus();
  await advanced.press("Enter");
  await expect(page.getByTestId("appearance-advanced-content")).toBeHidden();
  await expect(
    page.getByRole("textbox", { name: "Interface font family", exact: true }),
  ).toBeVisible();
  await advanced.press("Space");
  await expect(advanced).toHaveAttribute("aria-expanded", "true");
  const motion = page.getByTestId("appearance-reduced-motion");
  await motion.getByRole("button", { name: "On", exact: true }).click();
  await expect(motion.getByRole("button", { name: "On", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const codeSize = page.getByRole("textbox", { name: "Code font size", exact: true });
  await expect(codeSize).toHaveCSS("height", "28px");
  await codeSize.fill("21");
  await page.getByTestId("appearance-advanced-reset").click();
  await expect(codeSize).toHaveValue("12");
  await expect(motion.getByRole("button", { name: "System", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByLabel("Theme: Dark", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(artifactDir, "packaged-appearance-modes.png") });
  // Exercise overflow through a real saved appearance preference, without rewriting the timeline.
  const previousCodeSize = await codeSize.elementHandle();
  if (!previousCodeSize) throw new Error("Missing code-size input before saving");
  await codeSize.fill("22");
  await codeSize.press("Tab");
  await expect.poll(() => previousCodeSize.evaluate((node) => node.isConnected)).toBe(false);
  await previousCodeSize.dispose();
  await page.getByLabel(/^Interface font weight:/).click();
  await page.getByRole("menuitem", { name: "SemiBold", exact: true }).click();
  // Production strips the readable RN-web class names. Check the actual default Text rule.
  await expect(page.getByText("Interface font style", { exact: true })).toHaveCSS(
    "font-weight",
    "600",
  );
  await page.getByLabel(/^Code font weight:/).click();
  await page.getByRole("menuitem", { name: "Medium", exact: true }).click();
  await expect(page.getByLabel("Code font weight: Medium", { exact: true })).toBeVisible();
  await page.getByTestId("desktop-shell-back").click();
  await expectChat("A");
  await page.reload();
  await expectChat("A");
  await expect(title).toHaveCSS("font-weight", "600");
  await expect(composer).toHaveCSS("font-weight", "400");
  await expect(composer).toHaveValue(draft);
  await page.getByTestId("workspace-explorer-toggle").click();
  await expect(page.getByTestId("assistant-message").last()).toContainText(
    "(end of synthetic stream)",
    { timeout: 30_000 },
  );
  await page.getByTestId("desktop-turn-activity").first().click();
  const shell = page
    .getByTestId("tool-call-badge")
    .filter({ hasText: "node scripts/simulate-stream-burst.mjs" })
    .first();
  await shell.scrollIntoViewIfNeeded();
  await shell.getByRole("button").first().click();
  const prompt = shell
    .getByTestId("shell-output-horizontal-scroll")
    .getByText("$", { exact: true });
  await expect(prompt).toHaveCSS("font-size", "22px");
  await expect(prompt).toHaveCSS("line-height", "33px");
  await expect(prompt).toHaveCSS("font-weight", "500");
  await page.getByTestId("combined-model-selector").filter({ visible: true }).click();
  const effort = page.getByTestId("desktop-thinking-range");
  await expect(effort).toHaveCSS("accent-color", "rgb(217, 119, 87)");
  await expect(effort).toHaveAttribute("aria-valuetext", "Low");
  await page.screenshot({ path: path.join(artifactDir, "packaged-effort-accent.png") });
  await page.keyboard.press("Escape");
  await expect(effort).toHaveCount(0);
  const card = shell.getByTestId("tool-call-detail-surface");
  await expect(card).toHaveCSS("mask-image", /linear-gradient.*25px/);
  await page.screenshot({ path: path.join(artifactDir, "packaged-shell-overflow.png") });
  await shell.getByTestId("shell-output-scroll").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    node.dispatchEvent(new Event("scroll"));
  });
  await expect(card).toHaveCSS("mask-image", "none");
  await expect(shell).toContainText("[burst] drag-end isDragging=false");
  await expect(composer).toHaveValue(draft);
  await page.screenshot({ path: path.join(artifactDir, "packaged-shell-final-line.png") });
  await page.keyboard.press("Meta+,");
  await page.getByTestId("settings-host-section-projects").click();
  await page.getByRole("button", { name: "Edit Desktop browser project 1", exact: true }).click();
  await page.getByTestId("project-edit-button").click();
  const projectModal = page.getByTestId("project-edit-sheet");
  await expect(projectModal.getByRole("dialog")).toHaveCSS("border-radius", "20px");
  await expect(projectModal.getByTestId("project-edit-source-folder")).toContainText("workspace-1");
  await expect(projectModal.getByTestId("project-edit-name")).toBeEditable();
  await expect(projectModal.getByTestId("project-edit-save")).toBeDisabled();
  await page.screenshot({ path: path.join(artifactDir, "packaged-project-edit.png") });
  await projectModal.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(projectModal).toBeHidden();
  await page
    .getByTestId("settings-sidebar")
    .getByRole("button", { name: "Appearance", exact: true })
    .click();
  await page.getByTestId("appearance-advanced-reset").click();
  await expect(page.getByRole("textbox", { name: "Code font size", exact: true })).toHaveValue(
    "12",
  );
  await page.getByTestId("desktop-shell-back").click();
  await expectChat("A");
  await expect(composer).toHaveValue(draft);
  // Check the production renderer with its native preload, preserving chat A's draft.
  await evaluateMain(openUrl(link(styledAgent)));
  await expect(title).toHaveText("Styled response");
  await expect(page.getByTestId("desktop-turn-activity").filter({ visible: true })).toHaveCount(0);
  const timeline = page.getByTestId("agent-chat-scroll").filter({ visible: true }).first();
  await timeline.hover();
  await page.mouse.wheel(0, -10000);
  await expect.poll(() => timeline.evaluate((node) => node.scrollTop)).toBe(0);
  const assistant = page.getByTestId("assistant-message").filter({ visible: true });
  const quote = assistant.locator('[data-paseo-markdown-tag="blockquote"]');
  await expect(quote).toContainText("这是一段引用文字。");
  await expect(quote).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(quote).toHaveCSS("border-left-width", "3px");
  const intro = assistant.locator('[data-paseo-markdown-tag="p"]').filter({ hasText: /^例如/ });
  await expect
    .poll(async () => {
      const before = await intro.boundingBox();
      const after = await quote.boundingBox();
      if (!before || !after) return null;
      return after.y - before.y - before.height;
    })
    .toBe(12);
  const blockGaps = [
    [/^这部分是/, "ul", 4],
    ["ul", /^代码块也可以/, 6],
    [/^代码块也可以/, "pre", 16],
  ].map(([before, after, gap]) => {
    const locate = (target) =>
      typeof target === "string"
        ? assistant.locator(`[data-paseo-markdown-tag="${target}"]`).first()
        : assistant.locator('[data-paseo-markdown-tag="p"]').filter({ hasText: target });
    return [locate(before), locate(after), gap];
  });
  for (const [before, after, gap] of blockGaps) {
    await expect
      .poll(async () => {
        const upper = await before.boundingBox();
        const lower = await after.boundingBox();
        return upper && lower ? lower.y - upper.y - upper.height : null;
      })
      .toBe(gap);
  }
  const chipParagraph = assistant
    .locator('[data-paseo-markdown-tag="p"]')
    .filter({ hasText: /^这部分是/ });
  const inlineCode = chipParagraph.locator('[data-paseo-markdown-tag="code"]');
  await expect(inlineCode).toHaveCSS("padding-top", "1px");
  await expect
    .poll(async () => (await chipParagraph.boundingBox())?.height)
    .toBe((await intro.boundingBox())?.height);
  const pathCode = assistant
    .locator('[data-paseo-markdown-tag="p"]')
    .filter({ hasText: /^路径/ })
    .locator('[data-paseo-markdown-tag="code"]');
  await expect.poll(async () => (await pathCode.boundingBox())?.height).toBe(16);
  await expect(assistant.getByText("斜体", { exact: true })).toHaveCSS("font-style", "italic");
  await expect(assistant.getByText("删除线", { exact: true })).toHaveCSS(
    "text-decoration-line",
    "line-through",
  );
  const plain = assistant
    .locator('[data-paseo-markdown-tag="pre"]')
    .filter({ hasText: "这是一段代码或纯文本" });
  await expect(plain.getByText("Plain text", { exact: true })).toBeVisible();
  await expect(plain).toHaveCSS("border-radius", "20px");
  await expect(plain).toHaveCSS("height", "82px");
  await expect
    .poll(async () => {
      const body = await plain.boundingBox();
      const input = await page
        .getByTestId("message-input-root")
        .filter({ visible: true })
        .boundingBox();
      if (!body || !input) return Infinity;
      return Math.max(
        Math.abs(body.x - input.x),
        Math.abs(body.x + body.width - input.x - input.width),
      );
    })
    .toBeLessThan(1);
  const typed = assistant
    .locator('[data-paseo-markdown-tag="pre"]')
    .filter({ hasText: "const message" });
  const code = typed.locator('[data-paseo-markdown-tag="code"]').first();
  await expect(code).toHaveCSS("white-space", "pre-wrap");
  await typed.getByRole("button", { name: "Scroll long lines", exact: true }).click();
  await expect(code).toHaveCSS("white-space", "pre");
  await expect
    .poll(() =>
      typed
        .getByTestId("markdown-code-scroll")
        .evaluate((node) => node.scrollWidth > node.clientWidth),
    )
    .toBe(true);
  await typed.getByRole("button", { name: "Wrap long lines", exact: true }).click();
  await expect(code).toHaveCSS("white-space", "pre-wrap");
  await expect(typed.getByRole("button", { name: "Copy code", exact: true })).toBeEnabled();
  // Actual clipboard contents are covered by the browser suite; keep the system clipboard intact.
  await page.screenshot({ path: path.join(artifactDir, "packaged-styled-text.png") });
  const timing = page.getByTestId("assistant-turn-timing").filter({ visible: true }).last();
  await expect(timing).toHaveText(/^\d{1,2}:\d{2}/);
  await timing.scrollIntoViewIfNeeded();
  await expect(timing).toBeInViewport();
  await page.screenshot({ path: path.join(artifactDir, "packaged-turn-timing.png") });

  await evaluateMain(openUrl(link(agentB)));
  await expectChat("B");
  await composer.fill("Emit synthetic question: single choice.");
  await composer.press("Enter");
  const question = page.getByTestId("desktop-permission-dock").getByTestId("question-form-card");
  await expect(question).toBeVisible();
  const questionDraft = "Keep my draft while answering.";
  await composer.fill(questionDraft);
  await expect(composer).toBeEditable();
  const send = question.getByTestId("question-form-primary-action");
  await expect(send).toBeDisabled();
  const choice = question.getByRole("radio", { name: "Use the existing component", exact: true });
  await expect(choice).toHaveAttribute("aria-checked", "false");
  await page.screenshot({ path: path.join(artifactDir, "packaged-question-pending.png") });
  await choice.click();
  await send.click();
  await expect(question).toHaveCount(0);
  await expect(composer).toHaveValue(questionDraft);
  await page.reload();
  await expectChat("B");
  await expect(composer).toHaveValue(questionDraft);
  await expect(question).toHaveCount(0);
  await evaluateMain(openUrl(link(agentA)));
  await expectChat("A");
  await expect(composer).toHaveValue(draft);

  // Open in new window starts another window on this chat and leaves this one where it was.
  await page.getByTestId("desktop-chat-toolbar-menu").click();
  await page.getByRole("menuitem", { name: "Open in new window", exact: true }).click();
  await expect.poll(async () => (await appState()).windows.length).toBe(2);
  const otherWindow = (expression) =>
    evaluateMain(`(async () => {
    const { BrowserWindow } = process.mainModule.require('electron');
    const win = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.id !== ${initial.windows[0]});
    return win ? (${expression}) : null;
  })()`);
  await expect
    .poll(
      () =>
        otherWindow(
          `win.webContents.executeJavaScript("document.querySelector('[data-testid=desktop-chat-title]')?.textContent ?? null")`,
        ),
      { timeout: 60_000 },
    )
    .toBe("Deep link chat A");
  expect(await otherWindow("new URL(win.webContents.getURL()).pathname")).toBe(
    `/h/${serverId}/workspace/${workspaceId}`,
  );
  await otherWindow("(win.close(), true)");
  await expect.poll(async () => (await appState()).windows).toEqual(initial.windows);
  await expectChat("A");
  await expect(composer).toHaveValue(draft);
  return {
    serverId,
    workspaceId,
    agentA,
    agentB,
    coldArgv: true,
    secondInstanceExitCode: second.exitCode,
    retainedWebContentsId: initial.windows[0],
    openUrlEvent: true,
    draftPreserved: true,
    packagedChatSearch: true,
    packagedFilesDock: true,
    packagedBrowserPlaceholder: true,
    packagedEffortAccent: true,
    packagedAppearanceModes: true,
    packagedAppearanceAdvancedReset: true,
    packagedCodeFontWeight: true,
    packagedInterfaceFontWeight: true,
    packagedShellOverflow: true,
    packagedMotionControl: true,
    packagedCopyMenu: true,
    packagedSubmenuKeyboard: true,
    packagedProjectEditor: true,
    packagedStyledText: true,
    packagedProseSpacing: true,
    packagedMarkdownBlockSpacing: true,
    packagedInlineCodeLineHeight: true,
    packagedChatColumnAlignment: true,
    packagedPlainReplyTiming: true,
    packagedCodeCardDensity: true,
    packagedQuestionSubmission: true,
    packagedChatNewWindow: true,
    invalidUrlRejected: true,
    osProtocolDispatch: "not tested",
  };
}
