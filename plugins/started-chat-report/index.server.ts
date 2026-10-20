import type {
  PluginHandlerContext,
  PluginLifecycleEvents,
  PluginServerContext,
} from "@getpaseo/plugin/server";
import {
  answersPluginNote,
  finalReplyText,
  reportMessage,
  type StartedChatReport,
} from "./server/report.js";

// Matches STARTED_FROM_AGENT_ID_LABEL in packages/app/src/chat-proposals/proposal.ts, which sets
// it when the user starts a proposed chat.
const STARTED_FROM_LABEL = "codex-ui.started-from-agent-id";
// Matches HANDOFF_FROM_AGENT_ID_LABEL in @getpaseo/protocol/agent-labels; the bundle cannot
// import protocol. Auto handoff sets it on the chat that continues another.
const HANDOFF_FROM_LABEL = "paseo.handoff-from-agent-id";

// Built-in plugins ship without node_modules, so every type comes from the host SDK.
type PaseoApi = PluginHandlerContext["paseo"];
type PaseoAgentHandle = ReturnType<PaseoApi["agents"]["ref"]>;
type TurnEnded = PluginLifecycleEvents["agent.turn_ended"];
type AgentSnapshot = NonNullable<ReturnType<PaseoAgentHandle["current"]>>;

interface SourceInbox {
  /** The latest report of each started chat, by chat ID. */
  reports: Map<string, StartedChatReport>;
  /** A note went out and the turn it started has not ended yet. */
  awaitingTurnEnd: boolean;
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event: `started-chat-report.${event}`, ...fields }));
}

async function snapshotOf(paseo: PaseoApi, agentId: string): Promise<AgentSnapshot | null> {
  const agent = paseo.agents.ref(agentId);
  await agent.refresh();
  return agent.current();
}

/**
 * The source a chat reports to. A chat that auto handoff started carries no started-from label, so
 * the label is read from the earliest chat of its handoff chain, as the Mac sidebar does.
 */
async function startedFrom(paseo: PaseoApi, chat: AgentSnapshot): Promise<string | null> {
  const seen = new Set<string>();
  let current: AgentSnapshot | null = chat;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const sourceId = current.labels[STARTED_FROM_LABEL];
    if (sourceId) return sourceId === chat.id ? null : sourceId;
    const previous: string | undefined = current.labels[HANDOFF_FROM_LABEL];
    current = previous ? await snapshotOf(paseo, previous) : null;
  }
  return null;
}

/** The newest live chat of `agentId`'s handoff chain, which is where its user now works. */
async function newestChat(paseo: PaseoApi, agentId: string): Promise<string> {
  const seen = new Set([agentId]);
  let newest = agentId;
  for (let current = agentId; ; ) {
    const { entries } = await paseo.agents.list({
      filter: { labels: { [HANDOFF_FROM_LABEL]: current }, includeArchived: true },
      sort: [{ key: "created_at", direction: "desc" }],
      page: { limit: 1 },
    });
    const next = entries[0]?.agent;
    if (!next || seen.has(next.id)) return newest;
    seen.add(next.id);
    if (!next.archivedAt) newest = next.id;
    current = next.id;
  }
}

export default function contribute(server: PluginServerContext) {
  // Lives in memory: reports still waiting when the daemon stops are dropped.
  const inboxes = new Map<string, SourceInbox>();
  // Turn ends run one at a time, so two reports never race for the same idle source.
  let queue = Promise.resolve();

  function inboxOf(sourceId: string): SourceInbox {
    const inbox = inboxes.get(sourceId) ?? { reports: new Map(), awaitingTurnEnd: false };
    inboxes.set(sourceId, inbox);
    return inbox;
  }

  async function deliver(paseo: PaseoApi, sourceId: string): Promise<void> {
    const inbox = inboxes.get(sourceId);
    if (!inbox || inbox.awaitingTurnEnd || inbox.reports.size === 0) return;
    // The source handed off since its reports were queued: they follow it to the new chat.
    const newest = await newestChat(paseo, sourceId);
    if (newest !== sourceId) {
      inboxes.delete(sourceId);
      const target = inboxOf(newest);
      for (const [chatId, report] of inbox.reports) target.reports.set(chatId, report);
      await deliver(paseo, newest);
      return;
    }
    const source = paseo.agents.ref(sourceId);
    await source.refresh();
    const snapshot = source.current();
    if (!snapshot || snapshot.archivedAt) {
      inboxes.delete(sourceId);
      return;
    }
    // A send interrupts a running turn. A busy source gets its reports when its own turn ends.
    const busy =
      snapshot.status === "running" ||
      snapshot.status === "initializing" ||
      snapshot.pendingPermissions.length > 0;
    if (busy) return;
    const chats = [...inbox.reports.keys()];
    await source.send(reportMessage([...inbox.reports.values()]));
    inbox.reports.clear();
    inbox.awaitingTurnEnd = true;
    log("sent", { source: sourceId, chats });
  }

  async function onTurnEnded(event: TurnEnded, paseo: PaseoApi): Promise<void> {
    const ownInbox = inboxes.get(event.agent.id);
    if (ownInbox) ownInbox.awaitingTurnEnd = false;
    // The user stopped this turn: the chat reports nothing, and reports for it wait.
    if (event.outcome.kind === "canceled") return;
    await deliver(paseo, event.agent.id);

    // A turn that answered a report or a briefing request stays local, so the source's reply never
    // flows back and a chain of chats never cascades turns upward.
    if (answersPluginNote(event.timeline)) return;
    const snapshot = await snapshotOf(paseo, event.agent.id);
    const sourceId = snapshot && (await startedFrom(paseo, snapshot));
    if (!snapshot || !sourceId) return;
    const reply =
      finalReplyText(event.timeline) ||
      (event.outcome.kind === "failed" ? event.outcome.error.message : "");
    inboxOf(sourceId).reports.set(snapshot.id, {
      chatId: snapshot.id,
      title: snapshot.title ?? event.agent.title ?? "",
      outcome: event.outcome.kind,
      reply,
    });
    await deliver(paseo, sourceId);
  }

  const offTurnEnded = server.on("agent.turn_ended", (event, { paseo }) => {
    const run = queue.then(() => onTurnEnded(event, paseo));
    queue = run.catch(() => undefined);
    return run;
  });

  const offArchived = server.on("agent.archived", ({ agent }) => {
    inboxes.delete(agent.id);
  });

  return () => {
    offTurnEnded();
    offArchived();
  };
}
