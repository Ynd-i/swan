import {
  collectAllTabs,
  createWorkspaceLayoutWithExplorerSidebar,
  DEFAULT_PANE_ID,
  EXPLORER_SIDEBAR_PANE_ID,
  findPaneById,
  type SplitNode,
  type SplitPane,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-actions";
import { generateDraftId } from "@/stores/draft-keys";
import { createNewWorkspaceTab } from "@/workspace-tabs/new-tab";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";

type PaneWithTabs = SplitPane & { tabs: WorkspaceTab[] };

export function isMainChatTarget(target: WorkspaceTabTarget): boolean {
  return target.kind === "agent" || target.kind === "draft";
}

function allPanes(node: SplitNode): PaneWithTabs[] {
  return node.kind === "pane" ? [node.pane as PaneWithTabs] : node.group.children.flatMap(allPanes);
}

function withTabs(
  pane: PaneWithTabs,
  tabs: WorkspaceTab[],
  focusedTabId: string | null,
  hidden: boolean,
): PaneWithTabs {
  if (
    pane.focusedTabId === focusedTabId &&
    (pane.hidden === true) === hidden &&
    pane.tabs.length === tabs.length &&
    pane.tabs.every((tab, index) => tab === tabs[index])
  )
    return pane;
  return { ...pane, tabs, tabIds: tabs.map((tab) => tab.tabId), focusedTabId, hidden };
}

function separateChatTabs(
  layout: WorkspaceLayout,
  explorer: PaneWithTabs,
): { chats: WorkspaceTab[]; tools: WorkspaceTab[] } {
  const chats: WorkspaceTab[] = [];
  const tools: WorkspaceTab[] = [];
  for (const tab of collectAllTabs(layout.root)) {
    if (isMainChatTarget(tab.target)) {
      chats.push(tab);
    } else if (tab.target.kind === "new_tab" && !explorer.tabIds.includes(tab.tabId)) {
      chats.push({ ...tab, target: { kind: "draft", draftId: generateDraftId() } });
    } else {
      tools.push(tab);
    }
  }
  if (chats.length === 0) {
    const tab = createNewWorkspaceTab();
    chats.push({ ...tab, target: { kind: "draft", draftId: generateDraftId() } });
  }
  return { chats, tools };
}

function joinPanes(
  layout: WorkspaceLayout,
  main: PaneWithTabs,
  explorer: PaneWithTabs,
): WorkspaceLayout {
  const children: { kind: "pane"; pane: SplitPane }[] = [
    { kind: "pane", pane: main },
    { kind: "pane", pane: explorer },
  ];
  const rootUnchanged =
    layout.root.kind === "group" &&
    layout.root.group.direction === "horizontal" &&
    layout.root.group.children.length === 2 &&
    layout.root.group.children.every(
      (child, index) => child.kind === "pane" && child.pane === children[index]?.pane,
    );
  const root: SplitNode = rootUnchanged
    ? layout.root
    : {
        kind: "group",
        group: {
          id: layout.root.kind === "group" ? layout.root.group.id : "mac-chat-root",
          direction: "horizontal",
          children,
          sizes: [0.78, 0.22],
        },
      };
  const focusedPaneId = layout.focusedPaneId === null ? null : main.id;
  return root === layout.root && focusedPaneId === layout.focusedPaneId
    ? layout
    : { ...layout, root, focusedPaneId };
}

/** Moves existing instances without closing resources or discarding panel state. */
export function toSingleChatLayout(
  layout: WorkspaceLayout,
  explorerPaneId: string | null,
): WorkspaceLayout {
  const panes = allPanes(layout.root);
  const explorer =
    panes.find((pane) => pane.id === explorerPaneId) ??
    panes.find((pane) => pane.id === EXPLORER_SIDEBAR_PANE_ID) ??
    (findPaneById(
      createWorkspaceLayoutWithExplorerSidebar().root,
      EXPLORER_SIDEBAR_PANE_ID,
    ) as PaneWithTabs);
  const main = panes.find((pane) => pane.id === DEFAULT_PANE_ID && pane.id !== explorer.id) ??
    panes.find((pane) => pane.id !== explorer.id && !pane.hidden) ?? {
      id: explorer.id === DEFAULT_PANE_ID ? "chat-main" : DEFAULT_PANE_ID,
      tabs: [],
      tabIds: [],
      focusedTabId: null,
    };
  const { chats, tools } = separateChatTabs(layout, explorer);
  if (!panes.includes(explorer)) tools.push(...explorer.tabs);
  const focusedPane = panes.find((pane) => pane.id === layout.focusedPaneId);
  const focusedChat =
    chats.find((tab) => tab.tabId === focusedPane?.focusedTabId) ??
    chats.find((tab) => tab.tabId === main.focusedTabId) ??
    chats.find((tab) => panes.some((pane) => pane.focusedTabId === tab.tabId)) ??
    chats[0];
  const movedTools = tools.filter((tab) => !explorer.tabIds.includes(tab.tabId));
  const movedActiveTool =
    movedTools.find((tab) => tab.tabId === focusedPane?.focusedTabId) ??
    movedTools.find((tab) => panes.some((pane) => !pane.hidden && pane.focusedTabId === tab.tabId));
  const nextMain = withTabs(main, chats, focusedChat.tabId, false);
  const nextExplorer = withTabs(
    explorer,
    tools,
    movedActiveTool?.tabId ??
      tools.find((tab) => tab.tabId === explorer.focusedTabId)?.tabId ??
      tools[0]?.tabId ??
      null,
    !movedActiveTool && explorer.hidden === true,
  );
  return joinPanes(layout, nextMain, nextExplorer);
}
