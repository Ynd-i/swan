import { test, expect, type Page } from "../../app/e2e/support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { composerLocator, openAttachmentMenu } from "../../app/e2e/support/helpers/composer";
import { installDesktopRuntime } from "./support/runtime";

async function expectComposerAlignedMenu(page: Page) {
  const menu = page.getByTestId("message-input-attachment-menu");
  const composer = page.getByTestId("message-input-root").filter({ visible: true }).first();
  await expect
    .poll(async () => {
      const [surface, input] = await Promise.all([menu.boundingBox(), composer.boundingBox()]);
      if (!surface || !input) return Infinity;
      return Math.max(Math.abs(surface.width - input.width), Math.abs(surface.x - input.x));
    })
    .toBeLessThanOrEqual(2);
  await expect(menu).toBeInViewport({ ratio: 1 });
  const [surface, input] = await Promise.all([menu.boundingBox(), composer.boundingBox()]);
  if (!surface || !input) throw new Error("Missing attachment menu geometry");
  expect(surface.y + surface.height).toBeLessThan(input.y);
}

async function expectMenuAlignmentPersists(page: Page) {
  const menu = await page.getByTestId("message-input-attachment-menu").elementHandle();
  const composer = await page
    .getByTestId("message-input-root")
    .filter({ visible: true })
    .first()
    .elementHandle();
  if (!menu || !composer) throw new Error("Missing attachment menu geometry");
  // Include Reanimated's delayed style cleanup, not just its initial placement.
  const stayedAligned = await page.evaluate(
    ({ menu: menuElement, composer: composerElement }) =>
      new Promise<boolean>((resolve) => {
        const until = performance.now() + 1000;
        function check() {
          const surface = menuElement.getBoundingClientRect();
          const input = composerElement.getBoundingClientRect();
          if (
            Math.abs(surface.width - input.width) > 2 ||
            Math.abs(surface.x - input.x) > 2 ||
            surface.y + surface.height >= input.y
          )
            return resolve(false);
          if (performance.now() >= until) return resolve(true);
          requestAnimationFrame(check);
        }
        requestAnimationFrame(check);
      }),
    { menu, composer },
  );
  expect(stayedAligned).toBe(true);
}

test("desktop attachment menu follows the composer and preserves canceled drafts", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "desktop-attachments-",
    title: "Attachment menu check",
  });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
      dialogOpenResult: null,
    });
    await page.setViewportSize({ width: 1352, height: 782 });
    await page.emulateMedia({ colorScheme: "dark" });
    await openAgentRoute(page, fixture);
    await composerLocator(page).fill("Keep this draft while choosing an attachment.");
    await openAttachmentMenu(page);
    await expectComposerAlignedMenu(page);
    const menu = page.getByTestId("message-input-attachment-menu");
    const first = menu.getByRole("menuitem").first();
    await expect(first).toHaveAttribute("data-testid", "message-input-attachment-menu-item-file");
    await expect(first).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("attachment-menu-wide.png") });
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(
      page.getByTestId("message-input-attach-button").filter({ visible: true }),
    ).toBeFocused();
    await openAttachmentMenu(page);
    await page.setViewportSize({ width: 900, height: 680 });
    await expectComposerAlignedMenu(page);
    await expectMenuAlignmentPersists(page);
    await first.click();
    await expect.poll(() => page.evaluate(() => window.__capturedDialogOpenCalls.length)).toBe(1);
    expect(await page.evaluate(() => window.__capturedDialogOpenCalls[0])).toMatchObject({
      directory: false,
      multiple: true,
    });
    await expect(menu).toHaveCount(0);
    await expect(page.getByTestId("composer-file-attachment-pill")).toHaveCount(0);
    await expect(composerLocator(page)).toHaveValue(
      "Keep this draft while choosing an attachment.",
    );
  } catch (error) {
    await page
      .screenshot({ path: testInfo.outputPath("attachment-menu-failure.png"), timeout: 5000 })
      .catch(() => {});
    throw error;
  } finally {
    await fixture.cleanup();
  }
});

test("desktop attachment picker recovers from a read failure and uploads the selected file", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "desktop-attachment-retry-",
    title: "Attachment retry check",
  });
  const selectedPath = "/tmp/paseo-attachment-fixture.txt";
  const contents = Buffer.from("Picker attachment fixture.\n");
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
      dialogOpenResult: selectedPath,
    });
    // Simulate only the native file boundary; upload uses the real isolated daemon.
    await page.addInitScript(
      ({ path, base64, byteSize }) => {
        const bridge = (
          window as unknown as {
            paseoDesktop: {
              invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
            };
          }
        ).paseoDesktop;
        const invoke = bridge.invoke;
        let failFirstRead = true;
        bridge.invoke = async (command, args) => {
          if (command === "copy_attachment_file") {
            if (args?.sourcePath !== path) throw new Error("Unexpected fixture path");
            if (failFirstRead) {
              failFirstRead = false;
              throw new Error("Fixture read failed");
            }
            return { path, byteSize };
          }
          if (command === "read_file_base64") {
            if (args?.path !== path) throw new Error("Unexpected fixture path");
            return base64;
          }
          return invoke(command, args);
        };
      },
      { path: selectedPath, base64: contents.toString("base64"), byteSize: contents.length },
    );
    await page.setViewportSize({ width: 1352, height: 782 });
    await openAgentRoute(page, fixture);
    await composerLocator(page).fill("Keep the draft through a failed selection.");
    await openAttachmentMenu(page);
    await page.getByTestId("message-input-attachment-menu-item-file").press("Enter");
    await expect(page.getByText("Fixture read failed", { exact: true })).toBeVisible();
    await expect(page.getByTestId("message-input-attachment-menu")).toHaveCount(0);
    await expect(page.getByTestId("composer-file-attachment-pill")).toHaveCount(0);
    await expect(composerLocator(page)).toHaveValue("Keep the draft through a failed selection.");
    await openAttachmentMenu(page);
    await page.getByTestId("message-input-attachment-menu-item-file").press("Enter");
    await expect(page.getByTestId("composer-file-attachment-pill")).toContainText(
      "paseo-attachment-fixture.txt",
    );
    await expect(composerLocator(page)).toHaveValue("Keep the draft through a failed selection.");
    expect(await page.evaluate(() => window.__capturedDialogOpenCalls.length)).toBe(2);
  } catch (error) {
    await page
      .screenshot({ path: testInfo.outputPath("attachment-retry-failure.png"), timeout: 5000 })
      .catch(() => {});
    throw error;
  } finally {
    await fixture.cleanup();
  }
});
