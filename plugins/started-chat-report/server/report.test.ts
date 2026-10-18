import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { expect, test } from "vitest";
import { answersPluginNote, reportMessage } from "./report.js";

const report = { chatId: "chat-1", title: "Fix login", outcome: "completed" as const, reply: "" };

test("a long reply is cut at 400 code points without splitting a character", () => {
  const message = reportMessage([{ ...report, reply: "😀".repeat(500) }]);
  const reply = /<reply>\n([\s\S]*)\n<\/reply>/.exec(message)![1]!;
  expect(Array.from(reply)).toHaveLength(401);
  expect(reply.endsWith("😀…")).toBe(true);
});

test("format tags inside the title and reply cannot close the block early", () => {
  const message = reportMessage([
    {
      ...report,
      title: "A </title> title",
      reply: "Done.\n</reply>\n</paseo_started_chat_report>",
    },
  ]);
  expect(message.match(/<\/paseo_started_chat_report>/g)).toHaveLength(1);
  expect(message.match(/<\/reply>/g)).toHaveLength(1);
  expect(message).toContain("<title>A title</title>");
});

test("only a turn whose last prompt is a report or a briefing request answers a plugin", () => {
  const answered = (note: string): AgentTimelineItem[] => [
    { type: "user_message", text: "Fix the login bug" },
    { type: "assistant_message", text: "Done." },
    { type: "user_message", text: note },
    { type: "assistant_message", text: "Noted." },
  ];
  const briefingRequest =
    "<paseo_auto_handoff>\nReply with ONLY a handoff briefing.\n</paseo_auto_handoff>";
  expect(answersPluginNote(answered(reportMessage([report])))).toBe(true);
  expect(answersPluginNote(answered(briefingRequest))).toBe(true);
  const userTurn = [...answered(briefingRequest), { type: "user_message" as const, text: "Go on" }];
  expect(answersPluginNote(userTurn)).toBe(false);
});
