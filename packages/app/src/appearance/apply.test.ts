import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as platform from "@/constants/platform";
import { darkHighlightColors, resolveSyntaxColors, SYNTAX_THEME_IDS } from "@getpaseo/highlight";
import { resolveSyntaxColors as resolveAppSyntaxColors } from "./syntax-theme";
import { DEFAULT_UI_FONT_STACK, PLUGIN_THEME_NAMES, REGISTERED_THEMES } from "@/styles/theme";
import { applyAppearance, type AppearanceInput } from "./apply";

// Override the global react-native-unistyles mock (vitest.setup.ts) so that
// UnistylesRuntime.updateTheme is a spy that records (themeName, updater) calls.
const { runtime, updateTheme } = vi.hoisted(() => {
  const updateThemeSpy = vi.fn();
  return {
    runtime: { themeName: undefined as string | undefined, updateTheme: updateThemeSpy },
    updateTheme: updateThemeSpy,
  };
});
vi.mock("react-native-unistyles", () => ({ UnistylesRuntime: runtime }));

const ALL_THEME_KEYS = Object.keys(REGISTERED_THEMES);

// The signature of the updater passed to UnistylesRuntime.updateTheme.
type ThemeUpdater = (theme: FakeTheme) => FakeTheme;

// The subset of the theme shape the updater reads / spreads. The real Theme type
// is a frozen `as const` literal; the updater only touches these fields. Casting a
// fake of this shape through `unknown` to ThemeUpdater's param is test-only.
interface FakeTheme {
  colorScheme: "light" | "dark";
  fontFamily: { ui: string; content: string; mono: string };
  fontSize: {
    code: number;
    content: number;
    sm: number;
    base: number;
    lg: number;
    xl: number;
    "2xl": number;
    "3xl": number;
    "4xl": number;
  };
  lineHeight: { diff: number };
  contentMaxWidth: number;
  colors: { foreground: string; syntax: Record<string, string> } & Record<string, unknown>;
}

function makeFakeTheme(): FakeTheme {
  return {
    colorScheme: "dark",
    fontFamily: { ui: "seed-ui-stack", content: "seed-content-stack", mono: "seed-mono-stack" },
    fontSize: {
      code: 12,
      content: 15,
      sm: 12,
      base: 14,
      lg: 16,
      xl: 18,
      "2xl": 20,
      "3xl": 22,
      "4xl": 26,
    },
    lineHeight: { diff: 22 },
    contentMaxWidth: 820,
    colors: { foreground: "#fff", syntax: {} },
  };
}

function makeInput(overrides: Partial<AppearanceInput> = {}): AppearanceInput {
  return {
    uiFontFamily: "",
    contentFontFamily: "",
    monoFontFamily: "",
    uiBaseFontSize: 14,
    contentFontSize: 15,
    codeFontSize: 12,
    codeFontWeight: null,
    contentFontWeight: null,
    uiFontWeight: null,
    contentMaxWidth: 820,
    syntaxTheme: "one",
    themeColors: {},
    ...overrides,
  };
}

// Run a single captured updater (default the first) against a fresh fake theme.
function runCapturedUpdater(call = 0, theme = makeFakeTheme()): FakeTheme {
  const updater = updateTheme.mock.calls[call]?.[1] as unknown as ThemeUpdater;
  return updater(theme);
}

function runUpdaterFor(key: string, theme = makeFakeTheme()): FakeTheme {
  return runCapturedUpdater(
    updateTheme.mock.calls.findIndex((call) => call[0] === key),
    theme,
  );
}

