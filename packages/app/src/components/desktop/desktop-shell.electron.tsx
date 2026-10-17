import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { router, usePathname } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CircleGauge,
  Folder,
  History,
  House,
  Server,
  Settings,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, useWindowDimensions, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { WindowSidebarMenuToggle } from "@/components/headers/menu-header";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { SidebarHelpMenu } from "@/components/sidebar/sidebar-help-menu";
import { HostPicker } from "@/components/hosts/host-picker";
import { openHostOverview } from "@/navigation/settings-navigation";
import { useHosts } from "@/runtime/host-runtime";
import { UsageRailPopover } from "@/usage";
import { getIsElectronMac } from "@/constants/platform";
import { SETTINGS_DESKTOP_SPLIT_MIN_WIDTH, useIsCompactFormFactor } from "@/constants/layout";
import {
  WindowChromeRegion,
  WindowChromeSafeArea,
  useHasWindowChromeObstruction,
} from "@/utils/desktop-window";
import { resolveDesktopSidebarWidth } from "@/components/desktop-sidebar-layout";
import { usePanelStore } from "@/stores/panel-store";
import { useSessionStore } from "@/stores/session-store";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useWorkspaceFields } from "@/stores/session-store-hooks";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { TitlebarDragRegion } from "./titlebar-drag-region";
import type { Theme } from "@/styles/theme";
import { isChatFolderPath } from "@/projects/chat-folder";
import { DesktopChatShortcuts } from "./desktop-chat-shortcuts";
import { DesktopChatToolbar } from "./desktop-chat-toolbar";
import { useDesktopNavigationHistory } from "./use-desktop-navigation-history";
import {
  buildOpenProjectRoute,
  buildSchedulesRoute,
  buildSessionsRoute,
  buildSettingsAddHostRoute,
  buildSettingsRoute,
} from "@/utils/host-routes";

export const usesDesktopShell = getIsElectronMac();
export const desktopShellInset = usesDesktopShell ? 56 : 0;

function canShowNavigationRail(pathname: string, width: number): boolean {
  return (
    !pathname.startsWith("/settings") ||
    width >= SETTINGS_DESKTOP_SPLIT_MIN_WIDTH + desktopShellInset
  );
}

const BackIcon = withUnistyles(ArrowLeft);
const ForwardIcon = withUnistyles(ArrowRight);
const HomeIcon = withUnistyles(House);
const HistoryIcon = withUnistyles(History);
const SchedulesIcon = withUnistyles(CalendarClock);
const SettingsIcon = withUnistyles(Settings);
const ProjectIcon = withUnistyles(Folder);
const UsageIcon = withUnistyles(CircleGauge);
const HostsIcon = withUnistyles(Server);
const iconProps = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const railIconProps = (active: boolean) => (theme: Theme) => ({
  color: active ? theme.colors.foreground : theme.colors.foregroundMuted,
});
const devLabel = process.env.EXPO_PUBLIC_PASEO_DEV_BUILD_LABEL?.trim();

function openHome() {
  router.navigate(buildOpenProjectRoute());
}
function openHistory() {
  router.navigate(buildSessionsRoute());
}
function openSchedules() {
  router.navigate(buildSchedulesRoute());
}
function openSettings() {
  router.navigate(buildSettingsRoute());
}
function addHost() {
  router.push(buildSettingsAddHostRoute(Date.now()));
}

function RailButton({
  label,
  testID,
  onPress,
  active,
  children,
}: {
  label: string;
  testID: string;
  onPress: () => void;
  active: boolean;
  children: ReactNode;
}) {
  const style = useMemo(() => [styles.railButton, active && styles.railActive], [active]);
  return (
    <HeaderToggleButton
      onPress={onPress}
      tooltipLabel={label}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessible
      aria-current={active ? "page" : undefined}
      tooltipKeys={[]}
      tooltipSide="right"
      style={style}
      testID={testID}
    >
      {children}
    </HeaderToggleButton>
  );
}

function ChatTitle({ chatTitle }: { chatTitle: string }) {
  const selection = useActiveWorkspaceSelection();
  const serverId = selection?.serverId ?? null;
  const workspaceId = selection?.workspaceId ?? null;
  const workspaceTitle = useWorkspaceFields(serverId, workspaceId, (workspace) => workspace.name);
  // Like Codex, the folder marks a chat that belongs to a project, not one in a chat folder.
  const inProject = useWorkspaceFields(
    serverId,
    workspaceId,
    (workspace) =>
      workspace.projectId.trim() !== "" && !isChatFolderPath(workspace.projectRootPath),
  );
  const title = chatTitle || workspaceTitle;
  if (!title) return null;
  return (
    <View style={styles.titleRow}>
      {inProject ? (
        <View testID="desktop-chat-project-icon">
          <ProjectIcon size={16} uniProps={iconProps} />
        </View>
      ) : null}
      <Text style={styles.chatTitle} numberOfLines={1} testID="desktop-chat-title">
        {title}
      </Text>
    </View>
  );
}

