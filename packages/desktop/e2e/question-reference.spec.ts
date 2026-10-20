import { expect, test } from "../../app/e2e/support/fixtures";
import { composerLocator } from "../../app/e2e/support/helpers/composer";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDaemonWebSocketGate } from "../../app/e2e/support/helpers/daemon-websocket-gate";
import { seedMockAgentWorkspace, openAgentRoute } from "../../app/e2e/support/helpers/mock-agent";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { installDesktopRuntime } from "./support/runtime";

test("macOS question cards preserve drafts, require answers, and submit selected answers", async ({
  page,
}, testInfo) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "question-reference-",
    title: "Question reference",
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
    const draft = "Keep this unsent draft while answering questions.";
    await composer.fill(draft);
    await fixture.client.sendAgentMessage(fixture.agentId, "Emit synthetic questions.");

    const dock = page.getByTestId("desktop-permission-dock");
    const card = dock.getByTestId("question-form-card");
    const primary = card.getByTestId("question-form-primary-action");
    await expect(card).toBeVisible();
    await expect(composer).toHaveValue(draft);
    await expect(composer).toBeEditable();
    await expect(card.getByTestId("question-form-current-question")).toHaveText(
      "Which surface should this apply to?",
    );
    await expect(card.getByRole("radio", { name: "App", exact: true })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(card.getByRole("radio", { name: "Desktop", exact: true })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(primary).toBeDisabled();
    expect(gate.getClientRequestCount("agent_permission_response")).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("question-pending-wide.png") });

    await page.setViewportSize({ width: 700, height: 782 });
    await expect(card).toBeVisible();
    await expect(composer).toHaveValue(draft);
    await page.screenshot({ path: testInfo.outputPath("question-pending-narrow.png") });
    await page.setViewportSize({ width: 1352, height: 782 });

    await card.getByRole("radio", { name: "App", exact: true }).click();
    await expect(card.getByTestId("question-form-current-question")).toHaveText(
      "Which rollout should we use?",
    );
    await card.getByRole("radio", { name: "Behind feature flag", exact: true }).click();
    const successQuestion = "What success criteria should we use?";
    await expect(card.getByTestId("question-form-current-question")).toHaveText(successQuestion);
    const successInput = card.getByRole("textbox", { name: successQuestion });
    const answerField = card.getByTestId("question-form-other-input");
    await expect(answerField).toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
    await successInput.focus();
    await expect(answerField).toHaveCSS("border-color", "rgb(215, 185, 173)");
    const singleLineHeight = (await successInput.boundingBox())!.height;
    expect(singleLineHeight).toBeLessThanOrEqual(24);
    await successInput.fill("Line one\nLine two\nLine three");
    await expect
      .poll(async () => (await successInput.boundingBox())!.height)
      .toBeGreaterThan(singleLineHeight);
    await successInput.fill("No dropped user drafts.");
    await expect(primary).toBeEnabled();
    await successInput.press("Enter");
    await expect.poll(() => gate.getClientRequestCount("agent_permission_response")).toBe(1);
    expect(gate.getClientRequests("agent_permission_response")[0]).toMatchObject({
      agentId: fixture.agentId,
      response: {
        behavior: "allow",
        updatedInput: {
          answers: {
            surface: "App",
            rollout: "Behind feature flag",
            success: "No dropped user drafts.",
          },
        },
      },
    });
    await expect(card).toHaveCount(0);
    await expect(composer).toHaveValue(draft);
    await expect(composer).toBeEditable();

    await fixture.client.sendAgentMessage(
      fixture.agentId,
      "Emit synthetic questions: two free-write questions.",
    );
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("textbox", { name: "What is the GitHub private repo URL to push to?" }),
    ).toHaveValue("");
    await card.getByTestId("question-form-dismiss").click();
    await expect.poll(() => gate.getClientRequestCount("agent_permission_response")).toBe(2);
    expect(gate.getClientRequests("agent_permission_response")[1]).toMatchObject({
      agentId: fixture.agentId,
      response: { behavior: "deny", message: "Dismissed by user" },
    });
    await expect(card).toHaveCount(0);
    await expect(composer).toHaveValue(draft);
    await expect(composer).toBeEditable();

    await fixture.client.sendAgentMessage(
      fixture.agentId,
      "Emit synthetic questions: multi-select with free text.",
    );
    const checksQuestion = "Which checks should run?";
    await expect(card.getByTestId("question-form-current-question")).toHaveText(checksQuestion);
    const lint = card.getByRole("checkbox", { name: "Lint", exact: true });
    const uiRegression = card.getByRole("checkbox", { name: "UI regression", exact: true });
    await lint.click();
    await uiRegression.click();
    await expect(lint).toHaveAttribute("aria-checked", "true");
    await expect(uiRegression).toHaveAttribute("aria-checked", "true");
    await card.getByRole("textbox", { name: checksQuestion }).fill("Manual review");
    await primary.click();
    await expect.poll(() => gate.getClientRequestCount("agent_permission_response")).toBe(3);
    expect(gate.getClientRequests("agent_permission_response")[2]).toMatchObject({
      agentId: fixture.agentId,
      response: {
        behavior: "allow",
        updatedInput: { answers: { checks: "Lint, UI regression, Manual review" } },
      },
    });
    await expect(card).toHaveCount(0);

    await fixture.client.sendAgentMessage(
      fixture.agentId,
      "Emit synthetic question: single choice.",
    );
    const pathQuestion = "Which implementation path should we take?";
    await expect(card.getByTestId("question-form-current-question")).toHaveText(pathQuestion);
    await expect(card.getByTestId("question-form-question-nav")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("question-single-choice-pending.png") });
    const beforeScroll = (await card.boundingBox())!;
    const timeline = page.getByTestId("agent-chat-scroll").filter({ visible: true }).first();
    await expect.poll(() => timeline.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await page.mouse.move(beforeScroll.x + 100, 140);
    await page.mouse.wheel(0, -900);
    await expect.poll(() => timeline.evaluate((node) => node.scrollTop)).toBe(0);
    await expect.poll(async () => (await card.boundingBox())!.y).toBe(beforeScroll.y);
    await card.getByRole("radio", { name: "Use the existing component", exact: true }).click();
    await expect(primary).toBeEnabled();
    await primary.click();
    await expect.poll(() => gate.getClientRequestCount("agent_permission_response")).toBe(4);
    expect(gate.getClientRequests("agent_permission_response")[3]).toMatchObject({
      agentId: fixture.agentId,
      response: {
        behavior: "allow",
        updatedInput: { answers: { path: "Use the existing component" } },
      },
    });
    await expect(card).toHaveCount(0);
    await expect(composer).toHaveValue(draft);
    await expect(composer).toBeEditable();
  } finally {
    await fixture.cleanup();
  }
});

test("Windows questions remain inline with the existing form controls", async ({ page }) => {
  const fixture = await seedMockAgentWorkspace({
    repoPrefix: "question-inline-",
    title: "Inline question",
  });
  try {
    await installDesktopRuntime(page, {
      platform: "win32",
      serverId: getServerId(),
      manageBuiltInDaemon: false,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await openAgentRoute(page, fixture);
    await composerLocator(page).fill("Keep the Windows draft.");
    await fixture.client.sendAgentMessage(
      fixture.agentId,
      "Emit synthetic question: single choice.",
    );
    const card = page.getByTestId("question-form-card");
    await expect(card).toBeVisible();
    await expect(page.getByTestId("desktop-permission-dock")).toHaveCount(0);
    await expect(card).toHaveCSS("border-radius", "8px");
    await card.getByRole("radio", { name: "Use the existing component", exact: true }).click();
    await card.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(card).toHaveCount(0);
    await expect(composerLocator(page)).toHaveValue("Keep the Windows draft.");
  } finally {
    await fixture.cleanup();
  }
});
