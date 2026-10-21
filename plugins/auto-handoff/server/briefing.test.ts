import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { expect, test } from "vitest";
import { reportMessage } from "../../started-chat-report/server/report.js";
import {
  briefingReply,
  briefingRequestPrompt,
  childPrompt,
  handoffTitle,
  looksLikeBriefing,
  recentUserRequests,
} from "./briefing.js";

const request = { used: 400_000, max: 1_000_000, threshold: 350_000, userRequests: ["Fix it"] };
const briefing = `## Task\nFix it.\n\n## Current state\n${"Half done. ".repeat(40).trim()}`;
const loginFix = "Fix the login bug in auth.ts and add a regression test";
const gitStatus: AgentTimelineItem = {
  type: "tool_call",
  callId: "1",
  name: "Bash",
  status: "completed",
  detail: { type: "unknown", input: { command: "git status" }, output: "clean" },
  error: null,
};

function userMessages(...texts: string[]): AgentTimelineItem[] {
  return texts.map((text) => ({ type: "user_message", text }));
}

test("the user's request skips notes from this plugin and from report back", () => {
  const timeline: AgentTimelineItem[] = [
    { type: "user_message", text: `  ${loginFix}  ` },
    { type: "assistant_message", text: "Done." },
    { type: "user_message", text: briefingRequestPrompt({ ...request, retry: false }) },
    {
      type: "user_message",
      text: reportMessage([
        { chatId: "chat-1", title: "Review", outcome: "completed", reply: "Looks good." },
      ]),
    },
  ];
  expect(recentUserRequests(timeline)).toEqual([loginFix]);
  expect(recentUserRequests([])).toEqual([]);
});

test("a short follow-up is quoted with the request it continues", () => {
  const older = "Rename the settings screen and update every link to it";
  expect(recentUserRequests(userMessages(older, loginFix, "ok", "continue"))).toEqual([
    loginFix,
    "ok",
    "continue",
  ]);
  expect(recentUserRequests(userMessages(older, "a", "b", "c", "d"))).toEqual(["b", "c", "d"]);
});

test("the briefing is the latest turn's last text that follows the template", () => {
  const [head, tail] = [briefing.slice(0, 20), briefing.slice(20)];
  const timeline: AgentTimelineItem[] = [
    ...userMessages("brief me"),
    { type: "assistant_message", text: "Checking git." },
    gitStatus,
    { type: "reasoning", text: "thinking" },
    { type: "assistant_message", text: head },
    { type: "assistant_message", text: tail },
    gitStatus,
    { type: "assistant_message", text: "Done." },
  ];
  expect(briefingReply(timeline)).toBe(briefing);
  expect(briefingReply([...timeline, ...userMessages("retry")])).toBeNull();
});

test("a briefing needs the template headings and some substance", () => {
  expect(looksLikeBriefing(briefing)).toBe(true);
  expect(looksLikeBriefing("## Task\n## Current state")).toBe(false);
  expect(looksLikeBriefing(briefing.replace("## Current state", "State"))).toBe(false);
});

test("handoff titles number the chain and do not stack prefixes", () => {
  expect(handoffTitle("Fix login", 1)).toBe("[Handoff 1] Fix login");
  expect(handoffTitle("[Handoff 1] Fix login", 2)).toBe("[Handoff 2] Fix login");
  expect(handoffTitle("[Handoff] [Handoff 3] Fix login", 4)).toBe("[Handoff 4] Fix login");
  expect(handoffTitle(null, 1)).toBe("[Handoff 1] Untitled");
  expect(handoffTitle("x".repeat(100), 1)).toHaveLength(60);
});

test("the briefing request is marked, quotes the user requests and states the numbers", () => {
  const prompt = briefingRequestPrompt({
    ...request,
    userRequests: [loginFix, "ok"],
    retry: false,
  });
  expect(
    prompt.startsWith("<paseo_auto_handoff>\nYour context window is at 400000 of 1000000"),
  ).toBe(true);
  expect(prompt).toContain(`"""\n${loginFix}\n"""\n"""\nok\n"""`);
  expect(prompt).toContain("## Open todos\n");
  expect(prompt).toContain("## Active skills\n");
  expect(prompt.endsWith("</paseo_auto_handoff>")).toBe(true);
  expect(briefingRequestPrompt({ ...request, userRequests: [], retry: false })).toContain(
    "(no user request found)",
  );
  expect(briefingRequestPrompt({ ...request, retry: true })).toContain(
    "Reply with the briefing only.",
  );
});

test("the child prompt is the briefing, then a preamble that points at the source chat", () => {
  const prompt = childPrompt({ briefing, usedTokens: 400_000, sourceAgentId: "agent-1" });
  expect(prompt.startsWith(`${briefing}\n\n---\n`)).toBe(true);
  expect(prompt).toContain("agent agent-1, when its context reached 400000 tokens.");
  expect(prompt).toContain('get_agent_activity tool with agentId "agent-1"');
});
