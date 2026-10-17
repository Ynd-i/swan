import type { PaseoAgentHandle, PaseoApi } from "@getpaseo/client";
import type { PluginLifecycleEvents, PluginServerContext } from "@getpaseo/plugin/server";
import { autoHandoffSettings, type AutoHandoffSettings } from "./shared/settings.js";
import {
  briefingRequestPrompt,
  childPrompt,
  finalReplyText,
  handoffTitle,
  lastUserRequest,
  looksLikeBriefing,
  type BriefingRequest,
} from "./server/briefing.js";
import {
  afterFailedBriefing,
  applyEnvOverrides,
  shouldHandoff,
  type HandoffPhase,
} from "./server/policy.js";

// Match HANDOFF_FROM_AGENT_ID_LABEL and PARENT_AGENT_ID_LABEL in @getpaseo/protocol/agent-labels.
// The bundle imports protocol types only, so the values are repeated here; the e2e test covers
// both.
const HANDOFF_FROM_LABEL = "paseo.handoff-from-agent-id";
const PARENT_LABEL = "paseo.parent-agent-id";
/** How many handoffs led to this agent, so titles survive a rename. */
const GENERATION_LABEL = "auto-handoff.generation";

type TurnEnded = PluginLifecycleEvents["agent.turn_ended"];
type AgentSnapshot = NonNullable<ReturnType<PaseoAgentHandle["current"]>>;

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event: `auto-handoff.${event}`, ...fields }));
}

