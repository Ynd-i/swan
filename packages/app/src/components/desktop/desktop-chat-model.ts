import {
  getParentAgentIdFromLabels,
  HANDOFF_FROM_AGENT_ID_LABEL,
} from "@getpaseo/protocol/agent-labels";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import type {
  SidebarProjectEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/use-sidebar-workspaces-list";
import { isWorkspaceRootAgent } from "@/subagents/policies";
import { isChatFolderPath } from "@/projects/chat-folder";
import { applyStoredOrdering } from "@/hooks/sidebar-workspaces-view-model";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import type { StreamItem } from "@/types/stream";
import {
  DATE_SECTION_ORDER,
  deriveDateSectionKey,
  type DateSectionKey,
} from "@/utils/date-sections";

// Generic agent metadata keeps these preferences synced without changing the daemon protocol.
export const DESKTOP_CHAT_PINNED_AT = "codex-ui.pinned-at";
export const DESKTOP_CHAT_UNREAD = "codex-ui.unread";

export function desktopChatKey(agent: Pick<AggregatedAgent, "serverId" | "id">): string {
  return `${agent.serverId}:${agent.id}`;
}

export function desktopChatPinnedAt(agent: Pick<AggregatedAgent, "labels">): number | null {
  const timestamp = Date.parse(agent.labels[DESKTOP_CHAT_PINNED_AT] ?? "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isDesktopChatUnread(
  agent: Pick<AggregatedAgent, "labels" | "requiresAttention">,
): boolean {
  return Boolean(agent.requiresAttention || agent.labels[DESKTOP_CHAT_UNREAD] === "true");
}

export interface DesktopChatProject {
  project: SidebarProjectEntry;
  chats: AggregatedAgent[];
  emptyWorkspaces: SidebarWorkspacePlacement[];
}

/** The earlier chats an auto handoff continued, keyed by the chat that continues them. */
export type HandoffChains = ReadonlyMap<string, AggregatedAgent[]>;

/**
 * Folds auto-handoff chains: the newest visible chat of a chain is its head, and the earlier
 * visible ones nest under it, newest first. Archived links are walked through, not shown.
 * `visible` is newest first, so a source handed off twice belongs to its newest successor.
 */
function foldHandoffChains(
  visible: readonly AggregatedAgent[],
  agentByKey: ReadonlyMap<string, AggregatedAgent>,
): { heads: AggregatedAgent[]; chains: Map<string, AggregatedAgent[]> } {
  const visibleKeys = new Set(visible.map(desktopChatKey));
  const claimed = new Set<string>();
  const chains = new Map<string, AggregatedAgent[]>();
  for (const agent of visible) {
    const head = desktopChatKey(agent);
    if (claimed.has(head)) continue;
    const chain: AggregatedAgent[] = [];
    const seen = new Set([head]);
    let sourceId = agent.labels[HANDOFF_FROM_AGENT_ID_LABEL];
    while (sourceId) {
      const key = `${agent.serverId}:${sourceId}`;
      const source = agentByKey.get(key);
      if (!source || seen.has(key)) break;
      seen.add(key);
      if (visibleKeys.has(key) && !claimed.has(key)) {
        claimed.add(key);
        chain.push(source);
      }
      sourceId = source.labels[HANDOFF_FROM_AGENT_ID_LABEL];
    }
    if (chain.length > 0) chains.set(head, chain);
  }
  return { heads: visible.filter((agent) => !claimed.has(desktopChatKey(agent))), chains };
}

/** A chain is pinned while any of its chats is, so a handoff keeps the chat in Pinned. */
export function chainPinnedAt(
  agent: Pick<AggregatedAgent, "labels">,
  chain: readonly Pick<AggregatedAgent, "labels">[] = [],
): number | null {
  const pins = [agent, ...chain].flatMap((member) => desktopChatPinnedAt(member) ?? []);
  return pins.length > 0 ? Math.max(...pins) : null;
}

export function buildDesktopChatSidebar({
  projects,
  agents,
}: {
  projects: readonly SidebarProjectEntry[];
  agents: readonly AggregatedAgent[];
}): {
  projects: DesktopChatProject[];
  pinned: AggregatedAgent[];
  recent: AggregatedAgent[];
  handoffs: HandoffChains;
} {
  const projectByWorkspace = new Map<string, string>();
  for (const project of projects) {
    for (const workspace of project.workspaces) {
      projectByWorkspace.set(workspace.workspaceKey, project.viewKey);
    }
  }
  const agentByKey = new Map(agents.map((agent) => [desktopChatKey(agent), agent]));
  const visible = agents
    .filter((agent) => {
      if (agent.archivedAt || !projectByWorkspace.has(`${agent.serverId}:${agent.workspaceId}`)) {
        return false;
      }
      const parentAgentId = getParentAgentIdFromLabels(agent.labels);
      return isWorkspaceRootAgent(
        { workspaceId: agent.workspaceId, parentAgentId },
        parentAgentId ? agentByKey.get(`${agent.serverId}:${parentAgentId}`) : undefined,
      );
    })
    .sort(
      (left, right) =>
        right.lastActivityAt.getTime() - left.lastActivityAt.getTime() ||
        desktopChatKey(left).localeCompare(desktopChatKey(right)),
    );
  const { heads, chains } = foldHandoffChains(visible, agentByKey);
  const pinnedAt = (agent: AggregatedAgent) =>
    chainPinnedAt(agent, chains.get(desktopChatKey(agent)));
  const chatsByProject = new Map<string, AggregatedAgent[]>();
  const workspacesWithChats = new Set<string>();
  for (const agent of heads) {
    const workspaceKey = `${agent.serverId}:${agent.workspaceId}`;
    const projectKey = projectByWorkspace.get(workspaceKey)!;
    const chats = chatsByProject.get(projectKey) ?? [];
    chats.push(agent);
    chatsByProject.set(projectKey, chats);
    workspacesWithChats.add(workspaceKey);
  }
  return {
    // A chat without a project lives in a chat folder project; it shows in Recent only.
    projects: projects
      .filter((project) => !isChatFolderPath(project.iconWorkingDir))
      .map((project) => {
        const chats = chatsByProject.get(project.viewKey) ?? [];
        return {
          project,
          chats,
          // A project without chats keeps its last workspace only so the daemon keeps the project
          // (see selectEmptiedWorkspaces); its row would repeat the header. Worktrees stay listed
          // because they can hold uncommitted work.
          emptyWorkspaces: project.workspaces.filter(
            (workspace) =>
              !workspacesWithChats.has(workspace.workspaceKey) &&
              (chats.length > 0 || workspace.workspaceKind === "worktree"),
          ),
        };
      }),
    pinned: heads
      .filter((agent) => pinnedAt(agent) !== null)
      .sort((left, right) => pinnedAt(right)! - pinnedAt(left)!),
    recent: heads.filter((agent) => pinnedAt(agent) === null),
    handoffs: chains,
  };
}

/**
 * Workspaces an archive left without an unarchived agent, so they archive with their last chat.
 * Worktrees keep their row because archiving one can remove uncommitted work, and each project
 * keeps one workspace because the daemon treats a project without one as archived.
 */
export function selectEmptiedWorkspaces(input: {
  workspaceIds: Iterable<string | undefined>;
  workspaces: Iterable<Pick<WorkspaceDescriptor, "id" | "projectId" | "workspaceKind">>;
  agents: Iterable<{ workspaceId?: string; archivedAt?: Date | null }>;
}): string[] {
  const workspaces = [...input.workspaces];
  const inUse = new Set<string | undefined>();
  for (const agent of input.agents) if (!agent.archivedAt) inUse.add(agent.workspaceId);
  const remaining = new Map<string, number>();
  for (const workspace of workspaces)
    remaining.set(workspace.projectId, (remaining.get(workspace.projectId) ?? 0) + 1);
  const emptied: string[] = [];
  for (const workspaceId of new Set(input.workspaceIds)) {
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace || workspace.workspaceKind === "worktree" || inUse.has(workspaceId)) continue;
    const count = remaining.get(workspace.projectId) ?? 0;
    if (count <= 1) continue;
    remaining.set(workspace.projectId, count - 1);
    emptied.push(workspace.id);
  }
  return emptied;
}

export type ChatSectionSort = "latest" | "manual";

function byLatestActivity(left: AggregatedAgent, right: AggregatedAgent): number {
  return right.lastActivityAt.getTime() - left.lastActivityAt.getTime();
}

/**
 * Latest follows activity. Manual applies the stored drag order and leaves chats it has never
 * seen where `chats` puts them, so a new chat still arrives on top of a hand-ordered section.
 */
export function orderSectionChats(
  chats: AggregatedAgent[],
  sort: ChatSectionSort,
  storedOrder: string[],
): AggregatedAgent[] {
  if (sort === "latest") return [...chats].sort(byLatestActivity);
  return applyStoredOrdering({ items: chats, storedOrder, getKey: desktopChatKey });
}

export interface CustomChatSection {
  id: string;
  name: string;
  chats: AggregatedAgent[];
  projects: DesktopChatProject[];
}

/**
 * Moves pinned projects to Pinned, then chats and projects assigned to a custom section out of
 * Recent and Projects. Pinned chats stay pinned, and an assignment to a section that no longer
 * exists is ignored. A handoff chat without its own assignment follows its chain's.
 */
export function partitionChatSections({
  recent,
  projects,
  sections,
  chatSection,
  projectSection,
  pinnedProjects,
  handoffs = new Map(),
}: {
  recent: AggregatedAgent[];
  projects: DesktopChatProject[];
  sections: readonly { id: string; name: string }[];
  chatSection: Readonly<Record<string, string>>;
  projectSection: Readonly<Record<string, string>>;
  pinnedProjects: readonly string[];
  handoffs?: HandoffChains;
}): {
  recent: AggregatedAgent[];
  projects: DesktopChatProject[];
  pinnedProjects: DesktopChatProject[];
  custom: CustomChatSection[];
} {
  const custom = new Map<string, CustomChatSection>(
    sections.map((section) => [section.id, { ...section, chats: [], projects: [] }]),
  );
  const remainingRecent: AggregatedAgent[] = [];
  for (const agent of recent) {
    const key = desktopChatKey(agent);
    const sectionId = [key, ...(handoffs.get(key) ?? []).map(desktopChatKey)]
      .map((member) => chatSection[member])
      .find((id) => id !== undefined);
    const section = custom.get(sectionId ?? "");
    if (section) section.chats.push(agent);
    else remainingRecent.push(agent);
  }
  const pinned = new Set(pinnedProjects);
  const remainingProjects: DesktopChatProject[] = [];
  for (const entry of projects) {
    if (pinned.has(entry.project.viewKey)) continue;
    const section = custom.get(projectSection[entry.project.viewKey] ?? "");
    if (section) section.projects.push(entry);
    else remainingProjects.push(entry);
  }
  const projectByKey = new Map(projects.map((entry) => [entry.project.viewKey, entry]));
  return {
    recent: remainingRecent,
    projects: remainingProjects,
    pinnedProjects: pinnedProjects.flatMap((key) => projectByKey.get(key) ?? []),
    custom: [...custom.values()],
  };
}

export interface ChatInbox {
  /** Chats waiting on the user: a pending permission or an error; finished chats are not. */
  priority: AggregatedAgent[];
  /** Everything else that is not running, newest first, by day. */
  groups: { key: DateSectionKey; chats: AggregatedAgent[] }[];
}

function needsAttention(agent: AggregatedAgent): boolean {
  if ((agent.pendingPermissionCount ?? 0) > 0) return true;
  return Boolean(agent.requiresAttention) && agent.attentionReason !== "finished";
}

/** The notification view: across every section, what needs the user, then what finished. */
export function buildChatInbox(chats: readonly AggregatedAgent[]): ChatInbox {
  const sorted = [...chats].sort(byLatestActivity);
  const groups = new Map<DateSectionKey, AggregatedAgent[]>();
  for (const agent of sorted) {
    if (needsAttention(agent) || agent.turn.phase === "open") continue;
    const key = deriveDateSectionKey(agent.lastActivityAt);
    groups.set(key, [...(groups.get(key) ?? []), agent]);
  }
  return {
    priority: sorted.filter(needsAttention),
    groups: DATE_SECTION_ORDER.flatMap((key) => {
      const entries = groups.get(key);
      return entries ? [{ key, chats: entries }] : [];
    }),
  };
}

/** The last reply of a chat whose timeline this client already holds, as one plain line. */
export function latestReplyPreview(items: readonly StreamItem[] | undefined): string | null {
  for (let index = (items?.length ?? 0) - 1; index >= 0; index -= 1) {
    const item = items![index];
    if (item.kind !== "assistant_message") continue;
    const text = item.text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#>*_`~[\]]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) return text.slice(0, 200);
  }
  return null;
}
