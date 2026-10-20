import { Buffer } from "buffer";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { Folder } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { ProjectIconSource } from "@getpaseo/protocol/messages";
import {
  AdaptiveModalSheet,
  AdaptiveTextInput,
  type SheetHeader,
} from "@/components/adaptive-modal-sheet";
import { ProjectIconView } from "@/components/project-icon-view";
import { Button } from "@/components/ui/button";
import type { FieldControlSize } from "@/components/ui/control-geometry";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { useIsCompactFormFactor } from "@/constants/layout";
import { getIsElectronMac } from "@/constants/platform";
import { useToast } from "@/contexts/toast-context";
import { useFilePicker } from "@/hooks/use-file-picker";
import {
  openProjectEditForm,
  type ProjectEditFormError,
  type ProjectEditFormSnapshot,
  type ProjectEditFormModel,
  type ProjectEditFormState,
  type ProjectEditSubmission,
  type ProjectIconIntent,
} from "@/projects/edit-form";
import { importProjectIconFromUrl } from "@/projects/import-project-icon";
import { useProjects } from "@/hooks/use-projects";
import { createProjectIconTarget } from "@/projects/icon-target";
import { useProjectIcons } from "@/projects/icons";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { toErrorMessage } from "@/utils/error-messages";
import {
  getProjectHostEntry,
  getProjectSummaryForHostProject,
  type ProjectHostEntry,
  type ProjectSummary,
} from "@/utils/projects";

export interface ProjectEditSheetProps {
  visible: boolean;
  onClose: () => void;
  serverId: string;
  projectId: string;
  projectViewKey: string;
  client: DaemonClient;
  /** False on hosts that predate custom project icons — the icon field is hidden. */
  supportsCustomIcon: boolean;
  snapshot: ProjectEditFormSnapshot;
  sourceDirectory: string;
  hostName: string;
  /** Mac only: a "Remove project" button at the footer's start, as in Codex. */
  onRemove?: () => void;
}

/** The form's starting point and icon for one host's copy of a project. */
export function useProjectEditSnapshot(project: ProjectSummary, host: ProjectHostEntry) {
  const supportsCustomIcon = useHostFeature(host.serverId, "projectCustomIcon");
  const customIconRevision = host.customIconRevision ?? null;
  const iconTargets = useMemo(() => {
    const target = createProjectIconTarget({
      projectViewKey: project.viewKey,
      placement: { ...host, iconWorkingDir: host.repoRoot },
    });
    return target ? [target] : [];
  }, [project.viewKey, host]);
  const iconDataUri = useProjectIcons({ projects: iconTargets }).get(project.viewKey) ?? null;
  const snapshot = useMemo<ProjectEditFormSnapshot>(
    () => ({
      projectName: host.projectName,
      projectCustomName: host.projectCustomName,
      hasCustomIcon: customIconRevision !== null,
      currentIconDataUri: iconDataUri,
    }),
    [customIconRevision, iconDataUri, host.projectCustomName, host.projectName],
  );
  return { snapshot, supportsCustomIcon, iconDataUri };
}

/**
 * The edit sheet for a project known only by host and id: the Mac sidebar opens it in place,
 * as Codex does. Setup, teardown and scripts stay in Settings › Projects. Renders nothing until
 * the project is loaded on an online host.
 */
export function HostProjectEditSheet({
  serverId,
  projectId,
  onClose,
  onRemove,
}: {
  serverId: string;
  projectId: string;
  onClose: () => void;
  onRemove: () => void;
}) {
  const { projects } = useProjects();
  const project = useMemo(
    () => getProjectSummaryForHostProject(projects, serverId, projectId),
    [projectId, projects, serverId],
  );
  const host = getProjectHostEntry(project, serverId, projectId);
  const client = useHostRuntimeClient(serverId);
  if (!project || !host?.isOnline || !client) return null;
  return (
    <LoadedHostProjectEditSheet
      project={project}
      host={host}
      client={client}
      onClose={onClose}
      onRemove={onRemove}
    />
  );
}

