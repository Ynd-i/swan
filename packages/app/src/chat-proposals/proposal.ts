// Generic agent labels link a started chat to its source without changing the daemon protocol.
// A parent label would make it a subagent: out of the sidebar and archived with its source.
export const STARTED_FROM_AGENT_ID_LABEL = "codex-ui.started-from-agent-id";
export const STARTED_FROM_PROPOSAL_LABEL = "codex-ui.started-from-proposal";

const PROPOSAL_OPEN = "<paseo_chat_proposal>";
const PROPOSAL_CLOSE = "</paseo_chat_proposal>";
const BRIEF_OPEN = "<paseo_started_chat>";
const BRIEF_CLOSE = "</paseo_started_chat>";

export interface ChatBrief {
  task: string;
  context: string | null;
}

/** A follow-up chat an agent suggests in its reply; nothing runs until the user starts it. */
export interface ChatProposal extends ChatBrief {
  title: string;
}

export interface ChatProposalSplit {
  /** The reply without its proposal blocks, or the source text when it has none. */
  text: string;
  proposals: ChatProposal[];
}

function tagged(body: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

function parseProposalBody(body: string): ChatProposal | null {
  const title = tagged(body, "title");
  const task = tagged(body, "task");
  if (!title || !task) return null;
  return { title: title.replace(/\s+/g, " "), task, context: tagged(body, "context") };
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Takes complete `<paseo_chat_proposal>` blocks out of an assistant reply. Tags count only on a
 * line of their own outside fenced code, so prose and examples that mention the format stay text.
 * An unclosed block hides from its opening line on, so a streaming reply never shows the raw tag.
 * A closed block without a title and task stays text.
 */
export function splitChatProposals(text: string): ChatProposalSplit {
  if (!text.includes(PROPOSAL_OPEN)) return { text, proposals: [] };
  const lines = text.split("\n");
  const kept: string[] = [];
  const proposals: ChatProposal[] = [];
  let fence: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      kept.push(line);
      continue;
    }
    if (marker) {
      fence = marker;
      kept.push(line);
      continue;
    }
    if (line.trim() !== PROPOSAL_OPEN) {
      kept.push(line);
      continue;
    }
    let close = index + 1;
    while (close < lines.length && lines[close]!.trim() !== PROPOSAL_CLOSE) close += 1;
    if (close === lines.length) break;
    const proposal = parseProposalBody(lines.slice(index + 1, close).join("\n"));
    if (proposal) proposals.push(proposal);
    else kept.push(...lines.slice(index, close + 1));
    index = close;
  }
  const stripped = kept.join("\n");
  return { text: stripped === text ? text : stripped.trimEnd(), proposals };
}

/** FNV-1a: a short stable id for a proposal's content, the same after every reload. */
function contentHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Identifies a proposal of one source chat, so its card finds the chat it started. */
export function proposalKey(sourceAgentId: string, proposal: ChatProposal): string {
  return `${sourceAgentId}:${contentHash(`${proposal.title}\u0000${proposal.task}`)}`;
}

/** The started chat's first prompt; the chat view reads it back as its Task and Context. */
export function startedChatPrompt(brief: ChatBrief): string {
  const context = brief.context ? `\n<context>\n${brief.context}\n</context>` : "";
  return `${BRIEF_OPEN}\n<task>\n${brief.task}\n</task>${context}\n${BRIEF_CLOSE}`;
}

export function parseStartedChatPrompt(text: string): ChatBrief | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(BRIEF_OPEN) || !trimmed.endsWith(BRIEF_CLOSE)) return null;
  const body = trimmed.slice(BRIEF_OPEN.length, -BRIEF_CLOSE.length);
  const task = tagged(body, "task");
  return task ? { task, context: tagged(body, "context") } : null;
}
