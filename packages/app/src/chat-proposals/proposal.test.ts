import { describe, expect, it } from "vitest";
import {
  parseStartedChatPrompt,
  proposalKey,
  splitChatProposals,
  startedChatPrompt,
} from "./proposal";

const block = [
  "<paseo_chat_proposal>",
  "<title>Make first tools/list wait for startup health</title>",
  "<task>",
  "Gate the first tools/list on the startup check.",
  "",
  "## Done when",
  "- the stdio test passes",
  "</task>",
  "<context>",
  "Codex lists tools once per connection.",
  "</context>",
  "</paseo_chat_proposal>",
].join("\n");

const proposal = {
  title: "Make first tools/list wait for startup health",
  task: "Gate the first tools/list on the startup check.\n\n## Done when\n- the stdio test passes",
  context: "Codex lists tools once per connection.",
  model: null,
  thinking: null,
};

describe("splitChatProposals", () => {
  it("returns the same text when the reply proposes nothing", () => {
    const text = "Fixed it.\n\nNothing else to do.";
    const split = splitChatProposals(text);
    expect(split.text).toBe(text);
    expect(split.proposals).toEqual([]);
  });

  it("takes a proposal out of the prose around it", () => {
    const split = splitChatProposals(
      `The root cause is timing.\n\n${block}\n\nI kept the fix here.`,
    );
    expect(split.proposals).toEqual([proposal]);
    expect(split.text).toBe("The root cause is timing.\n\n\nI kept the fix here.");
  });

  it("reads several proposals, an optional context and an indented tag line", () => {
    const second =
      "  <paseo_chat_proposal>\n<title>Docs</title>\n<task>Update docs.</task>\n  </paseo_chat_proposal>";
    const split = splitChatProposals(`${block}\n${second}`);
    expect(split.proposals).toEqual([
      proposal,
      { title: "Docs", task: "Update docs.", context: null, model: null, thinking: null },
    ]);
    expect(split.text).toBe("");
  });

  it("reads the model and thinking a proposal asks for", () => {
    const named = block.replace(
      "<task>",
      "<model>Opus 5.5</model>\n<thinking> xhigh </thinking>\n<task>",
    );
    expect(splitChatProposals(named).proposals).toEqual([
      { ...proposal, model: "Opus 5.5", thinking: "xhigh" },
    ]);
  });

  it("hides an unclosed proposal while it streams", () => {
    const split = splitChatProposals("Found it.\n\n<paseo_chat_proposal>\n<title>Half");
    expect(split).toEqual({ text: "Found it.", proposals: [] });
  });

  it("keeps a closed block without a title or task as text", () => {
    const broken = "<paseo_chat_proposal>\n<task>No title</task>\n</paseo_chat_proposal>";
    expect(splitChatProposals(broken)).toEqual({ text: broken, proposals: [] });
  });

  it("leaves the format alone inside fenced code and inline prose", () => {
    const fenced = `Use this format:\n\n\`\`\`xml\n${block}\n\`\`\``;
    expect(splitChatProposals(fenced)).toEqual({ text: fenced, proposals: [] });
    const prose = "I will reply with a <paseo_chat_proposal> block when it helps.";
    expect(splitChatProposals(prose)).toEqual({ text: prose, proposals: [] });
  });
});

describe("started chat prompt", () => {
  it("round-trips the task and context", () => {
    expect(parseStartedChatPrompt(startedChatPrompt(proposal))).toEqual({
      task: proposal.task,
      context: proposal.context,
    });
    expect(
      parseStartedChatPrompt(startedChatPrompt({ task: "Only a task", context: null })),
    ).toEqual({ task: "Only a task", context: null });
  });

  it("ignores ordinary and partial messages", () => {
    expect(parseStartedChatPrompt("Please fix the build")).toBeNull();
    expect(parseStartedChatPrompt("<paseo_started_chat>\n<task>x</task>")).toBeNull();
    expect(parseStartedChatPrompt("<paseo_started_chat>\n</paseo_started_chat>")).toBeNull();
  });
});

describe("proposalKey", () => {
  it("is stable for the same proposal and differs by source and content", () => {
    expect(proposalKey("agent-a", proposal)).toBe(proposalKey("agent-a", { ...proposal }));
    expect(proposalKey("agent-a", proposal)).not.toBe(proposalKey("agent-b", proposal));
    expect(proposalKey("agent-a", proposal)).not.toBe(
      proposalKey("agent-a", { ...proposal, task: "Another task" }),
    );
  });
});
