import { test, expect } from "../../app/e2e/support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { daemonWsRoutePattern, getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDesktopRuntime } from "./support/runtime";
import { installUsageReportsFixture } from "../../app/e2e/support/helpers/usage-reports";

test("desktop tool rows expand independently of file navigation", async ({ page }, testInfo) => {
  const readPath = "packages/app/src/components/conversation-list.tsx";
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "desktop-tool-output-",
    title: "Tool output check",
    model: "ten-second-stream",
    initialPrompt: "Show the synthetic tool activity.",
    repo: { files: [{ path: readPath, content: "export const toolPreview = true;\n" }] },
  });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await installUsageReportsFixture(page, { lists: [[]] });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    await expect(page.getByTestId("assistant-message").last()).toContainText(
      "(end of synthetic stream)",
      { timeout: 30_000 },
    );
    await page.getByTestId("desktop-turn-activity").first().click();
    const read = page.getByTestId("tool-call-badge").filter({ hasText: readPath }).first();
    await read.scrollIntoViewIfNeeded();
    await read.hover();
    await expect(read.getByTestId("tool-call-open-file")).toBeVisible();
    await expect(read.locator("button button")).toHaveCount(0);
    const toggle = read.getByRole("button").first();
    await toggle.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(read).toContainText("const ref = useRef");
    await toggle.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(read).not.toContainText("const ref = useRef");
    await page.mouse.move(10, 10);
    await toggle.focus();
    await page.keyboard.press("Tab");
    const openFile = read.getByTestId("tool-call-open-file");
    await expect(openFile).toBeFocused();
    await expect(openFile).toHaveCSS("opacity", "1");
    await openFile.press("Enter");
    await expect(
      page
        .getByTestId("workspace-explorer-sidebar")
        .locator(".cm-content")
        .filter({ visible: true }),
    ).toContainText("export const toolPreview = true;");
    await page.getByTestId("workspace-explorer-toggle").click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const shell = page
      .getByTestId("tool-call-badge")
      .filter({ hasText: "node scripts/simulate-stream-burst.mjs" })
      .first();
    await shell.scrollIntoViewIfNeeded();
    await shell.getByRole("button").first().click();
    await expect(shell.getByTestId("tool-call-detail-title")).toHaveText("Shell");
    await expect(shell).toContainText("$ node scripts/simulate-stream-burst.mjs");
    await expect(shell).toContainText("[burst] drag-end isDragging=false");
    await page.mouse.move(10, 10);
    await page.screenshot({ path: testInfo.outputPath("desktop-shell-output.png") });
  } catch (error) {
    await page.screenshot({ path: testInfo.outputPath("tool-interaction-failure.png") });
    throw error;
  } finally {
    await fixture.cleanup();
  }
});

test("macOS inline Shell fades overflow without hiding the final output line", async ({
  page,
}, testInfo) => {
  let output =
    Array.from(
      { length: 40 },
      (_, index) => `output-${index + 1}: ${"complete shell output ".repeat(8)}`,
    ).join("\n") + "\nFINAL_STDOUT_LINE";
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "shell-overflow-",
    title: "Shell output boundary",
    model: "ten-second-stream",
    initialPrompt: "Show synthetic tool output.",
  });
  let shortFixture: Awaited<ReturnType<typeof seedMockAgentWorkspace>> | null = null;
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    // Only synthetic mock Shell details are lengthened; the real protocol and other events pass through.
    await page.routeWebSocket(daemonWsRoutePattern(), (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((message) => {
        let envelope;
        try {
          envelope = JSON.parse(message.toString());
        } catch {
          server.send(message);
          return;
        }
        const request = envelope.type === "session" ? envelope.message : envelope;
        if (request?.type === "usage.list_reports.request") {
          ws.send(
            JSON.stringify({
              type: "session",
              message: {
                type: "usage.list_reports.response",
                payload: { requestId: request.requestId, reports: [] },
              },
            }),
          );
        } else server.send(message);
      });
      server.onMessage((message) => {
        let envelope;
        try {
          envelope = JSON.parse(message.toString());
        } catch {
          ws.send(message);
          return;
        }
        const rewrite = (value: unknown): void => {
          if (!value || typeof value !== "object") return;
          const object = value as Record<string, unknown>;
          if (
            object.type === "shell" &&
            object.command === "node scripts/simulate-stream-burst.mjs"
          )
            object.output = output;
          for (const child of Object.values(object)) rewrite(child);
        };
        rewrite(envelope);
        ws.send(JSON.stringify(envelope));
      });
    });
    await page.setViewportSize({ width: 1352, height: 781 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
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
    const toggle = shell.getByRole("button").first();
    await toggle.click();
    const card = shell.getByTestId("tool-call-detail-surface");
    await expect(card).toHaveCSS("mask-image", /linear-gradient.*25px/);
    const scroll = shell.getByTestId("shell-output-scroll");
    await expect(shell).toContainText(output);
    await page.mouse.move(10, 10);
    await page.screenshot({ path: testInfo.outputPath("shell-overflow-top.png") });
    await scroll.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
      node.dispatchEvent(new Event("scroll"));
    });
    await expect(card).toHaveCSS("mask-image", "none");
    const tail = await scroll.evaluate((node) => ({
      remaining: node.scrollHeight - node.scrollTop - node.clientHeight,
      text: node.textContent,
    }));
    expect(tail.remaining).toBeLessThanOrEqual(1);
    expect(tail.text).toContain("FINAL_STDOUT_LINE");
    const selected = await scroll.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      const text = selection?.toString() ?? "";
      selection?.removeAllRanges();
      return text;
    });
    expect(selected).toContain(output);
    const horizontal = shell.getByTestId("shell-output-horizontal-scroll");
    await horizontal.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
    });
    expect(await horizontal.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    await horizontal.evaluate((node) => {
      node.scrollLeft = 0;
    });
    await page.screenshot({ path: testInfo.outputPath("shell-overflow-bottom.png") });
    await scroll.evaluate((node) => {
      node.scrollTop = 0;
      node.dispatchEvent(new Event("scroll"));
    });
    await expect(card).toHaveCSS("mask-image", /linear-gradient.*25px/);
    await toggle.click();
    await expect(card).toHaveCount(0);
    await toggle.click();
    await expect(card).toHaveCSS("mask-image", /linear-gradient.*25px/);
    output = "SHORT_STDOUT_LINE";
    shortFixture = await seedMockAgentWorkspace({
      repoPrefix: "shell-short-",
      title: "Short Shell output",
      model: "ten-second-stream",
      initialPrompt: "Show synthetic short output.",
    });
    await openAgentRoute(page, shortFixture);
    await expect(page.getByTestId("assistant-message").last()).toContainText(
      "(end of synthetic stream)",
    );
    await page.getByTestId("desktop-turn-activity").first().click();
    await shell.scrollIntoViewIfNeeded();
    await toggle.click();
    await expect(shell).toContainText("SHORT_STDOUT_LINE");
    await expect(card).toHaveCSS("mask-image", "none");
    expect(
      await scroll.evaluate((node) => node.scrollHeight - node.clientHeight),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("shell-short-output.png") });
  } finally {
    await shortFixture?.cleanup();
    await fixture.cleanup();
  }
});
