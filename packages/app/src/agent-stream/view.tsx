import { PermissionRequestCard } from "./permission-request-card";
import { ChatFind, ChatFindExpansion } from "@/agent-stream/chat-find";
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { View, Text, Pressable, Platform, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { ChevronDown, Hand } from "lucide-react-native";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { openExplorerSidebarView } from "@/workspace-tabs/explorer-sidebar";
import {
  AssistantMessage,
  SpeakMessage,
  UserMessage,
  Notification,
  ToolCall,
  TodoListCard,
  CompactionMarker,
  MessageOuterSpacingProvider,
  type InlinePathTarget,
} from "@/components/message";
import type { StreamItem } from "@/types/stream";
import type { PendingMessageSubmission } from "@/composer/submission/model";
import type { TurnPresentation } from "@/timeline/turn-liveness";
import type { PendingPermission } from "@/types/shared";
import type { AgentCapabilityFlags } from "@getpaseo/protocol/agent-types";
import type { AgentScreenAgent } from "@/hooks/use-agent-screen-state-machine";
import { useSessionStore } from "@/stores/session-store";
import { useRevealedText } from "@/hooks/use-revealed-text";
import { useFileExplorerActions } from "@/hooks/use-file-explorer-actions";
import { useLoadOlderAgentHistory } from "@/hooks/use-load-older-agent-history";
import { resolveContentMaxWidth, useSettings } from "@/hooks/use-settings";
import type { ToastApi } from "@/components/toast-host";
import { returnToTimelineTail } from "./timeline-tail-navigation";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { ToolCallSheetProvider } from "@/components/tool-call-sheet";
import { createStreamPresentation, getStreamItemMessageId } from "./presentation";
import { DesktopTurnActivityHeader, useDesktopTurnActivity } from "./desktop-turn-activity-view";
import { OverviewToolCallGroupView } from "@/tool-calls/detail-level/overview/view";
import { type AgentStreamRenderModel, buildAgentStreamRenderModel } from "./model";
import { resolveStreamRenderStrategy } from "./strategy-resolver";
import { type StreamSegmentRenderers, type StreamViewportHandle } from "./strategy";
import { ChatOutlineRail } from "@/agent-stream/chat-outline/rail";
import { useChatOutline } from "@/agent-stream/chat-outline/use-chat-outline";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { planTimelineTailFetch } from "@/timeline/timeline-sync-plan";
import {
  CompletedTurnFooterRow,
  TurnFooter,
  TURN_FOOTER_BOTTOM_SPACING,
  type AssistantTurnForkHandler,
  type InFlightTurnForkHandler,
  type TurnContentStrategy,
} from "./turn-footer";
import { resolveBottomOverlayTailInset } from "./bottom-overlay-inset";
import { layoutStream, type StreamLayoutItem } from "./layout";
import {
  type BottomAnchorLocalRequest,
  type BottomAnchorRouteRequest,
} from "./bottom-anchor-controller";
import { createAssistantImageOccurrenceKey } from "@/assistant-image/acquisition-cache";
import { AssistantSelectionCopySurface } from "@/assistant-selection-copy/surface";
import {
  AssistantFileLinkResolverProvider,
  normalizeInlinePathTarget,
} from "@/assistant-file-links";
import {
  createWorkspaceFileTabTarget,
  normalizeWorkspaceFileLocation,
  type OpenFileDisposition,
  type WorkspaceFileOpenRequest,
} from "@/workspace/file-open";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useStableEvent } from "@/hooks/use-stable-event";
import { useForkAgent } from "@/hooks/use-fork-agent";
import { getIsElectronMac, isWeb } from "@/constants/platform";
import { CHAT_MESSAGE_HORIZONTAL_PADDING, type Theme } from "@/styles/theme";
import { recordRenderProfileReasons } from "@/utils/render-profiler";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useStreamHistoryWindow } from "./use-stream-history-window";
import { PluginTimelineItemView, useInstalledTimelineTransform } from "@/plugins/timeline";
import { ForkOriginDivider, useForkDividerPlacement } from "./fork-origin-divider";

function renderLiveAuxiliaryNode(input: {
  pendingPermissions: ReactNode;
  turnFooter: ReactNode;
  forkOriginDivider: ReactNode;
  bottomOverlayInset: number;
}): ReactNode {
  if (
    !input.pendingPermissions &&
    !input.turnFooter &&
    !input.forkOriginDivider &&
    input.bottomOverlayInset === 0
  ) {
    return null;
  }
  return (
    <>
      {input.turnFooter}
      {input.forkOriginDivider}
      {input.pendingPermissions ? (
        <View style={stylesheet.contentWrapper}>
          <View style={stylesheet.listHeaderContent}>{input.pendingPermissions}</View>
        </View>
      ) : null}
      {input.bottomOverlayInset > 0 ? (
        <BottomOverlayInset height={input.bottomOverlayInset} />
      ) : null}
    </>
  );
}

function BottomOverlayInset({ height }: { height: number }) {
  const style = useMemo(() => ({ height }), [height]);
  return <View style={style} />;
}

function renderPendingPermissionsNode(input: {
  pendingPermissions: PendingPermission[];
  client: DaemonClient | null;
}): ReactNode {
  if (input.pendingPermissions.length === 0) {
    return null;
  }
  return (
    <View style={stylesheet.permissionsContainer}>
      {input.pendingPermissions.map((permission) => (
        <PermissionRequestCard key={permission.key} permission={permission} client={input.client} />
      ))}
    </View>
  );
}

function renderStreamItemWithTurnFooter(input: {
  content: ReactNode;
  layoutItem: StreamLayoutItem;
  strategy: TurnContentStrategy;
  supportsTimelineCursor: boolean;
  onForkAssistantTurn?: AssistantTurnForkHandler;
}): ReactNode {
  if (!input.content) {
    return null;
  }

  const footerHost = input.layoutItem.completedFooter;
  const footer = footerHost ? (
    <CompletedTurnFooterRow
      strategy={input.strategy}
      items={footerHost.items}
      timing={footerHost.timing}
      startIndex={footerHost.startIndex}
      supportsTimelineCursor={input.supportsTimelineCursor}
      onForkAssistantTurn={input.onForkAssistantTurn}
    />
  ) : null;
  const content = (
    <StreamItemWrapper itemId={input.layoutItem.item.id} gapBelow={input.layoutItem.gapBelow}>
      {input.content}
    </StreamItemWrapper>
  );

  if (input.layoutItem.frameOrder === "footer-then-content") {
    return (
      <>
        {footer}
        {content}
      </>
    );
  }

  return (
    <>
      {content}
      {footer}
    </>
  );
}

