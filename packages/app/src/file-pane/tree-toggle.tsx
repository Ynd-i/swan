import { Folders } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { extraMutedIconColorMapping } from "@/components/ui/icon-button-chrome";
import { useCallback } from "react";
import { useIsCompactFormFactor } from "@/constants/layout";
import { getIsElectronMac } from "@/constants/platform";
import { defaultFileState, fileStateForFilesView, fileStateSchema } from "@/panels/file/state";
import { usePaneContext } from "@/panels/pane-context";
import { usePanelState } from "@/panels/use-panel-state";

const ThemedFolders = withUnistyles(Folders);

export function FileTreeToggle() {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const isMac = getIsElectronMac();
  // Matches the hosting panel's default: the Files view starts with its tree, a file without it.
  const { target } = usePaneContext();
  const [fileState, setFileState] = usePanelState(
    fileStateSchema,
    target.kind === "files" ? fileStateForFilesView : defaultFileState,
  );
  const visible = fileState.treeVisible;
  const toggle = useCallback(
    () => setFileState({ ...fileState, treeVisible: !visible }),
    [fileState, setFileState, visible],
  );
  // Compact layouts reach the tree through the explorer panel; there is no rail
  // beside the file to open or close.
  if (!isMac || isCompact) {
    return null;
  }
  return (
    <ToolbarButton
      label={t(visible ? "workspace.tree.hideFolderTree" : "workspace.tree.showFolderTree")}
      selected={visible}
      aria-expanded={visible}
      testID="file-toggle-tree"
      onPress={toggle}
      style={styles.toggle}
    >
      <ThemedFolders size={16} uniProps={extraMutedIconColorMapping} />
    </ToolbarButton>
  );
}

const styles = StyleSheet.create((theme) => ({
  toggle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
  },
}));
