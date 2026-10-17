import { execFileSync } from "node:child_process";
import { writeFile, readFile } from "node:fs/promises";
import { test, expect } from "../../app/e2e/support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { composerLocator } from "../../app/e2e/support/helpers/composer";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDesktopRuntime } from "./support/runtime";

test("macOS preserves the fixed comparison base of a Paseo-owned worktree", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "diff-fixed-base-",
    title: "Worktree source",
    repo: { withRemote: false },
  });
  let worktreeId: string | undefined;
  try {
    const created = await fixture.client.createWorkspace({
      source: {
        kind: "worktree",
        cwd: fixture.cwd,
        action: "branch-off",
        refName: "main",
        worktreeSlug: "comparison-locked",
      },
    });
    if (!created.workspace) throw new Error(created.error ?? "Worktree creation failed");
    worktreeId = created.workspace.id;
    const agent = await fixture.client.createAgent({
      provider: "mock",
      model: "e2e-fast-stream",
      modeId: "load-test",
      cwd: created.workspace.workspaceDirectory,
      workspaceId: worktreeId,
      title: "Fixed worktree base",
    });
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, { workspaceId: worktreeId, agentId: agent.id });
    await page.getByTestId("workspace-explorer-toggle").click();
    await page.getByTestId("explorer-sidebar-new-tab-button").click();
    await page.getByTestId("workspace-new-tab-menu-diff").click();
    const selector = page
      .getByTestId("working-diff-panel")
      .filter({ visible: true })
      .getByTestId("changes-base-selector");
    await expect(selector.getByRole("button")).toBeDisabled();
    await expect(selector).toContainText("main");
    await selector.getByRole("button").hover({ force: true });
    await expect(
      page.getByText("This worktree's comparison base is fixed.", { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("diff-fixed-worktree-base.png") });
  } finally {
    if (worktreeId) await fixture.client.archiveWorkspace(worktreeId);
    await fixture.cleanup();
  }
});

test("macOS comparison selects exact local and remote refs without changing the checkout or losing reviews", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "diff-base-selector-",
    title: "Compare branches",
    repo: {
      withRemote: false,
      files: [{ path: "source.ts", content: "export const version = 1;\n" }],
    },
  });
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: fixture.cwd, encoding: "utf8" }).trim();
  try {
    git("branch", "comparison-base");
    await writeFile(`${fixture.cwd}/committed.ts`, "export const committed = true;\n");
    git("add", "committed.ts");
    git("commit", "-m", "Synthetic comparison commit");
    git("update-ref", "refs/remotes/origin/comparison-base", "HEAD");
    await writeFile(`${fixture.cwd}/source.ts`, "export const version = 2;\n");
    await fixture.client.checkoutRefresh(fixture.cwd);
    const before = {
      head: git("rev-parse", "HEAD"),
      branch: git("branch", "--show-current"),
      status: git("status", "--porcelain"),
      stash: git("stash", "list"),
    };
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    const composer = composerLocator(page);
    await composer.fill("Keep this comparison draft.");
    await page.getByTestId("workspace-explorer-toggle").click();
    // Explorer starts on the launcher; open Changes first, as the old default Explorer had it.
    await page
      .getByTestId("workspace-explorer-sidebar")
      .getByTestId("workspace-new-tab-changes")
      .click();
    await expect(page.getByTestId("changes-tree-panel").filter({ visible: true })).toBeVisible();
    const changesTabId = await page
      .locator('[data-testid^="explorer-sidebar-tab-"][aria-selected="true"]')
      .getAttribute("data-testid");
    if (!changesTabId) throw new Error("Missing Changes tab identity");
    await page.getByTestId("explorer-sidebar-new-tab-button").click();
    await page.getByTestId("workspace-new-tab-menu-diff").click();
    const diff = page.getByTestId("working-diff-panel").filter({ visible: true });
    await expect(diff.getByTestId("git-diff-canvas")).toBeVisible();
    const tabId = await page
      .locator('[data-testid^="explorer-sidebar-tab-"][aria-selected="true"]')
      .getAttribute("data-testid");
    if (!tabId) throw new Error("Missing Diff tab identity");
    const selector = diff.getByTestId("changes-base-selector");
    await expect(selector).toBeVisible();
    await expect(diff.getByTestId("changes-branch-switcher")).toHaveCount(0);

    const body = diff.getByTestId("diff-file-0-body");
    await expect(body).toBeVisible();
    const bodyBox = (await body.boundingBox())!;
    const fontSize = await diff
      .getByTestId("git-diff-canvas")
      .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
    await page.mouse.move(bodyBox.x + 20, bodyBox.y + Math.round(fontSize * 1.5) * 1.5);
    await page.getByRole("button", { name: "Add review comment", exact: true }).click();
    await page.getByTestId("inline-review-editor-input").fill("Keep this uncommitted review.");
    await page.getByTestId("inline-review-editor-save").click();
    await expect(diff.getByText("Keep this uncommitted review.", { exact: true })).toBeVisible();

    const chooseBase = async (label: string) => {
      await selector.getByRole("button").click();
      const picker = page.getByTestId("combobox-desktop-container");
      await expect(picker).toBeVisible();
      await picker.getByPlaceholder("Filter branches...").fill(label);
      await picker.getByText(label, { exact: true }).click();
      await expect(picker).toBeHidden();
    };
    await chooseBase("comparison-base");
    await expect(diff.getByTestId("changes-diff-status-trigger")).toHaveText("Committed");
    await diff.getByTestId("changes-toggle-tree").click();
    const tree = diff.getByTestId("changes-file-tree");
    await expect(tree.getByText("committed.ts", { exact: true })).toBeVisible();
    await expect(tree.getByText("source.ts", { exact: true })).toHaveCount(0);
    await diff.getByTestId("changes-refresh").click();
    await expect(diff.getByTestId("changes-refresh")).toBeEnabled();
    await expect(selector).toContainText("comparison-base");
    await expect(tree.getByText("committed.ts", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("diff-local-base.png") });
    await page.getByTestId(changesTabId).click();
    const changes = page.getByTestId("changes-tree-panel").filter({ visible: true });
    await expect(changes.getByTestId("changes-base-selector")).toHaveCount(0);
    await expect(changes.getByText("committed.ts", { exact: true })).toBeVisible();
    await expect(changes.getByTestId("commits-base-hint")).toContainText("main");
    await page.getByTestId(tabId).click();
    await chooseBase("origin/comparison-base");
    await expect(diff.getByTestId("git-diff-canvas")).toHaveCount(0);
    await expect(diff.getByText("No changes to display", { exact: true })).toBeVisible();
    await expect(selector).toContainText("origin/comparison-base");
    await page.screenshot({ path: testInfo.outputPath("diff-remote-base.png") });
    await diff.getByTestId("changes-diff-status-trigger").click();
    await page.getByTestId("changes-diff-mode-uncommitted").filter({ visible: true }).click();
    await expect(diff.getByText("Keep this uncommitted review.", { exact: true })).toBeVisible();
    await chooseBase("Workspace default");
    await expect(selector).not.toContainText("comparison-base");
    await expect(composer).toHaveValue("Keep this comparison draft.");
    expect({
      head: git("rev-parse", "HEAD"),
      branch: git("branch", "--show-current"),
      status: git("status", "--porcelain"),
      stash: git("stash", "list"),
    }).toEqual(before);
    expect(await readFile(`${fixture.cwd}/source.ts`, "utf8")).toBe("export const version = 2;\n");
  } finally {
    await fixture.cleanup();
  }
});
