import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";

// The app parses this format back in packages/app/src/chat-proposals/proposal.ts.
const REPORT_TAG = "paseo_started_chat_report";
const LEAD =
  "Chats started from your proposals ended a turn. Continue any of your work their replies " +
  "unblock; otherwise answer in a line or two.";
const MAX_REPLY_LENGTH = 400;
const FORMAT_TAGS = /<\/?(?:paseo_started_chat_report|chat|title|outcome|reply)>/g;

export interface StartedChatReport {
  chatId: string;
  title: string;
  outcome: "completed" | "failed";
  reply: string;
}

/**
 * The final reply of the latest turn: assistant text after its last tool call. Reasoning and
 * tool output stay out, because the reply is what the source reads.
 */
export function finalReplyText(timeline: readonly AgentTimelineItem[]): string {
  let text = "";
  for (const item of timeline) {
    if (item.type === "assistant_message") text += item.text;
    else if (item.type === "user_message" || item.type === "tool_call") text = "";
  }
  return text.trim();
}

/** A plugin's note: a report, or auto handoff's briefing request (`plugins/auto-handoff`). */
function isPluginNote(text: string): boolean {
  return text.includes(`\n<${REPORT_TAG}>\n`) || text.includes("<paseo_auto_handoff>");
}

/** Whether the latest turn answered a plugin's note instead of the user. */
export function answersPluginNote(timeline: readonly AgentTimelineItem[]): boolean {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const item = timeline[index]!;
    if (item.type === "user_message") return isPluginNote(item.text);
  }
  return false;
}

/** Caps by code points, so an emoji or CJK text is never cut in half. */
function excerpt(text: string): string {
  const chars = Array.from(text.trim());
  if (chars.length <= MAX_REPLY_LENGTH) return chars.join("");
  return `${chars.slice(0, MAX_REPLY_LENGTH).join("").trimEnd()}…`;
}

function reportBlock(report: StartedChatReport): string {
  const title = report.title.replace(FORMAT_TAGS, "").replace(/\s+/g, " ").trim();
  return [
    `<${REPORT_TAG}>`,
    `<chat>${report.chatId}</chat>`,
    `<title>${title}</title>`,
    `<outcome>${report.outcome}</outcome>`,
    "<reply>",
    excerpt(report.reply.replace(FORMAT_TAGS, "")),
    "</reply>",
    `</${REPORT_TAG}>`,
  ].join("\n");
}

/** One message for every waiting report, so a source never gets two notes racing for one turn. */
export function reportMessage(reports: readonly StartedChatReport[]): string {
  return [LEAD, ...reports.map(reportBlock)].join("\n");
}