// The rail owns the sidebar footer actions; their test IDs match the footer they replace.
function RailHostPicker() {
  const { t } = useTranslation();
  const hosts = useHosts();
  const anchorRef = useRef<View | null>(null);
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  return (
    <HostPicker
      hosts={hosts}
      value=""
      onSelect={openHostOverview}
      open={open}
      onOpenChange={setOpen}
      anchorRef={anchorRef}
      includeAddHost
      onAddHost={addHost}
      showActiveConnection
      onOpenHostSettings={openHostOverview}
      searchable
      desktopPlacement="top-start"
      desktopMinWidth={240}
      addHostTestID="sidebar-host-add"
      hostOptionTestID={hostOptionTestID}
    >
      <View ref={anchorRef} collapsable={false}>
        <RailButton
          onPress={show}
          label={t("sidebar.actions.hosts")}
          active={false}
          testID="sidebar-hosts-trigger"
        >
          <HostsIcon size={19} uniProps={railIconProps(false)} />
        </RailButton>
      </View>
    </HostPicker>
  );
}

function hostOptionTestID(serverId: string): string {
  return `sidebar-host-row-${serverId}`;
}

function DesktopNavigationRail({ pathname }: { pathname: string }) {
  const { t } = useTranslation();
  const renderUsageTrigger = useCallback(
    (onPress: () => void) => (
      <RailButton
        onPress={onPress}
        label={t("sidebar.footer.usage")}
        active={false}
        testID="sidebar-usage-icon"
      >
        <UsageIcon size={20} uniProps={railIconProps(false)} />
      </RailButton>
    ),
    [t],
  );
  const homeActive =
    !pathname.includes("/settings") &&
    !pathname.includes("/sessions") &&
    !pathname.includes("/schedules");
  const historyActive = pathname.includes("/sessions");
  const schedulesActive = pathname.includes("/schedules");
  const settingsActive = pathname.includes("/settings");
  return (
    <View style={styles.rail} testID="desktop-shell-rail">
      <RailButton onPress={openHome} label="Swan" active={homeActive} testID="desktop-shell-home">
        <HomeIcon size={20} uniProps={railIconProps(homeActive)} />
      </RailButton>
      <RailButton
        onPress={openHistory}
        label={t("sidebar.sections.sessions")}
        active={historyActive}
        testID="desktop-shell-history"
      >
        <HistoryIcon size={20} uniProps={railIconProps(historyActive)} />
      </RailButton>
      <RailButton
        onPress={openSchedules}
        label={t("sidebar.sections.schedules")}
        active={schedulesActive}
        testID="desktop-shell-schedules"
      >
        <SchedulesIcon size={20} uniProps={railIconProps(schedulesActive)} />
      </RailButton>
      <View style={styles.railSpacer} />
      <UsageRailPopover renderTrigger={renderUsageTrigger} />
      <RailHostPicker />
      <SidebarHelpMenu />
      <RailButton
        onPress={openSettings}
        label={t("sidebar.actions.settings")}
        active={settingsActive}
        testID="sidebar-settings"
      >
        <SettingsIcon size={20} uniProps={railIconProps(settingsActive)} />
      </RailButton>
    </View>
  );
}

const WorkspaceToolbarHostContext = createContext<HTMLDivElement | null>(null);
const workspaceToolbarHostStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  alignSelf: "stretch",
  position: "relative",
  flexShrink: 0,
  marginLeft: 8,
  // Match the body's 4px inset and 1px content border so tool headers align with their dock.
  marginRight: 5,
};

export function DesktopWorkspaceToolbar({ children }: { children: ReactNode }) {
  const host = useContext(WorkspaceToolbarHostContext);
  // A DOM portal retains the originating workspace's routing and panel contexts.
  return host ? createPortal(children, host) : null;
}

