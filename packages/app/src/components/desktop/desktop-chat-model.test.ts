import { expect, it } from "vitest";
import {
  HANDOFF_FROM_AGENT_ID_LABEL,
  PARENT_AGENT_ID_LABEL,
} from "@getpaseo/protocol/agent-labels";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";
import {
  buildChatInbox,
  buildDesktopChatSidebar,
  DESKTOP_CHAT_PINNED_AT,
  DESKTOP_CHAT_UNREAD,
  isDesktopChatUnread,
  latestReplyPreview,
  orderSectionChats,
  partitionChatSections,
  selectEmptiedWorkspaces,
  type DesktopChatProject,
} from "./desktop-chat-model";

function chat(id: string, serverId: string, workspaceId: string): AggregatedAgent {
  return {
    id,
    serverId,
    workspaceId,
    serverLabel: serverId,
    title: id,
    provider: "codex",
    cwd: "/same-directory",
    status: "idle",
    turn: { phase: "idle", cancellationRequestId: null },
    createdAt: new Date("2026-09-30T08:00:00Z"),
    lastActivityAt: new Date("2026-09-30T09:00:00Z"),
    labels: {},
  };
}

function project(viewKey: string, serverId: string, workspaceIds: string[]): SidebarProjectEntry {
  return {
    viewKey,
    projectName: viewKey,
    projectKind: "git",
    iconWorkingDir: "/same-directory",
    hosts: [],
    workspaces: workspaceIds.map((workspaceId) => ({
      serverId,
      workspaceId,
      workspaceKey: `${serverId}:${workspaceId}`,
      projectViewKey: viewKey,
      projectName: viewKey,
      projectKind: "git",
      workspaceKind: "local_checkout",
      name: workspaceId,
    })),
  };
}

it("lists a chat without a project in Recent but not its chat folder in Projects", () => {
  const chatFolder = {
    ...project("brave-fox", "local", ["chat-folder"]),
    iconWorkingDir: "/Users/me/Documents/Paseo/2026-10-03/brave-fox",
  };
  const projectless = chat("projectless", "local", "chat-folder");

  const model = buildDesktopChatSidebar({
    projects: [chatFolder, project("app", "local", ["main"])],
    agents: [projectless],
  });

  expect(model.projects.map((entry) => entry.project.viewKey)).toEqual(["app"]);
  expect(model.recent).toEqual([projectless]);
});

it("keeps chat and host identities distinct without losing empty workspaces", () => {
  const first = chat("same-id", "local", "one");
  const sibling = chat("sibling", "local", "one");
  sibling.lastActivityAt = new Date("2026-09-30T10:00:00Z");
  first.labels[DESKTOP_CHAT_PINNED_AT] = "2026-09-30T11:00:00Z";
  const remote = chat("same-id", "remote", "one");
  const child = chat("child", "local", "one");
  child.labels[PARENT_AGENT_ID_LABEL] = first.id;
  const crossWorkspaceChild = chat("cross-child", "local", "two");
  crossWorkspaceChild.labels[PARENT_AGENT_ID_LABEL] = first.id;
  const archived = chat("archived", "local", "one");
  archived.archivedAt = new Date("2026-09-30T11:00:00Z");
  const model = buildDesktopChatSidebar({
    projects: [
      project("local-project", "local", ["one", "two", "empty"]),
      project("remote-project", "remote", ["one"]),
    ],
    agents: [
      first,
      sibling,
      remote,
      child,
      crossWorkspaceChild,
      archived,
      chat("filtered-host", "other", "one"),
    ],
  });

  expect(model.pinned.map((agent) => `${agent.serverId}:${agent.id}`)).toEqual(["local:same-id"]);
  expect(model.recent.map((agent) => `${agent.serverId}:${agent.id}`)).toEqual([
    "local:sibling",
    "local:cross-child",
    "remote:same-id",
  ]);
  expect(model.projects[0]?.chats.map((agent) => agent.id)).toEqual([
    "sibling",
    "cross-child",
    "same-id",
  ]);
  expect(model.projects[0]?.emptyWorkspaces.map((workspace) => workspace.workspaceId)).toEqual([
    "empty",
  ]);
  expect(model.projects[1]?.chats.map((agent) => agent.serverId)).toEqual(["remote"]);

  sibling.labels[DESKTOP_CHAT_UNREAD] = "true";
  expect(isDesktopChatUnread(first)).toBe(false);
  expect(isDesktopChatUnread(sibling)).toBe(true);
  sibling.labels[DESKTOP_CHAT_UNREAD] = "false";
  expect(isDesktopChatUnread(sibling)).toBe(false);
  sibling.requiresAttention = true;
  expect(isDesktopChatUnread(sibling)).toBe(true);
});

