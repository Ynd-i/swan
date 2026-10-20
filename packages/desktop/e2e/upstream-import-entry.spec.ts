import { test, expect } from "../../app/e2e/support/fixtures";
import { gotoAppShell } from "../../app/e2e/support/helpers/app";
import { ImportSessionFlow } from "../../app/e2e/support/helpers/import-session";
import { openCommandCenter } from "../../app/e2e/support/helpers/command-center";
import { openGlobalNewWorkspaceComposer } from "../../app/e2e/support/helpers/new-workspace";
import { composerLocator } from "../../app/e2e/support/helpers/composer";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDesktopRuntime } from "./support/runtime";

// Import-entry coverage uses an empty isolated provider catalog; it must not scan
// real provider history merely to prove that the sheet opens and closes.
test.use({
  e2eDaemonConfig: {
    version: 1,
    agents: {
      providers: Object.fromEntries(
        ["claude", "codex", "opencode", "pi", "omp", "copilot", "muse", "antigravity", "acp"].map(
          (id) => [id, { enabled: false }],
        ),
      ),
    },
  },
});

test("macOS keeps the welcome clear and imports through the command center", async ({
  page,
}, testInfo) => {
  await installDesktopRuntime(page, {
    serverId: getServerId(),
    manageBuiltInDaemon: false,
    daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
  });
  await page.setViewportSize({ width: 1352, height: 782 });
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoAppShell(page);
  const flow = new ImportSessionFlow(page);
  await openGlobalNewWorkspaceComposer(page);
  await expect(page.getByTestId("desktop-new-chat-hero")).toBeVisible();
  // Like Codex, nothing sits below the wide composer; History and Cmd+K keep import reachable.
  await expect(page.getByTestId("new-workspace-import-session")).toHaveCount(0);
  const composer = composerLocator(page);
  await composer.fill("Retain this new-chat draft.");
  const panel = await openCommandCenter(page);
  await panel.getByTestId("command-center-input").fill("import");
  await panel.getByText("Import session", { exact: true }).click();
  await expect(page.getByTestId("import-session-sheet")).toBeVisible();
  await flow.close();
  await expect(composer).toHaveValue("Retain this new-chat draft.");
  await expect(page.getByTestId("workspace-tabs-row").filter({ visible: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("upstream-import-wide.png") });
  await page.setViewportSize({ width: 700, height: 782 });
  await expect(page.getByTestId("new-workspace-import-session")).toBeInViewport();
  await flow.openFromNewWorkspace();
  await page
    .getByTestId("import-session-sheet")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(page.getByTestId("import-session-sheet")).not.toBeVisible();
  await expect(composer).toHaveValue("Retain this new-chat draft.");
});
