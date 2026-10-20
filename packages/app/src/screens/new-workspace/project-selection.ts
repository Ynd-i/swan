import {
  getHostProjectId,
  resolveEquivalentHostProjectCandidate,
  resolveExactHostProjectCandidate,
  type HostProjectListItem,
} from "@/projects/host-projects";
import { isChatFolderPath } from "@/projects/chat-folder";

export type ProjectSelectionSource = "initial" | "manual" | "none";
export type InitialProjectSelectionSource = "route" | "lastActive" | "fallback" | null;

interface InitialProjectSelection {
  contextKey: string;
  project: HostProjectListItem | null;
  source: "initial";
}

interface ManualProjectSelection {
  contextKey: string;
  project: HostProjectListItem;
  originProject: HostProjectListItem;
  source: "manual";
}

// No project: the chat gets its own folder. Kept like a manual choice until the route changes.
interface NoProjectSelection {
  contextKey: string;
  project: null;
  source: "none";
}

export type ProjectSelection =
  | InitialProjectSelection
  | ManualProjectSelection
  | NoProjectSelection;

export interface ProjectSelectionContext {
  contextKey: string;
  manualContextKey: string;
  selectedServerId: string;
  initialProject: HostProjectListItem | null;
  initialProjectSource: InitialProjectSelectionSource;
  projects: HostProjectListItem[];
  routeProject: HostProjectListItem | null;
  lastActiveProject: HostProjectListItem | null;
  shouldPreserveMissingProject: (project: HostProjectListItem) => boolean;
}

export function createProjectSelectionContextKey(input: {
  selectedServerId: string;
  routeProjectViewKey: string | null;
  allowAllProjects: boolean;
}): string {
  const projectScope = input.allowAllProjects ? "all-projects" : "worktree-projects";
  return `${input.selectedServerId}:${projectScope}:${input.routeProjectViewKey ?? ""}`;
}

export function createManualProjectSelectionContextKey(input: {
  routeProjectViewKey: string | null;
}): string {
  return input.routeProjectViewKey ?? "";
}

export function createNoProjectSelection(manualContextKey: string): ProjectSelection {
  return { contextKey: manualContextKey, project: null, source: "none" };
}

export function createProjectSelection({
  contextKey,
  manualContextKey,
  initialProject,
}: ProjectSelectionContext): ProjectSelection {
  // A new chat started from a chat without a project stays without one.
  if (initialProject && isChatFolderPath(initialProject.iconWorkingDir)) {
    return createNoProjectSelection(manualContextKey);
  }
  return {
    contextKey,
    project: initialProject,
    source: "initial",
  };
}

export function resolveInitialProjectSelectionSource(input: {
  initialProject: HostProjectListItem | null;
  routeProject: HostProjectListItem | null;
  lastActiveProject: HostProjectListItem | null;
}): InitialProjectSelectionSource {
  if (!input.initialProject) {
    return null;
  }
  if (
    input.routeProject?.viewKey === input.initialProject.viewKey ||
    input.routeProject?.hosts.some((routeHost) =>
      input.initialProject?.hosts.some(
        (host) =>
          host.serverId === routeHost.serverId &&
          Boolean(host.projectId) &&
          host.projectId === routeHost.projectId,
      ),
    )
  ) {
    return "route";
  }
  if (
    input.lastActiveProject?.viewKey === input.initialProject.viewKey ||
    (input.lastActiveProject?.projectKey !== null &&
      input.lastActiveProject?.projectKey !== undefined &&
      input.lastActiveProject.projectKey === input.initialProject.projectKey)
  ) {
    return "lastActive";
  }
  return "fallback";
}

function resolveSelectedProjectFromInitialInputs(
  project: HostProjectListItem,
  context: ProjectSelectionContext,
): HostProjectListItem | null {
  return (
    (context.routeProject?.viewKey === project.viewKey ? context.routeProject : null) ??
    (context.lastActiveProject?.viewKey === project.viewKey ? context.lastActiveProject : null)
  );
}

function refreshSelectionProject(
  selection: InitialProjectSelection | ManualProjectSelection,
  project: HostProjectListItem,
): ProjectSelection {
  if (selection.project === project) {
    return selection;
  }
  return {
    ...selection,
    project,
  };
}

function resolveManualOriginProject(
  selection: ProjectSelection,
  context: ProjectSelectionContext,
): HostProjectListItem | null {
  if (selection.source !== "manual") {
    return null;
  }

  const exactOriginProject = resolveExactHostProjectCandidate({
    candidate: selection.originProject,
    projects: context.projects,
    serverId: context.selectedServerId,
  });
  if (exactOriginProject) {
    return exactOriginProject;
  }

  const originBelongsToSelectedHost =
    getHostProjectId(selection.originProject, context.selectedServerId) !== null;
  return originBelongsToSelectedHost &&
    context.shouldPreserveMissingProject(selection.originProject)
    ? selection.originProject
    : null;
}

function shouldResetHydratedInitialSelection(
  selection: ProjectSelection,
  context: ProjectSelectionContext,
): boolean {
  if (
    selection.source !== "initial" ||
    !context.initialProject ||
    (context.initialProjectSource !== "route" && context.initialProjectSource !== "lastActive")
  ) {
    return false;
  }

  return selection.project?.viewKey !== context.initialProject.viewKey;
}

export function resolveProjectSelection(
  selection: ProjectSelection,
  context: ProjectSelectionContext,
): HostProjectListItem | null {
  if (!selection.project) {
    return null;
  }

  if (selection.source === "manual") {
    const originProject = resolveManualOriginProject(selection, context);
    if (originProject) {
      return originProject;
    }
  }

  const exactProject = resolveExactHostProjectCandidate({
    candidate: selection.project,
    projects: context.projects,
    serverId: context.selectedServerId,
  });
  if (exactProject) {
    return exactProject;
  }

  if (context.shouldPreserveMissingProject(selection.project)) {
    return selection.project;
  }

  const equivalentProject = resolveEquivalentHostProjectCandidate({
    candidate: selection.project,
    projects: context.projects,
    serverId: context.selectedServerId,
  });
  if (equivalentProject) {
    return equivalentProject;
  }

  if (selection.source !== "manual") {
    return resolveSelectedProjectFromInitialInputs(selection.project, context);
  }

  return null;
}

export function reconcileProjectSelection(
  current: ProjectSelection,
  context: ProjectSelectionContext,
): ProjectSelection {
  const initialSelection = createProjectSelection(context);
  const currentContextKey =
    current.source === "initial" ? context.contextKey : context.manualContextKey;
  if (current.contextKey !== currentContextKey) {
    return initialSelection;
  }

  if (current.source === "none") {
    return current;
  }

  if (shouldResetHydratedInitialSelection(current, context)) {
    return initialSelection;
  }

  if (!current.project) {
    return initialSelection;
  }

  if (current.source === "manual") {
    const originProject = resolveManualOriginProject(current, context);
    if (originProject) {
      return {
        ...current,
        project: originProject,
        originProject,
      };
    }
  }

  const exactProject = resolveExactHostProjectCandidate({
    candidate: current.project,
    projects: context.projects,
    serverId: context.selectedServerId,
  });
  if (exactProject) {
    return refreshSelectionProject(current, exactProject);
  }

  if (context.shouldPreserveMissingProject(current.project)) {
    return current;
  }

  const resolvedProject = resolveProjectSelection(current, context);
  if (resolvedProject) {
    return refreshSelectionProject(current, resolvedProject);
  }

  return initialSelection;
}
