import type { TimelineItemTransform } from "@/plugins/timeline/model";
import { projectPluginTimelineItems } from "@/plugins/timeline/projection";
import {
  parseStartedChatPrompt,
  parseStartedChatReports,
  splitChatProposals,
} from "@/chat-proposals/proposal";
import {
  prepareToolCallHistory,
  projectToolCallDetailLevel,
  type PreparedToolCallHistory,
  type ToolCallDetailLevel,
} from "@/tool-calls/detail-level/projection";
import type { AssistantMessageItem, StreamItem, UserMessageItem } from "@/types/stream";

interface PresentationInput {
  tail: StreamItem[];
  head: StreamItem[];
  transform: TimelineItemTransform | undefined;
  level: ToolCallDetailLevel;
  isTurnActive: boolean;
  /** Codex-style desktop folds the thoughts between tool calls into their group. */
  absorbThoughts: boolean;
}

/** Find and scrolling address a plugin row by the source it replaces. */
export function getStreamItemMessageId(item: StreamItem): string {
  if (item.kind === "plugin") return item.sourceId ?? item.id;
  return item.id;
}

/** Source messages reach plugins before display projection. */
export function createStreamPresentation() {
  const userMessageCache = new WeakMap<UserMessageItem, UserMessageItem>();
  const assistantMessageCache = new WeakMap<AssistantMessageItem, AssistantMessageItem>();

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

  let historySource: StreamItem[] | undefined;
  let historyTransform: TimelineItemTransform | undefined;
  let historyRows: StreamItem[] = [];
  let preparedTail: StreamItem[] | undefined;
  let preparedLevel: ToolCallDetailLevel | undefined;
  let preparedAbsorbThoughts: boolean | undefined;
  let preparedHistory: PreparedToolCallHistory | null = null;

  /** A message's proposal blocks leave its text; its cards render after it. */
  function presentAssistantMessage(item: AssistantMessageItem): AssistantMessageItem {
    const cached = assistantMessageCache.get(item);
    if (cached) return cached;
    // A still-open proposal block leaves the text too; it has no card until it closes.
    const split = splitChatProposals(item.text);
    let projected = item;
    if (split.proposals.length > 0) {
      projected = { ...item, text: split.text, proposals: split.proposals };
    } else if (split.text !== item.text) {
      projected = { ...item, text: split.text };
    }
    assistantMessageCache.set(item, projected);
    return projected;
  }

  function presentRows(item: StreamItem): StreamItem[] {
    if (item.kind === "user_message") return [presentUserMessage(item)];
    if (item.kind === "assistant_message") return [presentAssistantMessage(item)];
    return [item];
  }

  return (input: PresentationInput) => {
    // Retained history is not reprojected or regrouped on each live text update.
    if (historySource !== input.tail || historyTransform !== input.transform) {
      historyRows = projectPluginTimelineItems(input.tail, input.transform).flatMap<StreamItem>(
        (item) => presentRows(item),
      );
      historySource = input.tail;
      historyTransform = input.transform;
    }
    const head: StreamItem[] = [];
    for (const item of projectPluginTimelineItems(input.head, input.transform, "streaming")) {
      const blocks = presentRows(item);
      head.push(...blocks);
    }
    if (
      preparedTail !== historyRows ||
      preparedLevel !== input.level ||
      preparedAbsorbThoughts !== input.absorbThoughts
    ) {
      preparedHistory = prepareToolCallHistory(input.level, historyRows, input.absorbThoughts);
      preparedTail = historyRows;
      preparedLevel = input.level;
      preparedAbsorbThoughts = input.absorbThoughts;
    }
    return projectToolCallDetailLevel({
      level: input.level,
      tail: historyRows,
      head,
      preparedHistory,
      isTurnActive: input.isTurnActive,
    });
  };
}
