import { useCallback, useMemo, type ComponentType } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { ChevronDown, Globe, LayoutGrid } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Shortcut } from "@/components/ui/shortcut";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import type { PanelIconProps } from "@/panels/panel-registry";
import { WorkspaceNewTabMenuContent } from "@/screens/workspace/workspace-new-tab-menu";
import { collectAllTabs, useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import type { Theme } from "@/styles/theme";
import {
  useWorkspaceTabLaunchCatalog,
  type WorkspaceTabLaunchItem,
} from "@/workspace-tabs/launcher";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { useBrowserStore, type BrowserRecord } from "../store";

const EMPTY_PANE_PANEL_KINDS: readonly [] = [];

function IconGlyph({
  Icon,
  size = 16,
  color = "",
}: {
  Icon: ComponentType<PanelIconProps>;
  size?: number;
  color?: string;
}) {
  return <Icon size={size} color={color} />;
}
const ThemedIcon = withUnistyles(IconGlyph);
const iconColors = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
function toolStyle({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.tool, (pressed || hovered) && styles.toolHovered];
}
function ToolShortcut({ actionId }: { actionId: string }) {
  const keys = useShortcutKeys(actionId);
  return keys ? <Shortcut chord={keys} /> : null;
}
function ToolCard({ item, label }: { item: WorkspaceTabLaunchItem; label?: string }) {
  const launch = useCallback(() => item.launch({ kind: "open" }), [item]);
  return (
    <Pressable
      testID={`browser-new-tab-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={label ?? item.label}
      disabled={item.disabled}
      onPress={launch}
      style={toolStyle}
    >
      <ThemedIcon Icon={item.Icon ?? Globe} uniProps={iconColors} />
      <Text numberOfLines={1} style={styles.toolLabel}>
        {label ?? item.label}
      </Text>
      {item.shortcutActionId ? <ToolShortcut actionId={item.shortcutActionId} /> : null}
    </Pressable>
  );
}
function OpenPage({
  browser,
  onNavigate,
}: {
  browser: BrowserRecord;
  onNavigate: (url: string) => void;
}) {
  const favicon = useMemo(
    () => (browser.faviconUrl ? { uri: browser.faviconUrl } : undefined),
    [browser.faviconUrl],
  );
  const navigate = useCallback(() => onNavigate(browser.url), [browser.url, onNavigate]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={browser.title}
      onPress={navigate}
      style={styles.openPage}
      testID={`browser-new-tab-open-${browser.browserId}`}
    >
      {favicon ? (
        <Image source={favicon} style={styles.favicon} accessibilityIgnoresInvertColors />
      ) : (
        <ThemedIcon Icon={Globe} size={32} uniProps={iconColors} />
      )}
      <Text numberOfLines={1} style={styles.pageLabel}>
        {browser.title}
      </Text>
    </Pressable>
  );
}

export function BrowserNewTabPage({
  serverId,
  workspaceId,
  browserId,
  onNavigate,
}: {
  serverId: string;
  workspaceId: string;
  browserId: string;
  onNavigate: (url: string) => void;
}) {
  const { t } = useTranslation();
  const groups = useWorkspaceTabLaunchCatalog({
    serverId,
    purpose: "supporting",
    host: "explorer",
    surface: "panel",
  });
  const items = groups.find((group) => group.id === "tabs")?.items ?? [];
  const key = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
  const layout = useWorkspaceLayoutStore((state) =>
    key ? state.layoutByWorkspace[key] : undefined,
  );
  const browsers = useBrowserStore((state) => state.browsersById);
  const openPages = useMemo(() => {
    if (!layout) return [];
    const openIds = new Set(
      collectAllTabs(layout.root).flatMap((tab) =>
        tab.target.kind === "browser" ? [tab.target.browserId] : [],
      ),
    );
    return Object.values(browsers).filter(
      (browser) =>
        openIds.has(browser.browserId) &&
        browser.browserId !== browserId &&
        /^https?:\/\//i.test(browser.url) &&
        browser.title.trim() &&
        !browser.lastError &&
        !browser.isLoading,
    );
  }, [browserId, browsers, layout]);
  const tools = ["diff", "terminal", "files"].flatMap((id) => {
    const item = items.find((candidate) => candidate.id === id);
    return item ? [item] : [];
  });
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      testID="browser-new-tab-page"
    >
      <Text style={styles.heading}>{t("workspace.browser.newTab.tools")}</Text>
      <View style={styles.tools}>
        {tools.map((item) => (
          <ToolCard
            key={item.id}
            item={item}
            label={item.id === "diff" ? t("message.attachments.review") : undefined}
          />
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger
            accessibilityRole="button"
            testID="browser-new-tab-more"
            accessibilityLabel={t("workspace.browser.newTab.moreTools")}
            style={toolStyle}
          >
            <ThemedIcon Icon={LayoutGrid} uniProps={iconColors} />
            <Text numberOfLines={1} style={styles.toolLabel}>
              {t("workspace.browser.newTab.moreTools")}
            </Text>
            <ThemedIcon Icon={ChevronDown} size={14} uniProps={iconColors} />
          </DropdownMenuTrigger>
          <WorkspaceNewTabMenuContent
            serverId={serverId}
            purpose="supporting"
            host="explorer"
            panePanelKinds={EMPTY_PANE_PANEL_KINDS}
          />
        </DropdownMenu>
      </View>
      {openPages.length > 0 ? (
        <View style={styles.openPagesSection} testID="browser-new-tab-open-pages">
          <Text style={styles.heading}>{t("workspace.browser.newTab.openPages")}</Text>
          <View style={styles.openPages}>
            {openPages.map((browser) => (
              <OpenPage key={browser.browserId} browser={browser} onNavigate={onNavigate} />
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  page: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.surfaceWorkspace },
  content: { paddingHorizontal: 20, paddingTop: 36, paddingBottom: 24 },
  heading: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    marginBottom: 16,
  },
  tools: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tool: {
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 120,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: theme.colors.surface1,
  },
  toolHovered: { backgroundColor: theme.colors.surface2 },
  toolLabel: { flex: 1, color: theme.colors.foreground, fontSize: theme.fontSize.base },
  openPagesSection: { marginTop: 42 },
  openPages: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  openPage: {
    flexBasis: "21%",
    minWidth: 100,
    flexGrow: 1,
    maxWidth: 150,
    alignItems: "center",
    paddingTop: 18,
    gap: 24,
  },
  favicon: { width: 32, height: 32, borderRadius: 4 },
  pageLabel: { color: theme.colors.foreground, fontSize: theme.fontSize.base, maxWidth: "100%" },
}));
