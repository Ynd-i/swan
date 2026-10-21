import type { StreamItem, ToolCallItem } from "@/types/stream";
import type { TurnTiming } from "@/timeline/turn-time";
import type { ToolCallDetailProjection } from "@/tool-calls/detail-level/projection";
import { describeToolCall, isGroupableToolCall } from "@/tool-calls/detail-level/grouping";
import { getStreamItemMessageId } from "./presentation";
import { startsNewTurn } from "./turn-membership";

export interface DesktopTurnActivity {
  id: string;
  source: StreamItem;
  row: StreamItem;
  timing: TurnTiming;
  failedCount: number;
  expanded: boolean;
  collapsibleItemIds: ReadonlySet<string>;
  messageIds: ReadonlySet<string>;
}

export interface DesktopTurnActivityProjection {
  byHostId: ReadonlyMap<string, DesktopTurnActivity>;
  hiddenItemIds: ReadonlySet<string>;
  groupByMessageId: ReadonlyMap<string, string>;
}

interface ProjectionInput {
  scope: string;
  items: StreamItem[];
  timingByAssistantId: ReadonlyMap<string, TurnTiming>;
  expanded: ReadonlySet<string>;
  toolGroups: ToolCallDetailProjection["groupsByHostId"];
}

export const EMPTY_DESKTOP_TURN_ACTIVITY: DesktopTurnActivityProjection = {
  byHostId: new Map(),
  hiddenItemIds: new Set(),
  groupByMessageId: new Map(),
};

function isStep(item: StreamItem): boolean {
  return item.kind === "thought" || isGroupableToolCall(item);
}

// An overview host can contain a failed call even when its latest call succeeded.
function callsOf(item: ToolCallItem, groups: ProjectionInput["toolGroups"]) {
  return groups.get(item.id)?.run.calls ?? [item];
}

function isFailed(call: ToolCallItem): boolean {
  const detail = describeToolCall(call);
  return Boolean(detail.error) || detail.status === "failed";
}

// Failures fold with the rest; the header counts them.
function canCollapse(item: StreamItem, groups: ProjectionInput["toolGroups"]): boolean {
  if (item.kind === "assistant_message") return true;
  if (item.kind === "thought") return item.status === "ready";
  if (!isGroupableToolCall(item)) return false;
  return callsOf(item, groups).every(
    (call) => isFailed(call) || describeToolCall(call).status === "completed",
  );
}

function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function buildActivity(
  turn: StreamItem[],
  input: ProjectionInput,
  previous: DesktopTurnActivityProjection,
): DesktopTurnActivity | null {
  const source = turn.find((item) => item.kind !== "user_message");
  const assistant = turn.find((item) => input.timingByAssistantId.has(item.id));
  const timing = assistant && input.timingByAssistantId.get(assistant.id);
  // Active turns have no timing yet; they and tool-only/error-only responses stay fully visible.
  if (!source || !timing) return null;
  const boundary = turn.findLastIndex(isStep);
  if (boundary < 0 && !turn.some((item) => item.kind === "tool_call")) return null;
  const hasReply = turn.slice(boundary + 1).some((item) => item.kind === "assistant_message");
  const collapsible = hasReply
    ? turn.slice(0, boundary + 1).filter((item) => canCollapse(item, input.toolGroups))
    : [];
  const failedCount = collapsible
    .flatMap((item) => (item.kind === "tool_call" ? callsOf(item, input.toolGroups) : []))
    .filter(isFailed).length;
  const collapsibleItemIds = new Set(collapsible.map((item) => item.id));
  const messageIds = new Set(collapsible.map(getStreamItemMessageId));
  const turnId = turn.find((item) => item.turnId)?.turnId ?? getStreamItemMessageId(turn[0]!);
  const id = `${input.scope}:${turnId}`;
  const expanded = input.expanded.has(id);
  const old = previous.byHostId.get(source.id);
  if (
    old &&
    old.source === source &&
    old.id === id &&
    old.expanded === expanded &&
    old.timing.completedAt.getTime() === timing.completedAt.getTime() &&
    old.timing.durationMs === timing.durationMs &&
    old.failedCount === failedCount &&
    sameIds(old.collapsibleItemIds, collapsibleItemIds) &&
    sameIds(old.messageIds, messageIds)
  ) {
    return old;
  }
  return {
    id,
    source,
    row: { ...source },
    timing,
    failedCount,
    expanded,
    collapsibleItemIds,
    messageIds,
  };
}

/** Display rows only: the full layout, copy and fork inputs remain untouched. */
export function createDesktopTurnActivityProjection() {
  let previous = EMPTY_DESKTOP_TURN_ACTIVITY;
  return (input: ProjectionInput): DesktopTurnActivityProjection => {
    const turns: StreamItem[][] = [];
    let previousItem: StreamItem | null = null;
    for (const item of input.items) {
      if (startsNewTurn(item, previousItem)) turns.push([]);
      turns.at(-1)!.push(item);
      previousItem = item;
    }
    const byHostId = new Map<string, DesktopTurnActivity>();
    for (const turn of turns) {
      const activity = buildActivity(turn, input, previous);
      if (activity) byHostId.set(activity.source.id, activity);
    }
    // A live text delta must not revise already completed history headers.
    if (
      byHostId.size === previous.byHostId.size &&
      [...byHostId].every(([id, activity]) => previous.byHostId.get(id) === activity)
    ) {
      return previous;
    }
    const hiddenItemIds = new Set<string>();
    const groupByMessageId = new Map<string, string>();
    for (const activity of byHostId.values()) {
      if (activity.expanded) continue;
      for (const id of activity.collapsibleItemIds) hiddenItemIds.add(id);
      for (const id of activity.messageIds) groupByMessageId.set(id, activity.id);
    }
    previous = { byHostId, hiddenItemIds, groupByMessageId };
    return previous;
  };
}

export function projectDesktopActivityItems(
  items: StreamItem[],
  projection: DesktopTurnActivityProjection,
): StreamItem[] {
  if (projection.byHostId.size === 0) return items;
  const result: StreamItem[] = [];
  let changed = false;
  for (const item of items) {
    const activity = projection.byHostId.get(item.id);
    if (activity) {
      result.push(activity.row);
      changed ||= activity.row !== item;
    } else if (projection.hiddenItemIds.has(item.id)) {
      changed = true;
    } else {
      result.push(item);
    }
  }
  return changed ? result : items;
}