it("keeps new chats on top of a manually ordered section", () => {
  const older = chat("older", "local", "one");
  const middle = chat("middle", "local", "one");
  const fresh = chat("fresh", "local", "one");
  older.lastActivityAt = new Date("2026-09-30T08:00:00Z");
  middle.lastActivityAt = new Date("2026-09-30T09:00:00Z");
  fresh.lastActivityAt = new Date("2026-09-30T10:00:00Z");
  const byActivity = [fresh, middle, older];
  const keys = (chats: AggregatedAgent[]) => chats.map((entry) => entry.id);
  expect(keys(orderSectionChats(byActivity, "manual", ["local:older", "local:middle"]))).toEqual([
    "fresh",
    "older",
    "middle",
  ]);
  expect(keys(orderSectionChats([older, fresh, middle], "latest", ["local:older"]))).toEqual([
    "fresh",
    "middle",
    "older",
  ]);
});

it("moves assigned chats and projects into existing custom sections only", () => {
  const kept = chat("kept", "local", "one");
  const moved = chat("moved", "local", "one");
  const orphaned = chat("orphaned", "local", "one");
  const app: DesktopChatProject = {
    project: project("app", "local", ["one"]),
    chats: [],
    emptyWorkspaces: [],
  };
  const docs: DesktopChatProject = {
    project: project("docs", "local", []),
    chats: [],
    emptyWorkspaces: [],
  };
  const pinned: DesktopChatProject = {
    project: project("pinned", "local", []),
    chats: [],
    emptyWorkspaces: [],
  };
  const result = partitionChatSections({
    recent: [kept, moved, orphaned],
    projects: [app, docs, pinned],
    sections: [{ id: "work", name: "Work" }],
    chatSection: { "local:moved": "work", "local:orphaned": "removed-section" },
    projectSection: { docs: "work", pinned: "work" },
    // A pinned project shows in Pinned only, even when it was also filed in a section.
    pinnedProjects: ["pinned", "gone"],
  });
  expect(result.recent.map((entry) => entry.id)).toEqual(["kept", "orphaned"]);
  expect(result.projects.map((entry) => entry.project.viewKey)).toEqual(["app"]);
  expect(result.pinnedProjects).toEqual([pinned]);
  expect(result.custom).toEqual([{ id: "work", name: "Work", chats: [moved], projects: [docs] }]);
});

it("puts chats needing the user first and groups finished chats by day", () => {
  const now = Date.now();
  const waiting = chat("waiting", "local", "one");
  waiting.pendingPermissionCount = 1;
  const running = chat("running", "local", "one");
  running.turn = { phase: "open", cancellationRequestId: null } as AggregatedAgent["turn"];
  const failed = chat("failed", "local", "one");
  failed.requiresAttention = true;
  failed.attentionReason = "error";
  const today = chat("today", "local", "one");
  today.lastActivityAt = new Date(now);
  // A finished turn the user has not seen yet is news, not a task.
  today.requiresAttention = true;
  today.attentionReason = "finished";
  const old = chat("old", "local", "one");
  old.lastActivityAt = new Date(now - 40 * 86_400_000);
  const inbox = buildChatInbox([old, running, today, waiting, failed]);
  expect(inbox.priority.map((entry) => entry.id).sort()).toEqual(["failed", "waiting"]);
  expect(inbox.groups.map((group) => [group.key, group.chats.map((entry) => entry.id)])).toEqual([
    ["today", ["today"]],
    ["older", ["old"]],
  ]);
});

it("previews the last reply as one plain line", () => {
  const reply = (text: string) =>
    ({ kind: "assistant_message", id: text, text, timestamp: new Date() }) as never;
  expect(latestReplyPreview(undefined)).toBeNull();
  expect(
    latestReplyPreview([reply("first"), reply("**Done.** Fixed `the bug`.\n\n```ts\ncode\n```")]),
  ).toBe("Done. Fixed the bug.");
});

