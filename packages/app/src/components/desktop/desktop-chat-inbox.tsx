import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { useSessionStore } from "@/stores/session-store";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import {
  buildChatInbox,
  desktopChatKey,
  isDesktopChatUnread,
  latestReplyPreview,
} from "./desktop-chat-model";
import { ChatSectionHeader } from "./desktop-chat-section-header";
import { useDesktopChatMutation } from "./use-desktop-chat";

/**
 * A notification row: title and, when this client already holds the chat's timeline, its last
 * reply. Fetching other timelines would resume each chat on its host, so they show the title only.
 */
const InboxRow = memo(function InboxRow({
  agent,
  selected,
}: {
  agent: AggregatedAgent;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const { update } = useDesktopChatMutation();
  const preview = useSessionStore((state) =>
    latestReplyPreview(state.sessions[agent.serverId]?.agentStreamTail.get(agent.id)),
  );
  const unread = isDesktopChatUnread(agent);
  const [hovered, setHovered] = useState(false);
  const enter = useCallback(() => setHovered(true), []);
  const leave = useCallback(() => setHovered(false), []);
  const open = useCallback(() => {
    if (unread) void update(agent, { kind: "read" }).catch(() => {});
    navigateToAgent({
      serverId: agent.serverId,
      agentId: agent.id,
      workspaceId: agent.workspaceId,
      pin: true,
    });
  }, [agent, unread, update]);
  const title = agent.title || t("agentList.fallbackTitle");
  return (
    <View
      onPointerEnter={enter}
      onPointerLeave={leave}
      style={[styles.row, hovered && styles.rowHovered, selected && styles.rowSelected]}
    >
      <Pressable
        onPress={open}
        style={styles.rowButton}
        accessibilityRole="button"
        accessibilityLabel={title}
        testID={`desktop-inbox-${desktopChatKey(agent)}`}
      >
        <Text numberOfLines={1} style={[styles.title, unread && styles.unreadTitle]}>
          {title}
        </Text>
        {preview ? (
          <Text numberOfLines={2} style={styles.preview}>
            {preview}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
});

export function ChatInbox({
  chats,
  selectedKey,
}: {
  chats: AggregatedAgent[];
  selectedKey: string | null;
}) {
  const { t } = useTranslation();
  const inbox = useMemo(() => buildChatInbox(chats), [chats]);
  return (
    <>
      <ChatSectionHeader
        title={t("desktopChat.sections.priority")}
        collapsed={false}
        testID="desktop-inbox-priority"
      />
      {inbox.priority.length === 0 ? (
        <Text style={styles.empty}>{t("desktopChat.sections.priorityEmpty")}</Text>
      ) : (
        inbox.priority.map((agent) => (
          <InboxRow
            key={desktopChatKey(agent)}
            agent={agent}
            selected={selectedKey === desktopChatKey(agent)}
          />
        ))
      )}
      {inbox.groups.map((group) => (
        <View key={group.key} testID={`desktop-inbox-${group.key}`}>
          <ChatSectionHeader
            title={t(`agentList.dateSections.${group.key}`)}
            collapsed={false}
            testID={`desktop-inbox-header-${group.key}`}
          />
          {group.chats.map((agent) => (
            <InboxRow
              key={desktopChatKey(agent)}
              agent={agent}
              selected={selectedKey === desktopChatKey(agent)}
            />
          ))}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  rowHovered: { backgroundColor: theme.colors.surfaceSidebarHover },
  rowSelected: { backgroundColor: theme.colors.surfaceSidebarSelected },
  rowButton: { gap: 2 },
  title: { color: theme.colors.foreground, fontSize: theme.fontSize.base, lineHeight: 20 },
  unreadTitle: { fontWeight: theme.fontWeight.medium },
  preview: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, lineHeight: 18 },
  empty: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.base,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
}));