/** Starts the continuing agent beside its source. Returns null when no model can be named. */
async function spawnHandoff(input: {
  paseo: PaseoApi;
  event: TurnEnded;
  source: AgentSnapshot;
  briefing: string;
  usedTokens: number;
}): Promise<string | null> {
  const { paseo, event, source } = input;
  // An agent without a model runs on the provider default, so the child does too.
  const model =
    source.model ??
    source.runtimeInfo?.model ??
    (await paseo.providers.listModels(source.provider)).models?.find((m) => m.isDefault)?.id;
  if (!model) return null;
  const generation = (Number(source.labels[GENERATION_LABEL]) || 0) + 1;
  // Feature toggles such as Claude's fast mode are part of how the source ran.
  const featureValues = Object.fromEntries(
    (source.features ?? []).map((feature) => [feature.id, feature.value]),
  );
  const options = {
    // The snapshot carries generated titles; the hook agent only carries one set at creation.
    title: handoffTitle(source.title ?? event.agent.title, generation),
    config: {
      provider: `${source.provider}/${model}`,
      ...(source.currentModeId ? { modeId: source.currentModeId } : {}),
      ...(source.thinkingOptionId ? { thinkingOptionId: source.thinkingOptionId } : {}),
      featureValues,
    },
    prompt: childPrompt(input.briefing, input.usedTokens),
    // The daemon records a first prompt in the timeline only when it carries a message ID.
    clientMessageId: crypto.randomUUID(),
    labels: { [HANDOFF_FROM_LABEL]: source.id, [GENERATION_LABEL]: String(generation) },
  };
  // No parent: a subagent would leave the sidebar and be archived with its source.
  const child = event.agent.workspaceId
    ? await paseo.workspaces.ref(event.agent.workspaceId).agents.create(options)
    : await paseo.agents.create({ ...options, cwd: event.agent.cwd });
  return child.id;
}

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(autoHandoffSettings);
  const phases = new Map<string, HandoffPhase>();

  async function readSettings() {
    const state = await settings.read();
    const values = state.status === "ready" ? state.values : autoHandoffSettings.schema.parse({});
    return applyEnvOverrides(values, process.env);
  }

  async function requestBriefing(input: {
    agent: PaseoAgentHandle;
    attempt: number;
    request: BriefingRequest;
  }): Promise<void> {
    phases.set(input.agent.id, { kind: "requested", ...input });
    try {
      await input.agent.send(briefingRequestPrompt({ ...input.request, retry: input.attempt > 1 }));
    } catch (error) {
      phases.delete(input.agent.id);
      throw error;
    }
  }

  async function onWorkTurn(input: {
    event: TurnEnded;
    paseo: PaseoApi;
    agent: PaseoAgentHandle;
    config: AutoHandoffSettings;
  }) {
    const { event, paseo, agent, config } = input;
    const snapshot = agent.current()!;
    const decision = shouldHandoff({
      settings: config,
      outcome: event.outcome.kind,
      status: snapshot.status,
      pendingPermissions: snapshot.pendingPermissions.length,
      usage: snapshot.lastUsage ?? null,
      handoffChildFirstTurn:
        HANDOFF_FROM_LABEL in snapshot.labels &&
        event.timeline.filter((item) => item.type === "user_message").length <= 1,
      subagent: PARENT_LABEL in snapshot.labels,
    });
    if (!decision.ok) return;
    // Running subagents report to this agent's id, not to a continuation. A finish report starts a
    // turn here, and the check runs again when that turn ends.
    const subagents = await agent.subagents();
    if (subagents.some((subagent) => subagent.status === "running")) {
      log("deferred", { source: agent.id, reason: "subagents running" });
      return;
    }
    const children = await paseo.agents.list({
      filter: { labels: { [PARENT_LABEL]: agent.id }, statuses: ["initializing", "running"] },
      page: { limit: 1 },
    });
    if (children.entries.length > 0) {
      log("deferred", { source: agent.id, reason: "paseo subagents running" });
      return;
    }
    log("requested", { source: agent.id, used: decision.used, threshold: decision.threshold });
    const request = {
      used: decision.used,
      max: decision.max,
      threshold: decision.threshold,
      lastUserRequest: lastUserRequest(event.timeline),
    };
    await requestBriefing({ agent, attempt: 1, request });
  }

  async function onBriefingTurn(input: {
    event: TurnEnded;
    paseo: PaseoApi;
    agent: PaseoAgentHandle;
    phase: Extract<HandoffPhase, { kind: "requested" }>;
    config: AutoHandoffSettings;
  }) {
    const { event, agent, phase } = input;
    const snapshot = agent.current()!;
    // The user interrupted the briefing turn to keep working; ask again at the next clean turn end.
    if (event.outcome.kind === "canceled" || snapshot.status !== "idle") {
      phases.delete(agent.id);
      log("deferred", { source: agent.id, outcome: event.outcome.kind, status: snapshot.status });
      return;
    }
    const briefing = event.outcome.kind === "completed" ? finalReplyText(event.timeline) : "";
    if (!looksLikeBriefing(briefing)) {
      const next = afterFailedBriefing(phase, input.config.maxAttempts, "reply was not a briefing");
      if (next.kind === "failed") {
        phases.set(agent.id, next);
        log("failed", { source: agent.id, reason: next.reason });
        return;
      }
      log("retry", { source: agent.id, attempt: phase.attempt + 1 });
      await requestBriefing({ agent, attempt: phase.attempt + 1, request: phase.request });
      return;
    }
    const usedTokens = phase.request.used;
    const childId = await spawnHandoff({ ...input, source: snapshot, briefing, usedTokens });
    if (!childId) {
      phases.set(agent.id, { kind: "failed", reason: "source model unknown" });
      log("failed", { source: agent.id, reason: "source model unknown" });
      return;
    }
    phases.set(agent.id, { kind: "spawned", childId });
    log("spawned", { source: agent.id, child: childId, used: usedTokens });
  }

  const offTurnEnded = server.on("agent.turn_ended", async (event, { paseo }) => {
    const phase = phases.get(event.agent.id) ?? { kind: "idle" };
    if (phase.kind === "spawned" || phase.kind === "failed") return;
    const config = await readSettings();
    const agent = paseo.agents.ref(event.agent.id);
    await agent.refresh();
    if (!agent.current()) return;
    if (phase.kind === "idle") await onWorkTurn({ event, paseo, agent, config });
    else await onBriefingTurn({ event, paseo, agent, phase, config });
  });

  const offArchived = server.on("agent.archived", ({ agent }) => {
    phases.delete(agent.id);
  });

  return () => {
    offTurnEnded();
    offArchived();
  };
}