function renderListEmptyComponent(input: {
  renderModel: AgentStreamRenderModel;
  emptyStateStyle: StyleProp<ViewStyle>;
  emptyText: string;
}): ReactNode {
  if (
    input.renderModel.boundary.hasVirtualizedHistory ||
    input.renderModel.boundary.hasMountedHistory ||
    input.renderModel.boundary.hasLiveHead ||
    input.renderModel.auxiliary.pendingPermissions ||
    input.renderModel.auxiliary.turnFooter
  ) {
    return null;
  }

  return (
    <View style={input.emptyStateStyle}>
      <Text style={stylesheet.emptyStateText}>{input.emptyText}</Text>
    </View>
  );
}

// History rows sit inside FlatList cells that rerender on every data change (RN recreates each
// CellRenderer with a fresh ref and, in a newest-first list, a shifted index). This boundary is
// what stops that churn: a row renders again only when its stream item identity, its layout item
// identity, or the renderer itself changes. Item identity is the revision signal the strategy
// already uses (`useRevisedHistoryRows` clones items whose content or display state changed).
const HistoryStreamRow = memo(function HistoryStreamRow({
  layoutItem,
  renderStreamItem,
}: {
  item: StreamItem;
  layoutItem: StreamLayoutItem;
  renderStreamItem: (layoutItem: StreamLayoutItem) => ReactNode;
}) {
  return <>{renderStreamItem(layoutItem)}</>;
});

function renderHistoryStreamItem(input: {
  item: StreamItem;
  layoutItemById: Map<string, StreamLayoutItem>;
  renderStreamItem: (layoutItem: StreamLayoutItem) => ReactNode;
}): ReactNode {
  const layoutItem = input.layoutItemById.get(input.item.id);
  if (!layoutItem) {
    return null;
  }
  return (
    <HistoryStreamRow
      item={input.item}
      layoutItem={layoutItem}
      renderStreamItem={input.renderStreamItem}
    />
  );
}

function renderLiveHeadStreamItem(input: {
  item: StreamItem;
  layoutItemById: Map<string, StreamLayoutItem>;
  renderStreamItem: (layoutItem: StreamLayoutItem) => ReactNode;
}): ReactNode {
  const layoutItem = input.layoutItemById.get(input.item.id);
  if (!layoutItem) {
    return null;
  }
  return input.renderStreamItem(layoutItem);
}

export interface AgentStreamViewHandle {
  scrollToBottom(reason?: BottomAnchorLocalRequest["reason"]): void;
  prepareForViewportChange(): void;
}

export interface AgentStreamViewProps {
  agentId: string;
  serverId?: string;
  context: AgentScreenAgent;
  streamItems: StreamItem[];
  streamHead?: StreamItem[];
  pendingPermissions: Map<string, PendingPermission>;
  hasDockedPermissions?: boolean;
  pendingMessageSubmissions?: readonly PendingMessageSubmission[];
  turnPresentation: TurnPresentation;
  routeBottomAnchorRequest?: BottomAnchorRouteRequest | null;
  isAuthoritativeHistoryReady?: boolean;
  /** Tail space required by a transparent overlay rendered at the bottom edge. */
  bottomOverlayTailClearance?: number;
  /** Bottom offset required for controls floating above that overlay. */
  bottomOverlayControlClearance?: number;
  toast?: ToastApi | null;
  onOpenWorkspaceFile?: (request: WorkspaceFileOpenRequest) => void;
  readOnly?: boolean;
  historyPagination?: {
    hasOlder: boolean;
    isLoadingOlder: boolean;
    progressKey: string | null;
    onLoadOlder: () => boolean | Promise<boolean>;
  };
}

const AGENT_CAPABILITY_FLAG_KEYS: (keyof AgentCapabilityFlags)[] = [
  "supportsStreaming",
  "supportsSessionPersistence",
  "supportsDynamicModes",
  "supportsMcpServers",
  "supportsReasoningStream",
  "supportsToolInvocations",
  "supportsRewindConversation",
  "supportsRewindFiles",
  "supportsRewindBoth",
];

const EMPTY_STREAM_HEAD: StreamItem[] = [];

function useRetainedValue<T>(value: T, active: boolean): T {
  const retainedRef = useRef(value);
  if (active) {
    retainedRef.current = value;
  }
  return active ? value : retainedRef.current;
}
const EMPTY_PENDING_MESSAGE_SUBMISSIONS: readonly PendingMessageSubmission[] = [];
const GROUPED_TOOL_CALL_DETAIL_MAX_HEIGHT = 200;

function resolveBottomOverlayControlOffset(clearance: number | undefined): number {
  return Math.max(16, clearance ?? 0);
}

