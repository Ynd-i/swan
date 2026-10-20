import { readFile } from "node:fs/promises";
import { test, expect } from "../../app/e2e/support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDesktopRuntime } from "./support/runtime";

test("macOS file toolbar keeps the path and editor actions above both file columns", async ({
  page,
  context,
}, testInfo) => {
  const filename = "single-chat-layout.spec.ts";
  const relativePath = `packages/desktop/e2e/${filename}`;
  const source = [
    'import { test, expect } from "../../app/e2e/support/fixtures";',
    'import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";',
    'import { composerLocator, submitMessage } from "../../app/e2e/support/helpers/composer";',
    'import { installDesktopRuntime } from "./support/runtime";',
    "",
    "export const answer = 42;",
    "",
    'test("macOS keeps one main conversation while tools open in the right sidebar", async ({ page }) => {',
    '  const fixture = await seedMockAgentWorkspace({ repoPrefix: "single-chat-", title: "Main conversation" });',
    "  await openAgentRoute(page, fixture);",
    "});",
    "",
  ].join("\n");
  const readonlySource = source.repeat(Math.ceil((1024 * 1024 + 1) / source.length));
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "file-toolbar-",
    title: "File toolbar reference",
    repo: {
      files: [
        { path: relativePath, content: source },
        { path: "packages/desktop/e2e/large-source.ts", content: readonlySource },
      ],
    },
  });
  const recordPath = testInfo.outputPath("file-editor.jsonl");
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
      editorRecordPath: recordPath,
      editorTargets: [
        {
          id: "vscode",
          label: "Visual Studio Code",
          kind: "editor",
          icon: { kind: "symbol", name: "folder" },
        },
        {
          id: "cursor",
          label: "Cursor",
          kind: "editor",
          icon: { kind: "symbol", name: "terminal" },
        },
      ],
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
    for (const directory of ["packages", "desktop", "e2e"]) {
      await dock.getByText(directory, { exact: true }).click();
    }
    await dock.getByText(filename, { exact: true }).click();
    const toolbar = dock.getByTestId("file-tool-toolbar").filter({ visible: true });
    await expect(toolbar).toBeVisible({ timeout: 2_000 });
    // An opened file starts without the folder tree; this reference covers the file beside it.
    await toolbar.getByTestId("file-toggle-tree").click();
    const path = toolbar.getByTestId("file-path-menu-trigger");
    await expect(path).toContainText("e2e");
    await expect(path).toContainText(filename);
    await expect
      .poll(() =>
        path
          .getByText(filename, { exact: true })
          .evaluate((node) => node.scrollWidth <= node.clientWidth),
      )
      .toBe(true);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await path.click();
    await page.getByTestId("file-path-copy-relative").click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(relativePath);

    await toolbar.getByTestId("file-open-in-editor-caret").click();
    await page.getByTestId("workspace-open-in-editor-item-cursor").click();
    await toolbar.getByTestId("file-open-in-editor-primary").click();
    await expect
      .poll(async () => {
        const records = await readFile(recordPath, "utf8").catch(() => "");
        return records.trim() ? JSON.parse(records.trim().split("\n").at(-1)!) : null;
      })
      .toMatchObject({
        editorId: "cursor",
        workspacePath: fixture.cwd,
        filePath: `${fixture.cwd}/${relativePath}`,
      });

    const editor = dock.locator('.cm-content[contenteditable="true"]').filter({ visible: true });
    await expect(editor).toBeVisible();
    await expect(editor).toHaveCSS("font-weight", "600");
    await expect(editor).toHaveCSS("padding-top", "0px");
    const editedSource = source.replace("answer = 42", "answer = 43");
    await editor.fill(editedSource);
    const scroller = dock.locator(".cm-scroller").filter({ visible: true });
    await expect(scroller).toHaveCSS("line-height", "21.6px");
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollWidth <= element.clientWidth))
      .toBe(true);
    await expect
      .poll(() =>
        editor
          .locator(".cm-line")
          .first()
          .evaluate(
            (element) =>
              element.getBoundingClientRect().height >
              parseFloat(getComputedStyle(element).lineHeight) * 1.5,
          ),
      )
      .toBe(true);
    await editor.press("Control+s");
    await expect.poll(() => readFile(`${fixture.cwd}/${relativePath}`, "utf8")).toBe(editedSource);
    const node = await editor.elementHandle();
    await toolbar.getByTestId("file-toggle-tree").click();
    await toolbar.getByTestId("file-toggle-tree").click();
    expect(await node!.evaluate((element) => element.isConnected)).toBe(true);
    await expect(editor).toContainText("answer = 43");
    const bar = (await toolbar.boundingBox())!;
    const rail = (await dock
      .getByTestId("file-tree-rail")
      .filter({ visible: true })
      .boundingBox())!;
    expect(bar.height).toBe(48);
    expect(bar.width).toBe(rail.width);
    expect(bar.y + bar.height).toBe(rail.y);
    await page.screenshot({ path: testInfo.outputPath("file-toolbar-and-tree.png") });
    for (const width of [900, 700]) {
      await page.setViewportSize({ width, height: 680 });
      await expect(toolbar.getByTestId("file-open-in-editor-primary")).toBeInViewport({ ratio: 1 });
      await expect(path).toBeInViewport({ ratio: 1 });
      const toolbarBox = (await toolbar.boundingBox())!;
      const dockBox = (await dock.boundingBox())!;
      expect(toolbarBox.x + toolbarBox.width).toBeLessThanOrEqual(dockBox.x + dockBox.width + 1);
      await expect
        .poll(() => scroller.evaluate((element) => element.scrollWidth <= element.clientWidth))
        .toBe(true);
    }
    await page.setViewportSize({ width: 1352, height: 782 });
    await dock
      .getByTestId("file-tree-rail-tree")
      .filter({ visible: true })
      .getByText("large-source.ts", { exact: true })
      .click();
    const readonlyEditor = dock
      .locator('.cm-content[contenteditable="false"]')
      .filter({ visible: true });
    await expect(readonlyEditor).toBeVisible();
    await expect(dock.locator(".cm-gutters").filter({ visible: true })).toBeVisible({
      timeout: 2_000,
    });
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollWidth <= element.clientWidth))
      .toBe(true);
    await expect
      .poll(() =>
        readonlyEditor
          .locator(".cm-line")
          .first()
          .evaluate(
            (element) =>
              element.getBoundingClientRect().height >
              parseFloat(getComputedStyle(element).lineHeight) * 1.5,
          ),
      )
      .toBe(true);
    expect(await readFile(`${fixture.cwd}/packages/desktop/e2e/large-source.ts`, "utf8")).toBe(
      readonlySource,
    );
  } finally {
    await fixture.cleanup();
  }
});
