import { describe, expect, it } from "vitest";
import {
  parseStartedChatPrompt,
  proposalKey,
  STARTED_FROM_AGENT_ID_LABEL,
  STARTED_FROM_PROPOSAL_LABEL,
} from "./proposal";
import { buildProposedChatRequest } from "./start";

const proposal = { title: "Fix the gate", task: "Gate tools/list.", context: "Codex lists once." };

describe("buildProposedChatRequest", () => {
  it("starts the chat beside its source with the source's settings and a linking label", () => {
    const request = buildProposedChatRequest(
      {
        id: "source",
        provider: "codex",
        cwd: "/repo",
        workspaceId: "workspace-1",
        model: null,
        runtimeInfo: { provider: "codex", sessionId: null, model: "gpt-6" },
        currentModeId: "full-access",
        thinkingOptionId: "high",
        features: [{ type: "toggle", id: "fast", label: "Fast", value: true }],
      },
      proposal,
      "message-1",
    );
    expect(request).toEqual({
      config: {
        provider: "codex",
        cwd: "/repo",
        modeId: "full-access",
        model: "gpt-6",
        thinkingOptionId: "high",
        featureValues: { fast: true },
        title: "Fix the gate",
      },
      workspaceId: "workspace-1",
      initialPrompt: expect.any(String),
      clientMessageId: "message-1",
      labels: {
        [STARTED_FROM_AGENT_ID_LABEL]: "source",
        [STARTED_FROM_PROPOSAL_LABEL]: proposalKey("source", proposal),
      },
    });
    expect(parseStartedChatPrompt(request.initialPrompt!)).toEqual({
      task: proposal.task,
      context: proposal.context,
    });
  });
});
