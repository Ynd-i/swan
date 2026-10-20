import { useTranslation } from "react-i18next";
import { Folders, FolderTree } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { getIsElectronMac } from "@/constants/platform";
import { paneContentToolbarIconSize, ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { extraMutedIconColorMapping } from "@/components/ui/icon-button-chrome";

const ThemedFolderTree = withUnistyles(FolderTree);
const ThemedFolders = withUnistyles(Folders);
/**
 * Opens and closes a `TreeRail`. Every panel that owns a tree rail uses this one
 * button so the affordance reads the same wherever the rail appears; only the
 * flag it drives is per-panel.
 */
export function TreeRailToggle({
  visible,
  testID,
  onToggle,
}: {
  visible: boolean;
  testID: string;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const mac = getIsElectronMac();
  const Icon = mac ? ThemedFolders : ThemedFolderTree;
  const label = t(visible ? "workspace.tree.hideFolderTree" : "workspace.tree.showFolderTree");
  return (
    <ToolbarButton
      label={label}
      selected={visible}
      aria-selected={visible}
      aria-expanded={visible}
      testID={testID}
      onPress={onToggle}
      style={mac ? styles.macToggle : undefined}
    >
      <Icon
        size={mac ? 16 : paneContentToolbarIconSize(false)}
        uniProps={extraMutedIconColorMapping}
      />
    </ToolbarButton>
  );
}

const styles = StyleSheet.create((theme) => ({
  macToggle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
  },
}));
