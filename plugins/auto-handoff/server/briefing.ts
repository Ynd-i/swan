import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";

const MARKER = "paseo_auto_handoff";
const HANDOFF_TITLE_PREFIX = /^(?:\[Handoff(?: \d+)?\]\s*)+/;
const MAX_TITLE_LENGTH = 60;

export function isBriefingRequest(text: string): boolean {
  return text.includes(`<${MARKER}>`);
}

/** The user's latest request, skipping the briefing requests this plugin sent. */
export function lastUserRequest(timeline: readonly AgentTimelineItem[]): string {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const item = timeline[index]!;
    if (item.type === "user_message" && !isBriefingRequest(item.text)) return item.text.trim();
  }
  return "(no user request found)";
}

/**
 * The final reply of the latest turn: assistant text after its last tool call. Reasoning and
 * tool output stay out, because the reply becomes the next agent's first prompt.
 */
export function finalReplyText(timeline: readonly AgentTimelineItem[]): string {
  let text = "";
  for (const item of timeline) {
    if (item.type === "assistant_message") text += item.text;
    else if (item.type === "user_message" || item.type === "tool_call") text = "";
  }
  return text.trim();
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
  lastUserRequest: string;
}

export function briefingRequestPrompt(input: BriefingRequest & { retry: boolean }): string {
  const window = input.max ? `${input.used} of ${input.max}` : `${input.used}`;
  const retry = input.retry
    ? "Your previous reply did not follow the structure below. Reply with the briefing only.\n\n"
    : "";
  return `<${MARKER}>
${retry}Your context window is at ${window} tokens, past this host's handoff limit of ${input.threshold}.
A fresh agent with zero context will continue this work. Do not start new work and do not edit files.
You may run read-only commands (git status, git diff --stat, reading files) to make the briefing accurate.

Reply with ONLY a handoff briefing in exactly this structure:

## Task
[Imperative description.]

## Context
[Why this task exists, required context.]

## Relevant files
- \`path/to/file.ts\` — [what it is and why it matters]

## Current state
[What's done, what works, what doesn't. Branch and whether there are uncommitted changes.]

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

The next agent continues from the user's most recent request:
"""
${input.lastUserRequest}
"""
Write ## Task and ## Acceptance criteria around that request. Preserve the user's exact intent:
investigate-only stays read-only, a fix is implemented, a refactor is not a rewrite.
Mark anything unverified as unverified. Do not paste file contents. Keep it under 1,500 words.
</${MARKER}>`;
}

export function childPrompt(briefing: string, usedTokens: number): string {
  return `${briefing}

---
This briefing was written by the previous agent in this workspace when its context reached ${usedTokens} tokens.
Before you start, turn on each skill listed under "## Active skills".
Start from "## Task". Before relying on any claim about a file, read the file.`;
}
