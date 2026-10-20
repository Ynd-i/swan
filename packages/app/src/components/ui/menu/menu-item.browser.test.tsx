import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { MenuItem } from "./menu-item";
import { MenuRoot } from "./menu-root";

// The menu engine focuses the first item with script once the menu opens. These tests make the
// same script focus after a real pointer or keyboard interaction.
function MenuHarness() {
  return (
    <>
      <button type="button" data-testid="opener">
        Open
      </button>
      <MenuRoot>
        <MenuItem testID="menu-first">First</MenuItem>
        <MenuItem testID="menu-second">Second</MenuItem>
      </MenuRoot>
    </>
  );
}

function byTestId(testID: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-testid="${testID}"]`);
  if (!element) throw new Error(`Missing ${testID}`);
  return element;
}

const background = (testID: string) => getComputedStyle(byTestId(testID)).backgroundColor;

describe("MenuItem highlight", () => {
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<MenuHarness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
  });

  it("leaves an item plain when it is focused after a pointer interaction", async () => {
    const plain = background("menu-first");
    await userEvent.click(byTestId("opener"));
    act(() => byTestId("menu-first").focus());

    expect(document.activeElement).toBe(byTestId("menu-first"));
    expect(background("menu-first")).toBe(plain);
  });

  it("highlights an item that is focused after a keyboard interaction", async () => {
    const plain = background("menu-second");
    await userEvent.click(byTestId("opener"));
    await userEvent.keyboard("{ArrowDown}");
    act(() => byTestId("menu-second").focus());

    expect(document.activeElement).toBe(byTestId("menu-second"));
    expect(background("menu-second")).not.toBe(plain);
  });
});
