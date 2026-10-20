import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  HANDOFF_FROM_AGENT_ID_LABEL,
  PARENT_AGENT_ID_LABEL,
} from "@getpaseo/protocol/agent-labels";
import { afterEach, beforeEach, expect, test } from "vitest";
import { BuiltinPluginLoader } from "./builtin/index.js";
import { DaemonClient } from "../test-utils/daemon-client.js";
import { createTestAgentClients } from "../test-utils/fake-agent-client.js";
import { createTestPaseoDaemon } from "../test-utils/paseo-daemon.js";

const BRIEFING = `## Task\nFinish the login fix.\n\n## Current state\n${"Tests pass. ".repeat(30)}`;

const cleanups: Array<() => Promise<void>> = [];
beforeEach(() => {
  process.env.PASEO_AUTO_HANDOFF_THRESHOLD_TOKENS = "1000";
});
afterEach(async () => {
  delete process.env.PASEO_AUTO_HANDOFF_THRESHOLD_TOKENS;
  for (const cleanup of cleanups.splice(0).toReversed()) await cleanup();
});

function helperUpsert(status: "running" | "completed") {
  return { type: "upsert" as const, id: "helper", status };
}

/**
 * Replies with `briefing` to briefing requests; "Use N context tokens" reports N tokens used. A
 * handoff child's first prompt reports 1200, past the test threshold, as a real briefing can.
 * "start a helper" and "helper finished" start and finish a background subagent.
 */
function scriptedTurns(briefing: string) {
  return (prompt: string) => {
    if (prompt.includes("<paseo_auto_handoff>")) return { text: briefing };
    const tokens = prompt.includes("written by the previous agent")
      ? "1200"
      : /^Use (\d+) context tokens/.exec(prompt)?.[1];
    if (!tokens) return undefined;
    const usage = { contextWindowUsedTokens: Number(tokens), contextWindowMaxTokens: 200_000 };
    if (prompt.includes("start a helper")) {
      return { text: "ok", usage, subagent: helperUpsert("running") };
    }
    if (prompt.includes("helper finished")) {
      return { text: "ok", usage, subagent: helperUpsert("completed") };
    }
    return { text: "ok", usage };
  };
}

async function startSourceAgent(briefing: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-auto-handoff-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const daemon = await createTestPaseoDaemon({
    agentClients: createTestAgentClients({ respond: scriptedTurns(briefing) }),
    builtinPlugins: new BuiltinPluginLoader(undefined, ["auto-handoff"]),
  });
  cleanups.push(() => daemon.close());
  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.11.2",
  });
  cleanups.push(() => client.close().catch(() => undefined));
  await client.connect();
  await client.fetchAgents({ subscribe: {} });
  const created = await client.createWorkspace({ source: { kind: "directory", path: directory } });
  const workspace = created.workspace!;
  const source = await client.createAgent({
    provider: "claude",
    model: "sonnet",
    cwd: directory,
    workspaceId: workspace.id,
    title: "Login fix",
    modeId: "default",
    featureValues: { test_feature: true },
  });
  return {
    client,
    source,
    workspace,
    async handoffs(from = source.id) {
      return (await client.fetchAgents()).entries
        .map((entry) => entry.agent)
        .filter((agent) => agent.labels[HANDOFF_FROM_AGENT_ID_LABEL] === from);
    },
    async briefingRequests(agentId = source.id) {
      const timeline = await client.fetchAgentTimeline(agentId, { projection: "projected" });
      return timeline.entries.filter(
        (entry) =>
          entry.item.type === "user_message" && entry.item.text.includes("<paseo_auto_handoff>"),
      );
    },
    async runTurn(text: string) {
      await client.sendMessage(source.id, text);
      await client.waitForFinish(source.id, 10_000);
    },
  };
}

