import { memo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { useSessionStore, type SessionState } from "@/stores/session-store";
import { settingsStyles } from "@/styles/settings";
import { ChatBriefRows } from "./brief-rows";
import { LinkedChatLine, selectAgent } from "./linked-chat-line";
import { STARTED_FROM_AGENT_ID_LABEL, type ChatBrief } from "./proposal";

function selectStartedFrom(serverId: string, agentId: string) {
  return (state: { sessions: Record<string, SessionState> }): string | null =>
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
  return (
    <View style={styles.container} testID="started-chat-brief">
      {sourceAgentId ? (
        <LinkedChatLine
          serverId={serverId}
          agentId={sourceAgentId}
          label={t("chatProposals.startedFrom")}
          testID="started-chat-source"
        />
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
}));
