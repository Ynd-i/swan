import {
  isSyntaxThemeId as isSharedSyntaxThemeId,
  resolveSyntaxColors as resolveSharedSyntaxColors,
  SYNTAX_THEME_OPTIONS as SHARED_SYNTAX_THEME_OPTIONS,
  type SyntaxThemeId as SharedSyntaxThemeId,
  type SyntaxColors,
} from "@getpaseo/highlight";
import { getIsElectronMac } from "@/constants/platform";

export type SyntaxThemeId = SharedSyntaxThemeId | "codex";
export interface SyntaxThemeOption {
  id: SyntaxThemeId;
  label: string;
}

export const SYNTAX_THEME_OPTIONS: readonly SyntaxThemeOption[] = [
  { id: "codex", label: "Codex" },
  ...SHARED_SYNTAX_THEME_OPTIONS,
];

export function isSyntaxThemeId(value: string): value is SyntaxThemeId {
  return value === "codex" || isSharedSyntaxThemeId(value);
}

export function getDefaultSyntaxTheme(): SyntaxThemeId {
  return getIsElectronMac() ? "codex" : "one";
}

export function resolveSyntaxColors(
  id: SyntaxThemeId,
  colorScheme: "light" | "dark",
): SyntaxColors {
  if (id !== "codex") return resolveSharedSyntaxColors(id, colorScheme);
  const dark = colorScheme === "dark";
  const base = dark ? "#f0f0ee" : "#202020";
  const keyword = dark ? "#e66845" : "#c43c17";
  const string = dark ? "#5ac461" : "#00842b";
  return {
    ...resolveSharedSyntaxColors("github", colorScheme),
    keyword,
    string,
    variable: base,
    function: base,
    definition: base,
    property: base,
    operator: base,
    punctuation: base,
  };
}
