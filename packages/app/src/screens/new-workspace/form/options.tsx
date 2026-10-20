import { useMemo, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { ComboboxItem, type ComboboxOption } from "@/components/ui/combobox";
import { Shortcut } from "@/components/ui/shortcut";
import { getIsElectronMac } from "@/constants/platform";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { getHostProjectSourceDirectory, type HostProjectListItem } from "@/projects/host-projects";
import { pickerItemLabel, type PickerItem } from "../../new-workspace-picker-item";
import { addProjectIcon, branchIcon, folderIcon, ProjectIcon, pullRequestIcon } from "./icons";

interface OptionRowState {
  option: ComboboxOption;
  selected: boolean;
  active: boolean;
  onPress: () => void;
}

function IconBox({ children }: { children: ReactElement }): ReactElement {
  return <View style={styles.iconBox}>{children}</View>;
}

const localLeading = <IconBox>{folderIcon}</IconBox>;

export function ProjectOption({
  option,
  selected,
  active,
  onPress,
  project,
  iconDataUri,
  selectedServerId,
  disabled,
}: OptionRowState & {
  project: HostProjectListItem | undefined;
  iconDataUri: string | null;
  selectedServerId: string;
  disabled: boolean;
}): ReactElement {
  // Like Codex, the Mac desktop shows a project's favicon or a folder, and only its name.
  const desktopChat = getIsElectronMac();
  const leadingSlot = useMemo(() => {
    if (!project) return undefined;
    if (desktopChat && !iconDataUri) return localLeading;
    return (
      <IconBox>
        <ProjectIcon
          projectViewKey={project.viewKey}
          projectName={project.projectName}
          iconDataUri={iconDataUri}
        />
      </IconBox>
    );
  }, [desktopChat, iconDataUri, project]);
  if (!project) return <View key={option.id} />;
  return (
    <ComboboxItem
      testID={`new-workspace-project-picker-option-${project.viewKey}`}
      label={project.projectName}
      description={
        desktopChat
          ? undefined
          : (getHostProjectSourceDirectory(project, selectedServerId) ?? project.iconWorkingDir)
      }
      selected={selected}
      active={active}
      disabled={disabled}
      onPress={onPress}
      leadingSlot={leadingSlot}
    />
  );
}

export function AddProjectOption({ onPress }: { onPress: () => void }): ReactElement {
  const { t } = useTranslation();
  const openProjectKeys = useShortcutKeys("new-agent");
  const shortcut = useMemo(
    () => (openProjectKeys ? <Shortcut chord={openProjectKeys} /> : null),
    [openProjectKeys],
  );
  return (
    <ComboboxItem
      testID="new-workspace-project-picker-add-project"
      label={t("sidebar.actions.addProject")}
      onPress={onPress}
      leadingSlot={addProjectIcon}
      trailingSlot={shortcut}
    />
  );
}

const worktreeLeading = <IconBox>{branchIcon}</IconBox>;

export function IsolationOption({
  option,
  selected,
  active,
  onPress,
  disabled,
}: OptionRowState & { disabled: boolean }): ReactElement {
  return (
    <ComboboxItem
      testID={`workspace-create-isolation-${option.id}`}
      label={option.label}
      selected={selected}
      active={active}
      disabled={disabled}
      onPress={onPress}
      leadingSlot={option.id === "worktree" ? worktreeLeading : localLeading}
    />
  );
}

const branchLeading = <IconBox>{branchIcon}</IconBox>;
const pullRequestLeading = <IconBox>{pullRequestIcon}</IconBox>;

/** A branch of the project checkout itself, which Local isolation switches in place. */
export function LocalBranchOption({
  option,
  selected,
  active,
  onPress,
  disabled,
}: OptionRowState & { disabled: boolean }): ReactElement {
  return (
    <ComboboxItem
      testID={`new-workspace-local-branch-${option.id}`}
      label={option.label}
      selected={selected}
      active={active}
      disabled={disabled}
      onPress={onPress}
      leadingSlot={branchLeading}
    />
  );
}

export function RefOption({
  option,
  selected,
  active,
  onPress,
  item,
  disabled,
}: OptionRowState & { item: PickerItem | undefined; disabled: boolean }): ReactElement {
  const { t } = useTranslation();
  const divergenceLabel = item?.kind === "branch" ? item.divergenceLabel : undefined;
  const trailingSlot = useMemo(
    () =>
      divergenceLabel ? <Text style={styles.divergenceLabel}>{divergenceLabel}</Text> : undefined,
    [divergenceLabel],
  );
  if (!item) return <View key={option.id} />;

  const isBranch = item.kind === "branch";
  return (
    <ComboboxItem
      testID={
        isBranch
          ? `new-workspace-ref-picker-branch-${item.name}`
          : `new-workspace-ref-picker-pr-${item.item.number}`
      }
      label={pickerItemLabel(item)}
      description={
        !isBranch && item.item.baseRefName
          ? t("newWorkspace.refPicker.intoBase", { baseRef: item.item.baseRefName })
          : undefined
      }
      selected={selected}
      active={active}
      disabled={disabled}
      onPress={onPress}
      leadingSlot={isBranch ? branchLeading : pullRequestLeading}
      trailingSlot={trailingSlot}
      accessibilityLabel={isBranch ? item.accessibilityLabel : undefined}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  iconBox: {
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    alignItems: "center",
    justifyContent: "center",
  },
  divergenceLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    fontVariant: ["tabular-nums"],
  },
}));
