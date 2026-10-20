import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { expect, test } from "vitest";
import {
  briefingRequestPrompt,
  childPrompt,
  finalReplyText,
  handoffTitle,
  lastUserRequest,
  looksLikeBriefing,
} from "./briefing.js";

const request = { used: 400_000, max: 1_000_000, threshold: 350_000, lastUserRequest: "Fix it" };
const briefing = `## Task\nFix it.\n\n## Current state\n${"Half done. ".repeat(40)}`;

test("the last user request skips the plugin's own briefing requests", () => {
  const timeline: AgentTimelineItem[] = [
    { type: "user_message", text: "  Fix the login bug  " },
    { type: "assistant_message", text: "Done." },
    { type: "user_message", text: briefingRequestPrompt({ ...request, retry: false }) },
  ];
  expect(lastUserRequest(timeline)).toBe("Fix the login bug");
  expect(lastUserRequest([])).toBe("(no user request found)");
});

test("the final reply keeps assistant text after the turn's last tool call", () => {
  const timeline: AgentTimelineItem[] = [
    { type: "user_message", text: "old" },
    { type: "assistant_message", text: "old reply" },
    { type: "user_message", text: "brief me" },
    { type: "assistant_message", text: "Checking git." },
    {
      type: "tool_call",
      callId: "1",
      name: "Bash",
      status: "completed",
      detail: { type: "unknown", input: { command: "git status" }, output: "clean" },
      error: null,
    },
    { type: "reasoning", text: "thinking" },
    { type: "assistant_message", text: "## Task" },
    { type: "assistant_message", text: "\nDo it." },
  ];
  expect(finalReplyText(timeline)).toBe("## Task\nDo it.");
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

test("the briefing request is marked, quotes the user request and states the numbers", () => {
  const prompt = briefingRequestPrompt({ ...request, retry: false });
  expect(
    prompt.startsWith("<paseo_auto_handoff>\nYour context window is at 400000 of 1000000"),
  ).toBe(true);
  expect(prompt).toContain('"""\nFix it\n"""');
  expect(prompt).toContain("## Active skills\n");
  expect(prompt.endsWith("</paseo_auto_handoff>")).toBe(true);
  expect(briefingRequestPrompt({ ...request, retry: true })).toContain(
    "Reply with the briefing only.",
  );
});

test("the child prompt is the briefing followed by the preamble", () => {
  expect(childPrompt(briefing, 400_000)).toBe(
    `${briefing}\n\n---\nThis briefing was written by the previous agent in this workspace when its context reached 400000 tokens.\nBefore you start, turn on each skill listed under "## Active skills".\nStart from "## Task". Before relying on any claim about a file, read the file.`,
  );
});
