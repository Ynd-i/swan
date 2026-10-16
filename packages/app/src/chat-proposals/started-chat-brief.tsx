import { memo, useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { useSessionStore, type SessionState } from "@/stores/session-store";
import { settingsStyles } from "@/styles/settings";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { ChatBriefRows } from "./brief-rows";
import { STARTED_FROM_AGENT_ID_LABEL, type ChatBrief } from "./proposal";

interface Sessions {
  sessions: Record<string, SessionState>;
}

function selectAgent(serverId: string, agentId: string | null) {
  return (state: Sessions) => {
    if (!agentId) return undefined;
    const session = state.sessions[serverId];
    return session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
  };
}

function selectStartedFrom(serverId: string, agentId: string) {
  return (state: Sessions): string | null =>
    selectAgent(serverId, agentId)(state)?.labels[STARTED_FROM_AGENT_ID_LABEL] ?? null;
}

/** Stands in for a started chat's first prompt: where it came from, then its Task and Context. */
export const StartedChatBrief = memo(function StartedChatBrief({
  serverId,
  agentId,
  messageId,
  brief,
}: {
  serverId: string;
  agentId: string;
  messageId: string;
  brief: ChatBrief;
}) {
  const { t } = useTranslation();
  const sourceAgentId = useSessionStore(selectStartedFrom(serverId, agentId));
  const sourceTitle = useSessionStore(
    (state) => selectAgent(serverId, sourceAgentId)(state)?.title ?? null,
  );
  const openSource = useCallback(() => {
    if (sourceAgentId) navigateToAgent({ serverId, agentId: sourceAgentId });
  }, [serverId, sourceAgentId]);
  return (
    <View style={styles.container} testID="started-chat-brief">
      {sourceAgentId ? (
        <View style={styles.origin}>
          <Text style={styles.originText}>{t("chatProposals.startedFrom")}</Text>
          <Pressable
            onPress={openSource}
            accessibilityRole="link"
            style={styles.originLink}
            testID="started-chat-source"
          >
            <Text style={styles.originLinkText} numberOfLines={1}>
              {sourceTitle || t("agentList.fallbackTitle")}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View style={settingsStyles.card}>
        <ChatBriefRows
          brief={brief}
          occurrenceKey={`started:${agentId}:${messageId}`}
          bordered={false}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[2],
    marginVertical: theme.spacing[4],
  },
  origin: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  originText: {
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  originLink: {
    flexShrink: 1,
  },
  originLinkText: {
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.sm,
    color: theme.colors.accent,
    textDecorationLine: "underline",
  },
}));
