import { useCallback, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { ArrowLeftToLine, Plus, X } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { SortableInlineList } from "@/components/sortable-inline-list";
import { EXPLORER_TAB_RAIL_INSET } from "@/components/explorer-sidebar-layout";
import type {
  DraggableListDragHandleProps,
  DraggableRenderItemInfo,
} from "@/components/draggable-list.types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { titlebarDragSurfaceStyle } from "@/components/desktop/titlebar-drag-region";
import { WORKSPACE_SECONDARY_HEADER_HEIGHT } from "@/constants/layout";
import { getIsElectronMac, isWeb } from "@/constants/platform";
import { iconButtonChromeGlyphSize } from "@/components/ui/icon-button-chrome";
import { HEADER_CONTROL_HEIGHT } from "@/components/ui/control-geometry";
import {
  WorkspaceTabIcon,
  WorkspaceTabPresentationResolver,
  type WorkspaceTabPresentation,
} from "@/screens/workspace/workspace-tab-presentation";
import type { WorkspaceDesktopTabRowItem } from "@/screens/workspace/workspace-desktop-tabs-row";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { WorkspaceNewTabMenuContent } from "@/screens/workspace/workspace-new-tab-menu";
import {
  useWorkspaceTabLaunchCatalog,
  type WorkspaceTabLaunchItem,
} from "@/workspace-tabs/launcher";
import { workspaceTabTargetsEqual } from "@/workspace-tabs/identity";
import type { PanelIconProps } from "@/panels/panel-registry";
import { panelTargetSupportsHost } from "@/plugins/workspace-panels/locations";
import type { Theme } from "@/styles/theme";
import type { SurfaceBackdrop } from "@/styles/surface-backdrop";
import {
  HorizontalScrollBoundaryShades,
  useHorizontalScrollBoundary,
} from "@/components/ui/horizontal-scroll-boundary";

const TAB_GAP = 4;
const TAB_DROP_INDICATOR_WIDTH = 4;
const TAB_HOVER_FRAME_STYLE = { position: "relative" } as const;

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });

function stopClosePropagation(event: { stopPropagation?: () => void }) {
  event.stopPropagation?.();
}

interface ExplorerSidebarTabRailProps {
  paneId: string;
  tabs: WorkspaceDesktopTabRowItem[];
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  activeDragTabId: string | null;
  tabDropPreviewIndex: number | null;
  onNavigateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onCreateNewTab: () => void;
  onMoveTabToMain: (tabId: string) => void;
  onReorderTabs: (tabs: WorkspaceTabDescriptor[]) => void;
  trailingAccessory?: ReactNode;
  inTitlebar?: boolean;
}

function tabKey(item: WorkspaceDesktopTabRowItem): string {
  return `${item.tab.key}:${item.tab.kind}`;
}

function resolveExplorerSidebarTabBackdrop(): SurfaceBackdrop {
  return "surfaceSidebar";
}

