import { readFile } from "node:fs/promises";
import path from "node:path";
import { composerLocator } from "../../app/e2e/support/helpers/composer";
import { installUsageReportsFixture } from "../../app/e2e/support/helpers/usage-reports";
import { test, expect } from "../../app/e2e/support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { daemonWsRoutePattern, getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDesktopRuntime } from "./support/runtime";

test("macOS file tree filters unopened nested files and preserves file actions", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "file-tree-reference-",
    title: "File tree reference",
    repo: {
      files: [
        { path: "example.ts", content: "export const answer = 42;\n" },
        { path: "src/deep/needle.ts", content: "export const needle = true;\n" },
        { path: "src/deep/other.ts", content: "export const other = true;\n" },
      ],
    },
  });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    // Only one failed search response is injected; successful searches and file operations use the real daemon.
    let failNextSearch = false;
    await page.routeWebSocket(daemonWsRoutePattern(), (ws) => {
      const server = ws.connectToServer();
      server.onMessage((message) => ws.send(message));
      ws.onMessage((message) => {
        let envelope;
        try {
          envelope = JSON.parse(message.toString());
        } catch {
          server.send(message);
          return;
        }
        const request = envelope.type === "session" ? envelope.message : envelope;
        // This route also owns the search-error injection, so keep quota isolation on the same socket.
        if (request.type === "usage.list_reports.request") {
          ws.send(
            JSON.stringify({
              type: "session",
              message: {
                type: "usage.list_reports.response",
                payload: { requestId: request.requestId, reports: [] },
              },
            }),
          );
          return;
        }
        if (failNextSearch && request.type === "directory_suggestions_request") {
          failNextSearch = false;
          ws.send(
            JSON.stringify({
              type: "session",
              message: {
                type: "directory_suggestions_response",
                payload: {
                  requestId: request.requestId,
                  entries: [],
                  directories: [],
                  error: "Search temporarily unavailable",
                },
              },
            }),
          );
          return;
        }
        server.send(message);
      });
    });
    await openAgentRoute(page, fixture);
    await page.getByTestId("workspace-explorer-toggle").click();
    await page
      .getByTestId("workspace-explorer-sidebar")
      .getByTestId("workspace-new-tab-files")
      .click();
    const right = page.getByTestId("workspace-explorer-sidebar");
    const filter = right.getByTestId("files-filter").filter({ visible: true });
    await expect(filter).toBeVisible();
    await filter.fill("needle");
    const tree = right.getByTestId("file-explorer-tree-scroll").filter({ visible: true });
    await expect(tree.getByText("needle.ts", { exact: true })).toBeVisible();
    await expect(tree.getByText("src", { exact: true })).toBeVisible();
    await expect(tree.getByText("deep", { exact: true })).toBeVisible();
    await expect(tree.getByText("other.ts", { exact: true })).toHaveCount(0);
    const result = tree.getByTestId("file-explorer-row-2");
    await result.focus();
    await page.keyboard.press("Enter");
    await expect(right.locator(".cm-content").filter({ visible: true })).toContainText(
      "export const needle = true;",
    );
    // An opened file starts without the folder tree.
    await right
      .getByTestId("file-tool-toolbar")
      .filter({ visible: true })
      .getByTestId("file-toggle-tree")
      .click();
    const fileTree = right.getByTestId("file-tree-rail-tree").filter({ visible: true });
    await fileTree.getByTestId("files-filter").fill("zzzz-no-match");
    await expect(fileTree.getByTestId("files-filter-empty")).toBeVisible();
    await fileTree.getByTestId("files-filter-clear").click();
    await expect(fileTree.getByTestId("files-filter")).toHaveValue("");
    await expect(fileTree.getByText("example.ts", { exact: true })).toBeVisible();
    failNextSearch = true;
    await fileTree.getByTestId("files-filter").fill("needle.ts");
    await expect(fileTree.getByTestId("files-filter-error")).toHaveText(
      "Search temporarily unavailable",
    );
    await expect(
      fileTree.getByRole("textbox", { name: "Filter files...", exact: true }),
    ).toBeVisible();
    await fileTree.getByText("Retry", { exact: true }).click();
    await expect(fileTree.getByText("needle.ts", { exact: true })).toBeVisible();
    await expect(fileTree.getByTestId("files-filter-error")).toHaveCount(0);
    await fileTree.getByTestId("files-root-menu").click();
    await expect(page.getByTestId("files-new-file")).toBeVisible();
    await expect(page.getByTestId("files-new-folder")).toBeVisible();
    await expect(page.getByTestId("files-hidden-toggle")).toBeVisible();
    await expect(page.getByTestId("files-refresh")).toBeVisible();
    await page.getByTestId("files-new-file").click();
    await expect(fileTree.getByTestId("files-filter")).toHaveValue("");
    await expect(fileTree.getByTestId("files-filter-clear")).toHaveCount(0);
    await expect(fileTree.getByText("example.ts", { exact: true })).toBeVisible();
    const draft = fileTree.getByTestId("file-explorer-name-input");
    await draft.fill("created.ts");
    await draft.press("Enter");
    await expect(fileTree.getByText("created.ts", { exact: true })).toBeVisible();
    expect(await readFile(`${fixture.cwd}/created.ts`, "utf8")).toBe("");
    await expect(fileTree.getByTestId("files-filter")).toHaveValue("");
    await expect(fileTree.getByTestId("files-filter-clear")).toHaveCount(0);
    await fileTree.getByTestId("files-filter").fill("example");
    await fileTree.getByText("example.ts", { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    await fileTree.getByTestId("file-explorer-name-input").fill("renamed.ts");
    await fileTree.getByTestId("file-explorer-name-input").press("Enter");
    await expect(fileTree.getByText("renamed.ts", { exact: true })).toBeVisible();
    await expect(fileTree.getByTestId("files-filter")).toHaveValue("");
    await expect(fileTree.getByTestId("files-filter-clear")).toHaveCount(0);
    await expect(fileTree.getByText("created.ts", { exact: true })).toBeVisible();
    expect(await readFile(`${fixture.cwd}/renamed.ts`, "utf8")).toBe("export const answer = 42;\n");
    await expect(right.locator(".cm-content").filter({ visible: true })).toBeVisible();
    await page.mouse.click(780, 410);
    await page.screenshot({ path: testInfo.outputPath("file-tree-reference.png") });
  } finally {
    await fixture.cleanup();
  }
});

