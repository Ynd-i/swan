export type WorkingDiffComparison = "uncommitted" | "base";

export interface WorkingDiffComparisonOverride {
  serverId: string;
  cwd: string;
  comparison: WorkingDiffComparison;
  isDirtyAtSelection: boolean;
  baseRef?: string;
  currentBranch?: string | null;
  defaultBaseRef?: string | null;
}

export interface WorkingDiffComparisonState {
  overrides: Record<string, WorkingDiffComparisonOverride>;
}

export interface WorkingDiffCheckoutIdentity {
  serverId: string;
  workspaceId?: string | null;
  cwd: string;
}

export interface WorkingDiffCheckoutSnapshot {
  isDirty: boolean;
  currentBranch?: string | null;
  defaultBaseRef?: string | null;
}

function matchesCheckout(
  override: WorkingDiffComparisonOverride | undefined,
  input: WorkingDiffCheckoutSnapshot,
): boolean {
  if (!override) return false;
  return (
    override.isDirtyAtSelection === input.isDirty &&
    (override.currentBranch === undefined || override.currentBranch === input.currentBranch) &&
    (override.defaultBaseRef === undefined || override.defaultBaseRef === input.defaultBaseRef)
  );
}

function normalizeCwd(cwd: string): string {
  const trimmed = cwd.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

export function workingDiffComparisonKey(input: WorkingDiffCheckoutIdentity): string {
  const workspaceId = input.workspaceId?.trim();
  const checkout = workspaceId
    ? `workspace=${encodeURIComponent(workspaceId)}`
    : `cwd=${encodeURIComponent(normalizeCwd(input.cwd))}`;
  return `working-diff:server=${encodeURIComponent(input.serverId.trim())}:${checkout}`;
}

export function selectWorkingDiffComparisonInState(
  state: WorkingDiffComparisonState,
  input: WorkingDiffCheckoutIdentity &
    WorkingDiffCheckoutSnapshot & {
      comparison: WorkingDiffComparison;
      baseRef?: string | null;
    },
): WorkingDiffComparisonState {
  const key = workingDiffComparisonKey(input);
  const previous = state.overrides[key];
  let baseRef = input.baseRef?.trim() || undefined;
  if (input.baseRef === undefined && matchesCheckout(previous, input)) {
    baseRef = previous?.baseRef;
  }
  return {
    overrides: {
      ...state.overrides,
      [key]: {
        serverId: input.serverId.trim(),
        cwd: normalizeCwd(input.cwd),
        comparison: input.comparison,
        isDirtyAtSelection: input.isDirty,
        ...(baseRef
          ? {
              baseRef,
              currentBranch: input.currentBranch,
              defaultBaseRef: input.defaultBaseRef,
            }
          : {}),
      },
    },
  };
}

export function resolveWorkingDiffBaseRefFromState(
  state: WorkingDiffComparisonState,
  input: WorkingDiffCheckoutIdentity & WorkingDiffCheckoutSnapshot,
): string | undefined {
  const override = state.overrides[workingDiffComparisonKey(input)];
  return matchesCheckout(override, input) ? override?.baseRef : undefined;
}

export function resolveWorkingDiffRefs(input: {
  comparison: WorkingDiffComparison;
  defaultBaseRef?: string;
  selectedBaseRef?: string;
  fixedBase?: boolean;
}): { baseRef: string | undefined; reviewBaseRef: string | undefined } {
  const baseRef = input.fixedBase
    ? input.defaultBaseRef
    : (input.selectedBaseRef ?? input.defaultBaseRef);
  // An uncommitted diff does not depend on the selected comparison branch. Preserve
  // the existing default-ref draft key so selecting a branch cannot orphan that draft.
  const reviewBaseRef = input.comparison === "base" ? baseRef : input.defaultBaseRef;
  return { baseRef, reviewBaseRef };
}

export function resolveWorkingDiffComparisonFromState(
  state: WorkingDiffComparisonState,
  input: WorkingDiffCheckoutIdentity & WorkingDiffCheckoutSnapshot,
): WorkingDiffComparison {
  const override = state.overrides[workingDiffComparisonKey(input)];
  // Status can render before boundary expiry runs, so resolution must also mask a stale
  // selection under any ordering of the two updates.
  if (override && matchesCheckout(override, input)) {
    return override.comparison;
  }
  return input.isDirty ? "uncommitted" : "base";
}

export function expireWorkingDiffComparisonsInState(
  state: WorkingDiffComparisonState,
  input: { serverId: string; cwd: string } & WorkingDiffCheckoutSnapshot,
): WorkingDiffComparisonState {
  // Expire at the status boundary so selections cannot return after an unmounted surface
  // misses a relevant checkout-state transition.
  const staleKeys = Object.entries(state.overrides)
    .filter(
      ([, override]) =>
        override.serverId === input.serverId.trim() &&
        override.cwd === normalizeCwd(input.cwd) &&
        !matchesCheckout(override, input),
    )
    .map(([key]) => key);
  if (staleKeys.length === 0) return state;

  const overrides = { ...state.overrides };
  for (const key of staleKeys) delete overrides[key];
  return { overrides };
}
