import { useCallback, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { resolveFocusedChatTarget } from "@/composer/focused-chat-target";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import {
  getLastWorkspaceSelection,
  useActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceFields } from "@/stores/session-store-hooks";
import {
  collectAllTabs,
  findPaneById,
  useWorkspaceLayoutStore,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import { redirectIfArchivingActiveWorkspace } from "@/utils/sidebar-workspace-archive-redirect";
import { archiveWorkspaceOptimistically } from "@/workspace/workspace-archive";
import { purgeArchivedWorkspaceState } from "@/workspace/use-workspace-archive";
import {
  updateDesktopChat,
  type DesktopChatAction,
  type DesktopChatTarget,
} from "./desktop-chat-actions";
import { selectEmptiedWorkspaces } from "./desktop-chat-model";

function focusedAgentId(layout: WorkspaceLayout | undefined): string | null {
  if (!layout) return null;
  const pane = findPaneById(layout.root, layout.focusedPaneId);
  const tab = collectAllTabs(layout.root).find((item) => item.tabId === pane?.focusedTabId);
  return tab?.target.kind === "agent" ? tab.target.agentId : null;
}

export function useActiveDesktopChat() {
  const selection = useActiveWorkspaceSelection();
  const serverId = selection?.serverId ?? null;
  const workspaceId = useWorkspaceFields(
    serverId,
    selection?.workspaceId ?? null,
    (workspace) => workspace.id,
  );
  const layout = useWorkspaceLayoutStore((state) =>
    serverId && workspaceId ? state.layoutByWorkspace[`${serverId}:${workspaceId}`] : undefined,
  );
  const agentId = useMemo(() => {
    if (!serverId || !layout) return null;
    const focused = resolveFocusedChatTarget({ serverId, layout });
    const tab = collectAllTabs(layout.root).find((item) => item.tabId === focused?.tabId);
    return tab?.target.kind === "agent" ? tab.target.agentId : null;
  }, [serverId, layout]);
  return useMemo(
    () => (serverId && workspaceId && agentId ? { serverId, workspaceId, agentId } : null),
    [serverId, workspaceId, agentId],
  );
}

export function useDesktopChatMutation() {
  const { t } = useTranslation();
  const toast = useToast();
  const mutation = useMutation({
    // The daemon client owns connection errors/timeouts; don't pause the rename dialog offline.
    networkMode: "always",
    mutationFn: async ({
      agent,
      action,
    }: {
      agent: DesktopChatTarget;
      action: DesktopChatAction;
    }) => {
      const client = getHostRuntimeStore().getClient(agent.serverId);
      if (!client?.isConnected) throw new Error(t("common.errors.daemonClientUnavailable"));
      const workspaceKey = `${agent.serverId}:${agent.workspaceId}`;
      const layout = useWorkspaceLayoutStore.getState();
      // Match the upstream mark-unread flow, but only unfocus the selected chat.
      const focusToken =
        action.kind === "unread" &&
        focusedAgentId(layout.layoutByWorkspace[workspaceKey]) === agent.id
          ? layout.unfocusPane(workspaceKey)
          : null;
      try {
        await updateDesktopChat(client, agent, action);
      } catch (error) {
        if (focusToken) layout.restorePaneFocus(workspaceKey, focusToken);
        throw error;
      }
    },
    onError: (error) => toast.error(error.message),
  });
  const mutateAsync = mutation.mutateAsync;
  const update = useCallback(
    (agent: DesktopChatTarget, action: DesktopChatAction) => mutateAsync({ agent, action }),
    [mutateAsync],
  );
  return { update, pendingAgent: mutation.isPending ? mutation.variables?.agent : null };
}

/** Archives the workspaces of chats that were just archived once no chat is left in them. */
export async function archiveEmptiedWorkspaces(
  chats: readonly Pick<DesktopChatTarget, "serverId" | "workspaceId">[],
): Promise<void> {
  for (const serverId of new Set(chats.map((chat) => chat.serverId))) {
    const session = useSessionStore.getState().sessions[serverId];
    const client = getHostRuntimeStore().getClient(serverId);
    if (!session || !client) continue;
    const workspaceIds = selectEmptiedWorkspaces({
      workspaceIds: chats
        .filter((chat) => chat.serverId === serverId)
        .map((chat) => chat.workspaceId),
      workspaces: session.workspaces.values(),
      agents: session.agents.values(),
    });
    for (const workspaceId of workspaceIds) {
      // ponytail: the last remembered workspace stands in for the route; off a workspace route
      // (Settings) this can redirect to the project's new chat.
      redirectIfArchivingActiveWorkspace({
        serverId,
        workspaceId,
        activeWorkspaceSelection: getLastWorkspaceSelection(),
      });
      await archiveWorkspaceOptimistically({ client, workspace: { serverId, workspaceId } });
      purgeArchivedWorkspaceState({ serverId, workspaceId });
    }
  }
}
