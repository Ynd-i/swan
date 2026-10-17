import { createContext, memo, useCallback, useContext, useMemo, useState, type Ref } from "react";
import { Archive, ChevronDown, ChevronRight, Pin, PinOff } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AgentStatusDot } from "@/components/agent-status-dot";
import type { DraggableListDragHandleProps } from "@/components/draggable-list.types";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import type { Theme } from "@/styles/theme";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { deriveSidebarStateBucket } from "@/utils/sidebar-agent-state";
import { desktopChatKey, type HandoffChains } from "./desktop-chat-model";
import { DesktopChatMenuItems, useChatForkPage, useDesktopChatMenu } from "./desktop-chat-menu";
import { useSectionMovePage } from "./desktop-chat-section-menus";
import { useChatSectionsStore } from "./desktop-chat-sections-store";
import { DesktopProgressRing } from "./desktop-progress-ring";
import { DesktopSidebarTitle } from "./desktop-sidebar-title";

const ArchiveIcon = withUnistyles(Archive);
const PinIcon = withUnistyles(Pin);
const UnpinIcon = withUnistyles(PinOff);
const ChevronDownIcon = withUnistyles(ChevronDown);
const ChevronRightIcon = withUnistyles(ChevronRight);
const Progress = withUnistyles(DesktopProgressRing);
const mutedIcon = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/** Auto-handoff chains of the sidebar, so a chat row can nest the chats it continues. */
export const HandoffChainsContext = createContext<HandoffChains>(new Map());
// The width each row action covers at the right edge of the title.
// ponytail: the md+ button width; below 720pt buttons grow to 32 and the fade stops short. Measure
// the actions if the compact sidebar matters.
const ACTION_WIDTH = 26;

function ChatRowStatus({
  agent,
  status,
  running,
  unread,
}: {
  agent: AggregatedAgent;
  status: string;
  running: boolean;
  unread: boolean;
}) {
  return (
    <View style={styles.statusSlot}>
      {running ? (
        <Progress uniProps={mutedIcon} />
      ) : (
        <AgentStatusDot
          status={status}
          requiresAttention={unread}
          attentionReason={agent.attentionReason}
          pendingPermissionCount={agent.pendingPermissionCount}
        />
      )}
    </View>
  );
}

/**
 * Pin and archive over the title's right edge, so the title spans the row. A nested chat of a
 * handoff chain shows only its status: its chain is pinned and archived from the head row.
 */