describe("applyAppearance", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    updateTheme.mockClear();
    runtime.themeName = undefined;
  });

  it("patches every registered Unistyles theme exactly once", () => {
    applyAppearance(makeInput());

    expect(updateTheme).toHaveBeenCalledTimes(ALL_THEME_KEYS.length);
    expect(updateTheme.mock.calls.map((call) => call[0])).toEqual([...ALL_THEME_KEYS]);
  });

  it.each(["codeFontWeight", "contentFontWeight", "uiFontWeight"] as const)(
    "applies %s only on Mac without changing other typography or plugin colors",
    (field) => {
      vi.spyOn(platform, "getIsElectronMac").mockReturnValue(true);
      for (const codeFontWeight of ["400", "500", "600", null] as const) {
        updateTheme.mockClear();
        applyAppearance(makeInput({ [field]: codeFontWeight }));
        for (let index = 0; index < ALL_THEME_KEYS.length; index++) {
          const updated = runCapturedUpdater(index);
          expect(updated).toMatchObject({ [field]: codeFontWeight });
          expect(updated.fontSize.content).toBe(15);
        }
        for (const key of Object.values(PLUGIN_THEME_NAMES)) {
          expect(runUpdaterFor(key).colors.foreground).toBe("#fff");
        }
      }
      vi.spyOn(platform, "getIsElectronMac").mockReturnValue(false);
      updateTheme.mockClear();
      applyAppearance(makeInput({ [field]: "600" }));
      expect(runCapturedUpdater()).toMatchObject({ [field]: null });
    },
  );

  it("rebuilds a built-in theme from its palette and the user's colors", () => {
    applyAppearance(
      makeInput({
        themeColors: { dark: { main: "#101010", sidebar: "#000000", accent: "#ffffff" } },
      }),
    );

    const { colors } = runUpdaterFor("dark");
    expect(colors).toMatchObject({
      surface0: "#101010",
      surfaceWorkspace: "#101010",
      background: "#101010",
      surfaceSidebar: "#000000",
      accent: "#ffffff",
      accentForeground: "#151515",
      surface1: REGISTERED_THEMES.dark.colors.surface1,
    });
    expect(runUpdaterFor("darkZinc").colors).toMatchObject({
      surface0: REGISTERED_THEMES.darkZinc.colors.surface0,
    });
  });

  it.each([
    ["#d97757", "#ffffff"],
    ["#3b82f6", "#ffffff"],
    ["#ffcc00", "#151515"],
  ])("gives accent %s readable %s text", (accent, accentForeground) => {
    applyAppearance(makeInput({ themeColors: { dark: { accent } } }));

    expect(runUpdaterFor("dark").colors.accentForeground).toBe(accentForeground);
  });

  it("restores the authored color once the user's color is cleared", () => {
    applyAppearance(makeInput({ themeColors: {} }));

    const previouslyCustomized = makeFakeTheme();
    previouslyCustomized.colors.surfaceSidebar = "#000000";
    expect(runUpdaterFor("dark", previouslyCustomized).colors.surfaceSidebar).toBe(
      REGISTERED_THEMES.dark.colors.surfaceSidebar,
    );
  });

  it("patches the active theme before inactive registry entries", () => {
    runtime.themeName = "darkPureBlack";

    applyAppearance(makeInput({ uiBaseFontSize: 15 }));

    expect(updateTheme.mock.calls.map((call) => call[0])).toEqual([
      "darkPureBlack",
      ...ALL_THEME_KEYS.filter((key) => key !== "darkPureBlack"),
    ]);
  });

  it("patches the content max width into the theme", () => {
    applyAppearance(makeInput({ contentMaxWidth: 1600 }));

    expect(runCapturedUpdater().contentMaxWidth).toBe(1600);
  });

  it("resolves an empty UI font family to the default stack", () => {
    applyAppearance(makeInput({ uiFontFamily: "" }));

    expect(runCapturedUpdater().fontFamily.ui).toBe(DEFAULT_UI_FONT_STACK);
  });

  it("passes a non-empty UI font family through trimmed", () => {
    applyAppearance(makeInput({ uiFontFamily: "  Menlo  " }));

    expect(runCapturedUpdater().fontFamily.ui).toBe("Menlo");
  });

  it("applies the content font independently and falls back to the selected UI font", () => {
    applyAppearance(
      makeInput({
        uiFontFamily: "  Avenir  ",
        contentFontFamily: "  Charter  ",
        monoFontFamily: "  Menlo  ",
      }),
    );
    expect(runCapturedUpdater().fontFamily).toEqual({
      ui: "Avenir",
      content: "Charter",
      mono: "Menlo",
    });

    updateTheme.mockClear();
    applyAppearance(
      makeInput({
        uiFontFamily: "Avenir",
        contentFontFamily: "",
        monoFontFamily: "Menlo",
      }),
    );
    expect(runCapturedUpdater().fontFamily).toEqual({
      ui: "Avenir",
      content: "Avenir",
      mono: "Menlo",
    });
  });

  it("scales the whole UI ramp proportionally while preserving ratios", () => {
    applyAppearance(makeInput({ uiBaseFontSize: 15 }));

    const { fontSize } = runCapturedUpdater();
    expect(fontSize.base).toBe(15);
    expect(fontSize.sm).toBe(13);
    expect(fontSize.lg).toBe(17);
    expect(fontSize.xl).toBe(19);
    expect(fontSize["4xl"]).toBe(28);
  });

  it("derives the UI ramp from the canonical sizes, not the live theme (no compounding)", () => {
    applyAppearance(makeInput({ uiBaseFontSize: 15 }));

    // Simulate a theme whose fontSize was already scaled by a prior apply; the
    // updater must ignore it and rebuild from the authored FONT_SIZE ramp.
    const updater = updateTheme.mock.calls[0]?.[1] as unknown as ThemeUpdater;
    const alreadyScaled = makeFakeTheme();
    alreadyScaled.fontSize = {
      code: 4,
      content: 4,
      sm: 4,
      base: 4,
      lg: 4,
      xl: 4,
      "2xl": 4,
      "3xl": 4,
      "4xl": 4,
    };

    const { fontSize } = updater(alreadyScaled);
    expect(fontSize.base).toBe(15); // rebuilt from FONT_SIZE, not the live value of 4
    expect(fontSize.lg).toBe(17);
  });

  it("leaves the UI ramp at authored sizes when only the code size changes", () => {
    applyAppearance(makeInput({ uiBaseFontSize: 14, codeFontSize: 10 }));

    const { fontSize } = runCapturedUpdater();
    expect(fontSize.base).toBe(14);
    expect(fontSize.lg).toBe(16);
    expect(fontSize.sm).toBe(12);
    expect(fontSize.code).toBe(10);
  });

  it("sets content size independently of the interface and code sizes", () => {
    applyAppearance(makeInput({ uiBaseFontSize: 14, contentFontSize: 19, codeFontSize: 10 }));

    const { fontSize } = runCapturedUpdater();
    expect(fontSize.base).toBe(14);
    expect(fontSize.content).toBe(19);
    expect(fontSize.code).toBe(10);
  });

  it("sets fontSize.code to codeFontSize regardless of the UI font size", () => {
    applyAppearance(makeInput({ uiBaseFontSize: 14, codeFontSize: 18 }));

    expect(runCapturedUpdater().fontSize.code).toBe(18);
  });

  it("couples lineHeight.diff to the code font size", () => {
    applyAppearance(makeInput({ codeFontSize: 18 }));

    expect(runCapturedUpdater().lineHeight.diff).toBe(Math.round(18 * 1.5)); // 27
  });

  it("swaps colors.syntax to the resolved palette for the named theme", () => {
    applyAppearance(makeInput({ syntaxTheme: "dracula" }));

    const { colors } = runCapturedUpdater();
    expect(colors.syntax).toEqual(resolveSyntaxColors("dracula", "dark"));
  });

  it("resolves a syntax theme using the theme's own color scheme", () => {
    applyAppearance(makeInput({ syntaxTheme: "github" }));

    // makeFakeTheme().colorScheme === "dark" -> github resolves to the dark palette.
    expect(runCapturedUpdater().colors.syntax).toEqual(darkHighlightColors);
    expect(runCapturedUpdater().colors.syntax).toEqual(resolveSyntaxColors("github", "dark"));
  });

  it.each(SYNTAX_THEME_IDS)("preserves the shared %s preset in both color schemes", (id) => {
    for (const mode of ["light", "dark"] as const) {
      expect(resolveAppSyntaxColors(id, mode)).toEqual(resolveSyntaxColors(id, mode));
    }
  });

  it("applies Codex colors in both modes without replacing custom font choices", () => {
    applyAppearance(
      makeInput({ syntaxTheme: "codex", monoFontFamily: "Courier New", codeFontSize: 16 }),
    );
    for (const colorScheme of ["light", "dark"] as const) {
      const result = runUpdaterFor(PLUGIN_THEME_NAMES[colorScheme], {
        ...makeFakeTheme(),
        colorScheme,
      });
      expect(result.colors.syntax).toEqual(resolveAppSyntaxColors("codex", colorScheme));
      expect(result.colors.foreground).toBe("#fff");
      expect(result.fontFamily.mono).toBe("Courier New");
      expect(result.fontSize.code).toBe(16);
    }
    expect(resolveAppSyntaxColors("codex", "dark").keyword).not.toBe(
      resolveAppSyntaxColors("codex", "light").keyword,
    );
  });

  it("keeps unsampled Codex roles on the shared GitHub palette", () => {
    for (const mode of ["light", "dark"] as const) {
      const palette = resolveAppSyntaxColors("codex", mode);
      const base = resolveSyntaxColors("github", mode);
      for (const role of [
        "attribute",
        "class",
        "type",
        "heading",
        "tag",
        "regexp",
        "link",
        "comment",
        "number",
        "literal",
        "escape",
        "meta",
      ] as const) {
        expect(palette[role]).toBe(base[role]);
      }
    }
  });
});
