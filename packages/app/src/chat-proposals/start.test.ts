import { describe, expect, it } from "vitest";
import {
  parseStartedChatPrompt,
  proposalKey,
  STARTED_FROM_AGENT_ID_LABEL,
  STARTED_FROM_PROPOSAL_LABEL,
} from "./proposal";
import type { AgentModelDefinition } from "@getpaseo/protocol/agent-types";
import { buildProposedChatRequest, resolveProposalRuntime } from "./start";

const proposal = {
  title: "Fix the gate",
  task: "Gate tools/list.",
  context: "Codex lists once.",
  model: null,
  thinking: null,
};

const source = {
  id: "source",
  provider: "claude",
  cwd: "/repo",
  workspaceId: "workspace-1",
  model: "claude-sonnet-5-5",
  runtimeInfo: undefined,
  currentModeId: "default",
  thinkingOptionId: "low",
  features: [],
};

const efforts = [
  { id: "low", label: "Low" },
  { id: "xhigh", label: "Extra high" },
];
const catalog: AgentModelDefinition[] = [
  { provider: "claude", id: "claude-sonnet-5-5", label: "Sonnet 5.5", thinkingOptions: efforts },
  {
    provider: "claude",
    id: "claude-opus-5-5",
    label: "Opus 5.5",
    aliases: ["opus"],
    thinkingOptions: efforts,
  },
];

describe("resolveProposalRuntime", () => {
  it("keeps the source's model and thinking without reading the catalog", () => {
    expect(resolveProposalRuntime(source, proposal, undefined)).toEqual({
      kind: "ready",
      model: "claude-sonnet-5-5",
      thinkingOptionId: "low",
      labels: [],
    });
  });

  it("waits for the catalog when the proposal names a model", () => {
    const named = { ...proposal, model: "opus" };
    expect(resolveProposalRuntime(source, named, undefined)).toEqual({ kind: "loading" });
  });

  it("matches a model and thinking by label, case-insensitively", () => {
    const named = { ...proposal, model: "opus 5.5", thinking: "extra HIGH" };
    expect(resolveProposalRuntime(source, named, catalog)).toEqual({
      kind: "ready",
      model: "claude-opus-5-5",
      thinkingOptionId: "xhigh",
      labels: ["Opus 5.5", "Extra high"],
    });
  });

  it("runs a new model at its default thinking instead of the source's", () => {
    const named = { ...proposal, model: "opus" };
    expect(resolveProposalRuntime(source, named, catalog)).toEqual({
      kind: "ready",
      model: "claude-opus-5-5",
      thinkingOptionId: undefined,
      labels: ["Opus 5.5"],
    });
  });

  it("changes only the thinking of the source's model", () => {
    const named = { ...proposal, thinking: "xhigh" };
    expect(resolveProposalRuntime(source, named, catalog)).toEqual({
      kind: "ready",
      model: "claude-sonnet-5-5",
      thinkingOptionId: "xhigh",
      labels: ["Extra high"],
    });
  });

  it("refuses a model or thinking the catalog does not have", () => {
    expect(resolveProposalRuntime(source, { ...proposal, model: "gpt-6" }, catalog)).toEqual({
      kind: "unknown-model",
      requested: "gpt-6",
    });
    expect(resolveProposalRuntime(source, { ...proposal, thinking: "max" }, catalog)).toEqual({
      kind: "unknown-thinking",
      requested: "max",
    });
  });
});

describe("buildProposedChatRequest", () => {
  it("starts the chat beside its source with the source's settings and a linking label", () => {
    const codexSource = {
      id: "source",
      provider: "codex",
      cwd: "/repo",
      workspaceId: "workspace-1",
      model: null,
      runtimeInfo: { provider: "codex", sessionId: null, model: "gpt-6" },
      currentModeId: "full-access",
      thinkingOptionId: "high",
      features: [{ type: "toggle" as const, id: "fast", label: "Fast", value: true }],
    };
    const runtime = resolveProposalRuntime(codexSource, proposal, undefined);
    if (runtime.kind !== "ready") throw new Error(`runtime is ${runtime.kind}`);
    const request = buildProposedChatRequest(codexSource, proposal, runtime, "message-1");
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
