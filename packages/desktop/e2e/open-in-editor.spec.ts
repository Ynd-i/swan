import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "../../app/e2e/support/fixtures";
import { gotoAppShell, openSettings } from "../../app/e2e/support/helpers/app";
import { expandFolder, openFileExplorer } from "../../app/e2e/support/helpers/file-explorer";
import { installDesktopRuntime } from "./support/runtime";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { gotoWorkspace } from "../../app/e2e/support/helpers/launcher";

interface EditorOpenRecord {
  editorId: string;
  workspacePath: string;
  filePath?: string;
  line?: number;
  column?: number;
}

function requireE2EEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set.`);
  }
  return value;
}

async function readEditorOpenRecords(recordPath: string): Promise<EditorOpenRecord[]> {
  try {
    const contents = await readFile(recordPath, "utf8");
    return contents
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as EditorOpenRecord);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function selectEditorTarget(page: Page, targetId: string): Promise<void> {
  await expect(page.getByTestId("workspace-open-in-editor-primary")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("workspace-open-in-editor-caret").click();
  await expect(page.getByTestId("workspace-open-in-editor-menu")).toBeVisible();
  await page.getByTestId(`workspace-open-in-editor-item-${targetId}`).click();
}

async function expectEditorOpened(input: {
  recordPath: string;
  editorId: string;
  path: string;
  afterCount: number;
}): Promise<void> {
  await expect
    .poll(
      async () => {
        const records = await readEditorOpenRecords(input.recordPath);
        return records
          .slice(input.afterCount)
          .some(
            (record) => record.editorId === input.editorId && record.workspacePath === input.path,
          );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

test.describe("Workspace open in editor", () => {
  test("desktop titlebar keeps workspace actions scoped across navigation", async ({
    page,
    withWorkspace,
  }, testInfo) => {
    const recordPath = testInfo.outputPath("titlebar-editor.jsonl");
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
      editorTargets: [
        {
          id: "vscode",
          label: "Visual Studio Code",
          kind: "editor",
          icon: { kind: "symbol", name: "folder" },
        },
      ],
      editorRecordPath: recordPath,
    });
    const first = await withWorkspace({ prefix: "titlebar-first-" });
    const second = await withWorkspace({ prefix: "titlebar-second-" });
    await page.setViewportSize({ width: 1352, height: 782 });
    // The Mac sidebar lists chats, so a workspace without one has no row; open it by route.
    await gotoWorkspace(page, first.workspaceId);
    const toolbar = page.getByTestId("desktop-workspace-toolbar");
    const editor = toolbar.getByTestId("workspace-open-in-editor-primary");
    await expect(editor).toBeVisible();
    await expect(page.getByTestId("workspace-tabs-row")).toHaveCount(0);
    await expect(page.getByTestId("composer-dock-header")).toHaveCount(0);
    await editor.click();
    await expectEditorOpened({
      recordPath,
      editorId: "vscode",
      path: first.repoPath,
      afterCount: 0,
    });
    await gotoWorkspace(page, second.workspaceId);
    await expect(toolbar.getByTestId("workspace-header-menu-trigger")).toHaveCount(1);
    await editor.click();
    await expectEditorOpened({
      recordPath,
      editorId: "vscode",
      path: second.repoPath,
      afterCount: 1,
    });
    const explorer = toolbar.getByTestId("workspace-explorer-toggle");
    await expect(explorer).toHaveAttribute("aria-expanded", "false");
    await explorer.click();
    await expect(explorer).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("workspace-explorer-sidebar-resize-handle")).toBeVisible();
    await expect(
      page.getByTestId("workspace-explorer-sidebar").getByTestId("workspace-new-tab-files"),
    ).toBeVisible();
    await explorer.click();
    await openSettings(page);
    await expect(editor).toHaveCount(0);
    // Mac Back history skips workspaces without a chat, so leave settings by route.
    await gotoWorkspace(page, second.workspaceId);
    await expect(editor).toHaveCount(1);
    await editor.click();
    await expectEditorOpened({
      recordPath,
      editorId: "vscode",
      path: second.repoPath,
      afterCount: 2,
    });
    await page.screenshot({ path: testInfo.outputPath("workspace-titlebar.png") });
    await page.setViewportSize({ width: 900, height: 680 });
    await expect(editor).toBeInViewport({ ratio: 1 });
    await expect(explorer).toBeInViewport({ ratio: 1 });
    // Narrow Mac windows keep the current chat and the desktop titlebar actions.
    await page.setViewportSize({ width: 700, height: 680 });
    await expect(editor).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId("composer-dock-header")).toHaveCount(0);
    await expect(page.getByTestId("workspace-tabs-row")).toHaveCount(0);
    await expect(toolbar.getByTestId("workspace-header-menu-trigger")).toBeInViewport({ ratio: 1 });
    await editor.click();
    await expectEditorOpened({
      recordPath,
      editorId: "vscode",
      path: second.repoPath,
      afterCount: 3,
    });
    await explorer.click();
    await expect(page.getByTestId("workspace-explorer-sidebar")).toBeVisible();
    await expect(
      page.getByTestId("workspace-explorer-sidebar").getByTestId("workspace-new-tab-files"),
    ).toBeVisible();
    await expect(page.getByTestId("workspace-tabs-row")).toHaveCount(0);
    await explorer.click();
    await page.setViewportSize({ width: 1352, height: 782 });
    await expect(editor).toHaveCount(1);
    await page.keyboard.press("Meta+Shift+f");
    await expect(editor).toHaveCount(0);
    await page.keyboard.press("Meta+Shift+f");
    await expect(editor).toBeVisible();
  });

  test("opens a nested folder in the preferred editor", async ({ page, withWorkspace }) => {
    test.setTimeout(90_000);

    const serverId = requireE2EEnv("E2E_SERVER_ID");
    const recordPath = requireE2EEnv("E2E_EDITOR_RECORD_PATH");
    await rm(recordPath, { force: true });
    await installDesktopRuntime(page, {
      serverId,
      editorTargets: [
        {
          id: "android-studio",
          label: "Android Studio",
          kind: "editor",
          icon: { kind: "symbol", name: "terminal" },
        },
      ],
      editorRecordPath: recordPath,
    });

    const workspace = await withWorkspace({ prefix: "workspace-nested-editor-target-" });
    const childFolderName = "sample-android-app";
    const childFolderPath = path.join(workspace.repoPath, "repos", childFolderName);
    await mkdir(childFolderPath, { recursive: true });
    await gotoWorkspace(page, workspace.workspaceId);

    await openFileExplorer(page);
    await expect(page.getByTestId("workspace-explorer-sidebar")).toBeVisible();
    await expect(page.getByTestId("workspace-tabs-row")).toHaveCount(0);
    await expandFolder(page, "repos");
    await page.getByText(childFolderName, { exact: true }).click({ button: "right" });
    const openInEditor = page.getByTestId(/file-explorer-row-\d+-open-in-editor$/);
    await expect(openInEditor).toBeVisible({ timeout: 5_000 });
    await openInEditor.click();

    await expectEditorOpened({
      recordPath,
      editorId: "android-studio",
      path: childFolderPath,
      afterCount: 0,
    });
  });

  test("selects an editor without opening it", async ({ page, withWorkspace }) => {
    test.setTimeout(90_000);

    const serverId = requireE2EEnv("E2E_SERVER_ID");
    const recordPath = requireE2EEnv("E2E_EDITOR_RECORD_PATH");
    await rm(recordPath, { force: true });
    await installDesktopRuntime(page, {
      serverId,
      editorTargets: [
        {
          id: "cursor",
          label: "Cursor",
          kind: "editor",
          icon: { kind: "symbol", name: "terminal" },
        },
        {
          id: "zed",
          label: "Zed",
          kind: "editor",
          icon: { kind: "symbol", name: "terminal" },
        },
      ],
      editorRecordPath: recordPath,
    });

    const workspace = await withWorkspace({ prefix: "workspace-editor-selection-" });
    await gotoWorkspace(page, workspace.workspaceId);

    await selectEditorTarget(page, "zed");
    const primaryButton = page.getByTestId("workspace-open-in-editor-primary");
    await expect(primaryButton).toHaveAccessibleName("Open workspace in Zed");
    await expect(primaryButton).toBeEnabled();
    expect(await readEditorOpenRecords(recordPath)).toEqual([]);

    await primaryButton.click();
    await expectEditorOpened({
      recordPath,
      editorId: "zed",
      path: workspace.repoPath,
      afterCount: 0,
    });
  });

  test("keeps the selected editor target after leaving and returning to the workspace", async ({
    page,
    withWorkspace,
  }) => {
    test.setTimeout(90_000);

    const serverId = requireE2EEnv("E2E_SERVER_ID");
    const recordPath = requireE2EEnv("E2E_EDITOR_RECORD_PATH");
    await rm(recordPath, { force: true });
    await installDesktopRuntime(page, {
      serverId,
      editorTargets: [
        {
          id: "cursor",
          label: "Cursor",
          kind: "editor",
          icon: { kind: "symbol", name: "terminal" },
        },
        {
          id: "vscode",
          label: "VS Code",
          kind: "editor",
          icon: { kind: "symbol", name: "terminal" },
        },
      ],
      editorRecordPath: recordPath,
    });

    const workspace = await withWorkspace({ prefix: "workspace-editor-target-" });
    await gotoWorkspace(page, workspace.workspaceId);

    await selectEditorTarget(page, "vscode");
    await page.getByTestId("workspace-open-in-editor-primary").click();
    await expectEditorOpened({
      recordPath,
      editorId: "vscode",
      path: workspace.repoPath,
      afterCount: 0,
    });
    const recordsAfterSelection = (await readEditorOpenRecords(recordPath)).length;

    await openSettings(page);
    // Mac Back history skips workspaces without a chat, so leave settings by route.
    await gotoWorkspace(page, workspace.workspaceId);
    await expect(page).toHaveURL(/\/workspace\//, { timeout: 30_000 });

    await page.getByTestId("workspace-open-in-editor-primary").click();
    await expectEditorOpened({
      recordPath,
      editorId: "vscode",
      path: workspace.repoPath,
      afterCount: recordsAfterSelection,
    });
    const recordsAfterReturnOpen = (await readEditorOpenRecords(recordPath)).length;

    await gotoAppShell(page);
    await gotoWorkspace(page, workspace.workspaceId);
    await page.getByTestId("workspace-open-in-editor-primary").click();
    await expectEditorOpened({
      recordPath,
      editorId: "vscode",
      path: workspace.repoPath,
      afterCount: recordsAfterReturnOpen,
    });
  });
});
