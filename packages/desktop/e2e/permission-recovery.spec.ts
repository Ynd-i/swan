import { expect, test } from "../../app/e2e/support/fixtures";
import { composerLocator } from "../../app/e2e/support/helpers/composer";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDaemonWebSocketGate } from "../../app/e2e/support/helpers/daemon-websocket-gate";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { installDesktopRuntime } from "./support/runtime";

test("macOS tool approval recovers from a dropped daemon connection and retries manually", async ({
  page,
}) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "permission-recovery-",
    title: "Permission recovery",
  });
  const gate = await installDaemonWebSocketGate(page);
  try {
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await openAgentRoute(page, fixture);
    await fixture.client.sendAgentMessage(fixture.agentId, "Emit synthetic tool permission.");

    const dock = page.getByTestId("desktop-permission-dock");
    const allowOnce = dock.getByRole("button", { name: "Allow once", exact: true });
    await expect(allowOnce).toBeVisible();
    const fetchAgentsBeforeDrop = gate.getClientRequestCount("fetch_agents_request");

    await gate.drop();
    await gate.waitForBlockedConnection();
    await allowOnce.click();
    await expect(page.getByText(/^Couldn't respond:/)).toBeVisible();
    await expect(allowOnce).toBeEnabled();
    expect(gate.getClientRequestCount("agent_permission_response")).toBe(0);

    gate.restore();
    await expect
      .poll(() => gate.getClientRequestCount("fetch_agents_request"), { timeout: 10_000 })
      .toBeGreaterThan(fetchAgentsBeforeDrop);
    await allowOnce.click();
    await expect.poll(() => gate.getClientRequestCount("agent_permission_response")).toBe(1);
    expect(gate.getClientRequests("agent_permission_response")[0]).toMatchObject({
      agentId: fixture.agentId,
      response: { selectedActionId: "allow-once", behavior: "allow" },
    });
    await expect(dock).toHaveCount(0);
  } finally {
    gate.restore();
    await fixture.cleanup();
  }
});

test("Windows keeps tool approval inline and leaves the composer usable", async ({ page }) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "permission-inline-",
    title: "Inline permission",
  });
  try {
    const gate = await installDaemonWebSocketGate(page);
    await installDesktopRuntime(page, {
      serverId: getServerId(),
      platform: "win32",
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await openAgentRoute(page, fixture);
    const composer = composerLocator(page);
    await composer.fill("Keep composing while this approval is visible.");
    await fixture.client.sendAgentMessage(fixture.agentId, "Emit synthetic tool permission.");

    await expect(page.getByText("Shell access", { exact: true })).toBeVisible();
    await expect(page.getByTestId("desktop-permission-dock")).toHaveCount(0);
    await expect(composer).toHaveValue("Keep composing while this approval is visible.");
    await expect(composer).toBeEditable();

    await page.getByRole("button", { name: "Allow once", exact: true }).click();
    await expect.poll(() => gate.getClientRequestCount("agent_permission_response")).toBe(1);
    expect(gate.getClientRequests("agent_permission_response")[0]).toMatchObject({
      agentId: fixture.agentId,
      response: { selectedActionId: "allow-once", behavior: "allow" },
    });
    await expect(composer).toHaveValue("Keep composing while this approval is visible.");
    await expect(composer).toBeEditable();
  } finally {
    await fixture.cleanup();
  }
});
