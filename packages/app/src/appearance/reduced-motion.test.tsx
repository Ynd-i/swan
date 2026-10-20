/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppReducedMotionProvider, useAppReducedMotion } from "./reduced-motion";

const state = vi.hoisted(() => ({ mac: true, startupSystem: false }));
vi.mock("@/constants/platform", () => ({ getIsElectronMac: () => state.mac }));
vi.mock("react-native-reanimated", () => ({
  ReduceMotion: { Always: "always", Never: "never" },
  useReducedMotion: () => state.startupSystem,
  ReducedMotionConfig: ({ mode }: { mode: string }) => <span data-config={mode} />,
}));

function Consumer() {
  return <output>{String(useAppReducedMotion())}</output>;
}
let root: Root;
let host: HTMLDivElement;
let media: EventTarget & { matches: boolean };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.mac = true;
  state.startupSystem = false;
  media = Object.assign(new EventTarget(), { matches: false });
  vi.spyOn(window, "matchMedia").mockImplementation(() => media as MediaQueryList);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

async function render(preference: "system" | "on" | "off") {
  await act(() =>
    root.render(
      <AppReducedMotionProvider preference={preference}>
        <Consumer />
      </AppReducedMotionProvider>,
    ),
  );
}
function expectReduced(value: boolean) {
  expect(host.querySelector("output")?.textContent).toBe(String(value));
  expect(host.querySelector("[data-config]")?.getAttribute("data-config")).toBe(
    value ? "always" : "never",
  );
}

describe("application reduced motion", () => {
  it("keeps the hook and Reanimated override consistent for both OS values", async () => {
    for (const system of [false, true]) {
      media.matches = system;
      await render("system");
      expectReduced(system);
      await render("on");
      expectReduced(true);
      await render("off");
      expectReduced(false);
    }
  });
  it("reacts to system changes and removes its media listener on unmount", async () => {
    const remove = vi.spyOn(media, "removeEventListener");
    await render("system");
    expectReduced(false);
    await act(() => {
      media.matches = true;
      media.dispatchEvent(new Event("change"));
    });
    expectReduced(true);
    await render("off");
    await act(() => {
      media.matches = false;
      media.dispatchEvent(new Event("change"));
    });
    expectReduced(false);
    await act(() => root.render(<Consumer />));
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });
  it("falls back to the original OS hook without an Appearance or QueryClient provider", async () => {
    state.startupSystem = true;
    await act(() => root.render(<Consumer />));
    expect(host.textContent).toBe("true");
    expect(host.querySelector("[data-config]")).toBeNull();
  });
  it("leaves non-Mac behavior with the original OS hook regardless of saved overrides", async () => {
    state.mac = false;
    await render("on");
    expect(host.textContent).toBe("false");
    expect(host.querySelector("[data-config]")).toBeNull();
    state.startupSystem = true;
    await render("off");
    expect(host.textContent).toBe("true");
    expect(host.querySelector("[data-config]")).toBeNull();
  });
});
