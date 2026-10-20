import { memo, useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { useSessionStore, type SessionState } from "@/stores/session-store";
import { navigateToAgent } from "@/utils/navigate-to-agent";

interface Sessions {
  sessions: Record<string, SessionState>;
}

export function selectAgent(serverId: string, agentId: string | null) {
  return (state: Sessions) => {
    if (!agentId) return undefined;
    const session = state.sessions[serverId];
    return session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
  };
}

/** "<label> <chat title>", where the title opens the chat. */
export const LinkedChatLine = memo(function LinkedChatLine({
  serverId,
  agentId,
  label,
  fallbackTitle,
  testID,
}: {
  serverId: string;
  agentId: string;
  label: string;
  /** Shown while the chat is not in the store, for example after it was archived. */
  fallbackTitle?: string;
  testID: string;
}) {
  const { t } = useTranslation();
  const title = useSessionStore((state) => selectAgent(serverId, agentId)(state)?.title ?? null);
  const open = useCallback(() => navigateToAgent({ serverId, agentId }), [serverId, agentId]);
  return (
    <View style={styles.line}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={open} accessibilityRole="link" style={styles.link} testID={testID}>
        <Text style={styles.linkText} numberOfLines={1}>
          {title || fallbackTitle || t("agentList.fallbackTitle")}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  label: {
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  link: {
    flexShrink: 1,
  },
  linkText: {
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.sm,
    color: theme.colors.accent,
    textDecorationLine: "underline",
  },
}));