function ExplorerSidebarTab({
  item,
  isDragging,
  dragHandleProps,
  onNavigateTab,
  onCloseTab,
  onMoveTabToMain,
  normalizedServerId,
  normalizedWorkspaceId,
}: {
  item: WorkspaceDesktopTabRowItem;
  isDragging: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
  onNavigateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onMoveTabToMain: (tabId: string) => void;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [closeFocused, setCloseFocused] = useState(false);
  const showCloseControl = item.isActive || hovered || closeFocused || item.isClosingTab;
  const handlePress = useCallback(
    () => onNavigateTab(item.tab.tabId),
    [item.tab.tabId, onNavigateTab],
  );
  const handleHoverIn = useCallback(() => setHovered(true), []);
  const handleHoverOut = useCallback(() => setHovered(false), []);
  const handleClose = useCallback(() => {
    void onCloseTab(item.tab.tabId);
  }, [item.tab.tabId, onCloseTab]);
  const handleClosePress = useCallback(
    (event: { stopPropagation?: () => void }) => {
      event.stopPropagation?.();
      handleClose();
    },
    [handleClose],
  );
  const handleCloseFocus = useCallback(() => setCloseFocused(true), []);
  const handleCloseBlur = useCallback(() => setCloseFocused(false), []);
  const handleMoveToMain = useCallback(
    () => onMoveTabToMain(item.tab.tabId),
    [item.tab.tabId, onMoveTabToMain],
  );
  const isConversation = item.tab.kind === "agent" || item.tab.kind === "draft";
  const mainAreaAllowsTab = !getIsElectronMac() || isConversation;
  const canMoveToMain =
    mainAreaAllowsTab && panelTargetSupportsHost(normalizedServerId, item.tab.target, "main");
  const moveToMainLeading = useMemo(
    () => <ThemedArrowLeftToLine size={14} uniProps={mutedColorMapping} />,
    [],
  );
  const closeLeading = useMemo(() => <ThemedX size={14} uniProps={mutedColorMapping} />, []);
  const accessibilityState = useMemo(() => ({ selected: item.isActive }), [item.isActive]);
  const renderPresentation = useCallback(
    (presentation: WorkspaceTabPresentation) => {
      const content = (
        <ContextMenu>
          <Tooltip delayDuration={300} enabledOnDesktop enabledOnMobile={false}>
            <TooltipTrigger asChild triggerRefProp="triggerRef">
              <ContextMenuTrigger
                {...(dragHandleProps?.attributes as object | undefined)}
                {...(dragHandleProps?.listeners as object | undefined)}
                triggerRef={dragHandleProps?.setActivatorNodeRef as never}
                testID={`explorer-sidebar-tab-${item.tab.tabId}`}
                accessibilityRole="button"
                accessibilityLabel={presentation.tooltip}
                accessibilityState={accessibilityState}
                aria-selected={item.isActive}
                onPress={handlePress}
                onHoverIn={isWeb ? undefined : handleHoverIn}
                onHoverOut={isWeb ? undefined : handleHoverOut}
                style={[
                  styles.tab,
                  hovered ? styles.tabHovered : null,
                  item.isActive ? styles.tabActive : null,
                  isDragging ? styles.tabDragging : null,
                ]}
              >
                <WorkspaceTabIcon
                  presentation={presentation}
                  active={item.isActive}
                  size={iconButtonChromeGlyphSize("small")}
                  strokeWidth={1.5}
                  backdrop={
                    getIsElectronMac() && item.isActive
                      ? "surface2"
                      : resolveExplorerSidebarTabBackdrop()
                  }
                />
                <Text
                  selectable={false}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[styles.tabLabel, item.isActive ? styles.tabLabelActive : null]}
                >
                  {presentation.label}
                </Text>
              </ContextMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="center" offset={8}>
              <Text style={styles.tooltipText}>{presentation.tooltip}</Text>
            </TooltipContent>
          </Tooltip>
          {getIsElectronMac() ? (
            <View
              pointerEvents={showCloseControl ? "box-none" : "none"}
              style={[
                styles.tabCloseOverlay,
                showCloseControl ? styles.tabCloseShown : styles.tabCloseHidden,
              ]}
            >
              <Pressable
                {...({ onMouseDown: stopClosePropagation } as object)}
                onPointerDown={stopClosePropagation}
                onPressIn={stopClosePropagation}
                onPress={handleClosePress}
                onFocus={handleCloseFocus}
                onBlur={handleCloseBlur}
                testID={`explorer-sidebar-tab-close-${item.tab.tabId}`}
                accessibilityRole="button"
                accessibilityLabel={t("workspace.tabs.menu.close")}
                disabled={item.isClosingTab}
                style={styles.tabCloseButton}
              >
                {({ hovered: closeHovered, pressed }) => (
                  <ThemedX
                    size={12}
                    uniProps={closeHovered || pressed ? foregroundColorMapping : mutedColorMapping}
                  />
                )}
              </Pressable>
            </View>
          ) : null}
          <ContextMenuContent align="start" minWidth={180}>
            {canMoveToMain ? (
              <ContextMenuItem leading={moveToMainLeading} onSelect={handleMoveToMain}>
                {t("workspace.tabs.menu.moveToMain")}
              </ContextMenuItem>
            ) : null}
            {canMoveToMain ? <ContextMenuSeparator /> : null}
            <ContextMenuItem leading={closeLeading} onSelect={handleClose}>
              {t("workspace.tabs.menu.close")}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
      return isWeb ? (
        <div
          style={TAB_HOVER_FRAME_STYLE}
          onMouseEnter={handleHoverIn}
          onMouseLeave={handleHoverOut}
        >
          {content}
        </div>
      ) : (
        content
      );
    },
    [
      accessibilityState,
      dragHandleProps,
      handleHoverIn,
      handleHoverOut,
      handleClose,
      handleClosePress,
      handleCloseFocus,
      handleCloseBlur,
      handleMoveToMain,
      handlePress,
      hovered,
      isDragging,
      item,
      canMoveToMain,
      closeLeading,
      moveToMainLeading,
      showCloseControl,
      t,
    ],
  );

  return (
    <WorkspaceTabPresentationResolver
      tab={item.tab}
      serverId={normalizedServerId}
      workspaceId={normalizedWorkspaceId}
    >
      {renderPresentation}
    </WorkspaceTabPresentationResolver>
  );
}

function CatalogIcon({
  Icon,
  color = "",
}: {
  Icon: ComponentType<PanelIconProps>;
  color?: string;
}) {
  return <Icon size={14} color={color} />;
}

const ThemedCatalogIcon = withUnistyles(CatalogIcon);
const ThemedArrowLeftToLine = withUnistyles(ArrowLeftToLine);
const ThemedPlus = withUnistyles(Plus);
const ThemedX = withUnistyles(X);

function ExplorerSidebarConfigurationItem({
  item,
  paneId,
  tab,
  onCloseTab,
}: {
  item: WorkspaceTabLaunchItem;
  paneId: string;
  tab: WorkspaceTabDescriptor | null;
  onCloseTab: (tabId: string) => Promise<void> | void;
}) {
  const leading = useMemo(() => {
    return item.Icon ? <ThemedCatalogIcon Icon={item.Icon} uniProps={mutedColorMapping} /> : null;
  }, [item.Icon]);
  const handleSelect = useCallback(() => {
    if (tab) {
      void onCloseTab(tab.tabId);
      return;
    }
    item.launch({ kind: "open", paneId });
  }, [item, onCloseTab, paneId, tab]);

  return (
    <ContextMenuItem
      leading={leading}
      selected={Boolean(tab)}
      showSelectedCheck
      disabled={!tab && item.disabled}
      onSelect={handleSelect}
    >
      {item.label}
    </ContextMenuItem>
  );
}

function catalogItemMatchesTab(item: WorkspaceTabLaunchItem, tab: WorkspaceTabDescriptor): boolean {
  return item.toggleTarget !== null && workspaceTabTargetsEqual(item.toggleTarget, tab.target);
}

export function ExplorerSidebarTabRail({
  paneId,
  tabs,
  normalizedServerId,
  normalizedWorkspaceId,
  activeDragTabId,
  tabDropPreviewIndex,
  onNavigateTab,
  onCloseTab,
  onCreateNewTab,
  onMoveTabToMain,
  onReorderTabs,
  trailingAccessory,
  inTitlebar = false,
}: ExplorerSidebarTabRailProps) {
  const scrollBoundary = useHorizontalScrollBoundary();
  const { t } = useTranslation();
  const groups = useWorkspaceTabLaunchCatalog({
    serverId: normalizedServerId,
    purpose: "supporting",
    host: "explorer",
    surface: "menu",
  });
  const panePanelKinds = useMemo(() => tabs.map(({ tab }) => tab.kind), [tabs]);
  const singletonConfigurationItems = useMemo(
    () => groups.flatMap((group) => group.items).filter((item) => item.toggleTarget !== null),
    [groups],
  );
  const newTabLeading = useMemo(() => <ThemedPlus size={14} uniProps={mutedColorMapping} />, []);
  const handleDragEnd = useCallback(
    (nextTabs: WorkspaceDesktopTabRowItem[]) => onReorderTabs(nextTabs.map((item) => item.tab)),
    [onReorderTabs],
  );
  const getTabDragData = useCallback(
    (item: WorkspaceDesktopTabRowItem) => ({
      kind: "workspace-tab" as const,
      paneId,
      tabId: item.tab.tabId,
    }),
    [paneId],
  );
  const renderTab = useCallback(
    ({
      item,
      index,
      dragHandleProps,
      isActive,
    }: DraggableRenderItemInfo<WorkspaceDesktopTabRowItem>) => {
      const showBefore = activeDragTabId !== null && tabDropPreviewIndex === index;
      const showAfter =
        activeDragTabId !== null &&
        tabDropPreviewIndex === tabs.length &&
        index === tabs.length - 1;
      return (
        <View style={styles.tabSlot}>
          {showBefore ? <View style={[styles.dropIndicator, styles.dropIndicatorBefore]} /> : null}
          <ExplorerSidebarTab
            item={item}
            isDragging={isActive}
            dragHandleProps={dragHandleProps}
            onNavigateTab={onNavigateTab}
            onCloseTab={onCloseTab}
            onMoveTabToMain={onMoveTabToMain}
            normalizedServerId={normalizedServerId}
            normalizedWorkspaceId={normalizedWorkspaceId}
          />
          {showAfter ? <View style={[styles.dropIndicator, styles.dropIndicatorAfter]} /> : null}
        </View>
      );
    },
    [
      activeDragTabId,
      normalizedServerId,
      normalizedWorkspaceId,
      onNavigateTab,
      onCloseTab,
      onMoveTabToMain,
      tabDropPreviewIndex,
      tabs.length,
    ],
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger
        contextOnly
        style={[
          styles.track,
          inTitlebar && styles.titlebarTrack,
          titlebarDragSurfaceStyle as never,
        ]}
        testID="explorer-sidebar-tab-rail"
      >
        <View style={styles.scrollContainer}>
          <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            onLayout={scrollBoundary.onLayout}
            onContentSizeChange={scrollBoundary.onContentSizeChange}
            onScroll={scrollBoundary.onScroll}
            scrollEventThrottle={16}
          >
            <SortableInlineList
              data={tabs}
              keyExtractor={tabKey}
              renderItem={renderTab}
              onDragEnd={handleDragEnd}
              useDragHandle
              externalDndContext
              activeId={activeDragTabId}
              getItemData={getTabDragData}
            />
            {getIsElectronMac() ? (
              <DropdownMenu>
                <ToolbarButton
                  kind="menu"
                  label={t("workspace.tabs.actions.newTab")}
                  testID="explorer-sidebar-new-tab-button"
                >
                  <ThemedPlus size={14} uniProps={mutedColorMapping} />
                </ToolbarButton>
                <WorkspaceNewTabMenuContent
                  serverId={normalizedServerId}
                  purpose="supporting"
                  host="explorer"
                  panePanelKinds={panePanelKinds}
                  paneId={paneId}
                />
              </DropdownMenu>
            ) : null}
          </Animated.ScrollView>
          <HorizontalScrollBoundaryShades
            visible
            backdrop="sidebar"
            testIDPrefix="explorer-sidebar-tabs-scroll-shade"
            leftStyle={scrollBoundary.leftShadeStyle}
            rightStyle={scrollBoundary.rightShadeStyle}
          />
        </View>
        {trailingAccessory ? (
          <View style={styles.trailingAccessory}>{trailingAccessory}</View>
        ) : null}
      </ContextMenuTrigger>
      <ContextMenuContent align="start" minWidth={200} testID="explorer-sidebar-tab-configuration">
        <ContextMenuItem leading={newTabLeading} onSelect={onCreateNewTab}>
          {t("workspace.tabs.actions.newTab")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {singletonConfigurationItems.map((item) => (
          <ExplorerSidebarConfigurationItem
            key={item.id}
            item={item}
            paneId={paneId}
            tab={tabs.find(({ tab }) => catalogItemMatchesTab(item, tab))?.tab ?? null}
            onCloseTab={onCloseTab}
          />
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: {
    minWidth: 0,
    height: WORKSPACE_SECONDARY_HEADER_HEIGHT,
    backgroundColor: theme.colors.surfaceSidebar,
    flexDirection: "row",
    alignItems: "center",
  },
  titlebarTrack: {
    height: "100%",
    backgroundColor: "transparent",
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
  },
  scrollContainer: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: EXPLORER_TAB_RAIL_INSET,
  },
  trailingAccessory: {
    marginRight: 4,
  },
  tabSlot: {
    position: "relative",
    marginHorizontal: TAB_GAP / 2,
  },
  tab: {
    height: getIsElectronMac() ? 32 : HEADER_CONTROL_HEIGHT,
    maxWidth: 180,
    paddingHorizontal: theme.spacing[2],
    paddingRight: getIsElectronMac() ? theme.spacing[2] + 20 : theme.spacing[2],
    borderRadius: getIsElectronMac() ? 8 : theme.borderRadius.md,
    borderWidth: getIsElectronMac() ? 1 : 0,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    userSelect: "none",
  },
  tabHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  tabActive: {
    backgroundColor: getIsElectronMac() ? theme.colors.surface2 : theme.colors.interactionHighlight,
    borderColor: getIsElectronMac() ? theme.colors.borderAccent : "transparent",
  },
  tabLabel: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    userSelect: "none",
  },
  tabLabelActive: {
    color: theme.colors.foreground,
  },
  tabDragging: {
    opacity: 0.3,
  },
  tabCloseOverlay: {
    position: "absolute",
    top: 0,
    right: 4,
    bottom: 0,
    justifyContent: "center",
  },
  tabCloseShown: {
    opacity: 1,
  },
  tabCloseHidden: {
    opacity: 0,
  },
  tabCloseButton: {
    width: 18,
    height: 18,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  dropIndicator: {
    position: "absolute",
    top: theme.spacing[0.5],
    bottom: theme.spacing[0.5],
    width: TAB_DROP_INDICATOR_WIDTH,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
    zIndex: 10,
    pointerEvents: "none",
  },
  dropIndicatorBefore: {
    left: -TAB_GAP / 2 - TAB_DROP_INDICATOR_WIDTH / 2,
  },
  dropIndicatorAfter: {
    right: -TAB_GAP / 2 - TAB_DROP_INDICATOR_WIDTH / 2,
  },
  tooltipText: {
    color: theme.colors.popoverForeground,
    fontSize: theme.fontSize.base,
  },
}));
