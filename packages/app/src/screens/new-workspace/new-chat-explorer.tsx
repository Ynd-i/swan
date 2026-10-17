import { useCallback, useMemo } from "react";
import { ScrollView, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { useIsFocused } from "@react-navigation/native";
import { usePathname } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { DesktopWorkspaceToolbar } from "@/components/desktop/desktop-shell";
import { resolveExplorerSidebarWidth } from "@/components/explorer-sidebar-layout";
import { useAnimatedDock } from "@/components/use-animated-dock";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type { KeyboardActionDefinition } from "@/keyboard/keyboard-action-dispatcher";
import { NewTabLauncherGroups } from "@/panels/new-tab-panel";
import { WorkspaceExplorerToggle } from "@/screens/workspace/workspace-explorer-toggle";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import type { ShortcutKey } from "@/utils/format-shortcut";
import {
  NewTabLauncherProvider,
  useWorkspaceTabLaunchCatalog,
  type NewTabLauncher,
  type WorkspaceTabLaunchItem,
} from "@/workspace-tabs/launcher";
import { buildWorkspaceTabPersistenceKey, type WorkspaceTabTarget } from "@/workspace-tabs/model";

const EXPLORER_TOGGLE_KEYS: ShortcutKey[] = ["mod", "E"];
const TOGGLE_ACTIONS = ["sidebar.toggle.right"] as const;

function toggleNewChatExplorer() {
  const store = useWorkspaceLayoutStore.getState();
  store.setNewChatExplorerOpen(!store.newChatExplorerOpen);
}

/**
 * The workspace created from the new chat screen opens with the Explorer the user toggled there,
 * or on the tool they picked from its dock.
 */
export function revealNewChatExplorer(
  serverId: string,
  workspaceId: string,
  tool?: WorkspaceTabTarget,
) {
  const store = useWorkspaceLayoutStore.getState();
  const workspaceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
  if (!workspaceKey) return;
  if (tool) {
    const paneId = store.showExplorerSidebar(workspaceKey);
    store.openTab({
      workspaceKey,
      target: tool,
      intent: "reveal",
      placement: paneId ? { mode: "pane", paneId } : undefined,
    });
    return;
  }
  if (store.newChatExplorerOpen) store.showExplorerSidebar(workspaceKey);
}

function launchFromDock(item: WorkspaceTabLaunchItem) {
  item.launch({ kind: "open" });
}

function NewChatExplorerLauncher({ serverId }: { serverId: string }) {
  const groups = useWorkspaceTabLaunchCatalog({
    serverId,
    purpose: "supporting",
    host: "explorer",
    surface: "panel",
  });
  // This screen is already a new chat, so the launcher keeps only the tools.
  const toolGroups = useMemo(
    () =>
      groups.flatMap((group) => {
        const items = group.items.filter((item) => item.panelKind !== "draft");
        return items.length > 0 ? [{ ...group, items }] : [];
      }),
    [groups],
  );
  return <NewTabLauncherGroups groups={toolGroups} onLaunch={launchFromDock} />;
}

/**
 * The new chat screen has no workspace yet. Its dock keeps the titlebar toggle and Cmd+E and shows
 * the Explorer launcher, whose tools create the workspace without sending the draft.
 */
export function NewChatExplorerDock({
  serverId,
  launcher,
}: {
  serverId: string;
  launcher: NewTabLauncher;
}) {
  const { t } = useTranslation();
  const open = useWorkspaceLayoutStore((state) => state.newChatExplorerOpen);
  // Every "New chat" click can leave an older /new screen mounted; only the focused one owns the titlebar.
  const isFocused = useIsFocused();
  const onNewRoute = usePathname() === "/new";
  const routeFocused = isFocused && onNewRoute;
  const { width: windowWidth } = useWindowDimensions();
  const width = resolveExplorerSidebarWidth({ containerWidth: windowWidth });
  const dock = useAnimatedDock(open, width);
  const dockStyle = useMemo(() => [styles.dock, dock.style], [dock.style]);
  const contentStyle = useMemo(() => ({ width }), [width]);
  const accessibilityState = useMemo(() => ({ expanded: open }), [open]);
  const handleAction = useCallback((action: KeyboardActionDefinition) => {
    if (action.id !== "sidebar.toggle.right") return false;
    toggleNewChatExplorer();
    return true;
  }, []);

  useKeyboardActionHandler({
    handlerId: "new-chat-explorer",
    actions: TOGGLE_ACTIONS,
    enabled: routeFocused,
    priority: 100,
    handle: handleAction,
  });

  return (
    <>
      {routeFocused ? (
        <DesktopWorkspaceToolbar>
          <WorkspaceExplorerToggle
            onPress={toggleNewChatExplorer}
            label={
              open
                ? t("workspace.tabs.explorerSidebar.close")
                : t("workspace.tabs.explorerSidebar.open")
            }
            tooltipLabel={t("workspace.tabs.explorerSidebar.toggle")}
            tooltipKeys={EXPLORER_TOGGLE_KEYS}
            accessibilityState={accessibilityState}
            mobile={false}
          />
        </DesktopWorkspaceToolbar>
      ) : null}
      {dock.rendered ? (
        <Animated.View style={dockStyle} pointerEvents={open ? "auto" : "none"}>
          <ScrollView style={contentStyle} contentContainerStyle={styles.content}>
            <NewTabLauncherProvider value={launcher}>
              <NewChatExplorerLauncher serverId={serverId} />
            </NewTabLauncherProvider>
          </ScrollView>
        </Animated.View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  dock: {
    flexShrink: 0,
    overflow: "hidden",
    borderLeftWidth: theme.borderWidth[1],
    borderLeftColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  content: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
  },
}));
