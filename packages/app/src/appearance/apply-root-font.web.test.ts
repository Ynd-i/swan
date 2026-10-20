import { afterEach, describe, expect, it, vi } from "vitest";
import { applyRootFonts } from "./apply-root-font.web";

describe("applyRootFonts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("changes only the root Text reset at its original priority in development and production", () => {
    const makeRule = (selectorText: string, fontFamily = "System", display = "inline") => ({
      type: 1,
      selectorText,
      style: {
        fontFamily,
        display,
        fontSize: fontFamily === "inherit" ? "inherit" : "14px",
        whiteSpace: "pre-wrap",
        fontWeight: "normal",
      },
    });
    const dev = makeRule(".css-text-development");
    const prod = makeRule(".css-minified");
    const nested = makeRule(".css-textHasAncestor", "inherit");
    const authored = makeRule(".css-authored-heading");
    authored.style.fontWeight = "700";
    const input = makeRule(".css-textinput", "System", "inline-block");
    const variables = vi.fn();
    const style = { id: "paseo-ui-font", textContent: "" };
    const sheet = { sheet: { cssRules: [dev, prod, nested, authored, input] } };
    vi.stubGlobal("document", {
      documentElement: { style: { setProperty: variables } },
      getElementById: (id: string) => (id === "react-native-stylesheet" ? sheet : style),
    });
    applyRootFonts("Inter", "Georgia", "600");
    for (const rule of [dev, prod, input])
      expect(rule.style.fontWeight).toBe("var(--paseo-default-text-weight, normal)");
    expect(nested.style.fontWeight).toBe("normal");
    expect(authored.style.fontWeight).toBe("700");
    expect(variables).toHaveBeenCalledWith("--paseo-default-text-weight", "600");
    expect(style.textContent).not.toContain("{font-weight:");
    expect(style.textContent).toContain("[data-pcontent],[data-pmono]");
    applyRootFonts("Inter", "Georgia", null);
    expect(variables).toHaveBeenLastCalledWith("--paseo-default-text-weight", "normal");
  });

  it("scopes the UI rule away from content and monospace surfaces", () => {
    const variables = vi.fn();
    const appendChild = vi.fn();
    const style = { id: "", textContent: null as string | null };
    const documentMock = {
      documentElement: { style: { setProperty: variables } },
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => style),
      head: { appendChild },
    } as unknown as Document;
    vi.stubGlobal("document", documentMock);

    applyRootFonts("Inter", "Georgia");

    expect(variables).toHaveBeenNthCalledWith(1, "--paseo-ui-font", "Inter");
    expect(variables).toHaveBeenNthCalledWith(2, "--paseo-content-font", "Georgia");
    expect(style.textContent).toContain(":not([data-pcontent]):not([data-pcontent] *)");
    expect(style.textContent).toContain("[data-pcontent]:not([data-pmono]):not([data-pmono] *)");
    expect(appendChild).toHaveBeenCalledWith(style);
  });
});
