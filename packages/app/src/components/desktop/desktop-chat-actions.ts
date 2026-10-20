import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { DESKTOP_CHAT_PINNED_AT, DESKTOP_CHAT_UNREAD } from "./desktop-chat-model";

export type DesktopChatTarget = Pick<
  AggregatedAgent,
  | "serverId"
  | "workspaceId"
  | "id"
  | "title"
  | "labels"
  | "requiresAttention"
  | "attentionReason"
  | "turn"
>;

export type DesktopChatAction =
  | { kind: "pin"; pinnedAt: string }
  | { kind: "unpin" | "read" | "unread" }
  | { kind: "rename"; title: string };

export async function updateDesktopChat(
  client: Pick<DaemonClient, "updateAgent" | "clearAgentAttention">,
  agent: Pick<AggregatedAgent, "id" | "labels" | "requiresAttention" | "attentionReason">,
  action: DesktopChatAction,
): Promise<void> {
  switch (action.kind) {
    case "pin":
      return client.updateAgent(agent.id, {
        labels: { [DESKTOP_CHAT_PINNED_AT]: action.pinnedAt },
      });
    case "unpin":
      return client.updateAgent(agent.id, { labels: { [DESKTOP_CHAT_PINNED_AT]: "" } });
    case "unread":
      return client.updateAgent(agent.id, { labels: { [DESKTOP_CHAT_UNREAD]: "true" } });
    case "rename":
      return client.updateAgent(agent.id, { name: action.title.trim() });
    case "read":
      if (agent.labels[DESKTOP_CHAT_UNREAD] === "true") {
        await client.updateAgent(agent.id, { labels: { [DESKTOP_CHAT_UNREAD]: "false" } });
      }
      if (agent.requiresAttention && agent.attentionReason !== "permission") {
        await client.clearAgentAttention(agent.id);
      }
  }
}
