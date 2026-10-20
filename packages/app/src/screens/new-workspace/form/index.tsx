import {
  useCallback,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { TerminalProfile } from "@getpaseo/protocol/messages";
import { Combobox, type ComboboxOption, type ComboboxProps } from "@/components/ui/combobox";
import { HostStatusDot } from "@/components/host-status-dot";
import { HostPicker } from "@/components/hosts/host-picker";
import { getIsElectronMac } from "@/constants/platform";
import type { LaunchTarget } from "@/new-workspace-launch/target";
import type { HostProjectListItem } from "@/projects/host-projects";
import type { HostProfile } from "@/types/host-connection";
import type { PickerItem } from "../../new-workspace-picker-item";
import {
  FIELD_BADGE_HEIGHT,
  FIELD_HEIGHT,
  FieldTrigger,
  type FieldTriggerVariant,
} from "./field-trigger";
import { branchIcon, clearIcon, folderIcon, ProjectIcon, pullRequestIcon } from "./icons";
import { LaunchControl } from "./launch-control";
import {
  AddProjectOption,
  IsolationOption,
  LocalBranchOption,
  ProjectOption,
  RefOption,
} from "./options";

type Isolation = "local" | "worktree";
type RenderOption = NonNullable<ComboboxProps["renderOption"]>;

interface PickerControl {
  anchorRef: RefObject<View | null>;
  open: () => void;
  openState: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface NewWorkspaceFormProps {
  isCompact: boolean;
  isPending: boolean;
  project: PickerControl & {
    options: ComboboxOption[];
    projectByOptionId: Map<string, HostProjectListItem>;
    iconDataByProjectViewKey: Map<string, string | null>;
    selectedProject: HostProjectListItem | null;
    selectedOptionId: string;
    triggerLabel: string;
    selectedServerId: string;
    /** COMPAT(workspaceMultiplicity): without it only worktree-capable projects are selectable. */
    supportsWorkspaceMultiplicity: boolean;
    onSelect: (id: string) => void;
    onAddProject: () => void;
    /** No project chosen: the chat gets its own folder. */
    cleared: boolean;
    canClear: boolean;
    onClear: () => void;
  };
  host: PickerControl & {
    allHosts: HostProfile[];
    selectedServerId: string;
    onSelect: (id: string) => void;
    onAddHost: () => void;
  };
  isolation: PickerControl & {
    effectiveIsolation: Isolation;
    canCreateWorktree: boolean;
    onSelect: (isolation: Isolation) => void;
  };
  base: PickerControl & {
    selectedSourceDirectory: string | null;
    selectedItem: PickerItem | null;
    triggerLabel: string;
    options: ComboboxOption[];
    itemById: Map<string, PickerItem>;
    selectedOptionId: string;
    onSelect: (id: string) => void;
    setSearchQuery: (query: string) => void;
    emptyText: string;
    showRefPicker: boolean;
  };
  /** Local isolation: switches the project checkout's branch. Null when not on a branch. */
  localBranch:
    | (PickerControl & {
        currentBranch: string;
        /** The current branch, or the target branch while a switch is in flight. */
        triggerLabel: string;
        disabled: boolean;
        options: ComboboxOption[];
        onSelect: (id: string) => void;
      })
    | null;
  launch: {
    serverId: string;
    target: LaunchTarget;
    onChange: (target: LaunchTarget) => void;
    profiles: readonly TerminalProfile[];
    disabled: boolean;
  };
}

function hostOptionTestID(serverId: string): string {
  return `new-workspace-host-picker-option-${serverId}`;
}

function isProjectSelectable(
  project: HostProjectListItem,
  supportsWorkspaceMultiplicity: boolean,
): boolean {
  return (
    supportsWorkspaceMultiplicity ||
    project.hosts.some((host) => host.worktreeSupport !== "unsupported")
  );
}

function useProjectPicker(
  project: NewWorkspaceFormProps["project"],
  isPending: boolean,
): { renderOption: RenderOption; footer: ReactNode } {
  const { projectByOptionId, iconDataByProjectViewKey, selectedServerId } = project;
  const { supportsWorkspaceMultiplicity, onAddProject } = project;
  const renderOption = useCallback<RenderOption>(
    (row) => {
      const item = projectByOptionId.get(row.option.id);
      return (
        <ProjectOption
          {...row}
          project={item}
          iconDataUri={item ? (iconDataByProjectViewKey.get(item.viewKey) ?? null) : null}
          selectedServerId={selectedServerId}
          disabled={isPending || !item || !isProjectSelectable(item, supportsWorkspaceMultiplicity)}
        />
      );
    },
    [
      iconDataByProjectViewKey,
      isPending,
      projectByOptionId,
      selectedServerId,
      supportsWorkspaceMultiplicity,
    ],
  );
  const footer = useMemo(() => <AddProjectOption onPress={onAddProject} />, [onAddProject]);
  return { renderOption, footer };
}

function useIsolationPicker(
  isolation: NewWorkspaceFormProps["isolation"],
  isPending: boolean,
): { options: ComboboxOption[]; onSelect: (id: string) => void; renderOption: RenderOption } {
  const { t } = useTranslation();
  const { canCreateWorktree, onSelect, onOpenChange } = isolation;
  // "New worktree" is omitted entirely (not disabled) when the project isn't a
  // git checkout, since worktree isolation is impossible there.
  const options = useMemo<ComboboxOption[]>(() => {
    const local = { id: "local", label: t("newWorkspace.isolation.local") };
    if (!canCreateWorktree) return [local];
    return [local, { id: "worktree", label: t("newWorkspace.isolation.worktree") }];
  }, [canCreateWorktree, t]);
  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id === "worktree" ? "worktree" : "local");
      onOpenChange(false);
    },
    [onOpenChange, onSelect],
  );
  const renderOption = useCallback<RenderOption>(
    (row) => <IsolationOption {...row} disabled={isPending} />,
    [isPending],
  );
  return { options, onSelect: handleSelect, renderOption };
}

