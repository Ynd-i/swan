import { memo, useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { GitFork } from "lucide-react-native";
import { FORKED_AT_LABEL, FORKED_FROM_AGENT_ID_LABEL } from "@getpaseo/protocol/agent-labels";
import { useSessionStore, type SessionState } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import type { StreamItem } from "@/types/stream";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { findForkBoundary } from "./fork-origin";

const ThemedGitFork = withUnistyles(GitFork);
const accentColorMapping = (theme: Theme) => ({ color: theme.colors.accent });

export interface ForkDividerPlacement {
  sourceAgentId: string;
  /** The last inherited item; the divider follows its turn actions. */
  itemId: string;
  isLast: boolean;
}

function selectLabel(serverId: string, agentId: string, label: string) {
  return (state: { sessions: Record<string, SessionState> }): string | null => {
    const session = state.sessions[serverId];
    const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
    return agent?.labels[label] ?? null;
  };
}

/**
 * Where a native fork's divider goes. The result keeps its identity while the boundary stays,
 * so history rows do not rerender on every streamed item.
 */
export function useForkDividerPlacement(input: {
  serverId: string;
  agentId: string;
  tail: readonly StreamItem[];
  head: readonly StreamItem[];
}): ForkDividerPlacement | null {
  const { serverId, agentId, tail, head } = input;
  const sourceAgentId = useSessionStore(selectLabel(serverId, agentId, FORKED_FROM_AGENT_ID_LABEL));
  const forkedAt = Date.parse(
    useSessionStore(selectLabel(serverId, agentId, FORKED_AT_LABEL)) ?? "",
  );
  const boundary = useMemo(
    () =>
      sourceAgentId && Number.isFinite(forkedAt)
        ? findForkBoundary([...tail, ...head], forkedAt)
        : null,
    [forkedAt, head, sourceAgentId, tail],
  );
  const itemId = boundary?.itemId;
  const isLast = boundary?.isLast ?? false;
  return useMemo(
    () => (sourceAgentId && itemId ? { sourceAgentId, itemId, isLast } : null),
    [isLast, itemId, sourceAgentId],
  );
}

/** Like Codex: ends a fork's inherited history and links back to the chat it came from. */
export const ForkOriginDivider = memo(function ForkOriginDivider({
  serverId,
  sourceAgentId,
}: {
  serverId: string;
  sourceAgentId: string;
}) {
  const { t } = useTranslation();
  const openSource = useCallback(() => {
    navigateToAgent({ serverId, agentId: sourceAgentId });
  }, [serverId, sourceAgentId]);
  return (
    <View style={styles.container} testID="fork-origin-divider">
      <View style={styles.line} />
      <Pressable
        onPress={openSource}
        accessibilityRole="link"
        style={styles.link}
        testID="fork-origin-link"
      >
        <ThemedGitFork size={13} uniProps={accentColorMapping} />
        <Text style={styles.text}>{t("message.actions.forkOrigin")}</Text>
      </Pressable>
      <View style={styles.line} />
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[2],
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  text: {
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.sm,
    color: theme.colors.accent,
  },
}));
