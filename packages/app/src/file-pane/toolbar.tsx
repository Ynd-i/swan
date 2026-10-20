import { Fragment, useCallback, useRef, useState } from "react";
import { ScrollView, Text, View, type LayoutChangeEvent } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspaceOpenInEditorButton } from "@/workspace/open-in-editor/button";
import { resolveWorkspaceFilePaths, type WorkspaceFileLocation } from "@/workspace/file-open";
import { FileTreeToggle } from "./tree-toggle";
import type { Theme } from "@/styles/theme";

const ThemedChevron = withUnistyles(ChevronRight);
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/** macOS file tools share one path/action row above the editor and its tree. */
export function FileToolToolbar({
  serverId,
  workspaceRoot,
  location,
}: {
  serverId: string;
  workspaceRoot: string;
  location?: WorkspaceFileLocation;
}) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const paths = location ? resolveWorkspaceFilePaths({ path: location.path, workspaceRoot }) : null;
  const absolutePath = paths?.absolutePath ?? location?.path ?? workspaceRoot;
  const relativePath = paths?.relativePath;
  const rootName = workspaceRoot.replace(/\\/g, "/").split("/").findLast(Boolean) ?? workspaceRoot;
  let segments = [rootName];
  if (location) {
    segments = relativePath
      ? [rootName, ...relativePath.split("/")]
      : absolutePath.replace(/\\/g, "/").split("/").filter(Boolean);
  }
  const copyPath = useCallback(async () => {
    await Clipboard.setStringAsync(absolutePath);
  }, [absolutePath]);
  const copyRelative = useCallback(async () => {
    if (relativePath) await Clipboard.setStringAsync(relativePath);
  }, [relativePath]);
  const measure = useCallback((event: LayoutChangeEvent) => {
    if (event.nativeEvent.layout.width > 0) setWidth(event.nativeEvent.layout.width);
  }, []);
  const revealNearestDirectory = useCallback(
    () => scroll.current?.scrollToEnd({ animated: false }),
    [],
  );
  return (
    <View style={styles.toolbar} onLayout={measure} testID="file-tool-toolbar">
      <View style={styles.pathSlot}>
        <DropdownMenu>
          <DropdownMenuTrigger
            style={styles.path}
            accessibilityRole="button"
            accessibilityLabel={`${t("workspace.fileActions.moreActions")}: ${absolutePath}`}
            testID="file-path-menu-trigger"
          >
            {location ? (
              <ScrollView
                ref={scroll}
                horizontal
                showsHorizontalScrollIndicator={false}
                onContentSizeChange={revealNearestDirectory}
                onLayout={revealNearestDirectory}
                contentContainerStyle={styles.segments}
                style={styles.parents}
              >
                {segments.slice(0, -1).map((segment, index) => (
                  <Fragment key={segments.slice(0, index + 1).join("/")}>
                    <ThemedChevron size={14} uniProps={mutedColor} />
                    <Text style={styles.segment}>{segment}</Text>
                  </Fragment>
                ))}
              </ScrollView>
            ) : null}
            <ThemedChevron size={14} uniProps={mutedColor} />
            <Text style={[styles.segment, styles.filename]} numberOfLines={1} ellipsizeMode="head">
              {segments.at(-1)}
            </Text>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={copyPath} testID="file-path-copy-absolute">
              {t("workspace.fileActions.copyPath")}
            </DropdownMenuItem>
            {relativePath ? (
              <DropdownMenuItem onSelect={copyRelative} testID="file-path-copy-relative">
                {t("workspace.fileActions.copyRelativePath")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
      <FileTreeToggle />
      {location ? (
        <WorkspaceOpenInEditorButton
          serverId={serverId}
          cwd={workspaceRoot}
          activeFile={location}
          hideLabels={width > 0 && width < 400}
          fileToolbar
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  toolbar: {
    height: 48,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    backgroundColor: theme.colors.surface0,
  },
  pathSlot: { flex: 1, minWidth: 0 },
  path: {
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: 8,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  segments: { alignItems: "center", gap: 6 },
  parents: { flex: 1, minWidth: 0 },
  segment: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  filename: { color: theme.colors.foreground, fontWeight: theme.fontWeight.medium, flexShrink: 1 },
}));
