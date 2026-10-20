import { describe, expect, it } from "vitest";
import {
  expireWorkingDiffComparisonsInState,
  resolveWorkingDiffComparisonFromState,
  resolveWorkingDiffBaseRefFromState,
  resolveWorkingDiffRefs,
  selectWorkingDiffComparisonInState,
  type WorkingDiffComparisonState,
  workingDiffComparisonKey,
} from "./state";

const checkout = { serverId: "server-1", workspaceId: "workspace-1", cwd: "/repo" };

function emptyState(): WorkingDiffComparisonState {
  return { overrides: {} };
}

describe("working diff comparison", () => {
  it("preserves the existing dirty-state-only lifetime when no custom base is selected", () => {
    const original = {
      ...checkout,
      isDirty: false,
      currentBranch: "main",
      defaultBaseRef: "origin/main",
    };
    const state = selectWorkingDiffComparisonInState(emptyState(), {
      ...original,
      comparison: "uncommitted",
    });
    const changed = { ...original, currentBranch: "other" };
    expect(expireWorkingDiffComparisonsInState(state, changed)).toBe(state);
    expect(resolveWorkingDiffComparisonFromState(state, changed)).toBe("uncommitted");
  });
  it("invalidates a selected base when the current branch or checkout base changes", () => {
    const current = {
      ...checkout,
      isDirty: false,
      currentBranch: "feature",
      defaultBaseRef: "origin/main",
    };
    const state = selectWorkingDiffComparisonInState(emptyState(), {
      ...current,
      comparison: "base",
      baseRef: "release",
    });
    for (const changed of [
      { ...current, currentBranch: "other" },
      { ...current, defaultBaseRef: "origin/develop" },
    ]) {
      expect(resolveWorkingDiffBaseRefFromState(state, changed)).toBeUndefined();
      expect(expireWorkingDiffComparisonsInState(state, changed).overrides).toEqual({});
    }
    expect(
      resolveWorkingDiffRefs({
        comparison: "base",
        defaultBaseRef: "main",
        selectedBaseRef: "release",
        fixedBase: true,
      }),
    ).toEqual({ baseRef: "main", reviewBaseRef: "main" });
  });
  it("shares a selected base across panels, retains it across mode changes, and clears or expires it explicitly", () => {
    const current = { ...checkout, isDirty: true };
    let state = selectWorkingDiffComparisonInState(emptyState(), {
      ...current,
      comparison: "base",
      baseRef: " origin/release ",
    });
    expect(resolveWorkingDiffBaseRefFromState(state, current)).toBe("origin/release");
    state = selectWorkingDiffComparisonInState(state, { ...current, comparison: "uncommitted" });
    expect(resolveWorkingDiffBaseRefFromState(state, current)).toBe("origin/release");
    expect(
      resolveWorkingDiffBaseRefFromState(state, { ...current, workspaceId: "other" }),
    ).toBeUndefined();
    expect(
      resolveWorkingDiffBaseRefFromState(state, { ...current, isDirty: false }),
    ).toBeUndefined();
    const afterDirtyTransition = selectWorkingDiffComparisonInState(state, {
      ...current,
      isDirty: false,
      comparison: "base",
    });
    expect(
      resolveWorkingDiffBaseRefFromState(afterDirtyTransition, { ...current, isDirty: false }),
    ).toBeUndefined();
    state = selectWorkingDiffComparisonInState(state, {
      ...current,
      comparison: "base",
      baseRef: null,
    });
    expect(resolveWorkingDiffBaseRefFromState(state, current)).toBeUndefined();
  });

  it("keeps uncommitted review drafts on their original base when choosing a comparison ref", () => {
    const refs = { defaultBaseRef: "origin/main", selectedBaseRef: "release" };
    expect(resolveWorkingDiffRefs({ ...refs, comparison: "base" })).toEqual({
      baseRef: "release",
      reviewBaseRef: "release",
    });
    expect(resolveWorkingDiffRefs({ ...refs, comparison: "uncommitted" })).toEqual({
      baseRef: "release",
      reviewBaseRef: "origin/main",
    });
    expect(resolveWorkingDiffRefs({ defaultBaseRef: "origin/main", comparison: "base" })).toEqual({
      baseRef: "origin/main",
      reviewBaseRef: "origin/main",
    });
  });

  it("scopes selection to the workspace checkout rather than a panel", () => {
    expect(workingDiffComparisonKey(checkout)).toBe(
      "working-diff:server=server-1:workspace=workspace-1",
    );
    expect(workingDiffComparisonKey({ ...checkout, workspaceId: "workspace-2" })).not.toBe(
      workingDiffComparisonKey(checkout),
    );
    expect(workingDiffComparisonKey({ ...checkout, workspaceId: null, cwd: "/repo/" })).toBe(
      "working-diff:server=server-1:cwd=%2Frepo",
    );
  });

  it("defaults from checkout dirtiness and honors a matching manual selection", () => {
    expect(
      resolveWorkingDiffComparisonFromState(emptyState(), { ...checkout, isDirty: true }),
    ).toBe("uncommitted");
    expect(
      resolveWorkingDiffComparisonFromState(emptyState(), { ...checkout, isDirty: false }),
    ).toBe("base");

    const selected = selectWorkingDiffComparisonInState(emptyState(), {
      ...checkout,
      comparison: "base",
      isDirty: true,
    });
    expect(resolveWorkingDiffComparisonFromState(selected, { ...checkout, isDirty: true })).toBe(
      "base",
    );
  });

  it("masks and expires stale selections for every workspace on the checkout", () => {
    let state = selectWorkingDiffComparisonInState(emptyState(), {
      ...checkout,
      comparison: "base",
      isDirty: true,
    });
    state = selectWorkingDiffComparisonInState(state, {
      ...checkout,
      workspaceId: "workspace-2",
      comparison: "uncommitted",
      isDirty: false,
    });
    state = selectWorkingDiffComparisonInState(state, {
      serverId: "server-2",
      workspaceId: "workspace-3",
      cwd: "/other",
      comparison: "base",
      isDirty: true,
    });

    expect(resolveWorkingDiffComparisonFromState(state, { ...checkout, isDirty: false })).toBe(
      "base",
    );
    const expired = expireWorkingDiffComparisonsInState(state, {
      serverId: checkout.serverId,
      cwd: checkout.cwd,
      isDirty: false,
    });
    expect(expired.overrides[workingDiffComparisonKey(checkout)]).toBeUndefined();
    expect(
      expired.overrides[workingDiffComparisonKey({ ...checkout, workspaceId: "workspace-2" })],
    ).toBeDefined();
    expect(
      expired.overrides[
        workingDiffComparisonKey({
          serverId: "server-2",
          workspaceId: "workspace-3",
          cwd: "/other",
        })
      ],
    ).toBeDefined();
  });

  it("keeps state identity when nothing expires", () => {
    const state = selectWorkingDiffComparisonInState(emptyState(), {
      ...checkout,
      comparison: "base",
      isDirty: true,
    });
    expect(
      expireWorkingDiffComparisonsInState(state, {
        serverId: checkout.serverId,
        cwd: checkout.cwd,
        isDirty: true,
      }),
    ).toBe(state);
  });
});
