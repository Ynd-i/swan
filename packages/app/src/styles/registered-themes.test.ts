import { expect, it, vi } from "vitest";
import { REGISTERED_THEMES as upstream } from "./theme";

vi.mock("@/constants/platform", () => ({ getIsElectronMac: vi.fn() }));

it("customizes only the macOS Electron default dark theme", async () => {
  const { getIsElectronMac } = await import("@/constants/platform");
  vi.mocked(getIsElectronMac).mockReturnValue(true);
  const { REGISTERED_THEMES: desktop } = await import("./registered-themes.electron");
  expect(desktop.dark.colors.surfaceSidebar).toBe("#111111");
  expect(desktop.dark.colors.surface0).toBe("#151515");
  expect(desktop.dark.colors.surfaceWorkspace).toBe("#151515");
  expect(desktop.dark.colors.terminal.background).toBe("#151515");
  expect(desktop.dark.colors.link).toBe("#7aa6e7");
  expect(desktop.dark.colors.inlineCode).toBe("#de8481");
  expect(desktop.dark.colors.statusDanger).toBe(upstream.dark.colors.statusDanger);
  const otherThemeKeys = (Object.keys(upstream) as (keyof typeof upstream)[]).filter(
    (key) => key !== "dark",
  );
  for (const key of otherThemeKeys) {
    expect(desktop[key]).toBe(upstream[key]);
  }

  vi.resetModules();
  vi.mocked(getIsElectronMac).mockReturnValue(false);
  const { REGISTERED_THEMES: otherDesktop } = await import("./registered-themes.electron");
  const { REGISTERED_THEMES: original } = await import("./theme");
  expect(otherDesktop).toBe(original);
  expect((await import("./registered-themes")).REGISTERED_THEMES).toBe(original);
});
