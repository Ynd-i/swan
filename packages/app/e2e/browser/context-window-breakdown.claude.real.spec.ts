import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "../support/fixtures";
import {
  cleanupRewindFlow,
  launchAgent,
  sendMessage,
  type AgentHandle,
} from "../support/helpers/rewind-flow";

test.describe("real Claude context window breakdown", () => {
  test.setTimeout(180_000);

  test("lists what fills the window once the turn ends", async ({ page }, testInfo) => {
    const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "paseo-context-breakdown-")));
    let handle: AgentHandle | undefined;

    try {
      handle = await launchAgent({
        page,
        provider: "claude",
        cwd,
        mode: "full-access",
        providerConfig: { model: "claude-haiku-4-5" },
      });
      await sendMessage(handle, "Reply with exactly CONTEXT_BREAKDOWN_DONE.");

      await page.getByTestId("context-window-meter").hover();
      const tooltip = page.getByTestId("context-window-meter-tooltip");
      // Claude's own categories, then the autocompact buffer and the free space.
      await expect
        .poll(() => tooltip.getByTestId("context-window-meter-row").count(), { timeout: 30_000 })
        .toBeGreaterThan(3);
      await page.screenshot({ path: testInfo.outputPath("context-window-breakdown.png") });
    } finally {
      await cleanupRewindFlow({ handle, cwd });
    }
  });
});
