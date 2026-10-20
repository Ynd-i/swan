import { test, expect } from "../../app/e2e/support/fixtures";
import { seedWorkspace } from "../../app/e2e/support/helpers/seed-client";
import {
  expectProjectEditFailed,
  expectProjectEditSaved,
  expectProjectTitle,
  openProjectEditSheet,
  openProjectSettings,
  openProjects,
  saveProjectEdits,
} from "../../app/e2e/support/helpers/project-settings";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installUsageReportsFixture } from "../../app/e2e/support/helpers/usage-reports";
import { installDesktopRuntime } from "./support/runtime";

test("macOS project editor shows its real source folder and preserves name and icon edits", async ({
  page,
}, testInfo) => {
  const fixture = await seedWorkspace({
    repoPrefix: "project-edit-reference-",
  });
  const selectedIconPath = "/tmp/reference-icon.png";
  const iconBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
      dialogOpenResult: selectedIconPath,
    });
    // Simulate only the native file boundary; project/icon saves use the isolated daemon.
    await page.addInitScript(
      ({ path, base64 }) => {
        const bridge = (
          window as unknown as {
            paseoDesktop: {
              invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
            };
          }
        ).paseoDesktop;
        const invoke = bridge.invoke;
        bridge.invoke = async (command, args) => {
          if (command === "copy_attachment_file") {
            if (args?.sourcePath !== path) throw new Error("Unexpected fixture icon path");
            return { path, byteSize: atob(base64).length };
          }
          if (command === "read_file_base64") {
            if (args?.path !== path) throw new Error("Unexpected fixture icon path");
            return base64;
          }
          return invoke(command, args);
        };
      },
      { path: selectedIconPath, base64: iconBase64 },
    );
    await installUsageReportsFixture(page, { lists: [[]] });
    await page.setViewportSize({ width: 1352, height: 781 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openProjects(page);
    await openProjectSettings(page, fixture.projectDisplayName);
    await openProjectEditSheet(page);
    const modal = page.getByTestId("project-edit-sheet");
    const dialog = modal.getByRole("dialog");
    const name = page.getByTestId("project-edit-name");
    const icon = page.getByTestId("project-edit-icon-trigger");
    await page.screenshot({
      path: testInfo.outputPath("project-edit-baseline.png"),
    });
    await expect(dialog).toHaveCSS("max-width", "520px");
    expect(await dialog.evaluate((node) => getComputedStyle(node).borderRadius)).toBe("20px");
    await expect(dialog).toHaveCSS("background-color", "rgb(38, 38, 38)");
    await expect(modal).toHaveCSS("background-color", "rgba(0, 0, 0, 0.12)");
    const modalTitle = dialog.getByText("Edit project", { exact: true });
    await expect(modalTitle).toHaveCSS("font-size", "17px");
    await expect(modalTitle).toHaveCSS("font-weight", "600");
    expect((await modalTitle.boundingBox())!.x - (await dialog.boundingBox())!.x).toBe(20);
    await expect(page.getByTestId("project-edit-source-folder")).toContainText(fixture.repoPath);
    await expect(page.getByTestId("project-edit-default-icon")).toBeVisible();
    await expect(page.getByTestId("project-edit-image-url")).toBeHidden();
    await expect(page.getByTestId("project-edit-save")).toBeDisabled();
    // Only the sidebar's in-place editor offers Remove project.
    await expect(page.getByTestId("project-edit-remove")).toHaveCount(0);
    const field = page.getByTestId("project-edit-name-field");
    const fieldTop = (await field.boundingBox())!.y - (await dialog.boundingBox())!.y;
    expect(fieldTop).toBeGreaterThanOrEqual(60);
    expect(fieldTop).toBeLessThanOrEqual(64);
    expect(await field.locator("input").count()).toBe(1);
    expect(await field.getByTestId("project-edit-icon-trigger").count()).toBe(1);
    expect((await name.boundingBox())!.width).toBeGreaterThan(400);
    await expect(name).toHaveCSS("outline-width", "0px");
    await page.screenshot({
      path: testInfo.outputPath("project-edit-wide.png"),
    });
    await name.fill("Canceled project name");
    await modal.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(modal).toHaveCount(0);
    await expectProjectTitle(page, fixture.projectDisplayName);
    await openProjectEditSheet(page);
    await expect(name).toHaveValue("");
    await name.fill("Renamed reference project");
    await icon.click();
    const url = page.getByTestId("project-edit-image-url");
    await url.fill("file:///not-a-project-icon.png");
    await saveProjectEdits(page);
    await expectProjectEditFailed(page, "URL must use HTTP or HTTPS without credentials");
    await expect(name).toHaveValue("Renamed reference project");
    await expectProjectTitle(page, fixture.projectDisplayName);
    await url.fill("");
    await page.getByTestId("project-edit-choose-image").click();
    await expect(page.getByText("reference-icon.png", { exact: true })).toBeVisible();
    await saveProjectEdits(page);
    await expectProjectEditSaved(page);
    await expectProjectTitle(page, "Renamed reference project");
    await openProjectEditSheet(page);
    await expect(name).toHaveValue("Renamed reference project");
    await expect(page.getByTestId("project-edit-default-icon")).toHaveCount(0);
    await expect(icon.locator("img")).toBeVisible();
    await expect(page.getByTestId("project-edit-save")).toBeDisabled();
    await page.setViewportSize({ width: 900, height: 781 });
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(900);
    await expect(page.getByTestId("app-toast-message")).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath("project-edit-narrow.png"),
    });
    await icon.click();
    await page.getByTestId("project-edit-use-automatic").click();
    await expect(page.getByTestId("project-edit-default-icon")).toBeVisible();
    await saveProjectEdits(page);
    await expect(modal).toHaveCount(0);
    await openProjectEditSheet(page);
    await expect(page.getByTestId("project-edit-default-icon")).toBeVisible();
    await expect(name).toHaveValue("Renamed reference project");
    await modal.getByRole("button", { name: "Close", exact: true }).click();
    await expect(modal).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});
