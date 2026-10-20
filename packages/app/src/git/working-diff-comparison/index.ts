import { useCallback } from "react";
import { create } from "zustand";
import {
  expireWorkingDiffComparisonsInState,
  resolveWorkingDiffComparisonFromState,
  resolveWorkingDiffBaseRefFromState,
  selectWorkingDiffComparisonInState,
  type WorkingDiffCheckoutIdentity,
  type WorkingDiffCheckoutSnapshot,
  type WorkingDiffComparison,
  type WorkingDiffComparisonState,
} from "./state";

interface WorkingDiffComparisonStore extends WorkingDiffComparisonState {
  select: (
    input: WorkingDiffCheckoutIdentity &
      WorkingDiffCheckoutSnapshot & {
        comparison: WorkingDiffComparison;
        baseRef?: string | null;
      },
  ) => void;
}

const useWorkingDiffComparisonStore = create<WorkingDiffComparisonStore>((set) => ({
  overrides: {},
  select: (input) => set((state) => selectWorkingDiffComparisonInState(state, input)),
}));

export function useWorkingDiffComparison(
  input: WorkingDiffCheckoutIdentity & WorkingDiffCheckoutSnapshot,
): {
  comparison: WorkingDiffComparison;
  selectComparison: (comparison: WorkingDiffComparison) => void;
  selectedBaseRef: string | undefined;
  selectBaseRef: (baseRef: string | null) => void;
} {
  const { serverId, workspaceId, cwd, isDirty, currentBranch, defaultBaseRef } = input;
  const comparison = useWorkingDiffComparisonStore((state) =>
    resolveWorkingDiffComparisonFromState(state, input),
  );
  const select = useWorkingDiffComparisonStore((state) => state.select);
  const selectedBaseRef = useWorkingDiffComparisonStore((state) =>
    resolveWorkingDiffBaseRefFromState(state, input),
  );
  const selectComparison = useCallback(
    (next: WorkingDiffComparison) =>
      select({
        serverId,
        workspaceId,
        cwd,
        isDirty,
        currentBranch,
        defaultBaseRef,
        comparison: next,
      }),
    [cwd, isDirty, currentBranch, defaultBaseRef, select, serverId, workspaceId],
  );
  const selectBaseRef = useCallback(
    (baseRef: string | null) =>
      select({
        serverId,
        workspaceId,
        cwd,
        isDirty,
        currentBranch,
        defaultBaseRef,
        comparison: "base",
        baseRef,
      }),
    [cwd, isDirty, currentBranch, defaultBaseRef, select, serverId, workspaceId],
  );
  return { comparison, selectComparison, selectedBaseRef, selectBaseRef };
}

export function selectWorkingDiffComparison(
  input: WorkingDiffCheckoutIdentity &
    WorkingDiffCheckoutSnapshot & {
      comparison: WorkingDiffComparison;
      baseRef?: string | null;
    },
): void {
  useWorkingDiffComparisonStore.getState().select(input);
}

export function resolveWorkingDiffComparison(
  input: WorkingDiffCheckoutIdentity & WorkingDiffCheckoutSnapshot,
): WorkingDiffComparison {
  return resolveWorkingDiffComparisonFromState(useWorkingDiffComparisonStore.getState(), input);
}

export function expireWorkingDiffComparisons(
  input: WorkingDiffCheckoutSnapshot & {
    serverId: string;
    cwd: string;
  },
): void {
  useWorkingDiffComparisonStore.setState((state) =>
    expireWorkingDiffComparisonsInState(state, input),
  );
}

export function resetWorkingDiffComparisons(): void {
  useWorkingDiffComparisonStore.setState({ overrides: {} });
}
