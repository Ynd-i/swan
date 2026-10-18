import { useCallback, useMemo, useState, type RefObject } from "react";
import { Pressable, Text } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { getIsElectronMac } from "@/constants/platform";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STREAM_METADATA_FONT_SIZE, toolCallLabel } from "@/components/message";
import { describeToolCall } from "@/tool-calls/detail-level/grouping";
import { buildToolCallDisplayModel } from "@/utils/tool-call-display";
import type { TurnTiming } from "@/timeline/turn-time";
import type { StreamItem } from "@/types/stream";
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
  isTurnActive,
  toolGroups,
  revealLoadedHistory,
  viewportRef,
}: {
  model: AgentStreamRenderModel;
  scope: string;
  isMobile: boolean;
  isTurnActive: boolean;
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
            isTurnActive,
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
      isTurnActive,
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
  const visibleMessageIds = useMemo(
    () =>
      new Set(
        [...model.history, ...model.segments.liveHead]
          .filter((item) => !projection.hiddenItemIds.has(item.id))
          .map(getStreamItemMessageId),
      ),
    [model.history, model.segments.liveHead, projection.hiddenItemIds],
  );
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
  return { projection, segments, boundary, visibleMessageIds, toggle, revealLoadedMessage };
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
  const canExpand = activity.collapsibleItemIds.size > 0;
  return activity.state.kind === "working" ? (
    <WorkingHeader
      latestStep={activity.state.latestStep}
      expanded={activity.expanded}
      onToggle={canExpand ? toggle : undefined}
    />
  ) : (
    <CompletedHeader
      timing={activity.state.timing}
      failedCount={activity.state.failedCount}
      expanded={activity.expanded}
      onToggle={canExpand ? toggle : undefined}
    />
  );
}

function stepLabel(t: (key: string) => string, step: StreamItem): string {
  if (step.kind !== "tool_call") return t("desktopChat.thinking");
  const { name, status, error, detail, metadata } = describeToolCall(step);
  const display = buildToolCallDisplayModel({
    name,
    status: status === "executing" ? "running" : status,
    error: error ?? null,
    detail,
    metadata,
  });
  const label = toolCallLabel(t, status, detail, display.displayName);
  return display.summary ? `${label} ${display.summary}` : label;
}

function WorkingHeader({
  latestStep,
  expanded,
  onToggle,
}: {
  latestStep: StreamItem;
  expanded: boolean;
  onToggle?: () => void;
}) {
  const { t } = useTranslation();
  const label = useMemo(() => stepLabel(t, latestStep), [t, latestStep]);
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole={onToggle ? "button" : undefined}
      accessibilityLabel={label}
      aria-expanded={onToggle ? expanded : undefined}
      style={styles.workingHeader}
      dataSet={ignoredMetadata}
      testID="desktop-turn-activity-working"
    >
      <Text style={styles.workingLabel} numberOfLines={1}>
        {label}
      </Text>
      {onToggle ? (
        <Disclosure size={14} uniProps={iconColor} style={expanded ? styles.expanded : undefined} />
      ) : null}
    </Pressable>
  );
}

function CompletedHeader({
  timing,
  failedCount,
  expanded,
  onToggle,
}: {
  timing: TurnTiming;
  failedCount: number;
  expanded: boolean;
  onToggle?: () => void;
}) {
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
        onPress={onToggle}
        accessibilityRole={onToggle ? "button" : undefined}
        accessibilityLabel={[label, failed, timestamp].filter(Boolean).join(" · ")}
        aria-expanded={onToggle ? expanded : undefined}
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
        {onToggle ? (
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
  workingHeader: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    marginBottom: theme.spacing[2],
  },
  workingLabel: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: STREAM_METADATA_FONT_SIZE,
    lineHeight: 20,
  },
  timestamp: { color: theme.colors.foreground, fontSize: STREAM_METADATA_FONT_SIZE },
  expanded: { transform: [{ rotate: "90deg" }] },
}));
