import { test, expect } from "../../app/e2e/support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { composerLocator } from "../../app/e2e/support/helpers/composer";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDaemonWebSocketGate } from "../../app/e2e/support/helpers/daemon-websocket-gate";
import { installDesktopRuntime } from "./support/runtime";

for (const action of ["allow-session", "allow-once", "deny-once"] as const) {
  test(`macOS docks tool approval and preserves the draft for ${action}`, async ({
    page,
  }, testInfo) => {
    const fixture = await seedMockAgentWorkspace({
      repoPrefix: "permission-reference-",
      title: "Tool approval",
    });
    try {
      const gate = await installDaemonWebSocketGate(page);
      await installDesktopRuntime(page, {
        serverId: getServerId(),
        manageBuiltInDaemon: false,
        daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
      });
      await page.setViewportSize({ width: 1352, height: 782 });
      await page.emulateMedia({ colorScheme: "dark" });
      await openAgentRoute(page, fixture);
      const composer = composerLocator(page);
      await composer.fill("Keep this unsent draft while approval is pending.");
      const originalInput = await composer.elementHandle();
      if (!originalInput) throw new Error("Missing composer");
      await fixture.client.sendAgentMessage(fixture.agentId, "Emit synthetic tool permission.");
      const dock = page.getByTestId("desktop-permission-dock");
      const card = dock.getByTestId("permission-request-card");
      await expect(card).toBeVisible();
      await expect(page.getByTestId("permission-request-question")).toHaveCount(1);
      await expect(page.getByTestId("desktop-waiting-for-approval")).toBeVisible();
      await expect(composer).toHaveCount(0);
      expect(await originalInput.evaluate((node) => node.isConnected)).toBe(true);
      await expect(card).toHaveCSS("border-radius", "20px");
      await expect(card).toHaveCSS("background-color", "rgb(38, 38, 38)");
      await expect(card.getByTestId("shell-output-horizontal-scroll")).toContainText(
        "/bin/echo permission-fixture",
      );
      const once = card.getByRole("button", { name: "Allow once", exact: true });
      const session = card.getByRole("button", { name: "Allow for session", exact: true });
      const deny = card.getByRole("button", { name: "Deny", exact: true });
      const boxes = await Promise.all([session, deny, once].map((button) => button.boundingBox()));
      expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
      expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);
      await expect(once).toHaveCSS("background-color", "rgb(240, 239, 236)");
      await page.getByTestId("desktop-chat-title").click();
      await page.keyboard.press("Enter");
      expect(gate.getClientRequestCount("agent_permission_response")).toBe(0);
      if (action === "allow-session") {
        await page.screenshot({ path: testInfo.outputPath("permission-pending.png") });
      }
      gate.holdNextClientRequest("agent_permission_response");
      if (action === "allow-session") await session.click();
      else {
        await card.focus();
        await page.keyboard.press(action === "allow-once" ? "Enter" : "Escape");
      }
      await gate.waitForHeldClientRequest();
      await expect(once).toBeDisabled();
      await expect(deny).toBeDisabled();
      await expect(session).toBeDisabled();
      await card.focus();
      await page.keyboard.press("Enter");
      expect(gate.getClientRequestCount("agent_permission_response")).toBe(1);
      expect(gate.getClientRequests("agent_permission_response")[0]).toMatchObject({
        agentId: fixture.agentId,
        response: { selectedActionId: action, behavior: action === "deny-once" ? "deny" : "allow" },
      });
      gate.releaseHeldClientRequest();
      await expect(dock).toHaveCount(0);
      await expect(composer).toHaveValue("Keep this unsent draft while approval is pending.");
      expect(await originalInput.evaluate((node) => node.isConnected)).toBe(true);
      await expect(page.getByTestId("desktop-waiting-for-approval")).toHaveCount(0);
    } finally {
      await fixture.cleanup();
    }
  });
}

test("macOS plan approval keeps its composer available for steering", async ({ page }) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "permission-plan-",
    title: "Plan approval",
  });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await openAgentRoute(page, fixture);
    const composer = composerLocator(page);
    await composer.fill("Retain this plan feedback draft.");
    await fixture.client.sendAgentMessage(fixture.agentId, "Emit synthetic plan approval.");
    const plan = page.getByTestId("permission-plan-card");
    await expect(plan).toBeVisible();
    await expect(page.getByTestId("desktop-permission-dock")).toHaveCount(0);
    await expect(composer).toHaveValue("Retain this plan feedback draft.");
    await expect(composer).toBeEditable();
    await plan.getByTestId("permission-request-accept").click();
    await expect(plan).toHaveCount(0);
    await expect(composer).toHaveValue("Retain this plan feedback draft.");
  } finally {
    await fixture.cleanup();
  }
});

test("macOS tool approval remains usable after narrowing the window", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "permission-narrow-",
    title: "Tool approval",
  });
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await page.setViewportSize({ width: 1352, height: 782 });
    await openAgentRoute(page, fixture);
    const composer = composerLocator(page);
    await composer.fill("Keep the draft across window resizing.");
    await fixture.client.sendAgentMessage(fixture.agentId, "Emit synthetic tool permission.");
    const dock = page.getByTestId("desktop-permission-dock");
    const card = dock.getByTestId("permission-request-card");
    await expect(card).toBeVisible();
    await page.setViewportSize({ width: 700, height: 782 });
    await expect
      .poll(async () => {
        const cardBox = await card.boundingBox();
        if (!cardBox) return false;
        const buttons = await Promise.all(
          ["Allow for session", "Deny", "Allow once"].map((name) =>
            card.getByRole("button", { name, exact: true }).boundingBox(),
          ),
        );
        return buttons.every(
          (bounds) =>
            bounds &&
            bounds.x >= cardBox.x &&
            bounds.x + bounds.width <= cardBox.x + cardBox.width + 1,
        );
      })
      .toBe(true);
    await page.screenshot({ path: testInfo.outputPath("permission-narrow.png") });
    await card.getByRole("button", { name: "Deny", exact: true }).click();
    await expect(dock).toHaveCount(0);
    await expect(composer).toHaveValue("Keep the draft across window resizing.");
  } finally {
    await fixture.cleanup();
  }
});
