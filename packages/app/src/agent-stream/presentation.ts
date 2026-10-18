import type { AssistantMessageItem, StreamItem, UserMessageItem } from "@/types/stream";
import type { TimelineItemTransform } from "@/plugins/timeline/model";
import { projectPluginTimelineItems } from "@/plugins/timeline/projection";
import { splitMarkdownBlocksWithKinds } from "@/utils/split-markdown-blocks";
import {
  parseStartedChatPrompt,
  parseStartedChatReports,
  splitChatProposals,
  type ChatProposal,
} from "@/chat-proposals/proposal";
import {
  prepareToolCallHistory,
  projectToolCallDetailLevel,
  type PreparedToolCallHistory,
  type ToolCallDetailLevel,
} from "@/tool-calls/detail-level/projection";

interface PresentationInput {
  tail: StreamItem[];
  head: StreamItem[];
  transform: TimelineItemTransform | undefined;
  level: ToolCallDetailLevel;
  isTurnActive: boolean;
  /** Codex-style desktop folds the thoughts between tool calls into their group. */
  absorbThoughts: boolean;
}

function retainItems(previous: StreamItem[], next: StreamItem[]): StreamItem[] {
  return previous.length === next.length && previous.every((item, index) => item === next[index])
    ? previous
    : next;
}

/**
 * The source message a display row belongs to. Every assistant message is split into
 * Markdown blocks, so an assistant row id never equals its message id; anything that
 * addresses a message — find, scroll-to-message, history reveal — asks for this.
 */
export function getStreamItemMessageId(item: StreamItem): string {
  return item.kind === "assistant_message" ? (item.blockGroupId ?? item.id) : item.id;
}

/**
 * A block is reusable only when it still stands for the same source state. Text, proposals
 * and turn are what the reader sees; cursor and timestamp are what the timeline reads back
 * through the row — a reused block carrying a pre-canonical cursor reports a stale
 * reading position and weakens fork-boundary resolution.
 */
function isReusableBlock(
  block: AssistantMessageItem | undefined,
  source: AssistantMessageItem,
  next: Pick<AssistantMessageItem, "id" | "text" | "proposals">,
): block is AssistantMessageItem {
  return (
    block !== undefined &&
    block.id === next.id &&
    block.text === next.text &&
    sameProposals(block.proposals, next.proposals) &&
    block.turnId === source.turnId &&
    block.timestamp.getTime() === source.timestamp.getTime() &&
    block.timelineCursor?.epoch === source.timelineCursor?.epoch &&
    block.timelineCursor?.seq === source.timelineCursor?.seq
  );
}

/** A streamed chunk that only adds text. Taking out a proposal block is not an append. */
function isPlainAppend(text: string, sourceText: string, previousText: string): boolean {
  return (
    sourceText === text &&
    text.startsWith(previousText) &&
    splitChatProposals(previousText).text === previousText
  );
}

function sameProposals(
  left: readonly ChatProposal[] | undefined,
  right: readonly ChatProposal[] | undefined,
): boolean {
  if (!left || !right) return left === right;
  return (
    left.length === right.length &&
    left.every(
      (proposal, index) =>
        proposal.title === right[index]!.title &&
        proposal.task === right[index]!.task &&
        proposal.context === right[index]!.context,
    )
  );
}