function LoadedHostProjectEditSheet({
  project,
  host,
  client,
  onClose,
  onRemove,
}: {
  project: ProjectSummary;
  host: ProjectHostEntry;
  client: DaemonClient;
  onClose: () => void;
  onRemove: () => void;
}) {
  const { snapshot, supportsCustomIcon } = useProjectEditSnapshot(project, host);
  return (
    <ProjectEditSheet
      visible
      onClose={onClose}
      serverId={host.serverId}
      projectId={host.projectId}
      projectViewKey={project.viewKey}
      client={client}
      supportsCustomIcon={supportsCustomIcon}
      snapshot={snapshot}
      sourceDirectory={host.repoRoot}
      hostName={host.serverName}
      onRemove={onRemove}
    />
  );
}

/** Editing a project is its name and its icon, decided together and saved once. */
export function ProjectEditSheet({
  visible,
  onClose,
  projectId,
  projectViewKey,
  client,
  supportsCustomIcon,
  snapshot,
  sourceDirectory,
  hostName,
  onRemove,
}: ProjectEditSheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { pickFiles } = useFilePicker();
  const size: FieldControlSize = useIsCompactFormFactor() ? "md" : "sm";
  const [form] = useState(() => openProjectEditForm(snapshot));
  const state = useSyncExternalStore(form.subscribe, form.getState, form.getState);
  const [iconEditorOpen, setIconEditorOpen] = useState(false);
  const isMac = getIsElectronMac();
  const showIconEditor = !isMac || iconEditorOpen || state.error?.scope === "icon";
  const openIconEditor = useCallback(() => setIconEditorOpen(true), []);

  const mutation = useMutation({
    mutationFn: (submission: ProjectEditSubmission) =>
      submitProjectEdit({ client, projectId, submission }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.show(t("settings.project.edit.savedToast"), { variant: "success" });
      onClose();
    },
    onError: (error) => form.setError(toFormError(error)),
  });
  const isSaving = mutation.isPending;

  const handleClose = useCallback(() => {
    if (isSaving) return;
    onClose();
  }, [isSaving, onClose]);

  const handleSubmit = useCallback(() => {
    mutation.mutate(state.submission);
  }, [mutation, state.submission]);

  const chooseImage = useCallback(async () => {
    const file = (await pickFiles())?.[0];
    if (!file) return;
    form.setPickedImage({
      fileName: file.fileName,
      mimeType: file.mimeType,
      data: Buffer.from(await file.readBytes()).toString("base64"),
    });
  }, [form, pickFiles]);

  const handleChooseImage = useCallback(() => {
    void chooseImage();
  }, [chooseImage]);

  const header = useMemo<SheetHeader>(() => ({ title: t("settings.project.edit.title") }), [t]);

  const footer = useMemo(
    () => (
      <View style={styles.footer}>
        {isMac && onRemove ? (
          <Button
            variant="secondary"
            size="sm"
            style={styles.removeButton}
            textStyle={styles.removeText}
            onPress={onRemove}
            disabled={isSaving}
            testID="project-edit-remove"
          >
            {t("desktopChat.sections.removeProject")}
          </Button>
        ) : null}
        {isMac && onRemove ? <View style={styles.footerSpacer} /> : null}
        <Button
          variant={isMac ? "ghost" : "secondary"}
          size={isMac ? "sm" : "md"}
          style={isMac ? undefined : styles.footerButton}
          onPress={handleClose}
          disabled={isSaving}
        >
          {t("common.actions.cancel")}
        </Button>
        <Button
          variant="default"
          size={isMac ? "sm" : "md"}
          style={isMac ? undefined : styles.footerButton}
          onPress={handleSubmit}
          disabled={!state.canSubmit}
          loading={isSaving}
          testID="project-edit-save"
        >
          {t("settings.project.edit.save")}
        </Button>
      </View>
    ),
    [handleClose, handleSubmit, isMac, isSaving, onRemove, state.canSubmit, t],
  );

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={handleClose}
      footer={footer}
      desktopMaxWidth={isMac ? 520 : 440}
      contentStyle={isMac ? styles.macContent : undefined}
      footerContainerStyle={isMac ? styles.macFooter : undefined}
      testID="project-edit-sheet"
    >
      <ProjectNameField
        form={form}
        state={state}
        snapshot={snapshot}
        projectViewKey={projectViewKey}
        size={size}
        isSaving={isSaving}
        supportsCustomIcon={supportsCustomIcon}
        showIconEditor={showIconEditor}
        onOpenIconEditor={openIconEditor}
      />

      {isMac ? (
        <Field label={t("settings.project.edit.sourceFolder")}>
          <View style={styles.sourceFolder} testID="project-edit-source-folder">
            <Folder size={18} color={styles.folderIcon.color} />
            <View style={styles.sourceText}>
              <Text style={styles.sourcePath} selectable>
                {sourceDirectory}
              </Text>
              <Text style={styles.sourceHost}>{hostName}</Text>
            </View>
          </View>
        </Field>
      ) : null}

      {supportsCustomIcon ? (
        <View style={showIconEditor ? undefined : styles.hidden}>
          <Field
            label={t("settings.project.edit.icon")}
            hint={state.pickedFileName ?? undefined}
            error={state.error?.scope === "icon" ? state.error.message : null}
          >
            <View style={styles.iconField}>
              <View style={styles.iconRow}>
                <ProjectIconView
                  iconDataUri={state.previewDataUri}
                  initial={projectInitial(snapshot.projectName)}
                  projectViewKey={projectViewKey}
                  size={40}
                  textStyle={styles.previewText}
                />
                <Button
                  variant="outline"
                  size={size}
                  onPress={handleChooseImage}
                  disabled={isSaving}
                  testID="project-edit-choose-image"
                >
                  {t("settings.project.edit.chooseImage")}
                </Button>
                {state.canUseAutomatic ? (
                  <Button
                    variant="ghost"
                    size={size}
                    onPress={form.useAutomaticIcon}
                    disabled={isSaving}
                    testID="project-edit-use-automatic"
                  >
                    {t("settings.project.edit.useAutomatic")}
                  </Button>
                ) : null}
              </View>
              <FormTextInput
                size={size}
                testID="project-edit-image-url"
                accessibilityLabel={t("settings.project.edit.imageUrl")}
                initialValue=""
                resetKey={state.urlResetKey}
                onChangeText={form.setImageUrl}
                placeholder={t("settings.project.edit.imageUrl")}
                editable={!isSaving}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
          </Field>
        </View>
      ) : null}
    </AdaptiveModalSheet>
  );
}

