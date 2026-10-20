import { afterEach, describe, expect, it, vi } from "vitest";
import * as platform from "@/constants/platform";
import {
  explorerSidebarCloseButtonLayout,
  resolveExplorerSidebarDockSizes,
  resolveExplorerSidebarWidth,
} from "@/components/explorer-sidebar-layout";

describe("Explorer sidebar layout", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the Mac tool width only when no width is saved and the workspace has room", () => {
    const mac = vi.spyOn(platform, "getIsElectronMac").mockReturnValue(true);
    expect(resolveExplorerSidebarWidth({ containerWidth: 1000 })).toBe(576);
    expect(resolveExplorerSidebarWidth({ requestedWidth: 320, containerWidth: 1000 })).toBe(320);
    expect(resolveExplorerSidebarWidth({ containerWidth: 520 })).toBe(240);
    mac.mockReturnValue(false);
    expect(resolveExplorerSidebarWidth({ containerWidth: 1000 })).toBe(320);
  });

  it("keeps the sidebar width fixed when the workspace body changes size", () => {
    const narrow = resolveExplorerSidebarDockSizes({ requestedWidth: 320, containerWidth: 1200 });
    const wide = resolveExplorerSidebarDockSizes({ requestedWidth: 320, containerWidth: 1520 });

    expect(narrow[1] * 1200).toBeCloseTo(320);
    expect(wide[1] * 1520).toBeCloseTo(320);
  });

  it("has no fixed maximum while preserving room for the workspace body", () => {
    expect(resolveExplorerSidebarWidth({ requestedWidth: 100, containerWidth: 1200 })).toBe(240);
    expect(resolveExplorerSidebarWidth({ requestedWidth: 900, containerWidth: 1600 })).toBe(900);
    expect(resolveExplorerSidebarWidth({ requestedWidth: 900, containerWidth: 1200 })).toBe(800);
    expect(resolveExplorerSidebarWidth({ requestedWidth: 600, containerWidth: 750 })).toBe(350);
  });
});

describe("Explorer close action", () => {
  it("preserves the wide-native touch target and glyph rail", () => {
    const layout = explorerSidebarCloseButtonLayout(false);
    expect(layout.size).toBe(34);
    expect(layout.iconSize).toBe(18);
    expect(layout.size + layout.hitSlop * 2).toBe(50);
    expect(layout.trailingPadding + (layout.size - layout.iconSize) / 2).toBe(16);
  });

  it("keeps the compact close glyph on the pane rail", () => {
    const layout = explorerSidebarCloseButtonLayout(true);
    expect(layout.size).toBe(32);
    expect(layout.iconSize).toBe(18);
    expect(layout.trailingPadding + (layout.size - layout.iconSize) / 2).toBe(8);
  });
});
