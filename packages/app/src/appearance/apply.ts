import { UnistylesRuntime } from "react-native-unistyles";
import { getIsElectronMac } from "@/constants/platform";
import { resolveSyntaxColors, type SyntaxThemeId } from "./syntax-theme";
import { REGISTERED_THEME_TINTS } from "@/styles/registered-themes";
import {
  buildDarkSemanticColors,
  buildLightSemanticColors,
  DEFAULT_UI_FONT_STACK,
  DEFAULT_MONO_FONT_STACK,
  FONT_SIZE,
  FONT_WEIGHT,
  REGISTERED_THEMES,
  THEME_TO_UNISTYLES,
  type Theme,
  type ThemeColorSettings,
  type ThemeName,
  type ThemeTint,
  withColorOverrides,
} from "@/styles/theme";
import { applyRootFonts } from "./apply-root-font";

const ALL_THEME_KEYS = Object.keys(REGISTERED_THEMES) as (keyof typeof REGISTERED_THEMES)[];
const BUILT_IN_THEME_NAMES = new Map(
  (Object.entries(THEME_TO_UNISTYLES) as [ThemeName, string][]).map(([name, key]) => [key, name]),
);

export interface AppearanceInput {
  uiFontFamily: string; // "" -> default stack
  contentFontFamily: string; // "" -> selected UI font
  monoFontFamily: string; // "" -> default stack
  uiBaseFontSize: number; // already clamped
  contentFontSize: number; // already clamped
  codeFontSize: number; // already clamped
  codeFontWeight: Theme["codeFontWeight"];
  contentFontWeight: Theme["contentFontWeight"];
  uiFontWeight: Theme["uiFontWeight"];
  contentMaxWidth: number; // already clamped, default resolved
  syntaxTheme: SyntaxThemeId;
  themeColors: ThemeColorSettings;
}

/**
 * Built-in themes rebuild their semantic colors from the authored tint plus the user's
 * colors, so clearing a color restores the original. Contributed themes keep theirs.
 */
function resolveTint(key: string, themeColors: ThemeColorSettings): ThemeTint | null {
  const name = BUILT_IN_THEME_NAMES.get(key);
  if (!name) return null;
  const tint = REGISTERED_THEME_TINTS[name];
  const overrides = themeColors[name] ?? {};
  return tint.colorScheme === "light"
    ? { colorScheme: "light", config: withColorOverrides(tint.config, overrides) }
    : { colorScheme: "dark", config: withColorOverrides(tint.config, overrides) };
}

/**
 * Build the font-size ramp from the canonical `FONT_SIZE` ramp, scaled
 * proportionally from the requested base size so the type hierarchy is preserved
 * sizes. Deriving from the authored ramp — NOT the live (possibly already-scaled)
 * theme — makes `applyAppearance` idempotent: repeated applies never compound, and a
 * code-size change (base size unchanged) leaves the UI ramp at its authored values.
 * `code` is set absolutely to `codeSize`, never scaled by the UI factor — a separate
 * control on a separate semantic axis (mono/diff text).
 */
function scaleFontSize(
  uiBaseSize: number,
  contentSize: number,
  codeSize: number,
): Theme["fontSize"] {
  const r = uiBaseSize / FONT_SIZE.base;
  return {
    sm: Math.round(FONT_SIZE.sm * r),
    base: Math.round(FONT_SIZE.base * r),
    lg: Math.round(FONT_SIZE.lg * r),
    xl: Math.round(FONT_SIZE.xl * r),
    "2xl": Math.round(FONT_SIZE["2xl"] * r),
    "3xl": Math.round(FONT_SIZE["3xl"] * r),
    "4xl": Math.round(FONT_SIZE["4xl"] * r),
    content: contentSize, // absolute, NOT scaled
    code: codeSize, // absolute, NOT scaled
  };
}

/**
 * Patch every registered Unistyles theme with the user's appearance choices.
 * All keys in `ALL_THEME_KEYS` are patched because the active theme can change
 * and adaptive mode can flip light/dark — patching all keys keeps the active key
 * always current and makes ordering vs `setTheme`/`setAdaptiveThemes` irrelevant.
 *
 * The updater patches the font ramp, content width, syntax palette, and the
 * built-in themes' semantic colors.
 * `updateTheme` replaces the stored theme rather than merging, so we spread
 * `...t` first.
 */
export function applyAppearance(input: AppearanceInput): void {
  const ui = input.uiFontFamily.trim() || DEFAULT_UI_FONT_STACK;
  const content = input.contentFontFamily.trim() || ui;
  const mono = input.monoFontFamily.trim() || DEFAULT_MONO_FONT_STACK;
  const codeFontWeight = getIsElectronMac() ? input.codeFontWeight : null;
  const contentFontWeight = getIsElectronMac() ? input.contentFontWeight : null;
  const uiFontWeight = getIsElectronMac() ? input.uiFontWeight : null;
  const diffLineHeight = Math.round(input.codeFontSize * 1.5); // couple to code size
  const activeTheme = UnistylesRuntime.themeName;
  // Unistyles web emits after each registry patch. Updating the mounted theme
  // first ensures subscribers receive its new numeric tokens in this render;
  // updating it last makes Pure black appear one committed value behind.
  const themeKeys = activeTheme
    ? [activeTheme, ...ALL_THEME_KEYS.filter((key) => key !== activeTheme)]
    : ALL_THEME_KEYS;

  for (const key of themeKeys) {
    UnistylesRuntime.updateTheme(key, (t) => {
      const tint = resolveTint(key, input.themeColors);
      const fontFamily = { ui, content, mono };
      const fontSize = scaleFontSize(
        input.uiBaseFontSize,
        input.contentFontSize,
        input.codeFontSize,
      );
      const fontWeight = { ...FONT_WEIGHT, normal: uiFontWeight ?? FONT_WEIGHT.normal };
      const lineHeight = { ...t.lineHeight, diff: diffLineHeight };
      if (t.colorScheme === "light") {
        const semanticColors =
          tint?.colorScheme === "light" ? buildLightSemanticColors(tint.config) : null;
        return {
          ...t,
          fontFamily,
          codeFontWeight,
          contentFontWeight,
          uiFontWeight,
          fontWeight,
          fontSize,
          lineHeight,
          contentMaxWidth: input.contentMaxWidth,
          colors: {
            ...t.colors,
            ...semanticColors,
            syntax: resolveSyntaxColors(input.syntaxTheme, t.colorScheme),
          },
        };
      }
      const semanticColors =
        tint?.colorScheme === "dark" ? buildDarkSemanticColors(tint.config) : null;
      return {
        ...t,
        fontFamily,
        codeFontWeight,
        contentFontWeight,
        uiFontWeight,
        fontWeight,
        fontSize,
        lineHeight,
        contentMaxWidth: input.contentMaxWidth,
        colors: {
          ...t.colors,
          ...semanticColors,
          syntax: resolveSyntaxColors(input.syntaxTheme, t.colorScheme),
        },
      };
    });
  }

  // Web: RN-web stamps a default font on each text element, so apply UI/content
  // stacks through the scoped root rules as well as the theme. No-op on native.
  applyRootFonts(ui, content, uiFontWeight);
}
