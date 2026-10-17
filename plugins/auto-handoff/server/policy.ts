import type { AgentUsage } from "@getpaseo/protocol/agent-types";
import type { PluginTurnOutcome } from "@getpaseo/plugin/server";
import type { AutoHandoffSettings } from "../shared/settings.js";
import type { BriefingRequest } from "./briefing.js";

/** Per source agent. Lives in memory: `lastUsage` is lost on daemon restart too. */
export type HandoffPhase =
  | { kind: "idle" }
  | { kind: "requested"; attempt: number; request: BriefingRequest }
  | { kind: "spawned"; childId: string }
  | { kind: "failed"; reason: string };

export type HandoffDecision =
  | { ok: true; used: number; max: number | undefined; threshold: number }
  | { ok: false; reason: string };

export function effectiveThreshold(settings: AutoHandoffSettings, maxTokens?: number): number {
  if (!maxTokens) return settings.absoluteThresholdTokens;
  return Math.min(
    settings.absoluteThresholdTokens,
    Math.floor(maxTokens * settings.windowFraction),
  );
}

/** Environment variables win over stored settings, for tests and one-off hosts. */
export function applyEnvOverrides(
  settings: AutoHandoffSettings,
  env: NodeJS.ProcessEnv,
): AutoHandoffSettings {
  const threshold = Number(env.PASEO_AUTO_HANDOFF_THRESHOLD_TOKENS);
  const fraction = Number(env.PASEO_AUTO_HANDOFF_WINDOW_FRACTION);
  return {
    ...settings,
    ...(env.PASEO_AUTO_HANDOFF_ENABLED ? { enabled: env.PASEO_AUTO_HANDOFF_ENABLED === "1" } : {}),
    ...(threshold > 0 ? { absoluteThresholdTokens: threshold } : {}),
    ...(fraction > 0 && fraction < 1 ? { windowFraction: fraction } : {}),
  };
}

export function shouldHandoff(input: {
  settings: AutoHandoffSettings;
  outcome: PluginTurnOutcome["kind"];
  status: string | null;
  pendingPermissions: number;
  usage: AgentUsage | null;
  /**
   * A handoff child's first turn only reads the briefing. Handing off then would copy the same
   * context again, and a threshold under the briefing's size would chain handoffs forever.
   */
  handoffChildFirstTurn: boolean;
  /**
   * A Paseo subagent reports to its parent by its own id. A continuation would be a root chat
   * the parent never hears from.
   */
  subagent: boolean;
}): HandoffDecision {
  if (!input.settings.enabled) return { ok: false, reason: "disabled" };
  if (input.subagent) return { ok: false, reason: "subagent" };
  if (input.handoffChildFirstTurn) return { ok: false, reason: "handoff child's first turn" };
  if (input.outcome !== "completed") return { ok: false, reason: `turn ${input.outcome}` };
  if (input.status !== "idle") return { ok: false, reason: `agent ${input.status}` };
  if (input.pendingPermissions > 0) return { ok: false, reason: "permission pending" };
  const used = input.usage?.contextWindowUsedTokens;
  if (typeof used !== "number") return { ok: false, reason: "context usage unknown" };
  const max = input.usage?.contextWindowMaxTokens;
  const threshold = effectiveThreshold(input.settings, max);
  if (used < threshold) return { ok: false, reason: "below threshold" };
  return { ok: true, used, max, threshold };
}

/** The phase after a briefing turn that produced no usable briefing. */
export function afterFailedBriefing(
  phase: Extract<HandoffPhase, { kind: "requested" }>,
  maxAttempts: number,
  reason: string,
): HandoffPhase {
  if (phase.attempt >= maxAttempts) return { kind: "failed", reason };
  return { ...phase, attempt: phase.attempt + 1 };
}