test("a turn past the threshold hands the work to a new root agent once", async () => {
  const { client, source, workspace, handoffs, briefingRequests, runTurn } =
    await startSourceAgent(BRIEFING);

  await runTurn("Use 500 context tokens to fix the login bug");
  await client.sendMessage(source.id, "Use 1500 context tokens to fix the login bug");
  await expect.poll(async () => (await handoffs()).length, { timeout: 10_000 }).toBe(1);

  const [child] = await handoffs();
  expect(child).toMatchObject({
    provider: "claude",
    model: "sonnet",
    workspaceId: workspace.id,
    title: "[Handoff 1] Login fix",
  });
  expect(child!.features).toContainEqual(
    expect.objectContaining({ id: "test_feature", value: true }),
  );
  expect(child!.labels[PARENT_AGENT_ID_LABEL]).toBeUndefined();
  const [request] = await briefingRequests();
  expect(request!.item).toMatchObject({
    text: expect.stringContaining('"""\nUse 1500 context tokens to fix the login bug\n"""'),
  });
  const firstPrompt = async () =>
    (await client.fetchAgentTimeline(child!.id, { projection: "projected" })).entries.find(
      (entry) => entry.item.type === "user_message",
    )?.item;
  await expect.poll(firstPrompt, { timeout: 10_000 }).toMatchObject({
    text: expect.stringMatching(/^## Task\nFinish the login fix\.[\s\S]*reached 1500 tokens\./),
  });

  // Still past the threshold: the source is latched. A request sent after either turn would
  // land before the next turn ends, so two turns settle the check.
  await runTurn("Use 1600 context tokens to keep going");
  await runTurn("Use 1700 context tokens to keep going");
  expect(await briefingRequests()).toHaveLength(1);
  expect(await handoffs()).toHaveLength(1);

  // The child's first turn read a briefing already past the threshold; only later work counts.
  await client.waitForFinish(child!.id, 10_000);
  await client.sendMessage(child!.id, "Use 1800 context tokens to finish");
  await expect.poll(async () => (await handoffs(child!.id)).length, { timeout: 10_000 }).toBe(1);
  const [grandchild] = await handoffs(child!.id);
  expect(grandchild!.title).toBe("[Handoff 2] Login fix");
  const childRequests = (
    await client.fetchAgentTimeline(child!.id, { projection: "projected" })
  ).entries.filter(
    (entry) =>
      entry.item.type === "user_message" && entry.item.text.includes("<paseo_auto_handoff>"),
  );
  expect(childRequests).toHaveLength(1);
}, 60_000);

test("a running background subagent defers the handoff until it finishes", async () => {
  const { client, source, handoffs, briefingRequests, runTurn } = await startSourceAgent(BRIEFING);

  await runTurn("Use 1500 context tokens and start a helper");
  await runTurn("Use 1600 context tokens while it works");
  await runTurn("Use 1700 context tokens while it works");
  expect(await briefingRequests()).toHaveLength(0);

  await client.sendMessage(source.id, "Use 1800 context tokens now the helper finished");
  await expect.poll(async () => (await handoffs()).length, { timeout: 10_000 }).toBe(1);
}, 60_000);

test("a running Paseo subagent defers its parent's handoff, and never hands off itself", async () => {
  const { client, source, workspace, handoffs, briefingRequests, runTurn } =
    await startSourceAgent(BRIEFING);
  const child = await client.createAgent({
    provider: "claude",
    model: "sonnet",
    cwd: source.cwd,
    workspaceId: workspace.id,
    title: "Reviewer",
    modeId: "default",
    labels: { [PARENT_AGENT_ID_LABEL]: source.id },
  });
  // The read waits for approval, so the child stays running until the test answers.
  await client.sendMessage(child.id, "read /etc/hosts");
  const waiting = await client.waitForFinish(child.id, 10_000);
  expect(waiting.status).toBe("permission");

  await runTurn("Use 1500 context tokens while the reviewer works");
  await runTurn("Use 1600 context tokens while the reviewer works");
  await runTurn("Use 1700 context tokens while the reviewer works");
  expect(await briefingRequests()).toHaveLength(0);

  await client.respondToPermission(child.id, waiting.final!.pendingPermissions[0]!.id, {
    behavior: "allow",
  });
  await client.waitForFinish(child.id, 10_000);
  for (const tokens of [1800, 1900, 2000]) {
    await client.sendMessage(child.id, `Use ${tokens} context tokens to review`);
    await client.waitForFinish(child.id, 10_000);
  }
  expect(await briefingRequests(child.id)).toHaveLength(0);

  await client.sendMessage(source.id, "Use 2100 context tokens now the review is in");
  await expect.poll(async () => (await handoffs()).length, { timeout: 10_000 }).toBe(1);
}, 60_000);

test("a reply that is not a briefing is retried once, then the source gives up", async () => {
  const { client, source, handoffs, briefingRequests, runTurn } =
    await startSourceAgent("Sure, will do.");

  await client.sendMessage(source.id, "Use 1500 context tokens to fix the login bug");
  await expect.poll(async () => (await briefingRequests()).length, { timeout: 10_000 }).toBe(2);
  const [, retry] = await briefingRequests();
  expect(retry!.item).toMatchObject({
    text: expect.stringContaining("Reply with the briefing only."),
  });

  await client.waitForFinish(source.id, 10_000);
  await runTurn("Use 1600 context tokens to keep going");
  await runTurn("Use 1700 context tokens to keep going");
  expect(await briefingRequests()).toHaveLength(2);
  expect(await handoffs()).toHaveLength(0);
}, 60_000);
