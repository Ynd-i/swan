import { expect, it, vi } from "vitest";
import { updateDesktopChat } from "./desktop-chat-actions";
import { DESKTOP_CHAT_PINNED_AT, DESKTOP_CHAT_UNREAD } from "./desktop-chat-model";

it("patches only the selected chat and preserves permission attention", async () => {
  const client = {
    updateAgent: vi.fn().mockResolvedValue(undefined),
    clearAgentAttention: vi.fn().mockResolvedValue(undefined),
  };
  const agent = {
    id: "selected",
    requiresAttention: true,
    attentionReason: "finished" as const,
    labels: { untouched: "keep", [DESKTOP_CHAT_UNREAD]: "true" },
  };
  await updateDesktopChat(client, agent, { kind: "pin", pinnedAt: "2026-09-30T12:00:00Z" });
  await updateDesktopChat(client, agent, { kind: "unread" });
  await updateDesktopChat(client, agent, { kind: "read" });
  expect(client.updateAgent.mock.calls).toEqual([
    ["selected", { labels: { [DESKTOP_CHAT_PINNED_AT]: "2026-09-30T12:00:00Z" } }],
    ["selected", { labels: { [DESKTOP_CHAT_UNREAD]: "true" } }],
    ["selected", { labels: { [DESKTOP_CHAT_UNREAD]: "false" } }],
  ]);
  expect(client.clearAgentAttention.mock.calls).toEqual([["selected"]]);
  client.clearAgentAttention.mockClear();
  await updateDesktopChat(client, { ...agent, attentionReason: "permission" }, { kind: "read" });
  expect(client.clearAgentAttention).not.toHaveBeenCalled();
  client.updateAgent.mockRejectedValueOnce(new Error("Host disconnected"));
  await expect(updateDesktopChat(client, agent, { kind: "unpin" })).rejects.toThrow(
    "Host disconnected",
  );
});