/** Source messages reach plugins before any Markdown splitting or Overview grouping. */
export function createStreamPresentation() {
  const userMessageCache = new WeakMap<UserMessageItem, UserMessageItem>();

  function presentUserMessage(item: UserMessageItem): UserMessageItem {
    const cached = userMessageCache.get(item);
    if (cached) return cached;

    // Recognize the complete voice envelope, including older messages without the
    // instruction suffix. Leave quoted examples and unrelated XML untouched.
    const spokenInput =
      /^\s*<spoken-input>([\s\S]*?)<\/spoken-input>(?:\s*<instruction>This message was spoken by the user\.[\s\S]*?<\/instruction>)?\s*$/.exec(
        item.text,
      );
    const startedChat = spokenInput ? null : parseStartedChatPrompt(item.text);
    const startedChatReports =
      spokenInput || startedChat ? null : parseStartedChatReports(item.text);
    let projected = item;
    if (spokenInput) projected = { ...item, text: spokenInput[1].trim() };
    else if (startedChat) projected = { ...item, text: startedChat.task, startedChat };
    else if (startedChatReports) {
      const text = startedChatReports.map((report) => report.reply).join("\n\n");
      projected = { ...item, text, startedChatReports };
    }
    userMessageCache.set(item, projected);
    return projected;
  }

  const blocksBySource = new WeakMap<AssistantMessageItem, AssistantMessageItem[]>();
  let liveSources = new Map<string, AssistantMessageItem>();
  let historySource: StreamItem[] | undefined;
  let historyTransform: TimelineItemTransform | undefined;
  let historyRows: StreamItem[] = [];
  let displayTail: StreamItem[] = [];
  let displayHistory: StreamItem[] | undefined;
  let promotedRows: StreamItem[] = [];
  let preparedTail: StreamItem[] | undefined;
  let preparedLevel: ToolCallDetailLevel | undefined;
  let preparedAbsorbThoughts: boolean | undefined;
  let preparedHistory: PreparedToolCallHistory | null = null;

  /**
   * One display row per Markdown block. Each block renders on its own, so a construct
   * that needs context from another block does not resolve: `splitMarkdownBlocks` keeps
   * link reference definitions with the block that uses them, but a reference pointing
   * at a definition several blocks away renders as literal text. Streamed messages
   * always behaved this way; history now matches them.
   */
  function nativeBlocks(item: StreamItem): StreamItem[] {
    if (item.kind === "user_message") return [presentUserMessage(item)];
    if (item.kind !== "assistant_message") return [item];
    const cached = blocksBySource.get(item);
    if (cached) return cached;
    const previousSource = liveSources.get(item.id);
    const previous = previousSource && blocksBySource.get(previousSource);
    // Proposal blocks leave the text before it is split; the message's cards follow its last block.
    const split = splitChatProposals(item.text);
    const sourceText = split.text;
    const proposals = split.proposals.length > 0 ? split.proposals : undefined;
    // Parse only the growing last block on append, as the old live reducer did.
    // Canonical text replacements are parsed afresh instead of joining fragments.
    const isAppend =
      previousSource && previous && isPlainAppend(item.text, sourceText, previousSource.text);
    let prefix: AssistantMessageItem[] = [];
    let growingText = sourceText;
    if (isAppend) {
      prefix = previous.slice(0, -1);
      growingText =
        previous[previous.length - 1]!.text + item.text.slice(previousSource.text.length);
    }
    const parsed = splitMarkdownBlocksWithKinds(growingText);
    // Whitespace-only text has no block, and a message still owns exactly one row.
    const textBlocks =
      parsed.length > 0 || prefix.length > 0 ? parsed : [{ text: "", kind: "other" as const }];

    const blocks = [...prefix];
    for (const [offset, { text, kind }] of textBlocks.entries()) {
      const index = prefix.length + offset;
      const isLast = offset === textBlocks.length - 1;
      let blockText = text;
      if (isLast) {
        // The split drops trailing blank lines, including a line break followed only
        // by the next line's indent. Keep them so the next append continues that line.
        const trailingBlankLines = /\n\s*$/.exec(sourceText)?.[0] ?? "";
        blockText += trailingBlankLines;
      }
      const next = {
        id: `${item.id}:block:${index}`,
        text: blockText,
        ...(isLast && proposals ? { proposals } : {}),
      };
      const existing = previous?.[index];
      blocks.push(
        isReusableBlock(existing, item, next)
          ? existing
          : { ...item, ...next, blockGroupId: item.id, blockIndex: index, blockKind: kind },
      );
    }
    blocksBySource.set(item, blocks);
    return blocks;
  }

  return (input: PresentationInput) => {
    // Retained history is not reprojected or regrouped on each live text update.
    if (historySource !== input.tail || historyTransform !== input.transform) {
      // One rendering path: history splits the same way the live head does, and
      // `blocksBySource` keeps both the live block identities and the split cost
      // from being paid again when only the tail's array identity changed.
      historyRows = projectPluginTimelineItems(input.tail, input.transform).flatMap<StreamItem>(
        nativeBlocks,
      );
      historySource = input.tail;
      historyTransform = input.transform;
    }
    const head: StreamItem[] = [];
    const promoted: StreamItem[] = [];
    const nextLiveSources = new Map<string, AssistantMessageItem>();
    for (const item of projectPluginTimelineItems(input.head, input.transform, "streaming")) {
      const blocks = nativeBlocks(item);
      if (item.kind === "assistant_message") nextLiveSources.set(item.id, item);
      if (item.kind === "assistant_message" && blocks.length > 1) {
        promoted.push(...blocks.slice(0, -1));
        head.push(blocks[blocks.length - 1]!);
      } else {
        head.push(...blocks);
      }
    }
    liveSources = nextLiveSources;
    const nextPromoted = retainItems(promotedRows, promoted);
    if (displayHistory !== historyRows || nextPromoted !== promotedRows) {
      displayTail = historyRows;
      if (nextPromoted.length > 0) displayTail = [...historyRows, ...nextPromoted];
      displayHistory = historyRows;
      promotedRows = nextPromoted;
    }
    if (
      preparedTail !== displayTail ||
      preparedLevel !== input.level ||
      preparedAbsorbThoughts !== input.absorbThoughts
    ) {
      preparedHistory = prepareToolCallHistory(input.level, displayTail, input.absorbThoughts);
      preparedTail = displayTail;
      preparedLevel = input.level;
      preparedAbsorbThoughts = input.absorbThoughts;
    }
    return projectToolCallDetailLevel({
      level: input.level,
      tail: displayTail,
      head,
      preparedHistory,
      isTurnActive: input.isTurnActive,
    });
  };
}
