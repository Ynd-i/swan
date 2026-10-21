import { describe, expect, it } from "vitest";
import type { StreamItem, ToolCallItem } from "@/types/stream";
import { deriveStreamTurnTiming } from "@/timeline/turn-time";
import type { ToolCallDetailGroup } from "@/tool-calls/detail-level/projection";
import { buildOverviewGroup } from "@/tool-calls/detail-level/overview/model";
import {
  createDesktopTurnActivityProjection,
  projectDesktopActivityItems,
} from "./desktop-turn-activity";

const items: StreamItem[] = [
  {
    kind: "user_message",
    id: "user",
    turnId: "turn",
    text: "Inspect this",
    timestamp: new Date(0),
  },
  {
    kind: "assistant_message",
    id: "intro",
    turnId: "turn",
    text: "I will inspect it.",
    timestamp: new Date(1000),
  },
  {
    kind: "thought",
    id: "thought",
    turnId: "turn",
    text: "Thinking",
    status: "ready",
    timestamp: new Date(2000),
  },
  {
    kind: "tool_call",
    id: "read",
    turnId: "turn",
    timestamp: new Date(3000),
    payload: {
      source: "agent",
      data: {
        provider: "codex",
        callId: "read",
        name: "read",
        status: "completed",
        error: null,
        detail: { type: "read", filePath: "README.md", content: "hello" },
      },
    },
  },
  {
    kind: "notification",
    id: "error",
    turnId: "turn",
    timestamp: new Date(4000),
    sourceType: "error",
    level: "error",
    message: "A warning must remain visible.",
  },
  {
    kind: "assistant_message",
    id: "answer",
    turnId: "turn",
    text: "Here is the result.",
    timestamp: new Date(5000),
  },
  {
    kind: "assistant_message",
    id: "explanation",
    turnId: "turn",
    text: "And its explanation.",
    timestamp: new Date(5000),
  },
];

function inputFor(turnItems: StreamItem[], isTurnActive = false) {
  return {
    scope: "host:agent",
    items: turnItems,
    timingByAssistantId: deriveStreamTurnTiming({
      tail: turnItems,
      head: [],
      isTurnActive,
      activeTurnStartedAt: isTurnActive ? new Date(6000) : null,
    }).byAssistantId,
    expanded: new Set<string>(),
    toolGroups: new Map<string, ToolCallDetailGroup>(),
  };
}

