import { test, expect } from "../../app/e2e/support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { submitMessage } from "../../app/e2e/support/helpers/composer";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDesktopRuntime } from "./support/runtime";

for (const platform of ["darwin", "win32"] as const) {
  test(`${platform} styled text preserves Markdown and code actions`, async ({
    page,
    context,
  }, testInfo) => {
    const longCode = 'const message = "' + "long code content ".repeat(14) + '";';
    const markdown =
      "例如，带格式的回复会显示成这样：\n\n> 这是一段引用文字。\n\n这部分是**加粗**，这部分是*斜体*，这部分是~~删除线~~，这里是`行内代码`。\n\n- 项目一\n- 项目二\n\n代码块也可以这样显示：\n\n```\n这是一段代码或纯文本\n```\n\n```ts\n" +
      longCode +
      "\n```\n\n> First nested paragraph.\n>\n> Second nested paragraph.\n\n路径 `src/app/index.ts` 在这里。\n";
    const fixture = await seedMockAgentWorkspace({
      repoPrefix: "rich-text-",
      title: "Styled text",
      featureValues: { mockAssistantResponse: markdown },
    });
    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await installDesktopRuntime(page, {
        platform,
        serverId: getServerId(),
        manageBuiltInDaemon: false,
        daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
      });
      await page.setViewportSize({ width: 1352, height: 782 });
      await page.emulateMedia({ colorScheme: "dark" });
      await openAgentRoute(page, fixture);
      await submitMessage(page, "Show styled text.");
      const assistant = page.getByTestId("assistant-message");
      const quote = assistant
        .locator('[data-paseo-markdown-tag="blockquote"]')
        .filter({ hasText: "这是一段引用文字。" });
      await expect(quote).toContainText("这是一段引用文字。");
      await expect(assistant.getByText("斜体", { exact: true })).toHaveCSS("font-style", "italic");
      await expect(assistant.getByText("删除线", { exact: true })).toHaveCSS(
        "text-decoration-line",
        "line-through",
      );
      const plain = assistant
        .locator('[data-paseo-markdown-tag="pre"]')
        .filter({ hasText: "这是一段代码或纯文本" });
      const typed = assistant
        .locator('[data-paseo-markdown-tag="pre"]')
        .filter({ hasText: "const message" });
      if (platform === "darwin") {
        await expect(page.getByTestId("desktop-turn-activity")).toHaveCount(0);
        const composer = page.getByTestId("message-input-root").filter({ visible: true });
        const expectAligned = async () => {
          await expect
            .poll(async () => {
              const body = await plain.boundingBox();
              const input = await composer.boundingBox();
              if (!body || !input) return Infinity;
              return Math.max(
                Math.abs(body.x - input.x),
                Math.abs(body.x + body.width - input.x - input.width),
              );
            })
            .toBeLessThan(1);
        };
        await expectAligned();
        const intro = assistant
          .locator('[data-paseo-markdown-tag="p"]')
          .filter({ hasText: /^例如/ });
        const paragraph = assistant
          .locator('[data-paseo-markdown-tag="p"]')
          .filter({ hasText: /^这部分是/ });
        const list = assistant
          .locator('[data-paseo-markdown-tag="ul"]')
          .filter({ hasText: "项目一" });
        const codeIntro = assistant
          .locator('[data-paseo-markdown-tag="p"]')
          .filter({ hasText: "代码块也可以这样显示：" });
        for (const [before, after, gap] of [
          [paragraph, list, 4],
          [list, codeIntro, 6],
          [codeIntro, plain, 16],
        ] as const) {
          await expect
            .poll(async () => {
              const first = await before.boundingBox();
              const second = await after.boundingBox();
              return first && second ? second.y - first.y - first.height : null;
            })
            .toBe(gap);
        }
        const inlineCode = paragraph.locator('[data-paseo-markdown-tag="code"]');
        await expect(inlineCode).toHaveCSS("padding-top", "1px");
        await expect(inlineCode).toHaveCSS("padding-left", "6px");
        // Bullets use the ordered-list indent so item text starts 26px into the column.
        await expect
          .poll(async () => {
            const item = await assistant.getByText("项目一", { exact: true }).boundingBox();
            const column = await list.boundingBox();
            return item && column ? item.x - column.x : null;
          })
          .toBe(26);
        await expect.poll(async () => (await inlineCode.boundingBox())?.height).toBe(16);
        await expect
          .poll(async () => (await paragraph.boundingBox())?.height)
          .toBe((await intro.boundingBox())?.height);
        // File and URL chips render through a tooltip wrapper instead of inline text.
        const pathParagraph = assistant
          .locator('[data-paseo-markdown-tag="p"]')
          .filter({ hasText: /^路径/ });
        const pathCode = pathParagraph.locator('[data-paseo-markdown-tag="code"]');
        await expect.poll(async () => (await pathCode.boundingBox())?.height).toBe(16);
        await expect
          .poll(async () => (await pathParagraph.boundingBox())?.height)
          .toBe((await intro.boundingBox())?.height);
        await expect
          .poll(async () => {
            const before = await intro.boundingBox();
            const after = await quote.boundingBox();
            if (!before || !after) return null;
            return after.y - before.y - before.height;
          })
          .toBe(12);
        await expect
          .poll(async () => {
            const before = await quote.boundingBox();
            const after = await paragraph.boundingBox();
            if (!before || !after) return null;
            return after.y - before.y - before.height;
          })
          .toBe(12);
        await expect(quote).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(quote).toHaveCSS("border-left-width", "3px");
        await expect(quote).toHaveCSS("border-left-color", "rgb(93, 93, 90)");
        await expect(quote.locator('[data-paseo-markdown-tag="p"]')).toHaveCSS(
          "margin-bottom",
          "0px",
        );
        await expect(plain).toHaveCSS("border-radius", "20px");
        await expect(plain).toHaveCSS("height", "82px");
        await expect
          .poll(async () => {
            const first = await assistant.getByText("项目一", { exact: true }).boundingBox();
            const second = await assistant.getByText("项目二", { exact: true }).boundingBox();
            return first && second ? second.y - first.y : null;
          })
          .toBe(21);
        await expect(plain).toHaveCSS("background-color", "rgb(29, 29, 29)");
        await expect(plain.getByText("Plain text", { exact: true })).toBeVisible();
        await expect(typed.getByText("ts", { exact: true })).toBeVisible();
        const scroll = typed.getByTestId("markdown-code-scroll");
        const code = typed.locator('[data-paseo-markdown-tag="code"]').first();
        await expect(code).toHaveCSS("white-space", "pre-wrap");
        const wrappedHeight = (await code.boundingBox())!.height;
        await typed.getByRole("button", { name: "Scroll long lines", exact: true }).click();
        await expect(code).toHaveCSS("white-space", "pre");
        expect((await code.boundingBox())!.height).toBeLessThan(wrappedHeight);
        expect(await scroll.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        await typed.getByRole("button", { name: "Wrap long lines", exact: true }).click();
        await expect(code).toHaveCSS("white-space", "pre-wrap");
        const timeline = page.getByTestId("agent-chat-scroll").filter({ visible: true }).first();
        await timeline.hover();
        await page.mouse.wheel(0, -10000);
        await expect.poll(() => timeline.evaluate((node) => node.scrollTop)).toBe(0);
        await page.screenshot({ path: testInfo.outputPath("styled-text.png") });
        await page.setViewportSize({ width: 700, height: 782 });
        await expectAligned();
        await page.screenshot({ path: testInfo.outputPath("styled-text-narrow.png") });
        await page.setViewportSize({ width: 1352, height: 782 });
        await page.mouse.wheel(0, 10000);
        const nested = assistant
          .locator('[data-paseo-markdown-tag="blockquote"]')
          .filter({ hasText: "First nested paragraph." });
        const paragraphs = nested.locator('[data-paseo-markdown-tag="p"]');
        await expect(paragraphs).toHaveCount(2);
        await expect(paragraphs.first()).toHaveCSS("margin-bottom", "12px");
        await expect(paragraphs.last()).toHaveCSS("margin-bottom", "0px");
      } else {
        await expect(plain.getByText("Plain text", { exact: true })).toHaveCount(0);
        await expect(quote).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await typed.hover();
      }
      await typed.getByRole("button", { name: "Copy code", exact: true }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(longCode);
      await page.getByRole("button", { name: "Copy turn", exact: true }).last().click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toContain("**加粗**");
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).toContain(longCode);
      expect(copied).not.toContain("Plain text");
      expect(copied).not.toContain("Wrap long lines");
      const timing = page.getByTestId("assistant-turn-timing").last();
      await expect(timing).toHaveText(platform === "darwin" ? /^\d{1,2}:\d{2}/ : /^Worked for/);
      const timingButton = page.getByRole("button", { name: /^Worked for.+ended/ }).last();
      const beforeHover = await timingButton.boundingBox();
      await timingButton.hover();
      await expect(timing).toHaveText(platform === "darwin" ? /^Worked for/ : /^\d{1,2}:\d{2}/);
      expect(await timingButton.boundingBox()).toEqual(beforeHover);
      await page.mouse.move(0, 0);
      await expect(timing).toHaveText(platform === "darwin" ? /^\d{1,2}:\d{2}/ : /^Worked for/);
    } finally {
      await fixture.cleanup();
    }
  });
}
