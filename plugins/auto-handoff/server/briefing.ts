import type { PluginLifecycleEvents } from "@getpaseo/plugin/server";

// Built-in plugins ship without node_modules, so every type comes from the host SDK.
type AgentTimelineItem = PluginLifecycleEvents["agent.turn_ended"]["timeline"][number];

const MARKER = "paseo_auto_handoff";
// Match REPORT_TAG in plugins/started-chat-report/server/report.ts; the unit test covers both.
const REPORT_TAG = "paseo_started_chat_report";
const HANDOFF_TITLE_PREFIX = /^(?:\[Handoff(?: \d+)?\]\s*)+/;
const MAX_TITLE_LENGTH = 60;
/** A shorter message, such as "ok, continue", leans on the request before it. */
const MIN_REQUEST_LENGTH = 40;
const MAX_QUOTED_REQUESTS = 3;

export function isBriefingRequest(text: string): boolean {
  return text.includes(`<${MARKER}>`);
}

/** Plugins send their notes as user messages. Messages from agents arrive as tool calls. */
function isPluginNote(text: string): boolean {
  return isBriefingRequest(text) || text.includes(`\n<${REPORT_TAG}>\n`);
}

/**
 * The user's latest request, oldest first with the short follow-ups after it, so "ok, continue"
 * arrives with what it continues.
 */
export function recentUserRequests(timeline: readonly AgentTimelineItem[]): string[] {
  const requests: string[] = [];
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const item = timeline[index]!;
    if (item.type !== "user_message" || isPluginNote(item.text)) continue;
    const text = item.text.trim();
    requests.unshift(text);
    if (text.length >= MIN_REQUEST_LENGTH || requests.length === MAX_QUOTED_REQUESTS) break;
  }
  return requests;
}

/**
 * The last run of assistant text in the latest turn that follows the template, so a command run
 * after the briefing does not discard it. Reasoning and tool output stay out, because the
 * briefing becomes the next agent's first prompt.
 */
export function briefingReply(timeline: readonly AgentTimelineItem[]): string | null {
  let blocks = [""];
  for (const item of timeline) {
    if (item.type === "user_message") blocks = [""];
    else if (item.type === "tool_call") blocks.push("");
    else if (item.type === "assistant_message") blocks[blocks.length - 1] += item.text;
  }
  return blocks.map((block) => block.trim()).findLast(looksLikeBriefing) ?? null;
}

/** A sanity check that the reply follows the template, not a parser. */
export function looksLikeBriefing(text: string): boolean {
  return text.length >= 300 && text.includes("## Task") && text.includes("## Current state");
}

/** `[Handoff N] <title>`, where N counts the handoffs since the original chat. */
export function handoffTitle(sourceTitle: string | null, generation: number): string {
  const base = sourceTitle?.replace(HANDOFF_TITLE_PREFIX, "").trim() || "Untitled";
  return `[Handoff ${generation}] ${base}`.slice(0, MAX_TITLE_LENGTH);
}

export interface BriefingRequest {
  used: number;
  max: number | undefined;
  threshold: number;
  userRequests: readonly string[];
}

export function briefingRequestPrompt(input: BriefingRequest & { retry: boolean }): string {
  const window = input.max ? `${input.used} of ${input.max}` : `${input.used}`;
  const retry = input.retry
    ? "Your previous reply did not follow the structure below. Reply with the briefing only.\n\n"
    : "";
  const requests = input.userRequests.length
    ? input.userRequests.map((request) => `"""\n${request}\n"""`).join("\n")
    : "(no user request found)";
  return `<${MARKER}>
${retry}Your context window is at ${window} tokens, past this host's handoff limit of ${input.threshold}.
A fresh agent with zero context will continue this work. Do not start new work, edit tracked files or commit.
First run any read-only commands (git status, git diff --stat, reading files) that make the briefing accurate.

Then reply with the handoff briefing as your last message, in exactly this structure:

## Task
[Imperative description.]

## Context
[Why this task exists, required context.]

## Relevant files
- \`path/to/file.ts\` — [what it is and why it matters]

## Current state
[What's done, what works, what doesn't. Branch and whether there are uncommitted changes. Link any checkpoint, plan file or decision log the work keeps.]

## Open todos
- [ ] [Each unfinished item of your todo list or plan, as written. Write "None" if there is none.]

## What was tried
- [Approach] — [why it failed or was abandoned]

## Decisions
- [Decision — rationale]

## Acceptance criteria
- [ ] [Criterion]

## Constraints
- [Must-not / must-preserve]

## Active skills
- [A skill or mode the user turned on in this chat, such as \`/poteto-mode\`, and the command that turns it on. Write "None" if there is none.]

The next agent continues from the user's most recent request, quoted with any short follow-ups after it:
${requests}
Write ## Task and ## Acceptance criteria around that request. Preserve the user's exact intent:
investigate-only stays read-only, a fix is implemented, a refactor is not a rewrite.
Mark anything unverified as unverified. Do not paste file contents. Keep it under 1,500 words.
</${MARKER}>`;
}

export function childPrompt(input: {
  briefing: string;
  usedTokens: number;
  sourceAgentId: string;
}): string {
  return `${input.briefing}

---
This briefing was written by the previous agent in this workspace, agent ${input.sourceAgentId}, when its context reached ${input.usedTokens} tokens.
Before you start, turn on each skill listed under "## Active skills". If "## Current state" links a checkpoint, resume from it with the skill that wrote it.
Start from "## Task". Before relying on any claim about a file, read the file.
The previous agent's chat still exists. If the briefing leaves out something you need, Paseo's get_agent_activity tool with agentId "${input.sourceAgentId}" returns its history.`;
}
