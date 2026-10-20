import { useCallback } from "react";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import { useSessionStore } from "@/stores/session-store";
import { desktopChatPinnedAt } from "./desktop-chat-model";
import { useActiveDesktopChat, useDesktopChatMutation } from "./use-desktop-chat";

export function DesktopChatShortcuts() {
  const active = useActiveDesktopChat();
  const { update, pendingAgent } = useDesktopChatMutation();
  const handle = useCallback(() => {
    if (!active) return false;
    if (!pendingAgent) {
      const session = useSessionStore.getState().sessions[active.serverId];
      const agent =
        session?.agents.get(active.agentId) ?? session?.agentDetails.get(active.agentId);
      if (agent && !agent.archivedAt) {
        void update(
          agent,
          desktopChatPinnedAt(agent) === null
            ? { kind: "pin", pinnedAt: new Date().toISOString() }
            : { kind: "unpin" },
        ).catch(() => {});
      }
    }
    return true;
  }, [active, pendingAgent, update]);
  useKeyboardActionHandler({
    handlerId: "desktop-chat-pin",
    actions: ["workspace.pin"],
    enabled: active !== null,
    priority: 10,
    handle,
  });
  return null;
}
