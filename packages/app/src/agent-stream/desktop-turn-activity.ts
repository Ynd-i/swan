import type { StreamItem } from "@/types/stream";
import type { TurnTiming } from "@/timeline/turn-time";
import type { ToolCallDetailProjection } from "@/tool-calls/detail-level/projection";
import { describeToolCall, isGroupableToolCall } from "@/tool-calls/detail-level/grouping";
import { getStreamItemMessageId } from "./presentation";
import { startsNewTurn } from "./turn-membership";

/** A finished turn folds behind its duration; a running turn shows its latest step. */
export type DesktopTurnActivityState =
  | { kind: "complete"; timing: TurnTiming }
  | { kind: "working"; latestStep: StreamItem };

export interface DesktopTurnActivity {
  id: string;
  source: StreamItem;
  row: StreamItem;
  state: DesktopTurnActivityState;
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
  isTurnActive: boolean;
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

// While working, replies in progress stay readable and unfinished steps fold.
function canCollapse(
  item: StreamItem,
  groups: ProjectionInput["toolGroups"],
  working: boolean,
): boolean {
  if (item.kind === "assistant_message") return !working;
  if (item.kind === "thought") return working || item.status === "ready";
  if (!isGroupableToolCall(item)) return false;
  // An overview host can contain a failed call even when its latest call succeeded.
  const calls = groups.get(item.id)?.run.calls ?? [item];
  return calls.every((call) => {
    const detail = describeToolCall(call);
    if (detail.error) return false;
    if (detail.status === "completed") return true;
    return working && (detail.status === "running" || detail.status === "executing");
  });
}

function latestStepOf(item: StreamItem, groups: ProjectionInput["toolGroups"]): StreamItem {
  return groups.get(item.id)?.run.items.at(-1) ?? item;
}

function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function sameState(left: DesktopTurnActivityState, right: DesktopTurnActivityState): boolean {
  if (left.kind === "complete" && right.kind === "complete") {
    return (
      left.timing.completedAt.getTime() === right.timing.completedAt.getTime() &&
      left.timing.durationMs === right.timing.durationMs
    );
  }
  if (left.kind === "working" && right.kind === "working") {
    const [a, b] = [left.latestStep, right.latestStep];
    // A streaming thought keeps the same label, so its deltas must not revise the row.
    return a === b || (a.kind === "thought" && b.kind === "thought" && a.id === b.id);
  }
  return false;
}

function collectComplete(turn: StreamItem[], input: ProjectionInput) {
  const assistant = turn.find((item) => input.timingByAssistantId.has(item.id));
  const timing = assistant && input.timingByAssistantId.get(assistant.id);
  // Tool-only/error-only responses stay fully visible.
  if (!timing) return null;
  const boundary = turn.findLastIndex(isStep);
  if (boundary < 0 && !turn.some((item) => item.kind === "tool_call")) return null;
  const hasReply = turn.slice(boundary + 1).some((item) => item.kind === "assistant_message");
  const collapsible = hasReply
    ? turn.slice(0, boundary + 1).filter((item) => canCollapse(item, input.toolGroups, false))
    : [];
  return { state: { kind: "complete", timing } as const, collapsible };
}

function collectWorking(turn: StreamItem[], input: ProjectionInput) {
  const steps = turn.filter(isStep);
  const latest = steps.at(-1);
  if (!latest) return null;
  return {
    state: { kind: "working", latestStep: latestStepOf(latest, input.toolGroups) } as const,
    collapsible: steps.filter((item) => canCollapse(item, input.toolGroups, true)),
  };
}

function buildActivity(
  turn: StreamItem[],
  working: boolean,
  input: ProjectionInput,
  previous: DesktopTurnActivityProjection,
): DesktopTurnActivity | null {
  const source = turn.find((item) => item.kind !== "user_message");
  if (!source) return null;
  const collected = working ? collectWorking(turn, input) : collectComplete(turn, input);
  if (!collected) return null;
  const { state, collapsible } = collected;
  const collapsibleItemIds = new Set(collapsible.map((item) => item.id));
  const messageIds = new Set(collapsible.map(getStreamItemMessageId));
  // The first row keeps the id stable while a running turn keeps appending.
  const turnId = turn.find((item) => item.turnId)?.turnId ?? getStreamItemMessageId(turn[0]!);
  const id = `${input.scope}:${turnId}`;
  const expanded = input.expanded.has(id);
  const old = previous.byHostId.get(source.id);
  if (
    old &&
    old.source === source &&
    old.id === id &&
    old.expanded === expanded &&
    sameState(old.state, state) &&
    sameIds(old.collapsibleItemIds, collapsibleItemIds) &&
    sameIds(old.messageIds, messageIds)
  ) {
    return old;
  }
  return { id, source, row: { ...source }, state, expanded, collapsibleItemIds, messageIds };
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
    turns.forEach((turn, index) => {
      const working = input.isTurnActive && index === turns.length - 1;
      const activity = buildActivity(turn, working, input, previous);
      if (activity) byHostId.set(activity.source.id, activity);
    });
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