function ProjectNameField({
  form,
  state,
  snapshot,
  projectViewKey,
  size,
  isSaving,
  supportsCustomIcon,
  showIconEditor,
  onOpenIconEditor,
}: {
  form: ProjectEditFormModel;
  state: ProjectEditFormState;
  snapshot: ProjectEditFormSnapshot;
  projectViewKey: string;
  size: FieldControlSize;
  isSaving: boolean;
  supportsCustomIcon: boolean;
  showIconEditor: boolean;
  onOpenIconEditor: () => void;
}) {
  const { t } = useTranslation();
  const isMac = getIsElectronMac();
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  const iconAccessibilityState = useMemo(
    () => ({ expanded: showIconEditor, disabled: isSaving }),
    [isSaving, showIconEditor],
  );
  const nameError = state.error?.scope === "name" ? state.error.message : null;
  const inputProps = {
    testID: "project-edit-name",
    accessibilityLabel: t("settings.project.edit.nameLabel"),
    initialValue: state.name,
    onChangeText: form.setName,
    placeholder: snapshot.projectName,
    editable: !isSaving,
    autoCapitalize: "none" as const,
    autoCorrect: false,
  };
  const input = isMac ? (
    <AdaptiveTextInput
      {...inputProps}
      autoFocus
      style={styles.macNameInput}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  ) : (
    <FormTextInput {...inputProps} size={size} />
  );
  if (!isMac)
    return (
      <Field label={t("settings.project.edit.name")} error={nameError}>
        {input}
      </Field>
    );
  const icon =
    state.canUseAutomatic && state.previewDataUri ? (
      <ProjectIconView
        iconDataUri={state.previewDataUri}
        initial={projectInitial(snapshot.projectName)}
        projectViewKey={projectViewKey}
        size={18}
        textStyle={styles.previewText}
      />
    ) : (
      <View testID="project-edit-default-icon">
        <Folder size={18} color={styles.folderIcon.color} />
      </View>
    );
  return (
    <View style={styles.nameGroup}>
      <View
        style={[styles.macNameField, focused && styles.macNameFocused]}
        testID="project-edit-name-field"
      >
        {supportsCustomIcon ? (
          <Pressable
            style={styles.macIconButton}
            onPress={onOpenIconEditor}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel={t("settings.project.edit.icon")}
            accessibilityState={iconAccessibilityState}
            testID="project-edit-icon-trigger"
          >
            {icon}
          </Pressable>
        ) : (
          <View style={styles.macIconButton}>{icon}</View>
        )}
        {input}
      </View>
      {nameError ? <Text style={styles.nameError}>{nameError}</Text> : null}
    </View>
  );
}

