import { describe, expect, it } from "vitest";
import {
  buildDiffBaseOptions,
  resolveValidatedDiffBaseRef,
  workspaceDefaultDiffBaseOptionId,
} from "./diff-base-options";

describe("buildDiffBaseOptions", () => {
  it("does not duplicate the default/current branch or offer a fictitious detached HEAD branch", () => {
    const input = {
      suggestions: { branches: ["main"] },
      currentBranch: "main",
      defaultBaseRef: "main",
      selectedBaseRef: undefined,
      workspaceDefault: "Workspace default",
    };
    expect(buildDiffBaseOptions(input).options).toEqual([
      { id: workspaceDefaultDiffBaseOptionId, label: "Workspace default" },
      { id: "ref:refs/heads/main", label: "main" },
    ]);
    expect(
      buildDiffBaseOptions({
        ...input,
        suggestions: { branches: [] },
        currentBranch: "HEAD",
        defaultBaseRef: null,
      }).options,
    ).toHaveLength(1);
  });
  it("keeps local and origin refs separate when they share a name", () => {
    const result = buildDiffBaseOptions({
      suggestions: {
        branches: ["foo"],
        branchDetails: [{ name: "foo", hasLocal: true, hasRemote: true }],
      },
      currentBranch: "foo",
      defaultBaseRef: "origin/foo",
      selectedBaseRef: undefined,
      workspaceDefault: "Workspace default",
    });

    expect(result.options).toEqual([
      { id: workspaceDefaultDiffBaseOptionId, label: "Workspace default" },
      { id: "ref:refs/remotes/origin/foo", label: "origin/foo" },
      { id: "ref:refs/heads/foo", label: "foo" },
    ]);
  });

  it("uses an exact remote ref for a remote-only branch", () => {
    const result = buildDiffBaseOptions({
      suggestions: {
        branches: ["release"],
        branchDetails: [{ name: "release", hasLocal: false, hasRemote: true }],
      },
      currentBranch: null,
      defaultBaseRef: null,
      selectedBaseRef: undefined,
      workspaceDefault: "Workspace default",
    });

    expect(result.options.map((option) => option.id)).toEqual([
      workspaceDefaultDiffBaseOptionId,
      "ref:refs/remotes/origin/release",
    ]);
  });

  it.each([undefined, [{ name: "legacy", hasRemote: false }]])(
    "validates names when provenance is absent or incomplete (%j)",
    (branchDetails) => {
      const result = buildDiffBaseOptions({
        suggestions: { branches: ["legacy"], branchDetails },
        currentBranch: null,
        defaultBaseRef: null,
        selectedBaseRef: "refs/remotes/origin/legacy",
        workspaceDefault: "Workspace default",
      });

      expect(result.legacyBranchByOptionId.get("ref:legacy")).toBe("legacy");
      expect(
        result.options.filter((option) => option.id === "ref:refs/remotes/origin/legacy"),
      ).toHaveLength(1);
      expect(
        resolveValidatedDiffBaseRef({ exists: true, isRemote: false, resolvedRef: "legacy" }),
      ).toBe("refs/heads/legacy");
    },
  );
});
