import { memo, useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronRight, MessageSquarePlus } from "lucide-react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { AgentModelDefinition } from "@getpaseo/protocol/agent-types";
import { AgentStatusDot } from "@/components/agent-status-dot";
import { Button } from "@/components/ui/button";
import { getStatusBucketLabel } from "@/hooks/sidebar-status-view-model";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useSessionStore, type Agent, type SessionState } from "@/stores/session-store";
import { settingsStyles } from "@/styles/settings";
import type { Theme } from "@/styles/theme";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { deriveSidebarStateBucket } from "@/utils/sidebar-agent-state";
import { ChatBriefRows } from "./brief-rows";
import { proposalKey, STARTED_FROM_PROPOSAL_LABEL, type ChatProposal } from "./proposal";
import { resolveProposalRuntime, startProposedChat, type ProposalRuntime } from "./start";

const ProposalIcon = withUnistyles(MessageSquarePlus);
const ChevronRightIcon = withUnistyles(ChevronRight);
const mutedIcon = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

interface Sessions {
  sessions: Record<string, SessionState>;
}

function selectAgent(serverId: string, agentId: string) {
  return (state: Sessions): Agent | undefined => {
    const session = state.sessions[serverId];
    return session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
  };
}

/** The chat a proposal started, found by its label so the card survives reloads. */
function selectStartedChat(serverId: string, key: string) {
  return (state: Sessions): Agent | undefined => {
    const agents = state.sessions[serverId]?.agents;
    if (!agents) return undefined;
    for (const agent of agents.values()) {
      if (agent.labels[STARTED_FROM_PROPOSAL_LABEL] === key) return agent;
    }
    return undefined;
  };
}

function StartedChatRow({ chat, title }: { chat: Agent; title: string }) {
  const { t } = useTranslation();
  const status = chat.turn.phase === "open" ? "running" : chat.status;
  const bucket = deriveSidebarStateBucket({
    status,
    requiresAttention: chat.requiresAttention,
    attentionReason: chat.attentionReason,
    pendingPermissionCount: chat.pendingPermissions.length,
  });
  const open = useCallback(() => {
    navigateToAgent({ serverId: chat.serverId, agentId: chat.id, workspaceId: chat.workspaceId });
  }, [chat.id, chat.serverId, chat.workspaceId]);
  return (
    <Pressable
      onPress={open}
      style={styles.header}
      accessibilityRole="link"
      accessibilityLabel={t("chatProposals.open", { title })}
      testID="chat-proposal-open"
    >
      <View style={styles.titleColumn}>
        <Text style={styles.title} numberOfLines={1}>
          {chat.title || title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {chat.archivedAt ? t("chatProposals.archived") : getStatusBucketLabel(bucket, t)}
        </Text>
      </View>
      <View style={styles.statusDot}>
        <AgentStatusDot
          status={status}
          requiresAttention={chat.requiresAttention}
          attentionReason={chat.attentionReason}
          pendingPermissionCount={chat.pendingPermissions.length}
          showInactive
        />
      </View>
      <ChevronRightIcon size={16} uniProps={mutedIcon} />
    </Pressable>
  );
}

/** Resolves a proposal's model and thinking against the source provider's catalog. */
function useProposalRuntime(
  serverId: string,
  source: Agent | undefined,
  proposal: ChatProposal,
): ProposalRuntime | null {
  const named = Boolean(proposal.model || proposal.thinking);
  const snapshot = useProvidersSnapshot(serverId, { cwd: source?.cwd, enabled: named });
  if (!source) return null;
  return resolveProposalRuntime(source, proposal, catalogModels(snapshot, source.provider));
}

/** Undefined while the catalog loads. A host without one, or a failed fetch, matches nothing. */
function catalogModels(
  snapshot: ReturnType<typeof useProvidersSnapshot>,
  provider: string,
): AgentModelDefinition[] | undefined {
  if (snapshot.entries) {
    return snapshot.entries.find((entry) => entry.provider === provider)?.models ?? [];
  }
  if (!snapshot.supportsSnapshot || snapshot.error !== null) return [];
  return undefined;
}

function proposalSubtitle(
  runtime: ProposalRuntime | null,
  error: string | null,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (error) return t("chatProposals.startFailed", { error });
  if (runtime?.kind === "unknown-model") {
    return t("chatProposals.unknownModel", { model: runtime.requested });
  }
  if (runtime?.kind === "unknown-thinking") {
    return t("chatProposals.unknownThinking", { thinking: runtime.requested });
  }
  const labels = runtime?.kind === "ready" ? runtime.labels : [];
  return [t("chatProposals.suggested"), ...labels].join(" · ");
}

/** Like Claude's linked-session card: nothing runs until the user starts the chat. */
export const ChatProposalCard = memo(function ChatProposalCard({
  serverId,
  sourceAgentId,
  proposal,
  client,
}: {
  serverId: string;
  sourceAgentId: string;
  proposal: ChatProposal;
  client: DaemonClient | null | undefined;
}) {
  const { t } = useTranslation();
  const key = proposalKey(sourceAgentId, proposal);
  const source = useSessionStore(selectAgent(serverId, sourceAgentId));
  const started = useSessionStore(selectStartedChat(serverId, key));
  const runtime = useProposalRuntime(serverId, source, proposal);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = useCallback(async () => {
    if (!client || !source || runtime?.kind !== "ready") return;
    setStarting(true);
    setError(null);
    try {
      await startProposedChat(client, source, proposal, runtime);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStarting(false);
    }
  }, [client, proposal, runtime, source]);

  if (started) {
    return (
      <View style={[settingsStyles.card, styles.card]} testID="chat-proposal-card">
        <StartedChatRow chat={started} title={proposal.title} />
      </View>
    );
  }
  return (
    <View style={[settingsStyles.card, styles.card]} testID="chat-proposal-card">
      <View style={styles.header}>
        <ProposalIcon size={16} uniProps={mutedIcon} />
        <View style={styles.titleColumn}>
          <Text style={styles.title} numberOfLines={2}>
            {proposal.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {proposalSubtitle(runtime, error, t)}
          </Text>
        </View>
        <Button
          variant="outline"
          size="sm"
          loading={starting}
          disabled={starting || !client || runtime?.kind !== "ready"}
          onPress={start}
          testID="chat-proposal-start"
        >
          {t("chatProposals.start")}
        </Button>
      </View>
      <ChatBriefRows brief={proposal} occurrenceKey={`proposal:${key}`} bordered />
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  card: {
    marginVertical: theme.spacing[2],
  },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
  },
  subtitle: {
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  statusDot: {
    width: 16,
    alignItems: "center",
  },
}));