describe("desktop turn activity", () => {
  it("leaves plain replies without an activity header, regardless of elapsed time", () => {
    const turn = items.filter(
      (item) => item.kind === "user_message" || item.kind === "assistant_message",
    );
    const input = inputFor(turn);
    expect(input.timingByAssistantId.size).toBeGreaterThan(0);
    const projection = createDesktopTurnActivityProjection()(input);
    expect(projection.byHostId.size).toBe(0);
    expect(projection.hiddenItemIds.size).toBe(0);
    expect(projectDesktopActivityItems(turn, projection)).toBe(turn);
  });
  it("folds completed activity while retaining every reply and warning", () => {
    const project = createDesktopTurnActivityProjection();
    const input = {
      scope: "host:agent",
      items,
      timingByAssistantId: deriveStreamTurnTiming({
        tail: items,
        head: [],
        isTurnActive: false,
        activeTurnStartedAt: null,
      }).byAssistantId,
      expanded: new Set<string>(),
      toolGroups: new Map<string, ToolCallDetailGroup>(),
    };
    const collapsed = project(input);
    expect(projectDesktopActivityItems(items, collapsed).map((item) => item.id)).toEqual([
      "user",
      "intro",
      "error",
      "answer",
      "explanation",
    ]);
    expect([...collapsed.hiddenItemIds]).toEqual(["intro", "thought", "read"]);
    const activity = collapsed.byHostId.get("intro")!;
    expect(activity.timing.durationMs).toBe(5000);
    expect(collapsed.groupByMessageId.get("intro")).toBe(activity.id);
    const expanded = project({ ...input, expanded: new Set([activity.id]) });
    expect(projectDesktopActivityItems(items, expanded).map((item) => item.id)).toEqual(
      items.map((item) => item.id),
    );
    expect(expanded.hiddenItemIds.size).toBe(0);
    const otherChat = project({
      ...input,
      scope: "another-host:agent",
      expanded: new Set([activity.id]),
    });
    expect(otherChat.hiddenItemIds.size).toBe(3);
    expect(items[1].id).toBe("intro");
  });

  it("keeps active text visible without revising completed headers on every delta", () => {
    const project = createDesktopTurnActivityProjection();
    const completed = project(inputFor(items));
    const live: StreamItem[] = [
      ...items,
      {
        kind: "user_message",
        id: "next-user",
        turnId: "next",
        text: "Continue",
        timestamp: new Date(6000),
      },
      {
        kind: "assistant_message",
        id: "live",
        turnId: "next",
        text: "Still working",
        timestamp: new Date(7000),
      },
    ];
    const first = project(inputFor(live, true));
    const last = live[live.length - 1]!;
    const nextLive = [
      ...live.slice(0, -1),
      { ...last, text: "Still working with more text" } as StreamItem,
    ];
    const next = project(inputFor(nextLive, true));
    expect(first).toBe(completed);
    expect(next).toBe(first);
    expect(next.byHostId.has("live")).toBe(false);
    expect(projectDesktopActivityItems(nextLive, next).at(-1)).toBe(nextLive.at(-1));
  });

  it("keeps plans visible and folds failed calls behind a counted header", () => {
    const read = items[3] as ToolCallItem;
    const failed: ToolCallItem = {
      ...read,
      id: "failed",
      payload: {
        source: "agent",
        data: {
          provider: "codex",
          callId: "failed",
          name: "shell",
          status: "failed",
          error: "Command failed",
          detail: { type: "shell", command: "false", output: "failed", exitCode: 1 },
        },
      },
    };
    const plan: ToolCallItem = {
      ...read,
      id: "plan",
      payload: {
        source: "agent",
        data: {
          provider: "codex",
          callId: "plan",
          name: "plan",
          status: "completed",
          error: null,
          detail: { type: "plan", text: "A plan that must stay visible." },
        },
      },
    };
    const planOnly = [items[0], plan, items[5]] as StreamItem[];
    const planProjection = createDesktopTurnActivityProjection()(inputFor(planOnly));
    expect(planProjection.byHostId.size).toBe(1);
    expect(planProjection.hiddenItemIds.size).toBe(0);
    const host = { ...read, id: "overview" };
    const turn = [...items.slice(0, 3), plan, host, ...items.slice(4)];
    const input = inputFor(turn);
    input.toolGroups.set(
      host.id,
      buildOverviewGroup({
        id: host.id,
        items: [failed, read],
        calls: [failed, read],
        latest: read,
        isSealed: true,
      }),
    );
    const projection = createDesktopTurnActivityProjection()(input);
    expect(projectDesktopActivityItems(turn, projection).map((item) => item.id)).toEqual([
      "user",
      "intro",
      "plan",
      "error",
      "answer",
      "explanation",
    ]);
    expect(projection.byHostId.get("intro")?.failedCount).toBe(1);
    const unfolded = createDesktopTurnActivityProjection()(inputFor(items));
    expect(unfolded.byHostId.get("intro")?.failedCount).toBe(0);
  });

  it("keeps a final reply that is only a chat proposal visible after its folded activity", () => {
    const proposal = {
      title: "Fix the gate",
      task: "Gate tools/list.",
      context: null,
      model: null,
      thinking: null,
    };
    const turn: StreamItem[] = [
      ...items.slice(0, 4),
      {
        kind: "assistant_message",
        id: "answer",
        turnId: "turn",
        text: "",
        timestamp: new Date(5000),
        proposals: [proposal],
      },
    ];
    const projection = createDesktopTurnActivityProjection()(inputFor(turn));
    expect([...projection.hiddenItemIds]).toEqual(["intro", "thought", "read"]);
    expect(projectDesktopActivityItems(turn, projection).at(-1)).toMatchObject({
      id: "answer",
      proposals: [proposal],
    });
  });

  it("does not hide a completed response that has no text after its last activity", () => {
    const turn = items.slice(0, 4);
    const projection = createDesktopTurnActivityProjection()(inputFor(turn));
    expect(projection.hiddenItemIds.size).toBe(0);
    expect(projectDesktopActivityItems(turn, projection).map((item) => item.id)).toEqual(
      turn.map((item) => item.id),
    );
  });
});

describe("desktop turn activity while the turn is working", () => {
  const read = items[3] as ToolCallItem;
  function shell(id: string, status: "running" | "completed"): ToolCallItem {
    return {
      ...read,
      id,
      payload: {
        source: "agent",
        data: {
          provider: "codex",
          callId: id,
          name: "shell",
          status,
          error: null,
          detail: { type: "shell", command: id },
        },
      },
    };
  }
  const working = [...items.slice(0, 4), shell("fetch", "running")];

  // Steps between progress messages fold as overview groups instead.
  it("leaves the active turn unfolded and folds the whole chain once it completes", () => {
    const project = createDesktopTurnActivityProjection();
    const active = project(inputFor(working, true));
    expect(active.byHostId.size).toBe(0);
    expect(projectDesktopActivityItems(working, active)).toBe(working);
    const finished = [...working.slice(0, 4), shell("fetch", "completed"), items[5]!];
    const completed = project(inputFor(finished));
    expect(projectDesktopActivityItems(finished, completed).map((item) => item.id)).toEqual([
      "user",
      "intro",
      "answer",
    ]);
    expect([...completed.hiddenItemIds]).toEqual(["intro", "thought", "read", "fetch"]);
  });
});
