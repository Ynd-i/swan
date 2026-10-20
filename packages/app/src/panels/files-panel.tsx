import { Text, View, type LayoutChangeEvent } from "react-native";
import { Files, Folders } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import invariant from "tiny-invariant";
import { FileExplorerPane } from "@/components/file-explorer-pane";
import { usePaneContext } from "@/panels/pane-context";
import { definePanel, type PanelPresentation } from "@/panels/panel-registry";
import { useAddFileToChat } from "@/panels/use-add-file-to-chat";
import { TreeRail } from "@/components/tree-rail";
import { FileToolToolbar } from "@/file-pane/toolbar";
import { getIsElectronMac } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import { fileStateForFilesView, fileStateSchema } from "@/panels/file/state";
import { usePanelState } from "@/panels/use-panel-state";
import type { Theme } from "@/styles/theme";
import { useWorkspaceDirectory } from "@/stores/session-store-hooks";

const ThemedFiles = withUnistyles(Files);
const ThemedFolders = withUnistyles(Folders);
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const filesPanelPresentation = {
  label: (t) => t("panels.files.label"),
  subtitle: (t) => t("panels.files.subtitle"),
  tooltip: (t) => t("panels.files.tooltip"),
  icon: ThemedFiles,
} satisfies PanelPresentation;

function FilesPanel() {
  const { t } = useTranslation();
  const { serverId, workspaceId, target, openPreferredTarget, openTargetToSide } = usePaneContext();
  const workspaceRoot = useWorkspaceDirectory(serverId, workspaceId);
  const isCompact = useIsCompactFormFactor();
  const isMac = getIsElectronMac();
  const [width, setWidth] = useState(0);
  const measure = useCallback((event: LayoutChangeEvent) => {
    if (event.nativeEvent.layout.width > 0) setWidth(event.nativeEvent.layout.width);
  }, []);
  const [fileState, setFileState] = usePanelState(fileStateSchema, fileStateForFilesView);
  const onTreeWidthChange = useCallback(
    (treeWidth: number) => setFileState({ ...fileState, treeWidth }),
    [fileState, setFileState],
  );
  const onFilterChange = useCallback(
    (treeFilter: string) => setFileState({ ...fileState, treeFilter }),
    [fileState, setFileState],
  );
  const { addFile, canAddToChat } = useAddFileToChat({ serverId, workspaceId });
  invariant(target.kind === "files", "FilesPanel requires files target");
  const onOpenFile = useCallback(
    (path: string) => openPreferredTarget({ kind: "file", path }, "explorerFiles"),
    [openPreferredTarget],
  );
  const onOpenFileToSide = useCallback(
    (path: string) => openTargetToSide?.({ kind: "file", path }),
    [openTargetToSide],
  );
  if (!workspaceRoot) {
    return (
      <View style={styles.centerState}>
        <Text>{t("panels.file.directoryMissing")}</Text>
      </View>
    );
  }
  const explorer = (
    <FileExplorerPane
      serverId={serverId}
      workspaceId={workspaceId}
      workspaceRoot={workspaceRoot}
      filter={isMac ? (fileState.treeFilter ?? "") : undefined}
      onFilterChange={isMac ? onFilterChange : undefined}
      onOpenFile={onOpenFile}
      onOpenFileToSide={openTargetToSide ? onOpenFileToSide : undefined}
      onAddToChat={canAddToChat ? addFile : undefined}
    />
  );
  // A compact picker needs its full width for the tree, as before.
  if (!isMac || isCompact) return explorer;
  // Below the existing 240px content + 180px tree minimums, prioritize the file picker.
  const treeOnly = width < 420 && fileState.treeVisible;
  return (
    <View style={styles.container} onLayout={measure}>
      <FileToolToolbar serverId={serverId} workspaceRoot={workspaceRoot} />
      {treeOnly ? (
        explorer
      ) : (
        <TreeRail
          testID="file-tree-rail"
          visible={fileState.treeVisible}
          width={fileState.treeWidth ?? 256}
          onWidthChange={onTreeWidthChange}
        >
          <View style={styles.emptyEditor} testID="files-empty-editor">
            <ThemedFolders size={32} uniProps={mutedColor} />
            <Text style={styles.emptyTitle}>{t("workspace.fileActions.openFile")}</Text>
            <Text style={styles.emptyDescription} numberOfLines={3}>
              {t("panels.files.emptyDescription")}
            </Text>
          </View>
          {explorer}
        </TreeRail>
      )}
    </View>
  );
}

export const filesPanelRegistration = definePanel("files", {
  component: FilesPanel,
  presentation: filesPanelPresentation,
});

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, minHeight: 0 },
  emptyEditor: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    gap: 16,
    backgroundColor: theme.colors.surface0,
  },
  emptyTitle: { color: theme.colors.foreground, fontSize: theme.fontSize.lg, textAlign: "center" },
  emptyDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
    maxWidth: 280,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
  },
}));
