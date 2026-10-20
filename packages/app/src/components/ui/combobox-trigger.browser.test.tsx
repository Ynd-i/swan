import React, { act } from "react";
import { Pressable, Text } from "react-native";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { ComboboxTrigger } from "./combobox-trigger";

function byTestId(testID: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-testid="${testID}"]`);
  if (!element) throw new Error(`Missing ${testID}`);
  return element;
}

// The New chat project chip puts its remove button inside the trigger.
describe("ComboboxTrigger with a nested button", () => {
  let root: Root;
  const openPicker = vi.fn();
  const clearProject = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("React", React);
    openPicker.mockClear();
    clearProject.mockClear();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <ComboboxTrigger testID="trigger" onPress={openPicker}>
          <Pressable testID="clear" onPress={clearProject} accessibilityRole="button">
            <Text>x</Text>
          </Pressable>
          <Text testID="label">Project</Text>
        </ComboboxTrigger>,
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
  });

  it("runs only the nested button's press", async () => {
    await userEvent.click(byTestId("clear"));

    expect(clearProject).toHaveBeenCalledTimes(1);
    expect(openPicker).not.toHaveBeenCalled();
  });

  it("still opens from the rest of the trigger", async () => {
    await userEvent.click(byTestId("label"));

    expect(openPicker).toHaveBeenCalledTimes(1);
    expect(clearProject).not.toHaveBeenCalled();
  });
});
