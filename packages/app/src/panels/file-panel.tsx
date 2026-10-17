import { Text, View } from "react-native";
import { useCallback, useMemo } from "react";
import invariant from "tiny-invariant";
import { useTranslation } from "react-i18next";
import { FilePane } from "@/file-pane/pane";
import { FileToolToolbar } from "@/file-pane/toolbar";
import { usePaneContext } from "@/panels/pane-context";
import { definePanel } from "@/panels/panel-registry";
import { useWorkspaceDirectory } from "@/stores/session-store-hooks";
import { createMaterialFileIcon } from "@/components/material-file-icon";
import { FileExplorerPane } from "@/components/file-explorer-pane";
import { TreeRail } from "@/components/tree-rail";
import { useIsCompactFormFactor } from "@/constants/layout";
import { getIsElectronMac } from "@/constants/platform";
import { defaultFileState, fileStateSchema } from "@/panels/file/state";
import { useAddFileToChat } from "@/panels/use-add-file-to-chat";
import { usePanelState } from "@/panels/use-panel-state";

const FILE_PANEL_STYLE = { flex: 1 } as const;
const CENTERED_PADDED_STYLE = {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
} as const;

function useFilePanelDescriptor(target: { kind: "file"; path: string }) {
  const fileName = target.path.split("/").findLast(Boolean) ?? target.path;
  const icon = useMemo(() => createMaterialFileIcon(fileName), [fileName]);
  return {
    label: fileName,
    subtitle: target.path,
    tooltip: target.path,
    titleState: "ready" as const,
    icon,
    statusBucket: null,
  };
}

function FilePanel() {
  const { t } = useTranslation();
  const {
    serverId,
    workspaceId,
    target,
    fileNavigationRevision,
    openPreferredTarget,
    openTargetToSide,
  } = usePaneContext();
  const workspaceDirectory = useWorkspaceDirectory(serverId, workspaceId);
  const isMac = getIsElectronMac();
  const isCompact = useIsCompactFormFactor();
  // An opened file shows only itself; the folder tree is one toggle away.
  const [fileState, setFileState] = usePanelState(fileStateSchema, defaultFileState);
  const { addFile, canAddToChat } = useAddFileToChat({ serverId, workspaceId });
  const onOpenFile = useCallback(
    (path: string) => openPreferredTarget({ kind: "file", path }, "explorerFiles"),
    [openPreferredTarget],
  );
  const onOpenFileToSide = useCallback(
    (path: string) => openTargetToSide?.({ kind: "file", path }),
    [openTargetToSide],
  );
  const onTreeWidthChange = useCallback(
    (treeWidth: number) => setFileState({ ...fileState, treeWidth }),
    [fileState, setFileState],
  );
  const onFilterChange = useCallback(
    (treeFilter: string) => setFileState({ ...fileState, treeFilter }),
    [fileState, setFileState],
  );
  const treeVisible = !isCompact && fileState.treeVisible;
  invariant(target.kind === "file", "FilePanel requires file target");
  if (!workspaceDirectory) {
    return (
      <View style={CENTERED_PADDED_STYLE}>
        <Text>{t("panels.file.directoryMissing")}</Text>
      </View>
    );
  }
  const filePane = (
    <FilePane
      serverId={serverId}
      workspaceRoot={workspaceDirectory}
      location={target}
      navigationRevision={fileNavigationRevision ?? 0}
    />
  );
  if (!isMac) return filePane;
  return (
    <View style={FILE_PANEL_STYLE}>
      <FileToolToolbar serverId={serverId} workspaceRoot={workspaceDirectory} location={target} />
      <TreeRail
        testID="file-tree-rail"
        visible={treeVisible}
        width={fileState.treeWidth ?? 256}
        onWidthChange={onTreeWidthChange}
      >
        {filePane}
        <FileExplorerPane
          serverId={serverId}
          workspaceId={workspaceId}
          workspaceRoot={workspaceDirectory}
          filter={fileState.treeFilter ?? ""}
          onFilterChange={onFilterChange}
          onOpenFile={onOpenFile}
          onOpenFileToSide={openTargetToSide ? onOpenFileToSide : undefined}
          onAddToChat={canAddToChat ? addFile : undefined}
        />
      </TreeRail>
    </View>
  );
}

export const filePanelRegistration = definePanel("file", {
  component: FilePanel,
  useDescriptor: useFilePanelDescriptor,
});