export function DesktopShell({
  children,
  chromeEnabled,
}: {
  children: ReactNode;
  chromeEnabled: boolean;
}) {
  const { t } = useTranslation();
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const navigation = useDesktopNavigationHistory();
  const sidebarWidth = usePanelStore((state) => state.sidebarWidth);
  const sidebarOpen = usePanelStore((state) => state.desktop.agentListOpen);
  const hasTrafficLights = useHasWindowChromeObstruction("top-left");
  const chatTitle = useSessionStore((state) => {
    if (!navigation.chat) return "";
    const session = state.sessions[navigation.chat.serverId];
    return (
      (
        session?.agents.get(navigation.chat.agentId) ??
        session?.agentDetails.get(navigation.chat.agentId)
      )?.title ?? ""
    );
  });
  const isCompact = useIsCompactFormFactor();
  const { width } = useWindowDimensions();
  const showRail = !isCompact && canShowNavigationRail(pathname, width);
  const controlsWidth =
    Math.max(
      190,
      sidebarOpen && chromeEnabled && !isCompact
        ? (showRail ? 51 : 1) +
            resolveDesktopSidebarWidth({
              requestedWidth: sidebarWidth,
              viewportWidth: width - desktopShellInset,
            })
        : 190,
    ) - (hasTrafficLights ? 78 : 0);

  if (!usesDesktopShell) return children;

  return (
    <WorkspaceToolbarHostContext.Provider value={toolbarHost}>
      <View style={styles.root} testID="desktop-shell">
        <DesktopChatShortcuts />
        <WindowChromeSafeArea placement="inline" style={styles.titlebar}>
          <TitlebarDragRegion />
          <View style={[styles.navigationControls, inlineUnistylesStyle({ width: controlsWidth })]}>
            <HeaderToggleButton
              onPress={navigation.back}
              disabled={!navigation.canGoBack}
              tooltipLabel={t("common.actions.back")}
              accessibilityLabel={t("common.actions.back")}
              accessibilityRole="button"
              accessible
              tooltipKeys={[]}
              tooltipSide="bottom"
              testID="desktop-shell-back"
              style={styles.navigationButton}
            >
              <BackIcon size={18} uniProps={iconProps} />
            </HeaderToggleButton>
            <HeaderToggleButton
              onPress={navigation.forward}
              disabled={!navigation.canGoForward}
              tooltipLabel={t("workspace.browser.controls.forward")}
              accessibilityLabel={t("workspace.browser.controls.forward")}
              accessibilityRole="button"
              accessible
              tooltipKeys={[]}
              tooltipSide="bottom"
              testID="desktop-shell-forward"
              style={styles.navigationButton}
            >
              <ForwardIcon size={18} uniProps={iconProps} />
            </HeaderToggleButton>
            {chromeEnabled && !isCompact ? (
              <WindowSidebarMenuToggle style={styles.navigationButton} tooltipSide="bottom" />
            ) : null}
          </View>
          <View style={styles.titleFill}>
            <ChatTitle chatTitle={chatTitle} />
          </View>
          {navigation.chat ? (
            <DesktopChatToolbar
              serverId={navigation.chat.serverId}
              agentId={navigation.chat.agentId}
            />
          ) : null}
          {devLabel ? (
            <Text style={styles.devLabel} testID="dev-build-label" numberOfLines={1}>
              {devLabel}
            </Text>
          ) : null}
          <div
            ref={setToolbarHost}
            data-testid="desktop-workspace-toolbar"
            style={workspaceToolbarHostStyle}
          />
        </WindowChromeSafeArea>
        <View style={styles.body}>
          {showRail ? <DesktopNavigationRail pathname={pathname} /> : null}
          <View style={styles.content} testID="desktop-shell-content">
            <WindowChromeRegion corners="none">{children}</WindowChromeRegion>
          </View>
        </View>
      </View>
    </WorkspaceToolbarHostContext.Provider>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.surface1 },
  titlebar: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
    gap: 0,
  },
  navigationControls: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 8,
    gap: 6,
    flexShrink: 0,
  },
  navigationButton: { width: 28, height: 28, marginLeft: 0 },
  titleFill: { flex: 1, minWidth: 0, justifyContent: "center", paddingRight: 12 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
    paddingLeft: 12,
  },
  chatTitle: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 24,
  },
  body: { flex: 1, flexDirection: "row", paddingRight: 4, paddingBottom: 4 },
  rail: { width: 50, alignItems: "center", paddingTop: 8, paddingBottom: 8, gap: 8 },
  railButton: { width: 36, height: 36, borderRadius: 10 },
  railActive: { backgroundColor: theme.colors.surface3 },
  railSpacer: { flex: 1 },
  content: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  devLabel: { maxWidth: 200, fontSize: 11, color: theme.colors.foregroundExtraMuted },
}));
