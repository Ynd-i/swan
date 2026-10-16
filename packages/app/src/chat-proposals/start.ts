import type {
  CreateAgentRequestOptions,
  DaemonClient,
} from "@getpaseo/client/internal/daemon-client";
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

/** The chat runs where its source runs, with the same provider, model, mode and features. */
export function buildProposedChatRequest(
  source: ProposalSource,
  proposal: ChatProposal,
  clientMessageId: string,
): CreateAgentRequestOptions {
  const model = source.model ?? source.runtimeInfo?.model ?? undefined;
  const featureValues = source.features?.length
    ? Object.fromEntries(source.features.map((feature) => [feature.id, feature.value]))
    : undefined;
  return {
    config: {
      ...buildWorkspaceDraftAgentConfig({
        provider: source.provider,
        cwd: source.cwd,
        modeId: source.currentModeId ?? undefined,
        model,
        thinkingOptionId: source.thinkingOptionId ?? undefined,
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
): Promise<string> {
  const agent = await client.createAgent(
    buildProposedChatRequest(source, proposal, generateMessageId()),
  );
  return agent.id;
}
