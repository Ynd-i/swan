import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { RetainedPanel, useRetainedPanelActive } from "@/components/retained-panel";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { DesktopWorkspaceToolbar, usesDesktopShell } from "@/components/desktop/desktop-shell";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import type { TabDropPreview } from "@/components/split-container-tab-drop-preview";
import { ExplorerSidebarTabRail } from "@/screens/workspace/explorer-sidebar-tab-rail";
import { WorkspacePanelHost } from "@/screens/workspace/workspace-panel-host";
import { deriveWorkspacePaneState } from "@/screens/workspace/workspace-pane-state";
import type { WorkspaceDesktopTabRowItem } from "@/screens/workspace/workspace-desktop-tabs-row";
import type { WorkspacePaneContentModel } from "@/screens/workspace/workspace-pane-content";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { SplitPane } from "@/stores/workspace-layout-store";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import { WindowChromeRegion, WindowChromeSafeArea } from "@/utils/desktop-window";

interface ExplorerSidebarDockProps {
  pane: SplitPane;
  uiTabs: WorkspaceTab[];
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  isWorkspaceFocused: boolean;
  closingTabIds: Set<string>;
  activeDragTabId: string | null;
  tabDropPreview: TabDropPreview | null;
  onSelectTab: (paneId: string, tabId: string) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onCreateNewTab: () => void;
  onMoveTabToMain: (tabId: string) => void;
  onReorderTabsInPane: (paneId: string, tabIds: string[]) => void;
  buildPaneContentModel: (input: {
    paneId: string;
    tab: WorkspaceTabDescriptor;
  }) => WorkspacePaneContentModel;
  headerAction?: ReactNode;
}

/** A dock shell over the shared panel host. It owns no workspace-pane capabilities. */
export function ExplorerSidebarDock({
  pane,
  uiTabs,
  normalizedServerId,
  normalizedWorkspaceId,
  isWorkspaceFocused,
  closingTabIds,
  activeDragTabId,
  tabDropPreview,
  onSelectTab,
  onCloseTab,
  onCreateNewTab,
  onMoveTabToMain,
  onReorderTabsInPane,
  buildPaneContentModel,
  headerAction,
}: ExplorerSidebarDockProps) {
  const isCompact = useIsCompactFormFactor();
  const isRetainedPanelActive = useRetainedPanelActive();
  const usesTitlebar = isWeb && usesDesktopShell && !isCompact;
  const [dockWidth, setDockWidth] = useState(0);
  const handleDockLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width <= 0) return;
    setDockWidth((current) => (current === width ? current : width));
  }, []);
  const titlebarStyle = useMemo<CSSProperties>(
    () => ({
      width: dockWidth,
      alignSelf: "stretch",
      flexShrink: 0,
      order: 1,
      position: "relative",
    }),
    [dockWidth],
  );
  const showTitlebarPortal =
    usesTitlebar && isWorkspaceFocused && isRetainedPanelActive && !pane.hidden && dockWidth > 0;
  const paneState = useMemo(() => deriveWorkspacePaneState({ pane, tabs: uiTabs }), [pane, uiTabs]);
  const tabs = useMemo(() => paneState.tabs.map((tab) => tab.descriptor), [paneState.tabs]);
  const activeTabId = paneState.activeTabId;
  const tabItems = useMemo<WorkspaceDesktopTabRowItem[]>(
    () =>
      tabs.map((tab) => ({
        tab,
        isActive: tab.tabId === activeTabId,
        isCloseHovered: false,
        isClosingTab: closingTabIds.has(tab.tabId),
      })),
    [activeTabId, closingTabIds, tabs],
  );
  const handleSelectTab = useCallback(
    (tabId: string) => onSelectTab(pane.id, tabId),
    [onSelectTab, pane.id],
  );
  const handleReorderTabs = useCallback(
    (nextTabs: WorkspaceTabDescriptor[]) => {
      onReorderTabsInPane(
        pane.id,
        nextTabs.map((tab) => tab.tabId),
      );
    },
    [onReorderTabsInPane, pane.id],
  );
  const tabRail = (
    <ExplorerSidebarTabRail
      paneId={pane.id}
      tabs={tabItems}
      normalizedServerId={normalizedServerId}
      normalizedWorkspaceId={normalizedWorkspaceId}
      activeDragTabId={activeDragTabId}
      tabDropPreviewIndex={
        tabDropPreview?.paneId === pane.id ? tabDropPreview.indicatorIndex : null
      }
      onNavigateTab={handleSelectTab}
      onCloseTab={onCloseTab}
      onCreateNewTab={onCreateNewTab}
      onMoveTabToMain={onMoveTabToMain}
      onReorderTabs={handleReorderTabs}
      trailingAccessory={headerAction}
      inTitlebar={usesTitlebar}
    />
  );

  return (
    <RetainedPanel active>
      <WindowChromeRegion corners="top-right">
        <View
          style={styles.dock}
          testID="workspace-explorer-sidebar"
          onLayout={usesTitlebar ? handleDockLayout : undefined}
        >
          {showTitlebarPortal ? (
            <DesktopWorkspaceToolbar>
              <div style={titlebarStyle} data-testid="desktop-explorer-toolbar">
                {tabRail}
              </div>
            </DesktopWorkspaceToolbar>
          ) : null}
          {usesTitlebar ? null : (
            <WindowChromeSafeArea placement="inline" style={styles.tabRail}>
              <TitlebarDragRegion />
              {tabRail}
              <View pointerEvents="none" style={styles.tabRailDivider} />
            </WindowChromeSafeArea>
          )}
          <View style={styles.content}>
            <WorkspacePanelHost
              paneId={pane.id}
              tabs={tabs}
              activeTabId={activeTabId}
              normalizedServerId={normalizedServerId}
              normalizedWorkspaceId={normalizedWorkspaceId}
              isWorkspaceFocused={isWorkspaceFocused}
              isPaneFocused
              buildPaneContentModel={buildPaneContentModel}
            />
          </View>
        </View>
      </WindowChromeRegion>
    </RetainedPanel>
  );
}

const styles = StyleSheet.create((theme) => ({
  dock: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  tabRail: {
    position: "relative",
    flexShrink: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  tabRailDivider: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: theme.borderWidth[1],
    backgroundColor: theme.colors.border,
  },
  content: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
}));
