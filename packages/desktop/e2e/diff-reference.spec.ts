import { writeFile } from "node:fs/promises";
import { test, expect } from "../../app/e2e/support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { composerLocator } from "../../app/e2e/support/helpers/composer";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDesktopRuntime } from "./support/runtime";
import { openSettings } from "../../app/e2e/support/helpers/app";
import {
  openSettingsSection,
  clickSettingsBackToWorkspace,
} from "../../app/e2e/support/helpers/settings";

test("macOS diff keeps its canvas and chat while the right file tree toggles", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "diff-reference-",
    title: "Review code changes",
    repo: {
      files: [
        { path: "example.ts", content: "const a = 1, b = 2;\n" },
        { path: "src/other.ts", content: "let x = false;\n" },
      ],
    },
  });
  try {
    await writeFile(`${fixture.cwd}/example.ts`, "const a = 3, b = 4;\nconst ready = true;\n");
    await writeFile(`${fixture.cwd}/src/other.ts`, "let x = true;\n");
    await fixture.client.checkoutRefresh(fixture.cwd);
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    const composer = composerLocator(page);
    await composer.fill("Keep this review draft.");
    await page.getByTestId("workspace-explorer-toggle").click();
    await page.getByTestId("explorer-sidebar-new-tab-button").click();
    await page.getByTestId("workspace-new-tab-menu-diff").click();
    const diff = page.getByTestId("working-diff-panel").filter({ visible: true });
    const canvas = diff.getByTestId("git-diff-canvas");
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveCSS("font-weight", "600");
    const referenceColors = [
      "#00c853",
      "#ff5f38",
      "#334a34",
      "#55392e",
      "#122013",
      "#28150e",
      "#33633b",
      "#774130",
    ];
    const paintedColors = () =>
      canvas.evaluate((node, wanted) => {
        const element = node as HTMLCanvasElement;
        const context = element.getContext("2d");
        if (!context) throw new Error("Missing canvas context");
        const { data } = context.getImageData(0, 0, element.width, element.height);
        const found = new Set<string>();
        for (let index = 0; index < data.length; index += 4) {
          found.add(
            "#" +
              [data[index], data[index + 1], data[index + 2]]
                .map((value) => value.toString(16).padStart(2, "0"))
                .join(""),
          );
        }
        return wanted.filter((color) => found.has(color));
      }, referenceColors);
    await expect.poll(paintedColors).toEqual(referenceColors);
    const toggle = diff.getByTestId("changes-toggle-tree");
    await expect(toggle).toBeVisible();
    await expect(diff.getByTestId("commits-section-header")).toHaveCount(0);
    await expect(diff.getByTestId("changes-selected-diff-stat")).toBeVisible();
    const comparison = await diff.getByTestId("changes-header").boundingBox();
    const branch = await diff.getByTestId("changes-repository-header").boundingBox();
    if (!comparison || !branch) throw new Error("Missing diff header");
    expect(comparison.y).toBeLessThan(branch.y);
    await diff.getByTestId("changes-options-menu").click();
    await expect(page.getByTestId("changes-toggle-inline-diff")).toHaveCount(0);
    await page.getByTestId("changes-toggle-layout").filter({ visible: true }).click();
    await expect.poll(paintedColors).toEqual(referenceColors);
    const originalCanvas = await canvas.elementHandle();
    if (!originalCanvas) throw new Error("Missing canvas");
    const closedWidth = (await canvas.boundingBox())!.width;
    await toggle.click();
    const tree = diff.getByTestId("changes-tree-rail-tree");
    await expect(tree).toBeVisible();
    await expect(tree.getByText("example.ts", { exact: true })).toBeVisible();
    expect(await originalCanvas.evaluate((node) => node.isConnected)).toBe(true);
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeLessThan(closedWidth);
    const treeBox = (await tree.boundingBox())!;
    const canvasBox = (await canvas.boundingBox())!;
    expect(treeBox.x).toBeGreaterThanOrEqual(canvasBox.x + canvasBox.width - 1);
    await page.screenshot({ path: testInfo.outputPath("diff-tree-open.png") });
    await tree.getByTestId("diff-folder-src").click();
    await expect(tree.getByText("other.ts", { exact: true })).toHaveCount(0);
    const filter = tree.getByTestId("changes-filter");
    await filter.fill(" EXAMPLE ");
    await expect(tree.getByText("example.ts", { exact: true })).toBeVisible();
    await expect(tree.getByText("other.ts", { exact: true })).toHaveCount(0);
    await filter.fill("SRC/OTHER");
    await expect(tree.getByText("other.ts", { exact: true })).toBeVisible();
    await filter.fill("missing-file");
    await expect(tree.getByTestId("changes-filter-empty")).toBeVisible();
    await tree.getByTestId("changes-filter-clear").click();
    await expect(tree.getByText("other.ts", { exact: true })).toHaveCount(0);
    await tree.getByTestId("diff-folder-src").click();
    await expect(tree.getByText("other.ts", { exact: true })).toBeVisible();
    expect(await originalCanvas.evaluate((node) => node.isConnected)).toBe(true);
    await toggle.click();
    await expect(tree).toHaveCount(0);
    expect(await originalCanvas.evaluate((node) => node.isConnected)).toBe(true);
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBe(closedWidth);
    await diff.getByTestId("changes-options-menu").click();
    await page.getByTestId("changes-toggle-wrap-lines").filter({ visible: true }).click();
    await expect.poll(paintedColors).toEqual(referenceColors);
    expect(await originalCanvas.evaluate((node) => node.isConnected)).toBe(true);
    await diff.getByTestId("changes-options-menu").click();
    await page.getByTestId("changes-toggle-wrap-lines").filter({ visible: true }).click();
    await expect(composer).toHaveValue("Keep this review draft.");
    await expect(page.getByTestId("workspace-new-tab-button")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("diff-tree-closed.png") });
    await page.reload();
    await expect(toggle).toBeVisible();
    await expect(tree).toHaveCount(0);
    for (const theme of ["Light", "Claude", "Dark"]) {
      await openSettings(page);
      await openSettingsSection(page, "appearance");
      await page.getByLabel(/^Theme:/).click();
      await page.getByRole("menuitem", { name: theme, exact: true }).click();
      await clickSettingsBackToWorkspace(page);
      await expect.poll(paintedColors).toEqual(theme === "Dark" ? referenceColors : []);
    }
  } finally {
    await fixture.cleanup();
  }
});