function projectInitial(projectName: string): string {
  return projectName.trim().charAt(0).toUpperCase() || "?";
}

class ProjectEditStepError extends Error {
  constructor(
    readonly scope: ProjectEditFormError["scope"],
    cause: unknown,
  ) {
    super(toErrorMessage(cause));
    this.name = "ProjectEditStepError";
  }
}

async function step<T>(scope: ProjectEditFormError["scope"], run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new ProjectEditStepError(scope, error);
  }
}

/**
 * One submit, up to two RPCs. Icon bytes are acquired before either RPC runs
 * because that is the step most likely to fail; past that point both RPCs take
 * the same inputs on a retry, so a failure between them is safe to submit again.
 */
async function submitProjectEdit(input: {
  client: DaemonClient;
  projectId: string;
  submission: ProjectEditSubmission;
}): Promise<void> {
  const { client, projectId, submission } = input;
  const { rename, icon } = submission;

  const source = icon ? await step("icon", () => acquireIconSource(icon)) : null;
  if (rename) {
    await step("name", () => client.renameProject(projectId, rename.customName));
  }
  if (source) {
    await step("icon", () => client.setProjectIcon(projectId, source));
  }
}

function acquireIconSource(intent: ProjectIconIntent): Promise<ProjectIconSource> {
  if (intent.type === "url") return importProjectIconFromUrl(intent.url);
  return Promise.resolve(intent);
}

function toFormError(error: unknown): ProjectEditFormError {
  if (error instanceof ProjectEditStepError) {
    return { scope: error.scope, message: error.message };
  }
  return { scope: "name", message: toErrorMessage(error) };
}

const styles = StyleSheet.create((theme) => ({
  hidden: { display: "none" },
  macContent: { padding: 20, paddingTop: theme.spacing[2], gap: theme.spacing[4] },
  macFooter: {
    borderTopWidth: 0,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  nameGroup: { gap: theme.spacing[2] },
  macNameField: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
  },
  macNameFocused: { borderColor: theme.colors.accent },
  macIconButton: {
    width: 40,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  macNameInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 0,
    outlineWidth: 0,
    backgroundColor: "transparent",
    fontSize: theme.fontSize.base,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  nameError: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.sm,
  },
  folderIcon: { color: theme.colors.foregroundMuted },
  sourceFolder: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
  },
  sourceText: { flex: 1, minWidth: 0, gap: theme.spacing[1] },
  sourcePath: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
  sourceHost: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  iconField: {
    gap: theme.spacing[2],
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  previewText: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  footer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  footerButton: {
    minWidth: 112,
  },
  footerSpacer: { flex: 1 },
  // Codex's red-tinted "remove" button; a ghost button would turn its text white on hover.
  removeButton: {
    backgroundColor: `${theme.colors.palette.red[500]}26`,
    borderColor: "transparent",
  },
  removeText: { color: theme.colors.palette.red[300] },
}));
