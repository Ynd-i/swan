import type { ComboboxOptionModel } from "@/components/ui/combobox-options";

export interface DiffBaseBranchDetail {
  name: string;
  hasLocal?: boolean;
  hasRemote?: boolean;
}

export interface DiffBaseSuggestions {
  branches: string[];
  branchDetails?: DiffBaseBranchDetail[];
}

export const diffBaseRefOptionPrefix = "ref:";
export const workspaceDefaultDiffBaseOptionId = "workspace-default";

function optionId(ref: string): string {
  return `${diffBaseRefOptionPrefix}${ref}`;
}

function currentBranchRef(branch: string | null | undefined): string | undefined {
  const trimmed = branch?.trim();
  return trimmed && trimmed !== "HEAD" ? `refs/heads/${trimmed}` : undefined;
}

function normalizedDefaultRef(ref: string | null | undefined): string | undefined {
  const trimmed = ref?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("origin/")) return `refs/remotes/${trimmed}`;
  // Bare defaults are represented by the automatic option, not a second ambiguous
  // copy of the matching qualified branch.
  return trimmed.startsWith("refs/") ? trimmed : undefined;
}

/** Display qualified refs compactly while every diff request keeps the exact ref. */
export function formatDiffBaseRef(ref: string): string {
  if (ref.startsWith("refs/heads/")) return ref.slice("refs/heads/".length);
  if (ref.startsWith("refs/remotes/")) return ref.slice("refs/remotes/".length);
  return ref;
}

export function resolveValidatedDiffBaseRef(input: {
  exists: boolean;
  isRemote: boolean;
  resolvedRef: string | null;
}): string | null {
  if (!input.exists || !input.resolvedRef?.trim()) return null;
  const ref = input.resolvedRef.trim();
  if (ref.startsWith("refs/heads/") || ref.startsWith("refs/remotes/")) return ref;
  return input.isRemote ? `refs/remotes/${ref}` : `refs/heads/${ref}`;
}

export function buildDiffBaseOptions(input: {
  suggestions: DiffBaseSuggestions;
  currentBranch: string | null | undefined;
  defaultBaseRef: string | null | undefined;
  selectedBaseRef: string | undefined;
  workspaceDefault: string;
}): {
  options: ComboboxOptionModel[];
  legacyBranchByOptionId: ReadonlyMap<string, string>;
} {
  const options: ComboboxOptionModel[] = [
    { id: workspaceDefaultDiffBaseOptionId, label: input.workspaceDefault },
  ];
  const legacyBranchByOptionId = new Map<string, string>();
  const added = new Set<string>([workspaceDefaultDiffBaseOptionId]);
  const detailByName = new Map(
    (input.suggestions.branchDetails ?? []).map((detail) => [detail.name, detail]),
  );
  const names = new Set([...input.suggestions.branches, ...detailByName.keys()]);
  const add = (ref: string, legacyBranch?: string) => {
    const id = optionId(ref);
    if (added.has(id)) return;
    added.add(id);
    options.push({ id, label: formatDiffBaseRef(ref) });
    if (legacyBranch) legacyBranchByOptionId.set(id, legacyBranch);
  };

  for (const name of names) {
    const detail = detailByName.get(name);
    const hasProvenance = detail?.hasLocal === true || detail?.hasRemote === true;
    if (!hasProvenance) {
      if (name === input.currentBranch) add(`refs/heads/${name}`);
      else add(name, name);
      continue;
    }
    if (detail?.hasRemote) add(`refs/remotes/origin/${name}`);
    if (detail?.hasLocal) add(`refs/heads/${name}`);
  }

  for (const ref of [
    currentBranchRef(input.currentBranch),
    normalizedDefaultRef(input.defaultBaseRef),
    input.selectedBaseRef,
  ]) {
    if (ref) add(ref, ref.startsWith("refs/") ? undefined : ref);
  }

  return { options, legacyBranchByOptionId };
}