function ChatRowActions({
  agent,
  nested,
  chatKey,
  status,
  running,
  unread,
  busy,
  pinned,
  revealed,
  onPin,
  onArchive,
  onFocus,
  onBlur,
}: {
  agent: AggregatedAgent;
  nested: boolean | undefined;
  chatKey: string;
  status: string;
  running: boolean;
  unread: boolean;
  busy: boolean;
  pinned: boolean;
  revealed: boolean;
  onPin: () => void;
  onArchive: () => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const { t } = useTranslation();
  const pinLabel = t(pinned ? "sidebar.workspace.actions.unpin" : "sidebar.workspace.actions.pin");
  const archiveLabel = t("agentList.archiveSheet.archive");
  const actionStyle = revealed ? undefined : styles.actionHidden;
  const statusDot = (
    <ChatRowStatus agent={agent} status={status} running={running} unread={unread} />
  );
  if (nested) {
    return (
      <View style={styles.actions}>
        <View style={styles.statusOnly}>{statusDot}</View>
      </View>
    );
  }
  return (
    <View style={styles.actions}>
      <HeaderToggleButton
        onPress={onPin}
        disabled={busy}
        onFocus={onFocus}
        onBlur={onBlur}
        tooltipLabel={pinLabel}
        tooltipKeys={[]}
        tooltipSide="top"
        style={actionStyle}
        accessibilityRole="button"
        accessibilityLabel={pinLabel}
        testID={`desktop-chat-pin-${chatKey}`}
      >
        {pinned ? (
          <UnpinIcon size={16} uniProps={mutedIcon} />
        ) : (
          <PinIcon size={16} uniProps={mutedIcon} />
        )}
      </HeaderToggleButton>
      <View>
        <HeaderToggleButton
          onPress={onArchive}
          disabled={busy}
          onFocus={onFocus}
          onBlur={onBlur}
          tooltipLabel={archiveLabel}
          tooltipKeys={[]}
          tooltipSide="top"
          style={actionStyle}
          accessibilityRole="button"
          accessibilityLabel={archiveLabel}
          testID={`desktop-chat-archive-${chatKey}`}
        >
          <ArchiveIcon size={16} uniProps={mutedIcon} />
        </HeaderToggleButton>
        {/* Shares the archive slot: hovering swaps the status for the row actions. */}
        {revealed ? null : statusDot}
      </View>
    </View>
  );
}

/** The width the title keeps clear at the right edge: both actions, else the status. */
function titleReserve(input: { showActions: boolean; busy: boolean; bucket: string }): number {
  if (input.showActions) return 2 * ACTION_WIDTH;
  // Done rows show no status, so their title runs to the row's edge.
  return input.busy || input.bucket !== "done" ? ACTION_WIDTH : 0;
}

/** A collapsed chain shows its selected earlier chat on the head row. */
function isChainSelected(input: {
  key: string;
  handoffs: readonly AggregatedAgent[] | undefined;
  selectedKey: string | null;
  open: boolean;
}): boolean {
  if (input.selectedKey === input.key) return true;
  if (input.open || !input.handoffs) return false;
  return input.handoffs.some((handoff) => desktopChatKey(handoff) === input.selectedKey);
}

/** A chain moves between sections as one chat. */
function useChainSection(key: string, handoffs: readonly AggregatedAgent[] | undefined) {
  const memberKeys = useMemo(() => [key, ...(handoffs ?? []).map(desktopChatKey)], [handoffs, key]);
  const section = useChatSectionsStore((state) =>
    memberKeys.map((member) => state.chatSection[member]).find((id) => id !== undefined),
  );
  const moveChat = useChatSectionsStore((state) => state.moveChat);
  const move = useCallback(
    (sectionId: string | null) => {
      for (const member of memberKeys) moveChat(member, sectionId);
    },
    [memberKeys, moveChat],
  );
  return { section, move };
}

/** The chevron of a chat that continues earlier ones; nothing for any other chat. */
function HandoffToggle({
  chatKey,
  handoffs,
  open,
  onToggle,
}: {
  chatKey: string;
  handoffs: readonly AggregatedAgent[] | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const accessibilityState = useMemo(() => ({ expanded: open }), [open]);
  if (!handoffs) return null;
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={4}
      style={styles.handoffToggle}
      accessibilityRole="button"
      accessibilityLabel={t("desktopChat.handoffs.toggle", { count: handoffs.length })}
      accessibilityState={accessibilityState}
      testID={`desktop-chat-handoffs-${chatKey}`}
    >
      {open ? (
        <ChevronDownIcon size={14} uniProps={mutedIcon} />
      ) : (
        <ChevronRightIcon size={14} uniProps={mutedIcon} />
      )}
    </Pressable>
  );
}

/** The earlier chats of a chain, newest first, greyed one level deeper. */
function HandoffRows({
  handoffs = [],
  open,
  selectedKey,
  indented,
}: {
  handoffs?: readonly AggregatedAgent[];
  open: boolean;
  selectedKey: string | null;
  indented: boolean;
}) {
  if (!open) return null;
  return handoffs.map((handoff) => (
    <ChatRow
      key={desktopChatKey(handoff)}
      agent={handoff}
      selectedKey={selectedKey}
      indented={indented}
      superseded
    />
  ));
}

export const ChatRow = memo(function ChatRow({
  agent,
  selectedKey,
  indented = false,
  superseded,
  dragHandleProps,
}: {
  agent: AggregatedAgent;
  selectedKey: string | null;
  indented?: boolean;
  /** An earlier chat of a handoff chain, nested and greyed under the chat that continues it. */
  superseded?: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
}) {
  const { t } = useTranslation();
  const key = desktopChatKey(agent);
  const handoffs = useContext(HandoffChainsContext).get(key);
  const { busy, unread, markRead, menuProps, renameModal } = useDesktopChatMenu(agent, handoffs);
  const [hovered, setHovered] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [handoffsOpen, setHandoffsOpen] = useState(false);
  const selected = isChainSelected({ key, handoffs, selectedKey, open: handoffsOpen });
  const { section, move } = useChainSection(key, handoffs);
  const toggleHandoffs = useCallback(() => setHandoffsOpen((open) => !open), []);
  const sectionPage = useSectionMovePage(`chat-section-${key}`, section, move);
  const forkPage = useChatForkPage(agent);
  const pages = useMemo(
    () => (forkPage ? [sectionPage, forkPage] : [sectionPage]),
    [forkPage, sectionPage],
  );
  const revealed = hovered || contextOpen;
  const title = agent.title || t("agentList.fallbackTitle");
  const status = agent.turn.phase === "open" ? "running" : agent.status;
  const bucket = deriveSidebarStateBucket({
    status,
    requiresAttention: unread,
    attentionReason: agent.attentionReason,
    pendingPermissionCount: agent.pendingPermissionCount,
  });
  const running = bucket === "running";
  const showActions = revealed && !superseded;
  const reserve = titleReserve({ showActions, busy, bucket });
  const enter = useCallback(() => setHovered(true), []);
  const leave = useCallback(() => setHovered(false), []);
  const open = useCallback(() => {
    if (unread) markRead();
    navigateToAgent({
      serverId: agent.serverId,
      agentId: agent.id,
      workspaceId: agent.workspaceId,
      pin: true,
    });
  }, [agent, unread, markRead]);
  const accessibilityState = useMemo(() => ({ selected, busy }), [selected, busy]);
  // The whole row starts a drag in manually ordered sections; dnd-kit's own role would
  // replace the row's button semantics.
  const {
    role: _dragRole,
    tabIndex: _dragTabIndex,
    "aria-roledescription": _dragRoleDescription,
    ...dragAttributes
  } = dragHandleProps?.attributes ?? {};

  return (
    <>
      <ContextMenu open={contextOpen} onOpenChange={setContextOpen}>
        <ContextMenuTrigger contextOnly>
          <View
            {...dragAttributes}
            {...dragHandleProps?.listeners}
            ref={dragHandleProps?.setActivatorNodeRef as unknown as Ref<View>}
            onPointerEnter={enter}
            onPointerLeave={leave}
            style={[
              styles.chatRow,
              indented && styles.indented,
              superseded && styles.superseded,
              revealed && styles.rowHovered,
              selected && styles.rowSelected,
            ]}
          >
            <HandoffToggle
              chatKey={key}
              handoffs={handoffs}
              open={handoffsOpen}
              onToggle={toggleHandoffs}
            />
            <Pressable
              onPress={open}
              disabled={busy}
              style={styles.chatButton}
              accessibilityRole="button"
              accessibilityLabel={`${title} — ${agent.serverLabel}`}
              accessibilityState={accessibilityState}
              testID={`desktop-chat-${key}`}
            >
              <DesktopSidebarTitle
                title={title}
                style={[
                  styles.chatTitle,
                  unread && styles.unreadTitle,
                  superseded && styles.supersededTitle,
                ]}
                reserve={reserve}
                scrolling={revealed}
              />
            </Pressable>
            <ChatRowActions
              agent={agent}
              nested={superseded}
              chatKey={key}
              status={status}
              running={busy || running}
              unread={unread}
              busy={busy}
              pinned={menuProps.pinned}
              revealed={showActions}
              onPin={menuProps.onPin}
              onArchive={menuProps.onArchive}
              onFocus={enter}
              onBlur={leave}
            />
          </View>
        </ContextMenuTrigger>
        <ContextMenuContent width={210} pages={pages}>
          <DesktopChatMenuItems
            {...menuProps}
            context
            nested={superseded}
            sectionPage={sectionPage.id}
            forkPage={forkPage?.id}
          />
        </ContextMenuContent>
      </ContextMenu>
      <HandoffRows
        handoffs={handoffs}
        open={handoffsOpen}
        selectedKey={selectedKey}
        indented={indented}
      />
      {renameModal}
    </>
  );
});

const styles = StyleSheet.create((theme) => ({
  chatRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingLeft: 8,
    paddingRight: 4,
  },
  indented: { paddingLeft: 32 },
  // Nested one chevron deeper than the chat that continues it.
  superseded: { marginLeft: 22 },
  supersededTitle: { color: theme.colors.foregroundMuted },
  handoffToggle: {
    width: 16,
    height: 32,
    marginLeft: -4,
    marginRight: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  rowHovered: { backgroundColor: theme.colors.surfaceSidebarHover },
  rowSelected: { backgroundColor: theme.colors.surfaceSidebarSelected },
  chatButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chatTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 20,
  },
  unreadTitle: { color: theme.colors.foreground, fontWeight: theme.fontWeight.medium },
  actions: {
    position: "absolute",
    top: 0,
    right: 4,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  actionHidden: { opacity: 0 },
  statusOnly: { width: ACTION_WIDTH, height: ACTION_WIDTH },
  statusSlot: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
}));
