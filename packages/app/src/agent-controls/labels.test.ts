import { afterEach, describe, expect, it, vi } from "vitest";
import * as platform from "@/constants/platform";
import { formatAgentModeLabel, formatThinkingOptionLabel } from "./labels";

describe("formatAgentModeLabel", () => {
  it("sentence-cases provider mode labels", () => {
    expect(formatAgentModeLabel({ id: "plan", label: "Plan" })).toBe("Plan");
    expect(formatAgentModeLabel({ id: "full-access", label: "Full Access" })).toBe("Full access");
    expect(formatAgentModeLabel({ id: "auto-review", label: "Auto-review" })).toBe("Auto-review");
    expect(formatAgentModeLabel({ id: "read_only", label: "read_only" })).toBe("Read only");
    expect(formatAgentModeLabel({ id: "acceptEdits", label: "acceptEdits" })).toBe("Accept edits");
  });

  it("splits compact mode ids when no provider label is available", () => {
    expect(formatAgentModeLabel({ id: "auto-review" })).toBe("Auto review");
  });

  describe("on the Mac desktop", () => {
    afterEach(() => vi.restoreAllMocks());

    it("names Codex modes the way the Codex app does and keeps other provider labels", () => {
      vi.spyOn(platform, "getIsElectronMac").mockReturnValue(true);
      const codex = (id: string) => formatAgentModeLabel({ id, label: id }, "codex");
      expect(
        formatAgentModeLabel({ id: "acceptEdits", label: "Accept File Edits" }, "claude"),
      ).toBe("Accept file edits");
      expect(codex("auto")).toBe("Ask for review");
      expect(codex("auto-review")).toBe("Auto-review");
      expect(formatAgentModeLabel({ id: "build", label: "Build" }, "opencode")).toBe("Build");
    });

    it("keeps provider labels elsewhere", () => {
      vi.spyOn(platform, "getIsElectronMac").mockReturnValue(false);
      expect(formatAgentModeLabel({ id: "auto", label: "Auto mode" }, "claude")).toBe("Auto mode");
    });
  });
});

describe("formatThinkingOptionLabel", () => {
  it("formats compact thinking option labels for display", () => {
    expect(formatThinkingOptionLabel({ id: "none", label: "none" })).toBe("None");
    expect(formatThinkingOptionLabel({ id: "low", label: "low" })).toBe("Low");
    expect(formatThinkingOptionLabel({ id: "medium", label: "medium" })).toBe("Medium");
    expect(formatThinkingOptionLabel({ id: "high", label: "high" })).toBe("High");
    expect(formatThinkingOptionLabel({ id: "xhigh", label: "xhigh" })).toBe("Extra high");
  });

  it("sentence-cases split provider labels", () => {
    expect(formatThinkingOptionLabel({ id: "extra_high", label: "extra_high" })).toBe("Extra high");
    expect(formatThinkingOptionLabel({ id: "think-hard", label: "think-hard" })).toBe("Think hard");
    expect(formatThinkingOptionLabel({ id: "xhigh", label: "XHigh" })).toBe("Extra high");
  });
});
