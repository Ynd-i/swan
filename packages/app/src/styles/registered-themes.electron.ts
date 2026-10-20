import { getIsElectronMac } from "@/constants/platform";
import {
  buildDarkSemanticColors,
  buildDarkTheme,
  REGISTERED_THEMES as upstreamThemes,
  THEME_TINTS as upstreamTints,
  type ThemeTint,
} from "./theme";

// Only the default macOS dark theme follows the Claude desktop reference: a near-black
// sidebar beside a slightly lighter conversation surface.
// Keep every other built-in theme and contributed theme under upstream ownership.
const desktopDarkTint = {
  colorScheme: "dark",
  config: {
    surface0: "#151515",
    surface1: "#1d1d1d",
    surface2: "#262626",
    surface3: "#343434",
    surface4: "#484848",
    surfaceDiffEmpty: "#1a1a1a",
    surfaceSidebar: "#111111",
    surfaceWorkspace: "#151515",
    foreground: "#f0efec",
    foregroundMuted: "#c3c2b7",
    foregroundExtraMuted: "#898781",
    border: "#292929",
    borderAccent: "#343434",
    accent: "#f0efec",
    accentBright: "#ffffff",
    accentForeground: "#151515",
    success: upstreamThemes.dark.colors.success,
    // The near-white accent cannot mark prose links and inline code.
    link: "#7aa6e7",
    inlineCode: "#de8481",
    destructive: upstreamThemes.dark.colors.destructive,
    terminalBlack: "#151515",
    terminalBrightBlack: "#6b6b69",
  },
} as const satisfies ThemeTint;

const desktopDark = buildDarkTheme(buildDarkSemanticColors(desktopDarkTint.config));

export const REGISTERED_THEME_TINTS = getIsElectronMac()
  ? { ...upstreamTints, dark: desktopDarkTint }
  : upstreamTints;

export const REGISTERED_THEMES = getIsElectronMac()
  ? { ...upstreamThemes, dark: desktopDark }
  : upstreamThemes;