const AgentStreamViewComponent = forwardRef<AgentStreamViewHandle, AgentStreamViewProps>(
  function AgentStreamView(
    {
      agentId,
      serverId,
      context,
      streamItems,
      streamHead: providedStreamHead,
      pendingPermissions,
      hasDockedPermissions,
      pendingMessageSubmissions = EMPTY_PENDING_MESSAGE_SUBMISSIONS,
      turnPresentation,
      routeBottomAnchorRequest = null,
      isAuthoritativeHistoryReady = true,
      bottomOverlayTailClearance = 0,
      bottomOverlayControlClearance,
      toast,
      onOpenWorkspaceFile,
      readOnly = false,
      historyPagination,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const autoExpandReasoning = useSettings((settings) => settings.autoExpandReasoning);
    const toolCallDetailLevel = useSettings((settings) => settings.toolCallDetailLevel);
    const chatOutlineEnabled = useSettings((settings) => settings.chatOutlineEnabled);
    const contentMaxWidth = useSettings(resolveContentMaxWidth);
    const viewportRef = useRef<StreamViewportHandle | null>(null);
    const pendingClientMessageIds = useMemo(
      () => new Set(pendingMessageSubmissions.map((submission) => submission.clientMessageId)),
      [pendingMessageSubmissions],
    );
    const isMobile = useIsCompactFormFactor();
    const streamRenderStrategy = useMemo(
      () =>
        resolveStreamRenderStrategy({
          platform: Platform.OS,
          isMobileBreakpoint: isMobile,
        }),
      [isMobile],
    );
    const [isNearBottom, setIsNearBottom] = useState(true);
    const [expandedInlineToolCallIds, setExpandedInlineToolCallIds] = useState<Set<string>>(
      new Set(),
    );
    const [expandedToolCallGroupIds, setExpandedToolCallGroupIds] = useState<Set<string>>(
      new Set(),
    );

    // Get serverId (fallback to agent's serverId if not provided)
    const resolvedServerId = serverId ?? context.serverId ?? "";
    const transformTimelineItem = useInstalledTimelineTransform(resolvedServerId);

    const client = useSessionStore((state) => state.sessions[resolvedServerId]?.client ?? null);
    const sessionStreamHead = useSessionStore((state) =>
      state.sessions[resolvedServerId]?.agentStreamHead?.get(agentId),
    );
    const streamHead = providedStreamHead ?? sessionStreamHead;
    const forkAgent = useForkAgent({ serverId: resolvedServerId, toast, readOnly });
    const supportsAgentForkContextCursor = useSessionStore(
      (state) =>
        state.sessions[resolvedServerId]?.serverInfo?.features?.agentForkContextCursor === true,
    );
    const supportsChatOutline = useSessionStore(
      (state) =>
        state.sessions[resolvedServerId]?.serverInfo?.features?.agentTimelinePromptIndex === true,
    );
    const timelineEpoch = useSessionStore(
      (state) => state.sessions[resolvedServerId]?.agentTimelineCursor.get(agentId)?.epoch ?? null,
    );
    const isTimelineDetached = useSessionStore(
      (state) => state.sessions[resolvedServerId]?.agentTimelineHasNewer.get(agentId) === true,
    );

    const workspaceRoot = context.cwd?.trim() || "";
    const { requestDirectoryListing } = useFileExplorerActions({
      serverId: resolvedServerId,
      workspaceId: context.workspaceId,
      workspaceRoot,
    });
    const agentHistoryPagination = useLoadOlderAgentHistory({
      serverId: resolvedServerId,
      agentId,
      toast,
    });
    const {
      isLoadingOlder: remoteIsLoadingOlder,
      hasOlder: remoteHasOlder,
      progressKey: remoteProgressKey,
      loadOlder: loadRemoteOlder,
    } = historyPagination
      ? {
          isLoadingOlder: historyPagination.isLoadingOlder,
          hasOlder: historyPagination.hasOlder,
          progressKey: historyPagination.progressKey,
          loadOlder: historyPagination.onLoadOlder,
        }
      : agentHistoryPagination;
    // Keep entry/exit animations off on Android due to RN dispatchDraw crashes
    // tracked in react-native-reanimated#8422.
    const shouldDisableEntryExitAnimations = Platform.OS === "android";
    const scrollIndicatorFadeIn = shouldDisableEntryExitAnimations
      ? undefined
      : FadeIn.duration(200);
    const scrollIndicatorFadeOut = shouldDisableEntryExitAnimations
      ? undefined
      : FadeOut.duration(200);

    useEffect(() => {
      setIsNearBottom(true);
      setExpandedInlineToolCallIds(new Set());
      setExpandedToolCallGroupIds(new Set());
    }, [agentId]);

    const handleInlinePathPress = useStableEvent(
      (target: InlinePathTarget, disposition: OpenFileDisposition) => {
        if (!target.path) {
          return;
        }

        const normalized = normalizeInlinePathTarget(target.path, context.cwd);
        if (!normalized) {
          return;
        }

        if (normalized.file) {
          const location = normalizeWorkspaceFileLocation({
            path: normalized.file,
            lineStart: target.lineStart,
            lineEnd: target.lineEnd,
          });
          if (!location) {
            return;
          }

          if (onOpenWorkspaceFile) {
            onOpenWorkspaceFile({
              location,
              disposition,
            });
            return;
          }

          if (context.workspaceId) {
            navigateToWorkspace({
              serverId: resolvedServerId,
              workspaceId: context.workspaceId,
              target: createWorkspaceFileTabTarget(location),
            });
          }
          return;
        }

        void requestDirectoryListing(normalized.directory, {
          recordHistory: false,
          setCurrentPath: false,
        });

        openExplorerSidebarView({
          isCompact: isMobile,
          workspaceKey: buildWorkspaceTabPersistenceKey({
            serverId: resolvedServerId,
            workspaceId: context.workspaceId ?? "",
          }),
          checkout: {
            serverId: resolvedServerId,
            cwd: context.cwd,
            isGit: context.projectPlacement?.checkout?.isGit ?? true,
          },
          view: "files",
        });
      },
    );

    const handleToolCallOpenFile = useStableEvent((filePath: string) => {
      handleInlinePathPress({ raw: filePath, path: filePath }, "preferred");
    });

    const handleForkAssistantTurn: AssistantTurnForkHandler = useStableEvent(
      async ({ target, boundary }) => {
        await forkAgent({
          agentId,
          agent: context,
          workspaceId: context.workspaceId,
          target,
          boundary,
        });
      },
    );

    // The in-flight turn forks with no boundary at all: `selectForkContextRows`
    // projects the whole timeline when neither boundary field is given, so the
    // fork carries everything up to now, including the response still streaming
    // in front of the user.
    const handleForkInFlightTurn: InFlightTurnForkHandler = useStableEvent(async (target) => {
      await forkAgent({
        agentId,
        agent: context,
        workspaceId: context.workspaceId,
        target,
      });
    });

    // Freeze stream presentation while this tab slot is hidden to prevent offscreen
    // cell-window and turn-lifecycle renders from background agents.
    // When isActive flips back to true, the context change triggers a re-render and
    // the component reads the current (fresh) streamItems/streamHead from props.
    const isActive = useRetainedPanelActive();
    const effectiveStreamItems = useRetainedValue(streamItems, isActive);
    const effectiveStreamHead = useRetainedValue(streamHead, isActive);
    const effectiveTurnPresentation = useRetainedValue(turnPresentation, isActive);
    const isTurnActive = effectiveTurnPresentation.isActive;
    const presentStream = useMemo(() => createStreamPresentation(), []);
    const presentation = useMemo(
      () =>
        presentStream({
          tail: effectiveStreamItems,
          head: effectiveStreamHead ?? EMPTY_STREAM_HEAD,
          transform: transformTimelineItem,
          level: toolCallDetailLevel,
          isTurnActive,
          absorbThoughts: getIsElectronMac() && !isMobile,
        }),
      [
        presentStream,
        effectiveStreamItems,
        effectiveStreamHead,
        transformTimelineItem,
        toolCallDetailLevel,
        isTurnActive,
        isMobile,
      ],
    );
    const forkDivider = useForkDividerPlacement({
      serverId: resolvedServerId,
      agentId,
      tail: presentation.tail,
      head: presentation.head,
    });
    const {
      start: historyWindowStart,
      hasLocalHistory,
      revealLoadedHistory,
      loadOlder,
    } = useStreamHistoryWindow({
      agentId,
      items: presentation.tail,
      loadRemoteOlder,
    });
    const isLoadingOlder = remoteIsLoadingOlder;
    const hasOlder = hasLocalHistory || remoteHasOlder;
    const progressKey = `${remoteProgressKey ?? "local"}:${historyWindowStart}`;

    const baseRenderModel = useMemo(() => {
      return buildAgentStreamRenderModel({
        isTurnActive,
        activeTurnStartedAt: effectiveTurnPresentation.startedAt,
        tail: presentation.tail,
        head: presentation.head,
        platform: isWeb ? "web" : "native",
        isMobileBreakpoint: isMobile,
        historyStart: historyWindowStart,
      });
    }, [
      isMobile,
      isTurnActive,
      presentation.head,
      presentation.tail,
      effectiveTurnPresentation.startedAt,
      historyWindowStart,
    ]);
    const streamLayout = useMemo(
      () =>
        layoutStream({
          strategy: streamRenderStrategy,
          isTurnActive,
          history: baseRenderModel.history,
          liveHead: baseRenderModel.segments.liveHead,
          timingByAssistantId: baseRenderModel.turnTiming.byAssistantId,
        }),
      [
        baseRenderModel.history,
        baseRenderModel.segments.liveHead,
        baseRenderModel.turnTiming.byAssistantId,
        isTurnActive,
        streamRenderStrategy,
      ],
    );
    const handleTimelineHistoryLoadError = useCallback(() => {
      toast?.error(t("agentStream.historyLoadFailed"));
    }, [t, toast]);
    // Only viewport rows are collapsed. The full layout/copy/fork inputs stay complete.
    const {
      projection: turnActivity,
      segments: visibleSegments,
      boundary: visibleBoundary,
      visibleMessageIds,
      toggle: toggleTurnActivity,
      revealLoadedMessage,
    } = useDesktopTurnActivity({
      model: baseRenderModel,
      scope: `${resolvedServerId}:${agentId}`,
      isMobile,
      isTurnActive,
      toolGroups: presentation.groupsByHostId,
      revealLoadedHistory,
      viewportRef,
    });
    const chatOutline = useChatOutline({
      agentId,
      serverId: resolvedServerId,
      timelineEpoch,
      tail: effectiveStreamItems,
      head: effectiveStreamHead,
      enabled: supportsChatOutline && chatOutlineEnabled,
      viewportRef,
      onJumpError: handleTimelineHistoryLoadError,
      visibleMessageIds,
      revealLoadedMessage,
    });

    useImperativeHandle(
      ref,
      () => ({
        scrollToBottom(reason = "jump-to-bottom") {
          viewportRef.current?.scrollToBottom(reason);
        },
        prepareForViewportChange() {
          viewportRef.current?.prepareForViewportChange();
        },
      }),
      [],
    );

    const scrollToBottom = useCallback(() => {
      if (!isTimelineDetached) {
        viewportRef.current?.scrollToBottom("jump-to-bottom");
        return;
      }
      void returnToTimelineTail({
        fetchTail: () =>
          getHostRuntimeStore().fetchAgentTimeline(resolvedServerId, agentId, {
            ...planTimelineTailFetch(),
          }),
        scrollToBottom: () => viewportRef.current?.scrollToBottom("jump-to-bottom"),
        onError: handleTimelineHistoryLoadError,
      });
    }, [agentId, handleTimelineHistoryLoadError, isTimelineDetached, resolvedServerId]);

    const setInlineDetailsExpanded = useCallback(
      (itemId: string, expanded: boolean) => {
        if (!streamRenderStrategy.shouldDisableParentScrollOnInlineDetailsExpansion()) {
          return;
        }
        setExpandedInlineToolCallIds((previous) => {
          const next = new Set(previous);
          if (expanded) {
            next.add(itemId);
          } else {
            next.delete(itemId);
          }
          return next;
        });
      },
      [streamRenderStrategy],
    );

    const setToolCallGroupExpanded = useCallback((groupId: string, expanded: boolean) => {
      setExpandedToolCallGroupIds((previous) => {
        const next = new Set(previous);
        if (expanded) {
          next.add(groupId);
        } else {
          next.delete(groupId);
        }
        return next;
      });
    }, []);

    const renderUserMessageItem = useCallback(
      (layoutItem: StreamLayoutItem, item: Extract<StreamItem, { kind: "user_message" }>) => {
        return (
          <UserMessage
            serverId={resolvedServerId}
            agentId={agentId}
            messageId={item.messageId}
            message={item.text}
            images={item.images}
            attachments={item.attachments}
            timestamp={item.timestamp.getTime()}
            capabilities={context.capabilities}
            client={client}
            isFirstInGroup={layoutItem.isFirstInUserGroup}
            isLastInGroup={layoutItem.isLastInUserGroup}
            isPending={
              item.clientMessageId !== undefined &&
              pendingClientMessageIds.has(item.clientMessageId)
            }
          />
        );
      },
      [context.capabilities, agentId, client, pendingClientMessageIds, resolvedServerId],
    );

    const renderAssistantMessageItem = useCallback(
      (layoutItem: StreamLayoutItem, item: Extract<StreamItem, { kind: "assistant_message" }>) => {
        return (
          <AssistantFileLinkResolverProvider
            client={client}
            serverId={resolvedServerId}
            workspaceRoot={workspaceRoot}
            onOpenWorkspaceFile={handleInlinePathPress}
            toast={toast}
          >
            <ChatFindExpansion messageId={getStreamItemMessageId(item)}>
              {(renderFullContent) => (
                <AssistantMessage
                  renderFullContent={renderFullContent}
                  occurrenceKey={createAssistantImageOccurrenceKey({ agentId, itemId: item.id })}
                  message={item.text}
                  timestamp={item.timestamp.getTime()}
                  workspaceRoot={workspaceRoot}
                  serverId={resolvedServerId}
                  client={client}
                  spacing={layoutItem.assistantSpacing}
                  phase={layoutItem.phase}
                />
              )}
            </ChatFindExpansion>
          </AssistantFileLinkResolverProvider>
        );
      },
      [agentId, client, handleInlinePathPress, resolvedServerId, toast, workspaceRoot],
    );

    const renderThoughtItem = useCallback(
      (layoutItem: StreamLayoutItem, item: Extract<StreamItem, { kind: "thought" }>) => {
        return (
          <ThoughtSlot
            itemId={item.id}
            onInlineDetailsExpandedChangeByItemId={setInlineDetailsExpanded}
            text={item.text}
            status={item.status}
            isLastInSequence={layoutItem.isLastInToolSequence}
            defaultExpanded={autoExpandReasoning}
          />
        );
      },
      [autoExpandReasoning, setInlineDetailsExpanded],
    );

    const renderSingleToolCallItem = useCallback(
      (
        item: Extract<StreamItem, { kind: "tool_call" }>,
        isLastInSequence: boolean,
        maxDetailHeight?: number,
      ) => {
        const { payload } = item;

        if (payload.source === "agent") {
          const data = payload.data;

          if (
            data.name === "speak" &&
            data.detail.type === "unknown" &&
            typeof data.detail.input === "string" &&
            data.detail.input.trim()
          ) {
            return (
              <SpeakMessage message={data.detail.input} timestamp={item.timestamp.getTime()} />
            );
          }

          return (
            <ToolCallSlot
              itemId={item.id}
              onInlineDetailsExpandedChangeByItemId={setInlineDetailsExpanded}
              toolName={data.name}
              error={data.error}
              status={data.status}
              detail={data.detail}
              cwd={context.cwd}
              metadata={data.metadata}
              isLastInSequence={isLastInSequence}
              onOpenFilePath={handleToolCallOpenFile}
              maxDetailHeight={maxDetailHeight}
            />
          );
        }

        const data = payload.data;
        return (
          <ToolCallSlot
            itemId={item.id}
            onInlineDetailsExpandedChangeByItemId={setInlineDetailsExpanded}
            toolName={data.toolName}
            args={data.arguments}
            result={data.result}
            status={data.status}
            isLastInSequence={isLastInSequence}
            onOpenFilePath={handleToolCallOpenFile}
            maxDetailHeight={maxDetailHeight}
          />
        );
      },
      [context.cwd, setInlineDetailsExpanded, handleToolCallOpenFile],
    );

    // Read through a stable event so live group updates do not change the renderer identity
    // every tick; history hosts whose group changed are revised through `historyRowRevision`.
    const getToolCallGroup = useStableEvent((hostId: string) =>
      presentation.groupsByHostId.get(hostId),
    );
    const renderToolCallItem = useCallback(
      (layoutItem: StreamLayoutItem, item: Extract<StreamItem, { kind: "tool_call" }>) => {
        const group = getToolCallGroup(item.id);
        if (!group) {
          return renderSingleToolCallItem(item, layoutItem.isLastInToolSequence);
        }
        const expanded = expandedToolCallGroupIds.has(group.run.id);
        return (
          <OverviewToolCallGroupView
            group={group}
            expanded={expanded}
            isLastInSequence={layoutItem.isLastInToolSequence}
            onExpandedChange={setToolCallGroupExpanded}
          >
            {expanded
              ? group.run.items.map((runItem, index) => {
                  const isLast = index === group.run.items.length - 1;
                  return (
                    <React.Fragment key={runItem.id}>
                      {runItem.kind === "thought" ? (
                        <ThoughtSlot
                          itemId={runItem.id}
                          onInlineDetailsExpandedChangeByItemId={setInlineDetailsExpanded}
                          text={runItem.text}
                          status={runItem.status}
                          isLastInSequence={isLast}
                          defaultExpanded={autoExpandReasoning}
                        />
                      ) : (
                        renderSingleToolCallItem(
                          runItem,
                          isLast,
                          GROUPED_TOOL_CALL_DETAIL_MAX_HEIGHT,
                        )
                      )}
                    </React.Fragment>
                  );
                })
              : null}
          </OverviewToolCallGroupView>
        );
      },
      [
        autoExpandReasoning,
        expandedToolCallGroupIds,
        getToolCallGroup,
        renderSingleToolCallItem,
        setInlineDetailsExpanded,
        setToolCallGroupExpanded,
      ],
    );

    const renderStreamItemContent = useCallback(
      (layoutItem: StreamLayoutItem) => {
        const item = layoutItem.item;
        switch (item.kind) {
          case "user_message":
            return renderUserMessageItem(layoutItem, item);

          case "assistant_message":
            return renderAssistantMessageItem(layoutItem, item);

          case "thought":
            return renderThoughtItem(layoutItem, item);

          case "tool_call":
            return renderToolCallItem(layoutItem, item);

          case "notification":
            return <Notification level={item.level} message={item.message} />;

          case "todo_list":
            return <TodoListCard items={item.items} activity={item.activity} />;

          case "compaction":
            return (
              <CompactionMarker
                status={item.status}
                trigger={item.trigger}
                preTokens={item.preTokens}
              />
            );

          case "plugin":
            return (
              <PluginTimelineItemView agentId={agentId} item={item} serverId={resolvedServerId} />
            );

          default:
            return null;
        }
      },
      [
        agentId,
        renderUserMessageItem,
        renderAssistantMessageItem,
        renderThoughtItem,
        renderToolCallItem,
        resolvedServerId,
      ],
    );

    const bottomTurnFooterHost = streamLayout.auxiliaryTurnFooter;

    const renderStreamItem = useCallback(
      (layoutItem: StreamLayoutItem) => {
        const activity = turnActivity.byHostId.get(layoutItem.item.id);
        const hidden = turnActivity.hiddenItemIds.has(layoutItem.item.id);
        const body = hidden ? null : renderStreamItemContent(layoutItem);
        const content = activity ? (
          <>
            <DesktopTurnActivityHeader activity={activity} onToggle={toggleTurnActivity} />
            {body}
          </>
        ) : (
          body
        );
        const rendered = renderStreamItemWithTurnFooter({
          content,
          layoutItem: activity && hidden ? { ...layoutItem, gapBelow: 0 } : layoutItem,
          strategy: streamRenderStrategy,
          supportsTimelineCursor: supportsAgentForkContextCursor,
          onForkAssistantTurn: readOnly ? undefined : handleForkAssistantTurn,
        });
        // A just-forked chat's last item has its turn actions in the live footer, which places
        // the divider itself; otherwise the divider follows this item's actions.
        if (!rendered || !forkDivider || forkDivider.isLast) return rendered;
        if (layoutItem.item.id !== forkDivider.itemId) return rendered;
        const divider = (
          <ForkOriginDivider
            serverId={resolvedServerId}
            sourceAgentId={forkDivider.sourceAgentId}
          />
        );
        return streamRenderStrategy.getFrameChildOrder() === "footer-then-content" ? (
          <>
            {divider}
            {rendered}
          </>
        ) : (
          <>
            {rendered}
            {divider}
          </>
        );
      },
      [
        forkDivider,
        handleForkAssistantTurn,
        readOnly,
        renderStreamItemContent,
        resolvedServerId,
        turnActivity,
        toggleTurnActivity,
        streamRenderStrategy,
        supportsAgentForkContextCursor,
      ],
    );

    const pendingPermissionItems = useMemo(
      () => Array.from(pendingPermissions.values()).filter((perm) => perm.agentId === agentId),
      [pendingPermissions, agentId],
    );

    const pendingPermissionsNode = useMemo(
      () =>
        renderPendingPermissionsNode({
          pendingPermissions: pendingPermissionItems,
          client,
        }),
      [client, pendingPermissionItems],
    );
    const turnFooterNode = useMemo(() => {
      if (hasDockedPermissions) return <WaitingForApproval />;
      return isTurnActive || bottomTurnFooterHost ? (
        <TurnFooter
          isRunning={isTurnActive}
          inFlightTurnStartedAt={baseRenderModel.turnTiming.runningStartedAt}
          host={bottomTurnFooterHost}
          strategy={streamRenderStrategy}
          supportsTimelineCursor={supportsAgentForkContextCursor}
          onForkAssistantTurn={readOnly ? undefined : handleForkAssistantTurn}
          onForkInFlightTurn={readOnly ? undefined : handleForkInFlightTurn}
        />
      ) : null;
    }, [
      handleForkAssistantTurn,
      handleForkInFlightTurn,
      readOnly,
      isTurnActive,
      hasDockedPermissions,
      baseRenderModel.turnTiming.runningStartedAt,
      bottomTurnFooterHost,
      streamRenderStrategy,
      supportsAgentForkContextCursor,
    ]);
    const renderModel = useMemo<AgentStreamRenderModel>(() => {
      return {
        ...baseRenderModel,
        segments: visibleSegments,
        boundary: visibleBoundary,
        auxiliary: {
          pendingPermissions: pendingPermissionsNode,
          turnFooter: turnFooterNode,
        },
      };
    }, [baseRenderModel, visibleSegments, visibleBoundary, pendingPermissionsNode, turnFooterNode]);

    const emptyStateStyle = useMemo(() => [stylesheet.emptyState, stylesheet.contentWrapper], []);
    const scrollToBottomContainerStyle = useMemo(
      () => [
        stylesheet.scrollToBottomContainer,
        { bottom: resolveBottomOverlayControlOffset(bottomOverlayControlClearance) },
      ],
      [bottomOverlayControlClearance],
    );
    const listEmptyComponent = useMemo(
      () =>
        renderListEmptyComponent({
          renderModel,
          emptyStateStyle,
          emptyText: t("agentStream.empty"),
        }),
      [renderModel, emptyStateStyle, t],
    );

    const { boundary, auxiliary } = renderModel;

    const layoutHistoryItemById = useMemo(() => {
      const itemById = new Map<string, StreamLayoutItem>();
      for (const item of streamLayout.history) {
        itemById.set(item.item.id, item);
      }
      return itemById;
    }, [streamLayout.history]);

    const layoutLiveHeadItemById = useMemo(() => {
      const itemById = new Map<string, StreamLayoutItem>();
      for (const item of streamLayout.liveHead) {
        itemById.set(item.item.id, item);
      }
      return itemById;
    }, [streamLayout.liveHead]);

    const handleReadingPositionChange = useStableEvent(
      (rowId: string | null, atBottom: boolean) => {
        const row =
          rowId === null
            ? undefined
            : (layoutHistoryItemById.get(rowId) ?? layoutLiveHeadItemById.get(rowId));
        chatOutline.reportReadingPosition(row?.item.timelineCursor?.seq ?? null, atBottom);
      },
    );

    const renderHistoryRow = useCallback(
      (item: StreamItem) =>
        renderHistoryStreamItem({
          item,
          layoutItemById: layoutHistoryItemById,
          renderStreamItem,
        }),
      [layoutHistoryItemById, renderStreamItem],
    );

    const renderHistoryVirtualizedRow = useCallback<
      StreamSegmentRenderers["renderHistoryVirtualizedRow"]
    >((item) => renderHistoryRow(item), [renderHistoryRow]);
    const renderHistoryMountedRow = useCallback<StreamSegmentRenderers["renderHistoryMountedRow"]>(
      (item) => renderHistoryRow(item),
      [renderHistoryRow],
    );
    // useStableEvent keeps the function reference stable across flushes.
    // layoutLiveHeadItemById and renderStreamItem are read from the ref at call time,
    // so the live-head render always uses the latest layout without causing renderers
    // to be a new object on every text-chunk flush.
    const renderLiveHeadRow: StreamSegmentRenderers["renderLiveHeadRow"] = useStableEvent(
      (item: StreamItem) =>
        renderLiveHeadStreamItem({
          item,
          layoutItemById: layoutLiveHeadItemById,
          renderStreamItem,
        }),
    );
    const renderLiveAuxiliary = useCallback<StreamSegmentRenderers["renderLiveAuxiliary"]>(() => {
      const existingTailSpacing =
        auxiliary.turnFooter && !auxiliary.pendingPermissions ? TURN_FOOTER_BOTTOM_SPACING : 0;
      const bottomOverlayInset = resolveBottomOverlayTailInset({
        requiredTailClearance: bottomOverlayTailClearance,
        existingTailSpacing,
      });
      return renderLiveAuxiliaryNode({
        pendingPermissions: auxiliary.pendingPermissions,
        turnFooter: auxiliary.turnFooter,
        forkOriginDivider: forkDivider?.isLast ? (
          <ForkOriginDivider
            serverId={resolvedServerId}
            sourceAgentId={forkDivider.sourceAgentId}
          />
        ) : null,
        bottomOverlayInset,
      });
    }, [
      auxiliary.pendingPermissions,
      auxiliary.turnFooter,
      bottomOverlayTailClearance,
      forkDivider,
      resolvedServerId,
    ]);

    const renderers = useMemo<StreamSegmentRenderers>(
      () => ({
        renderHistoryVirtualizedRow,
        renderHistoryMountedRow,
        renderLiveHeadRow,
        renderLiveAuxiliary,
      }),
      [
        renderHistoryVirtualizedRow,
        renderHistoryMountedRow,
        renderLiveHeadRow,
        renderLiveAuxiliary,
      ],
    );

    const streamScrollEnabled =
      !streamRenderStrategy.shouldDisableParentScrollOnInlineDetailsExpansion() ||
      expandedInlineToolCallIds.size === 0;
    const historyRowRevision = useMemo(
      () => ({
        contentById: presentation.historyGroupUpdatesByHostId,
        displayStateById: expandedToolCallGroupIds,
        globalDisplayState: isMobile,
      }),
      [expandedToolCallGroupIds, isMobile, presentation.historyGroupUpdatesByHostId],
    );

    const findItems = useMemo(
      () => [...effectiveStreamItems, ...(effectiveStreamHead ?? [])],
      [effectiveStreamItems, effectiveStreamHead],
    );
    return (
      <ChatFind
        agentId={agentId}
        serverId={resolvedServerId}
        epoch={timelineEpoch}
        items={findItems}
        viewportRef={viewportRef}
        revealLoadedMessage={revealLoadedMessage}
        visibleMessageIds={visibleMessageIds}
      >
        <ToolCallSheetProvider>
          <AssistantSelectionCopySurface style={stylesheet.container}>
            <MessageOuterSpacingProvider disableOuterSpacing>
              {streamRenderStrategy.render({
                agentId,
                segments: renderModel.segments,
                historyRowRevision,
                liveHeadRowRevision: expandedToolCallGroupIds,
                boundary,
                renderers,
                listEmptyComponent,
                viewportRef,
                routeBottomAnchorRequest,
                isAuthoritativeHistoryReady,
                onNearBottomChange: setIsNearBottom,
                onReadingPositionChange: handleReadingPositionChange,
                onNearHistoryStart: loadOlder,
                isLoadingOlderHistory: isLoadingOlder,
                hasOlderHistory: hasOlder,
                olderHistoryProgressKey: progressKey,
                scrollEnabled: streamScrollEnabled,
                listStyle: stylesheet.list,
                baseListContentContainerStyle: stylesheet.listContentContainer,
                forwardListContentContainerStyle: stylesheet.forwardListContentContainer,
                contentMaxWidth,
                imageContext: { serverId: resolvedServerId, workspaceRoot },
              })}
            </MessageOuterSpacingProvider>
            <ChatOutlineRail
              prompts={chatOutline.prompts}
              activePrompt={chatOutline.activePrompt}
              onJumpToPrompt={chatOutline.jumpToPrompt}
            />
            <ComposerEdgeFade />
            {(!isNearBottom || isTimelineDetached) && (
              <View style={scrollToBottomContainerStyle} pointerEvents="box-none">
                <Animated.View entering={scrollIndicatorFadeIn} exiting={scrollIndicatorFadeOut}>
                  <Pressable
                    style={stylesheet.scrollToBottomButton}
                    onPress={scrollToBottom}
                    accessibilityRole="button"
                    accessibilityLabel={t("agentStream.scrollToBottom")}
                    testID="scroll-to-bottom-button"
                  >
                    <ChevronDown size={24} color={stylesheet.scrollToBottomIcon.color} />
                  </Pressable>
                </Animated.View>
              </View>
            )}
          </AssistantSelectionCopySurface>
        </ToolCallSheetProvider>
      </ChatFind>
    );
  },
);

function ComposerEdgeFade() {
  if (!getIsElectronMac()) return null;
  return <View style={stylesheet.composerEdgeFade} pointerEvents="none" />;
}

function agentCapabilityFlagsEqual(
  left: AgentCapabilityFlags | undefined,
  right: AgentCapabilityFlags | undefined,
): boolean {
  return AGENT_CAPABILITY_FLAG_KEYS.every((key) => left?.[key] === right?.[key]);
}

function collectAgentProjectPlacementDiffs(
  left: AgentScreenAgent["projectPlacement"],
  right: AgentScreenAgent["projectPlacement"],
): string[] {
  const reasons: string[] = [];
  if (left?.checkout?.cwd !== right?.checkout?.cwd) {
    reasons.push("agent.projectPlacement.checkout.cwd");
  }
  if (left?.checkout?.isGit !== right?.checkout?.isGit) {
    reasons.push("agent.projectPlacement.checkout.isGit");
  }
  if (left?.projectName !== right?.projectName) {
    reasons.push("agent.projectPlacement.projectName");
  }
  if (left?.projectKey !== right?.projectKey) {
    reasons.push("agent.projectPlacement.projectKey");
  }
  return reasons;
}

function collectAgentSetupDiffs(left: AgentScreenAgent, right: AgentScreenAgent): string[] {
  const reasons: string[] = [];
  if (left.provider !== right.provider) reasons.push("agent.provider");
  if (left.currentModeId !== right.currentModeId) reasons.push("agent.currentModeId");
  if (left.model !== right.model) reasons.push("agent.model");
  if (left.thinkingOptionId !== right.thinkingOptionId) {
    reasons.push("agent.thinkingOptionId");
  }
  if (left.runtimeInfo?.modeId !== right.runtimeInfo?.modeId) {
    reasons.push("agent.runtimeInfo.modeId");
  }
  if (left.runtimeInfo?.model !== right.runtimeInfo?.model) {
    reasons.push("agent.runtimeInfo.model");
  }
  if (left.runtimeInfo?.thinkingOptionId !== right.runtimeInfo?.thinkingOptionId) {
    reasons.push("agent.runtimeInfo.thinkingOptionId");
  }
  if (left.features !== right.features) reasons.push("agent.features");
  return reasons;
}

function collectAgentScreenAgentDiffs(left: AgentScreenAgent, right: AgentScreenAgent): string[] {
  const reasons: string[] = [];
  if (left.serverId !== right.serverId) reasons.push("agent.serverId");
  if (left.id !== right.id) reasons.push("agent.id");
  if (left.workspaceId !== right.workspaceId) reasons.push("agent.workspaceId");
  if (left.status !== right.status) reasons.push("agent.status");
  if (left.cwd !== right.cwd) reasons.push("agent.cwd");
  if (!agentCapabilityFlagsEqual(left.capabilities, right.capabilities)) {
    reasons.push("agent.capabilities");
  }
  if (left.lastError !== right.lastError) reasons.push("agent.lastError");
  reasons.push(...collectAgentSetupDiffs(left, right));
  reasons.push(...collectAgentProjectPlacementDiffs(left.projectPlacement, right.projectPlacement));
  return reasons;
}

function bottomAnchorRouteRequestsEqual(
  left: BottomAnchorRouteRequest | null | undefined,
  right: BottomAnchorRouteRequest | null | undefined,
): boolean {
  return (
    left?.agentId === right?.agentId &&
    left?.reason === right?.reason &&
    left?.requestKey === right?.requestKey
  );
}

function historyPaginationPropsEqual(
  left: AgentStreamViewProps["historyPagination"],
  right: AgentStreamViewProps["historyPagination"],
): boolean {
  return (
    left?.hasOlder === right?.hasOlder &&
    left?.isLoadingOlder === right?.isLoadingOlder &&
    left?.progressKey === right?.progressKey &&
    left?.onLoadOlder === right?.onLoadOlder
  );
}

function agentStreamViewPropsEqual(
  left: AgentStreamViewProps,
  right: AgentStreamViewProps,
): boolean {
  const reasons: string[] = [];
  if (left.agentId !== right.agentId) reasons.push("agentId");
  if (left.serverId !== right.serverId) reasons.push("serverId");
  reasons.push(...collectAgentScreenAgentDiffs(left.context, right.context));
  if (left.streamItems !== right.streamItems) reasons.push("streamItems");
  if (left.streamHead !== right.streamHead) reasons.push("streamHead");
  if (left.pendingPermissions !== right.pendingPermissions) reasons.push("pendingPermissions");
  if (left.hasDockedPermissions !== right.hasDockedPermissions)
    reasons.push("hasDockedPermissions");
  if (left.pendingMessageSubmissions !== right.pendingMessageSubmissions) {
    reasons.push("pendingMessageSubmissions");
  }
  if (left.turnPresentation !== right.turnPresentation) reasons.push("turnPresentation");
  if (
    !bottomAnchorRouteRequestsEqual(left.routeBottomAnchorRequest, right.routeBottomAnchorRequest)
  ) {
    reasons.push("routeBottomAnchorRequest");
  }
  if (left.isAuthoritativeHistoryReady !== right.isAuthoritativeHistoryReady) {
    reasons.push("isAuthoritativeHistoryReady");
  }
  if (left.toast !== right.toast) reasons.push("toast");
  if (left.onOpenWorkspaceFile !== right.onOpenWorkspaceFile) reasons.push("onOpenWorkspaceFile");
  if (left.readOnly !== right.readOnly) reasons.push("readOnly");
  if (!historyPaginationPropsEqual(left.historyPagination, right.historyPagination)) {
    reasons.push("historyPagination");
  }
  recordRenderProfileReasons(`AgentStreamView:${right.agentId}`, reasons);
  return reasons.length === 0;
}

export const AgentStreamView = memo(AgentStreamViewComponent, agentStreamViewPropsEqual);
AgentStreamView.displayName = "AgentStreamView";

interface ToolCallSlotProps extends Omit<
  ComponentProps<typeof ToolCall>,
  "onInlineDetailsExpandedChange"
> {
  itemId: string;
  onInlineDetailsExpandedChangeByItemId: (itemId: string, expanded: boolean) => void;
}

interface ThoughtSlotProps {
  itemId: string;
  onInlineDetailsExpandedChangeByItemId: (itemId: string, expanded: boolean) => void;
  text: string;
  status: Extract<StreamItem, { kind: "thought" }>["status"];
  isLastInSequence: boolean;
  defaultExpanded: boolean;
}

// Reasoning text is paced the same way assistant text is; see @/hooks/use-revealed-text.
function ThoughtSlot({
  itemId,
  onInlineDetailsExpandedChangeByItemId,
  text,
  status,
  isLastInSequence,
  defaultExpanded,
}: ThoughtSlotProps) {
  const revealedText = useRevealedText(text, status === "ready" ? "complete" : "streaming");
  return (
    <ToolCallSlot
      itemId={itemId}
      onInlineDetailsExpandedChangeByItemId={onInlineDetailsExpandedChangeByItemId}
      toolName="thinking"
      args={revealedText}
      status={status === "ready" ? "completed" : "executing"}
      isLastInSequence={isLastInSequence}
      defaultExpanded={defaultExpanded}
      forceInline={defaultExpanded}
    />
  );
}

function ToolCallSlot({
  itemId,
  onInlineDetailsExpandedChangeByItemId,
  ...rest
}: ToolCallSlotProps) {
  const handleExpandedChange = useCallback(
    (expanded: boolean) => onInlineDetailsExpandedChangeByItemId(itemId, expanded),
    [onInlineDetailsExpandedChangeByItemId, itemId],
  );
  return <ToolCall {...rest} onInlineDetailsExpandedChange={handleExpandedChange} />;
}

const ThemedWaitingHand = withUnistyles(Hand, (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
}));

