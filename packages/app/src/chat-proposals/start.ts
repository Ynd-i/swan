import type {
  CreateAgentRequestOptions,
  DaemonClient,
} from "@getpaseo/client/internal/daemon-client";
import type { AgentModelDefinition, AgentSelectOption } from "@getpaseo/protocol/agent-types";
import { buildWorkspaceDraftAgentConfig } from "@/screens/workspace/workspace-draft-agent-config";
import type { Agent } from "@/stores/session-store";
import { generateMessageId } from "@/types/stream";
import {
  proposalKey,
  STARTED_FROM_AGENT_ID_LABEL,
  STARTED_FROM_PROPOSAL_LABEL,
  startedChatPrompt,
  type ChatProposal,
} from "./proposal";

type ProposalSource = Pick<
  Agent,
  | "id"
  | "provider"
  | "cwd"
  | "workspaceId"
  | "model"
  | "runtimeInfo"
  | "currentModeId"
  | "thinkingOptionId"
  | "features"
>;

export interface ProposalRuntimeChoice {
  model: string | undefined;
  thinkingOptionId: string | undefined;
}

/** The model and thinking a proposal asks for, resolved against its source provider's catalog. */
export type ProposalRuntime =
  | (ProposalRuntimeChoice & { kind: "ready"; labels: string[] })
  | { kind: "loading" }
  | { kind: "unknown-model" | "unknown-thinking"; requested: string };

function names(requested: string, ...candidates: (string | undefined)[]): boolean {
  const wanted = requested.toLowerCase();
  return candidates.some((candidate) => candidate?.toLowerCase() === wanted);
}

/**
 * Agents name models the way people do ("Opus 5.5"), so a model matches by ID, alias or label and
 * a thinking option by ID or label. A new model without a named thinking option runs at its own
 * default: the source's option may not exist on it. `models` is undefined while the catalog loads.
 */
export function resolveProposalRuntime(
  source: ProposalSource,
  proposal: ChatProposal,
  models: AgentModelDefinition[] | undefined,
): ProposalRuntime {
  const sourceModel = source.model ?? source.runtimeInfo?.model ?? undefined;
  const { model: requestedModel, thinking: requestedThinking } = proposal;
  if (!requestedModel && !requestedThinking) {
    const thinkingOptionId = source.thinkingOptionId ?? undefined;
    return { kind: "ready", model: sourceModel, thinkingOptionId, labels: [] };
  }
  if (!models) return { kind: "loading" };
  const labels: string[] = [];
  let model: AgentModelDefinition | undefined;
  if (requestedModel) {
    model = models.find((entry) =>
      names(requestedModel, entry.id, entry.label, ...(entry.aliases ?? [])),
    );
    if (!model) return { kind: "unknown-model", requested: requestedModel };
    labels.push(model.label);
  } else {
    model = models.find((entry) => entry.id === sourceModel);
  }
  if (!requestedThinking) {
    return { kind: "ready", model: model?.id ?? sourceModel, thinkingOptionId: undefined, labels };
  }
  const thinking = findThinking(model, requestedThinking);
  if (!thinking) return { kind: "unknown-thinking", requested: requestedThinking };
  labels.push(thinking.label);
  return { kind: "ready", model: model?.id ?? sourceModel, thinkingOptionId: thinking.id, labels };
}

/** A source model the catalog lacks has no options to check against, so the name passes as is. */
function findThinking(
  model: AgentModelDefinition | undefined,
  requested: string,
): AgentSelectOption | undefined {
  if (!model) return { id: requested, label: requested };
  return model.thinkingOptions?.find((option) => names(requested, option.id, option.label));
}

/** The chat runs where its source runs, with its provider, mode and features. */
export function buildProposedChatRequest(
  source: ProposalSource,
  proposal: ChatProposal,
  runtime: ProposalRuntimeChoice,
  clientMessageId: string,
): CreateAgentRequestOptions {
  const featureValues = source.features?.length
    ? Object.fromEntries(source.features.map((feature) => [feature.id, feature.value]))
    : undefined;
  return {
    config: {
      ...buildWorkspaceDraftAgentConfig({
        provider: source.provider,
        cwd: source.cwd,
        modeId: source.currentModeId ?? undefined,
        model: runtime.model,
        thinkingOptionId: runtime.thinkingOptionId,
        featureValues,
      }),
      title: proposal.title,
    },
    ...(source.workspaceId ? { workspaceId: source.workspaceId } : {}),
    initialPrompt: startedChatPrompt(proposal),
    // The daemon records a first prompt in the timeline only when it carries a message ID.
    clientMessageId,
    labels: {
      [STARTED_FROM_AGENT_ID_LABEL]: source.id,
      [STARTED_FROM_PROPOSAL_LABEL]: proposalKey(source.id, proposal),
    },
  };
}

export async function startProposedChat(
  client: DaemonClient,
  source: ProposalSource,
  proposal: ChatProposal,
  runtime: ProposalRuntimeChoice,
): Promise<string> {
  const agent = await client.createAgent(
    buildProposedChatRequest(source, proposal, runtime, generateMessageId()),
  );
  return agent.id;
}