it("archives workspaces left without chats but keeps worktrees and each project's last one", () => {
  const workspaces = [
    { id: "a", projectId: "app", workspaceKind: "directory" as const },
    { id: "b", projectId: "app", workspaceKind: "directory" as const },
    { id: "c", projectId: "app", workspaceKind: "directory" as const },
    { id: "tree", projectId: "app", workspaceKind: "worktree" as const },
    { id: "solo", projectId: "lib", workspaceKind: "local_checkout" as const },
  ];
  const archivedAt = new Date();
  const agents = [
    { workspaceId: "a", archivedAt },
    { workspaceId: "b", archivedAt },
    { workspaceId: "b", archivedAt: null },
    { workspaceId: "c", archivedAt },
  ];
  expect(
    selectEmptiedWorkspaces({
      workspaceIds: ["a", "b", "tree", "solo", "gone"],
      workspaces,
      agents,
    }),
  ).toEqual(["a"]);
  // The project keeps "tree" active, so both directory workspaces can go.
  expect(selectEmptiedWorkspaces({ workspaceIds: ["a", "c", "a"], workspaces, agents })).toEqual([
    "a",
    "c",
  ]);
  expect(
    selectEmptiedWorkspaces({
      workspaceIds: ["a", "c"],
      workspaces: [workspaces[0]!, workspaces[2]!],
      agents,
    }),
  ).toEqual(["a"]);
});

function handoff(id: string, from: string | null, minute: number): AggregatedAgent {
  return {
    ...chat(id, "local", "main"),
    lastActivityAt: new Date(`2026-09-30T09:${String(minute).padStart(2, "0")}:00Z`),
    labels: from ? { [HANDOFF_FROM_AGENT_ID_LABEL]: from } : {},
  };
}

it("nests a handoff chain under its newest chat, newest first", () => {
  const first = handoff("first", null, 1);
  const second = handoff("second", "first", 2);
  const third = handoff("third", "second", 3);
  const other = handoff("other", null, 4);
  const sidebar = buildDesktopChatSidebar({
    projects: [project("app", "local", ["main"])],
    agents: [first, second, third, other],
  });

  expect(sidebar.recent.map((agent) => agent.id)).toEqual(["other", "third"]);
  expect(sidebar.handoffs.get("local:third")?.map((agent) => agent.id)).toEqual([
    "second",
    "first",
  ]);
  expect(sidebar.handoffs.has("local:other")).toBe(false);
});

it("walks through archived links and promotes the newest chat left", () => {
  const first = handoff("first", null, 1);
  const second = { ...handoff("second", "first", 2), archivedAt: new Date() };
  const third = handoff("third", "second", 3);
  const projects = [project("app", "local", ["main"])];

  const throughArchived = buildDesktopChatSidebar({ projects, agents: [first, second, third] });
  expect(throughArchived.recent.map((agent) => agent.id)).toEqual(["third"]);
  expect(throughArchived.handoffs.get("local:third")?.map((agent) => agent.id)).toEqual(["first"]);

  const headArchived = buildDesktopChatSidebar({
    projects,
    agents: [first, handoff("second", "first", 2), { ...third, archivedAt: new Date() }],
  });
  expect(headArchived.recent.map((agent) => agent.id)).toEqual(["second"]);
  expect(headArchived.handoffs.get("local:second")?.map((agent) => agent.id)).toEqual(["first"]);
});

it("keeps a chain in Pinned and in its section after a handoff", () => {
  const first = {
    ...handoff("first", null, 1),
    labels: { [DESKTOP_CHAT_PINNED_AT]: "2026-09-30T08:00:00Z" },
  };
  const projects = [project("app", "local", ["main"])];
  const pinned = buildDesktopChatSidebar({
    projects,
    agents: [first, handoff("second", "first", 2)],
  });
  expect(pinned.pinned.map((agent) => agent.id)).toEqual(["second"]);
  expect(pinned.recent).toEqual([]);

  const sidebar = buildDesktopChatSidebar({
    projects,
    agents: [handoff("first", null, 1), handoff("second", "first", 2)],
  });
  const partition = partitionChatSections({
    recent: sidebar.recent,
    projects: sidebar.projects,
    sections: [{ id: "work", name: "Work" }],
    chatSection: { "local:first": "work" },
    projectSection: {},
    pinnedProjects: [],
    handoffs: sidebar.handoffs,
  });
  expect(partition.recent).toEqual([]);
  expect(partition.custom[0]?.chats.map((agent) => agent.id)).toEqual(["second"]);
});

it("lists no placeholder workspace for a project whose chats are all archived", () => {
  const archived = { ...chat("done", "local", "main"), archivedAt: new Date() };
  const app = project("app", "local", ["main"]);
  const withWorktree = {
    ...app,
    workspaces: [
      ...app.workspaces,
      {
        ...app.workspaces[0]!,
        workspaceId: "tree",
        workspaceKey: "local:tree",
        workspaceKind: "worktree" as const,
      },
    ],
  };

  const sidebar = buildDesktopChatSidebar({ projects: [withWorktree], agents: [archived] });

  expect(sidebar.projects[0]?.chats).toEqual([]);
  expect(sidebar.projects[0]?.emptyWorkspaces.map((workspace) => workspace.workspaceId)).toEqual([
    "tree",
  ]);
});
