import { useCallback, useMemo, useState, type RefObject } from "react";
import { Text } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { getIsElectronMac } from "@/constants/platform";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STREAM_METADATA_FONT_SIZE } from "@/components/message";
import { formatDuration, formatMessageTimestamp } from "@/utils/time";
import type { Theme } from "@/styles/theme";
import type { ToolCallDetailProjection } from "@/tool-calls/detail-level/projection";
import type { AgentStreamRenderModel } from "./model";
import type { StreamViewportHandle } from "./strategy";
import { getStreamItemMessageId } from "./presentation";
import {
  createDesktopTurnActivityProjection,
  projectDesktopActivityItems,
  EMPTY_DESKTOP_TURN_ACTIVITY,
  type DesktopTurnActivity,
} from "./desktop-turn-activity";

export function useDesktopTurnActivity({
  model,
  scope,
  isMobile,
  toolGroups,
  revealLoadedHistory,
  viewportRef,
}: {
  model: AgentStreamRenderModel;
  scope: string;
  isMobile: boolean;
  toolGroups: ToolCallDetailProjection["groupsByHostId"];
  revealLoadedHistory: (messageId: string) => boolean;
  viewportRef: RefObject<StreamViewportHandle | null>;
}) {
  const enabled = getIsElectronMac() && !isMobile;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const project = useMemo(() => createDesktopTurnActivityProjection(), []);
  const projection = useMemo(
    () =>
      enabled
        ? project({
            scope,
            items: [...model.history, ...model.segments.liveHead],
            timingByAssistantId: model.turnTiming.byAssistantId,
            expanded,
            toolGroups,
          })
        : EMPTY_DESKTOP_TURN_ACTIVITY,
    [
      enabled,
      project,
      scope,
      model.history,
      model.segments.liveHead,
      model.turnTiming.byAssistantId,
      expanded,
      toolGroups,
    ],
  );
  const historyVirtualized = useMemo(
    () => projectDesktopActivityItems(model.segments.historyVirtualized, projection),
    [model.segments.historyVirtualized, projection],
  );
  const historyMounted = useMemo(
    () => projectDesktopActivityItems(model.segments.historyMounted, projection),
    [model.segments.historyMounted, projection],
  );
  const liveHead = useMemo(
    () => projectDesktopActivityItems(model.segments.liveHead, projection),
    [model.segments.liveHead, projection],
  );
  const segments = useMemo(
    () => ({ historyVirtualized, historyMounted, liveHead }),
    [historyVirtualized, historyMounted, liveHead],
  );
  const boundary = useMemo(
    () => ({
      hasVirtualizedHistory: historyVirtualized.length > 0,
      hasMountedHistory: historyMounted.length > 0,
      hasLiveHead: liveHead.length > 0,
    }),
    [historyVirtualized, historyMounted, liveHead],
  );
  // Chat find and the chat outline address messages, never rows, and skip what a collapsed
  // activity hides.
  const mountedHistoryMessageIds = useMemo(
    () =>
      new Set(
        model.history
          .filter((item) => !projection.hiddenItemIds.has(item.id))
          .map(getStreamItemMessageId),
      ),
    [model.history, projection.hiddenItemIds],
  );
  const mountedMessageIds = useMemo(() => {
    const liveHeadMessageIds = new Set(
      model.segments.liveHead
        .filter((item) => !projection.hiddenItemIds.has(item.id))
        .map(getStreamItemMessageId),
    );
    return {
      has: (messageId: string) =>
        mountedHistoryMessageIds.has(messageId) || liveHeadMessageIds.has(messageId),
    };
  }, [model.segments.liveHead, mountedHistoryMessageIds, projection.hiddenItemIds]);
  const toggle = useCallback(
    (activity: DesktopTurnActivity) => {
      if (!activity.expanded) {
        // Pause automatic following while the selected activity expands.
        viewportRef.current?.pauseFollowingOutput?.();
      }
      setExpanded((previous) => {
        const next = new Set(previous);
        if (next.has(activity.id)) next.delete(activity.id);
        else next.add(activity.id);
        return next;
      });
    },
    [viewportRef],
  );
  const revealLoadedMessage = useCallback(
    (messageId: string) => {
      const group = projection.groupByMessageId.get(messageId);
      if (!group) return revealLoadedHistory(messageId);
      setExpanded((previous) => (previous.has(group) ? previous : new Set(previous).add(group)));
      return true;
    },
    [projection.groupByMessageId, revealLoadedHistory],
  );
  return {
    projection,
    segments,
    boundary,
    mountedHistoryMessageIds,
    mountedMessageIds,
    toggle,
    revealLoadedMessage,
  };
}

const Disclosure = withUnistyles(ChevronRight);
const iconColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ignoredMetadata = { "paseo-markdown-ignore": "true" };

export function DesktopTurnActivityHeader({
  activity,
  onToggle,
}: {
  activity: DesktopTurnActivity;
  onToggle: (activity: DesktopTurnActivity) => void;
}) {
  const toggle = useCallback(() => onToggle(activity), [onToggle, activity]);
  const onPress = activity.collapsibleItemIds.size > 0 ? toggle : undefined;
  const { timing, failedCount, expanded } = activity;
  const { t } = useTranslation();
  const duration = timing.durationMs;
  const label =
    duration !== null && Number.isFinite(duration)
      ? t("desktopChat.workedFor", { duration: formatDuration(duration) })
      : t("desktopChat.activity");
  const failed = failedCount > 0 ? t("desktopChat.failedCount", { count: failedCount }) : null;
  const timestamp = formatMessageTimestamp(timing.completedAt);
  return (
    <Tooltip enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger
        onPress={onPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={[label, failed, timestamp].filter(Boolean).join(" · ")}
        aria-expanded={onPress ? expanded : undefined}
        style={styles.header}
        dataSet={ignoredMetadata}
        testID="desktop-turn-activity"
      >
        <Text style={styles.label}>
          {label}
          {failed ? (
            <>
              {" · "}
              <Text style={styles.failed}>{failed}</Text>
            </>
          ) : null}
        </Text>
        {onPress ? (
          <Disclosure
            size={14}
            uniProps={iconColor}
            style={expanded ? styles.expanded : undefined}
          />
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="top">
        <Text style={styles.timestamp}>{timestamp}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[2],
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[2],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: STREAM_METADATA_FONT_SIZE,
    lineHeight: 20,
  },
  failed: { color: theme.colors.statusDanger },
  timestamp: { color: theme.colors.foreground, fontSize: STREAM_METADATA_FONT_SIZE },
  expanded: { transform: [{ rotate: "90deg" }] },
}));
