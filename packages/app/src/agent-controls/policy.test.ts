import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentFeature, AgentMode } from "@getpaseo/protocol/agent-types";
import * as platform from "@/constants/platform";
import {
  adoptDraftBaseMode,
  DRAFT_PLAN_OWNER,
  getDisplayedModeId,
  getSelectableAgentModes,
  isPlanningAgentMode,
  rememberBaseMode,
  resolveNonPlanningModeId,
  resolvePlanToggle,
  selectPermissionMode,
  takeBaseModeOnPlanExit,
} from "./policy";

describe("isPlanningAgentMode", () => {
  it("prefers planning metadata and recognizes existing provider ids", () => {
    expect(isPlanningAgentMode({ id: "research", colorTier: "planning" })).toBe(true);
    expect(isPlanningAgentMode({ id: "plan" })).toBe(true);
    expect(
      isPlanningAgentMode({
        id: "https://agentclientprotocol.com/protocol/session-modes#plan",
      }),
    ).toBe(true);
    expect(isPlanningAgentMode({ id: "default", colorTier: "safe" })).toBe(false);
  });
});

describe("resolveNonPlanningModeId", () => {
  const modes = [
    { id: "plan", label: "Plan", colorTier: "planning" },
    { id: "default", label: "Default", colorTier: "safe" },
    { id: "full", label: "Full", colorTier: "dangerous" },
  ] satisfies AgentMode[];

  it("uses a non-planning provider default", () => {
    expect(resolveNonPlanningModeId(modes, "full")).toBe("full");
  });

  it("does not use a planning or stale provider default", () => {
    expect(resolveNonPlanningModeId(modes, "plan")).toBe("default");
    expect(resolveNonPlanningModeId(modes, "deleted")).toBe("default");
  });

  it("returns null when no non-planning mode exists", () => {
    expect(resolveNonPlanningModeId([modes[0]], "plan")).toBeNull();
  });
});

const CLAUDE_MODES = [
  { id: "default", label: "Default" },
  { id: "acceptEdits", label: "Accept edits" },
  { id: "plan", label: "Plan" },
  { id: "auto", label: "Auto" },
  { id: "bypassPermissions", label: "Bypass" },
] satisfies AgentMode[];

describe("getSelectableAgentModes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists every non-planning provider mode on the Mac desktop", () => {
    vi.spyOn(platform, "getIsElectronMac").mockReturnValue(true);
    expect(getSelectableAgentModes(CLAUDE_MODES).map((mode) => mode.id)).toEqual([
      "default",
      "acceptEdits",
      "auto",
      "bypassPermissions",
    ]);
  });

  it("keeps planning modes elsewhere", () => {
    vi.spyOn(platform, "getIsElectronMac").mockReturnValue(false);
    expect(getSelectableAgentModes(CLAUDE_MODES)).toEqual(CLAUDE_MODES);
  });
});

describe("mode-based plan toggle", () => {
  function setup(selectedId: string) {
    const calls: string[] = [];
    const modes = {
      options: CLAUDE_MODES,
      selectedId,
      defaultModeId: "default",
      select: (modeId: string) => {
        calls.push(modeId);
      },
    };
    const toggle = resolvePlanToggle({
      ownerKey: "agent-1",
      features: [],
      setFeature: () => undefined,
      modes,
    });
    return { calls, modes, toggle };
  }

  it("remembers the base mode on and restores it off", () => {
    const on = setup("auto");
    on.toggle?.turnOn();
    expect(on.calls).toEqual(["plan"]);

    const off = setup("plan");
    expect(off.toggle?.isOn).toBe(true);
    expect(getDisplayedModeId("agent-1", CLAUDE_MODES, "plan")).toBe("auto");
    off.toggle?.turnOff();
    expect(off.calls).toEqual(["auto"]);
    expect(getDisplayedModeId("agent-1", CLAUDE_MODES, "plan")).toBe("plan");
  });

  it("changes the base instead of leaving plan when a permission mode is picked", () => {
    const on = setup("default");
    on.toggle?.turnOn();
    const planning = setup("plan");
    selectPermissionMode("agent-1", planning.modes, "bypassPermissions");
    expect(planning.calls).toEqual([]);
    planning.toggle?.turnOff();
    expect(planning.calls).toEqual(["bypassPermissions"]);
  });

  it("re-applies the base once when the server leaves plan on its own", () => {
    setup("auto").toggle?.turnOn();
    expect(takeBaseModeOnPlanExit("agent-1", CLAUDE_MODES, "plan", "acceptEdits")).toBe("auto");
    expect(takeBaseModeOnPlanExit("agent-1", CLAUDE_MODES, "plan", "acceptEdits")).toBeNull();
  });

  it("hands a draft's base mode to the chat it creates in plan", () => {
    rememberBaseMode(DRAFT_PLAN_OWNER, "auto");
    expect(adoptDraftBaseMode("agent-3", CLAUDE_MODES, "auto")).toBe(false);
    expect(adoptDraftBaseMode("agent-3", CLAUDE_MODES, "plan")).toBe(true);
    expect(getDisplayedModeId("agent-3", CLAUDE_MODES, "plan")).toBe("auto");
    expect(adoptDraftBaseMode("agent-4", CLAUDE_MODES, "plan")).toBe(false);
    expect(takeBaseModeOnPlanExit("agent-3", CLAUDE_MODES, "plan", "acceptEdits")).toBe("auto");
  });

  it("does nothing without a remembered base or when the base was restored", () => {
    expect(takeBaseModeOnPlanExit("agent-2", CLAUDE_MODES, "plan", "acceptEdits")).toBeNull();
    setup("auto").toggle?.turnOn();
    expect(takeBaseModeOnPlanExit("agent-1", CLAUDE_MODES, "plan", "auto")).toBeNull();
  });

  it("prefers the plan_mode feature and falls back to the provider default", () => {
    const calls: unknown[][] = [];
    const feature = {
      type: "toggle",
      id: "plan_mode",
      label: "Plan",
      value: true,
    } satisfies AgentFeature;
    const viaFeature = resolvePlanToggle({
      ownerKey: "agent-3",
      features: [feature],
      setFeature: (id, value) => {
        calls.push([id, value]);
      },
      modes: {
        options: CLAUDE_MODES,
        selectedId: "auto",
        defaultModeId: "default",
        select: () => {},
      },
    });
    viaFeature?.turnOff();
    expect(calls).toEqual([["plan_mode", false]]);
    expect(setup("plan").toggle?.isOn).toBe(true);
  });
});