test("macOS Files starts with an empty editor beside its searchable tree", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "files-empty-",
    title: "Files empty state",
    repo: { files: [{ path: "src/needle.ts", content: "export const needle = true;\n" }] },
  });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      editorTargets: [
        {
          id: "vscode",
          label: "Visual Studio Code",
          kind: "editor",
          icon: { kind: "symbol", name: "folder" },
        },
      ],
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await installUsageReportsFixture(page, { lists: [[]] });
    await page.setViewportSize({ width: 1352, height: 781 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    const draft = "Keep the conversation draft while browsing files.";
    await composerLocator(page).fill(draft);
    await page.getByTestId("workspace-explorer-toggle").click();
    // A tab launched from the launcher keeps the launcher's id, so find Files by its label.
    const filesTab = page.getByRole("button", { name: "Browse workspace files", exact: true });
    await page
      .getByTestId("workspace-explorer-sidebar")
      .getByTestId("workspace-new-tab-files")
      .click();
    const right = page.getByTestId("workspace-explorer-sidebar");
    const empty = right.getByTestId("files-empty-editor").filter({ visible: true });
    await expect(empty).toBeVisible();
    await expect(empty.getByText("Open file", { exact: true })).toBeVisible();
    await expect(
      empty.getByText("Select a file from the workspace tree", { exact: true }),
    ).toBeVisible();
    const toolbar = right.getByTestId("file-tool-toolbar").filter({ visible: true });
    await expect(toolbar.getByText(path.basename(fixture.cwd), { exact: true })).toBeVisible();
    await expect(toolbar.getByTestId("file-path-menu-trigger")).toHaveAccessibleName(
      `More actions: ${fixture.cwd}`,
    );
    await expect(toolbar.getByTestId("file-open-in-editor-primary")).toHaveCount(0);
    const tree = right.getByTestId("file-tree-rail-tree").filter({ visible: true });
    await expect(tree.getByTestId("file-explorer-tree-scroll")).toBeVisible();
    const barBox = await toolbar.boundingBox();
    const dockBox = await right.boundingBox();
    const emptyBox = await empty.boundingBox();
    const treeBox = await tree.boundingBox();
    if (!barBox || !dockBox || !emptyBox || !treeBox)
      throw new Error("Missing Files empty-state geometry");
    expect(Math.abs(barBox.width - dockBox.width)).toBeLessThanOrEqual(1);
    expect(emptyBox.x + emptyBox.width).toBeLessThanOrEqual(treeBox.x + 1);
    expect(emptyBox.y).toBeGreaterThanOrEqual(barBox.y + barBox.height);
    expect(Math.abs(emptyBox.height - treeBox.height)).toBeLessThanOrEqual(1);
    await page.mouse.move(500, 300);
    await page.screenshot({ path: testInfo.outputPath("files-empty-wide.png") });
    await toolbar.getByTestId("file-toggle-tree").click();
    await expect(tree).toHaveCount(0);
    await page.getByTestId("workspace-explorer-toggle").click();
    await page.getByTestId("workspace-explorer-toggle").click();
    await expect(filesTab).toHaveAttribute("aria-selected", "true");
    await expect(empty).toBeVisible();
    await expect(tree).toHaveCount(0);
    await toolbar.getByTestId("file-toggle-tree").click();
    await expect(tree).toBeVisible();
    await page.setViewportSize({ width: 900, height: 781 });
    await expect(
      right.getByTestId("file-explorer-tree-scroll").filter({ visible: true }),
    ).toBeInViewport({ ratio: 1 });
    await expect(toolbar).toBeInViewport();
    await expect(composerLocator(page)).toHaveValue(draft);
    await page.screenshot({ path: testInfo.outputPath("files-empty-narrow.png") });
    await page.setViewportSize({ width: 1352, height: 781 });
    await tree.getByTestId("files-filter").fill("needle");
    await expect(tree.getByText("needle.ts", { exact: true })).toBeVisible();
    await page.getByTestId("workspace-explorer-toggle").click();
    await page.getByTestId("workspace-explorer-toggle").click();
    await expect(tree.getByTestId("files-filter")).toHaveValue("needle");
    await tree.getByText("needle.ts", { exact: true }).click();
    await expect(right.locator(".cm-content").filter({ visible: true })).toContainText(
      "export const needle = true;",
    );
    await expect(right.getByTestId("file-tree-rail-tree").filter({ visible: true })).toHaveCount(0);
    await toolbar.getByTestId("file-toggle-tree").click();
    await expect(right.getByTestId("file-tree-rail-tree").filter({ visible: true })).toBeVisible();
    await expect(composerLocator(page)).toHaveValue(draft);
    const fileTab = page.getByRole("button", { name: "src/needle.ts", exact: true });
    await expect(fileTab).toHaveCount(1);
    const editorTree = right.getByTestId("file-tree-rail-tree").filter({ visible: true });
    await editorTree.getByTestId("files-filter").fill("needle.ts");
    await expect(editorTree.getByText("needle.ts", { exact: true })).toBeVisible();
    await page.getByTestId("workspace-explorer-toggle").click();
    await page.getByTestId("workspace-explorer-toggle").click();
    await expect(fileTab).toHaveAttribute("aria-selected", "true");
    await expect(editorTree.getByTestId("files-filter")).toHaveValue("needle.ts");
    await filesTab.click();
    await expect(empty).toBeVisible();
    await expect(tree.getByTestId("files-filter")).toHaveValue("needle");
    await tree.getByText("needle.ts", { exact: true }).click();
    await expect(fileTab).toHaveCount(1);
    await expect(fileTab).toHaveAttribute("aria-selected", "true");
    await expect(composerLocator(page)).toHaveValue(draft);
  } finally {
    await fixture.cleanup();
  }
});