/** The Mac desktop clears the project from its badge on hover, so the chat gets its own folder. */
function ProjectField({
  project,
  isPending,
  variant,
  icon,
}: {
  project: NewWorkspaceFormProps["project"];
  isPending: boolean;
  variant: FieldTriggerVariant;
  icon: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  // Hover lives on the plain wrapper (docs/hover.md) so the clear button inside the badge keeps it.
  const [hovered, setHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setHovered(true), []);
  const handlePointerLeave = useCallback(() => setHovered(false), []);
  const { onClear } = project;
  const clearLabel = t("newWorkspace.fields.clearProject");
  const clearButton = useMemo(
    () => (
      <Pressable
        testID="new-workspace-project-clear"
        onPress={onClear}
        accessibilityRole="button"
        accessibilityLabel={clearLabel}
      >
        {clearIcon}
      </Pressable>
    ),
    [clearLabel, onClear],
  );
  // Chat folders are only hidden from the Mac desktop sidebar.
  const showClear =
    project.canClear &&
    getIsElectronMac() &&
    hovered &&
    !isPending &&
    project.selectedProject !== null;
  return (
    <View
      style={styles.projectField}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <FieldTrigger
        ref={project.anchorRef}
        variant={variant}
        label={t("newWorkspace.fields.project")}
        accessibilityLabel="Workspace project"
        tooltip={t("newWorkspace.tooltips.project")}
        icon={showClear ? clearButton : icon}
        value={project.cleared ? t("newWorkspace.fields.noProject") : project.triggerLabel}
        onPress={project.open}
        disabled={isPending}
        testID="new-workspace-project-picker-trigger"
      />
    </View>
  );
}

function useRefRenderOption(itemById: Map<string, PickerItem>, isPending: boolean): RenderOption {
  return useCallback<RenderOption>(
    (row) => <RefOption {...row} item={itemById.get(row.option.id)} disabled={isPending} />,
    [isPending, itemById],
  );
}

/**
 * The New workspace setup fields, one trigger per field, each opening its picker. Compact: a stack
 * of full-width fields with the label inside. Desktop: one meta row of badges. Either way, a field
 * that does not apply to the selected project is left out, and Host only shows with a second host.
 */
// oxlint-disable-next-line complexity -- upstream fields plus the Mac branch, placement and launch branches
export function useNewWorkspaceForm(props: NewWorkspaceFormProps): ReactElement {
  const { t } = useTranslation();
  const { isCompact, isPending, project, host, isolation, base, localBranch, launch } = props;
  const variant: FieldTriggerVariant = isCompact ? "field" : "badge";
  const macDesktop = getIsElectronMac();
  const desktopPlacement = macDesktop ? "top-start" : "bottom-start";
  const projectPicker = useProjectPicker(project, isPending);
  const isolationPicker = useIsolationPicker(isolation, isPending);
  const renderRefOption = useRefRenderOption(base.itemById, isPending);
  const renderLocalBranchOption = useCallback<RenderOption>(
    (row) => <LocalBranchOption {...row} disabled={isPending} />,
    [isPending],
  );

  const showHost = host.allHosts.length > 1;
  const selectedHostLabel =
    host.allHosts.find((h) => h.serverId === host.selectedServerId)?.label ?? "Host";
  const selectedProject = project.selectedProject;
  const selectedProjectIconUri = selectedProject
    ? (project.iconDataByProjectViewKey.get(selectedProject.viewKey) ?? null)
    : null;
  const projectIcon = useMemo(
    () =>
      // Like Codex, the Mac desktop shows a project's favicon or a folder.
      selectedProject && (selectedProjectIconUri || !macDesktop) ? (
        <ProjectIcon
          projectViewKey={selectedProject.viewKey}
          projectName={selectedProject.projectName}
          iconDataUri={selectedProjectIconUri}
        />
      ) : (
        folderIcon
      ),
    [macDesktop, selectedProject, selectedProjectIconUri],
  );
  const hostIcon = useMemo(
    () => <HostStatusDot serverId={host.selectedServerId} />,
    [host.selectedServerId],
  );
  const isWorktree = isolation.effectiveIsolation === "worktree";
  const isolationValue = isWorktree
    ? t("newWorkspace.isolation.worktree")
    : t("newWorkspace.isolation.local");
  const refIcon = base.selectedItem?.kind === "github-pr" ? pullRequestIcon : branchIcon;

  const projectField = (
    <ProjectField project={project} isPending={isPending} variant={variant} icon={projectIcon} />
  );
  const hostField = showHost ? (
    <HostPicker
      hosts={host.allHosts}
      value={host.selectedServerId}
      onSelect={host.onSelect}
      open={host.openState}
      onOpenChange={host.onOpenChange}
      anchorRef={host.anchorRef}
      includeAddHost={isCompact}
      onAddHost={host.onAddHost}
      searchable={false}
      title={t("newWorkspace.fields.host")}
      desktopPlacement={desktopPlacement}
      desktopMinWidth={200}
      hostOptionTestID={hostOptionTestID}
    >
      <FieldTrigger
        ref={host.anchorRef}
        variant={variant}
        label={t("newWorkspace.fields.host")}
        tooltip={t("newWorkspace.tooltips.host")}
        icon={hostIcon}
        value={selectedHostLabel}
        onPress={host.open}
        disabled={isPending}
        testID="host-picker-trigger"
      />
    </HostPicker>
  ) : null;
  const isolationField = isolation.canCreateWorktree ? (
    <FieldTrigger
      ref={isolation.anchorRef}
      variant={variant}
      label={t("newWorkspace.isolation.label")}
      accessibilityLabel="Workspace isolation"
      tooltip={t("newWorkspace.tooltips.isolation")}
      icon={isWorktree ? branchIcon : folderIcon}
      value={isolationValue}
      onPress={isolation.open}
      disabled={isPending}
      testID="workspace-create-isolation-trigger"
    />
  ) : null;
  // Local isolation has no starting ref; its Branch field switches the project checkout instead.
  const localBranchField = localBranch ? (
    <FieldTrigger
      ref={localBranch.anchorRef}
      variant={variant}
      label={t("newWorkspace.fields.branch")}
      accessibilityLabel={t("branchSwitcher.currentBranch", {
        branchName: localBranch.triggerLabel,
      })}
      tooltip={t("branchSwitcher.triggerTooltip")}
      icon={branchIcon}
      value={localBranch.triggerLabel}
      onPress={localBranch.open}
      disabled={localBranch.disabled}
      testID="new-workspace-local-branch-trigger"
    />
  ) : null;
  const baseField = base.showRefPicker ? (
    <FieldTrigger
      ref={base.anchorRef}
      variant={variant}
      label={t("newWorkspace.fields.branch")}
      accessibilityLabel={t("newWorkspace.refPicker.startingRef")}
      tooltip={t("newWorkspace.tooltips.startingRef")}
      icon={refIcon}
      value={base.triggerLabel}
      onPress={base.open}
      disabled={isPending || !base.selectedSourceDirectory}
      testID="new-workspace-ref-picker-trigger"
    />
  ) : (
    localBranchField
  );
  // Like Codex, the Mac desktop always launches a chat, so it has no Chat/Terminal choice.
  const launchField = macDesktop ? null : (
    <LaunchControl
      variant={variant}
      serverId={launch.serverId}
      target={launch.target}
      onChange={launch.onChange}
      profiles={launch.profiles}
      disabled={launch.disabled}
    />
  );

  const pickers = (
    <>
      <Combobox
        options={project.options}
        value={project.selectedOptionId}
        onSelect={project.onSelect}
        searchable
        searchPlaceholder="Search projects"
        title={t("newWorkspace.fields.project")}
        open={project.openState}
        onOpenChange={project.onOpenChange}
        desktopPlacement={desktopPlacement}
        desktopMinWidth={360}
        anchorRef={project.anchorRef}
        emptyText="No projects available."
        renderOption={projectPicker.renderOption}
        footer={projectPicker.footer}
      />
      <Combobox
        options={isolationPicker.options}
        value={isolation.effectiveIsolation}
        onSelect={isolationPicker.onSelect}
        title={t("newWorkspace.isolation.label")}
        open={isolation.openState}
        onOpenChange={isolation.onOpenChange}
        desktopPlacement={desktopPlacement}
        anchorRef={isolation.anchorRef}
        renderOption={isolationPicker.renderOption}
      />
      <Combobox
        options={base.options}
        value={base.selectedOptionId}
        onSelect={base.onSelect}
        searchable
        searchPlaceholder={t("newWorkspace.refPicker.searchPlaceholder")}
        title={t("newWorkspace.refPicker.title")}
        open={base.openState}
        onOpenChange={base.onOpenChange}
        onSearchQueryChange={base.setSearchQuery}
        desktopPlacement={desktopPlacement}
        anchorRef={base.anchorRef}
        emptyText={base.emptyText}
        renderOption={renderRefOption}
      />
      {localBranch ? (
        <Combobox
          options={localBranch.options}
          value={localBranch.currentBranch}
          onSelect={localBranch.onSelect}
          searchable
          searchPlaceholder={t("branchSwitcher.searchPlaceholder")}
          emptyText={t("branchSwitcher.empty")}
          title={t("branchSwitcher.title")}
          open={localBranch.openState}
          onOpenChange={localBranch.onOpenChange}
          desktopPlacement={desktopPlacement}
          anchorRef={localBranch.anchorRef}
          renderOption={renderLocalBranchOption}
        />
      ) : null}
    </>
  );

  if (isCompact) {
    return (
      <View testID="new-workspace-ref-picker-row" style={styles.compactStack}>
        {projectField}
        {hostField}
        {isolationField}
        {baseField}
        {launchField}
        {/* Isolation and Base come and go with the project; their rows stay reserved so the
            stack keeps one height and nothing above the composer jumps. */}
        {isolationField ? null : <View style={styles.reservedField} pointerEvents="none" />}
        {baseField ? null : <View style={styles.reservedField} pointerEvents="none" />}
        {pickers}
      </View>
    );
  }

  return (
    <View testID="new-workspace-ref-picker-row" style={styles.desktopRow} pointerEvents="box-none">
      <View style={styles.desktopControl}>{projectField}</View>
      {hostField ? <View style={styles.desktopControl}>{hostField}</View> : null}
      {isolationField ? <View style={styles.desktopControl}>{isolationField}</View> : null}
      {baseField ? <View style={styles.desktopControl}>{baseField}</View> : null}
      {launchField ? <View style={styles.launchSpacer} pointerEvents="none" /> : null}
      {launchField}
      {pickers}
    </View>
  );
}

// Matches the Mac composer radius, so its corners cover the tray bottom.
const MAC_SETUP_TRAY_OVERLAP = 24;

const styles = StyleSheet.create((theme) => ({
  compactStack: {
    marginBottom: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[2],
  },
  reservedField: {
    height: FIELD_HEIGHT,
  },
  desktopRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: FIELD_BADGE_HEIGHT,
    // Matches the gap between the composer and the Import session pill below it.
    marginBottom: theme.spacing[4],
    // The badge adds its own left padding; offset it so the project icon's left
    // edge lands exactly on the "New workspace" title's left edge. The trailing
    // inset mirrors it so the launch chip stops on the composer's inner content
    // rather than running out to the composer's border.
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[2],
    // Like Codex, a narrower tray tucked behind the composer: the inset keeps its
    // edges inside the composer's 24pt corners and the overlap hides its bottom.
    ...(getIsElectronMac()
      ? {
          marginHorizontal: theme.spacing[3],
          marginBottom: -MAC_SETUP_TRAY_OVERLAP,
          backgroundColor: theme.colors.surface1,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          paddingHorizontal: theme.spacing[1],
          paddingTop: theme.spacing[1],
          paddingBottom: theme.spacing[1] + MAC_SETUP_TRAY_OVERLAP,
        }
      : {}),
  },
  desktopControl: {
    minWidth: 0,
    flexShrink: 1,
  },
  projectField: {
    minWidth: 0,
    flexShrink: 1,
  },
  // Pushes the launch control to the trailing edge of the desktop meta row.
  launchSpacer: {
    flex: 1,
  },
}));