function WaitingForApproval() {
  const { t } = useTranslation();
  return (
    <View style={stylesheet.syncingIndicator} testID="desktop-waiting-for-approval">
      <ThemedWaitingHand size={14} />
      <Text style={stylesheet.syncingIndicatorText} accessibilityLiveRegion="polite">
        {t("agentStream.permission.waiting")}
      </Text>
    </View>
  );
}
const stylesheet = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  contentWrapper: {
    width: "100%",
    maxWidth: theme.contentMaxWidth,
    alignSelf: "center",
    paddingHorizontal: CHAT_MESSAGE_HORIZONTAL_PADDING,
  },
  listContentContainer: {
    paddingVertical: 0,
    flexGrow: 1,
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[4],
    },
  },
  forwardListContentContainer: {
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[4],
  },
  list: {
    flex: 1,
  },
  streamItemWrapper: {
    width: "100%",
    maxWidth: theme.contentMaxWidth,
    alignSelf: "center",
    paddingHorizontal: CHAT_MESSAGE_HORIZONTAL_PADDING,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[12],
  },
  permissionsContainer: {
    gap: theme.spacing[2],
  },
  listHeaderContent: {
    gap: theme.spacing[3],
  },
  syncingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    paddingLeft: theme.spacing[2],
  },
  syncingIndicatorText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  invertedWrapper: {
    transform: [{ scaleY: -1 }],
    width: "100%",
  },
  emptyStateText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
  // Fades the transcript into the composer edge instead of cutting it off.
  composerEdgeFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: theme.spacing[6],
    backgroundImage: `linear-gradient(to bottom, transparent, ${theme.colors.surface0})`,
  },
  scrollToBottomContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  scrollToBottomButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadow.sm,
  },
  scrollToBottomIcon: {
    color: theme.colors.foreground,
  },
}));

interface StreamItemWrapperProps {
  itemId: string;
  gapBelow: number;
  children: ReactNode;
}

function StreamItemWrapper({ gapBelow, children }: StreamItemWrapperProps) {
  const wrapperStyle = useMemo(
    () => [stylesheet.streamItemWrapper, { marginBottom: gapBelow }],
    [gapBelow],
  );
  return <View style={wrapperStyle}>{children}</View>;
}
