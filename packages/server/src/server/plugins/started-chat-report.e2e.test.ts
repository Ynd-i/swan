import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { HANDOFF_FROM_AGENT_ID_LABEL } from "@getpaseo/protocol/agent-labels";
import { afterEach, expect, test } from "vitest";
import { BuiltinPluginLoader } from "./builtin/index.js";
import { DaemonClient } from "../test-utils/daemon-client.js";
import { createTestAgentClients } from "../test-utils/fake-agent-client.js";
import { createTestPaseoDaemon } from "../test-utils/paseo-daemon.js";

// The app sets this label when the user starts a proposed chat (chat-proposals/proposal.ts).
const STARTED_FROM_LABEL = "codex-ui.started-from-agent-id";
const REPORT_OPEN = "<paseo_started_chat_report>";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) await cleanup();
});

async function startDaemon() {
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-started-chat-report-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const daemon = await createTestPaseoDaemon({
    agentClients: createTestAgentClients(),
    builtinPlugins: new BuiltinPluginLoader(undefined, ["started-chat-report"]),
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
  const workspaceId = created.workspace!.id;

  function createChat(input: {
    title: string;
    startedFrom?: string;
    handoffFrom?: string;
    prompt?: string;
  }) {
    return client.createAgent({
      provider: "claude",
      model: "sonnet",
      cwd: directory,
      workspaceId,
      title: input.title,
      modeId: "default",
      labels: {
        ...(input.startedFrom ? { [STARTED_FROM_LABEL]: input.startedFrom } : {}),
        ...(input.handoffFrom ? { [HANDOFF_FROM_AGENT_ID_LABEL]: input.handoffFrom } : {}),
      },
      ...(input.prompt
        ? { initialPrompt: input.prompt, clientMessageId: crypto.randomUUID() }
        : {}),
    });
  }

  async function timeline(agentId: string) {
    return (await client.fetchAgentTimeline(agentId, { projection: "projected" })).entries.map(
      (entry) => entry.item,
    );
  }

  async function reports(agentId: string) {
    return (await timeline(agentId)).filter(
      (item) => item.type === "user_message" && item.text.includes(REPORT_OPEN),
    );
  }

  /**
   * The plugin handles turn ends one at a time, in order. A report reaching a fresh idle source
   * proves it already handled every turn that ended before this call.
   */
  async function settled() {
    const sentinel = await createChat({ title: "Sentinel" });
    await createChat({
      title: "Sentinel child",
      startedFrom: sentinel.id,
      prompt: "Respond with exactly: settled",
    });
    await expect.poll(async () => (await reports(sentinel.id)).length).toBe(1);
  }

  return { client, createChat, timeline, reports, settled };
}

test("a started chat's turn end reaches its source, and nothing flows back", async () => {
  const { client, createChat, reports, settled } = await startDaemon();
  const source = await createChat({ title: "Login work" });
  const started = await createChat({
    title: "Fix login",
    startedFrom: source.id,
    prompt: "Respond with exactly: Login fixed",
  });

  await expect.poll(async () => (await reports(source.id)).length, { timeout: 10_000 }).toBe(1);
  const [note] = await reports(source.id);
  expect(note).toMatchObject({
    text: expect.stringContaining(
      `<chat>${started.id}</chat>\n<title>Fix login</title>\n<outcome>completed</outcome>\n<reply>\nLogin fixed\n</reply>`,
    ),
  });

  // The source answered the note; that turn end must not report to the started chat.
  await client.waitForFinish(source.id, 10_000);
  await settled();
  expect(await reports(started.id)).toHaveLength(0);
  expect(await reports(source.id)).toHaveLength(1);
}, 60_000);

test("a busy source gets the report after its turn ends instead of being interrupted", async () => {
  const { client, createChat, timeline, reports, settled } = await startDaemon();
  const source = await createChat({ title: "Login work" });
  await client.sendMessage(source.id, "Run echo hello");
  const waiting = await client.waitForAgentUpsert(
    source.id,
    (agent) => agent.pendingPermissions.length > 0,
    10_000,
  );

  const started = await createChat({
    title: "Fix login",
    startedFrom: source.id,
    prompt: "Respond with exactly: Login fixed",
  });
  await client.waitForFinish(started.id, 10_000);
  await settled();
  expect(await reports(source.id)).toHaveLength(0);

  await client.respondToPermission(source.id, waiting.pendingPermissions[0]!.id, {
    behavior: "allow",
  });
  await expect.poll(async () => (await reports(source.id)).length, { timeout: 10_000 }).toBe(1);
  const items = await timeline(source.id);
  const tool = items.findIndex((item) => item.type === "tool_call" && item.name === "Bash");
  const note = items.findIndex(
    (item) => item.type === "user_message" && item.text.includes(REPORT_OPEN),
  );
  expect(items[tool]).toMatchObject({ status: "completed" });
  expect(note).toBeGreaterThan(tool);
}, 60_000);

test("a turn that answered a report is not reported up the chain", async () => {
  const { client, createChat, reports, settled } = await startDaemon();
  const root = await createChat({ title: "Root" });
  const middle = await createChat({
    title: "Middle",
    startedFrom: root.id,
    prompt: "Respond with exactly: Middle ready",
  });
  await expect.poll(async () => (await reports(root.id)).length, { timeout: 10_000 }).toBe(1);
  await client.waitForFinish(root.id, 10_000);

  await createChat({
    title: "Leaf",
    startedFrom: middle.id,
    prompt: "Respond with exactly: Leaf done",
  });
  await expect.poll(async () => (await reports(middle.id)).length, { timeout: 10_000 }).toBe(1);
  await client.waitForFinish(middle.id, 10_000);
  await settled();
  expect(await reports(root.id)).toHaveLength(1);
}, 60_000);

test("reports follow handoff chains on both sides and skip briefing turns", async () => {
  const { client, createChat, reports, settled } = await startDaemon();
  // Chats with the handoff label stand in for the ones auto handoff starts.
  const source = await createChat({ title: "Login work" });
  const continued = await createChat({ title: "[Handoff 1] Login work", handoffFrom: source.id });
  const started = await createChat({
    title: "Fix login",
    startedFrom: source.id,
    prompt: "Respond with exactly: First half",
  });
  await expect.poll(async () => (await reports(continued.id)).length, { timeout: 10_000 }).toBe(1);
  await client.waitForFinish(continued.id, 10_000);

  const startedNext = await createChat({
    title: "[Handoff 1] Fix login",
    handoffFrom: started.id,
    prompt: "Respond with exactly: Second half",
  });
  await expect.poll(async () => (await reports(continued.id)).length, { timeout: 10_000 }).toBe(2);
  const [, note] = await reports(continued.id);
  expect(note).toMatchObject({ text: expect.stringContaining(`<chat>${startedNext.id}</chat>`) });
  await client.waitForFinish(continued.id, 10_000);

  await client.sendMessage(
    startedNext.id,
    "<paseo_auto_handoff>\nReply with ONLY a handoff briefing.\n</paseo_auto_handoff>",
  );
  await client.waitForFinish(startedNext.id, 10_000);
  await settled();
  expect(await reports(continued.id)).toHaveLength(2);
  expect(await reports(source.id)).toHaveLength(0);
}, 60_000);
