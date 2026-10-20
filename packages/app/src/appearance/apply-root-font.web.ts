import type { FontWeightSetting } from "@/styles/theme";

// Apply the interface (UI) and content fonts app-wide on web.
//
// react-native-web stamps a hardcoded default font onto every text element, so a
// plain `body { font-family }` never cascades in — the element already has its own
// font. High-specificity rules point unmarked text at the UI variable and
// `data-pcontent` text at the content variable. Both beat RN-web and Unistyles
// classes without relying on stylesheet order. Code/diff/terminal surfaces carry
// `data-pmono`; they and their subtrees are excluded from both rules.
const STYLE_ID = "paseo-ui-font";
const ROOTS = ":is(#root, #overlay-root)";
const NOT_MONO = ":not([data-pmono]):not([data-pmono] *)";
const UI_RULE = `${ROOTS} *${NOT_MONO}:not([data-pcontent]):not([data-pcontent] *){font-family:var(--paseo-ui-font);}`;
const CONTENT_RULE = `${ROOTS} [data-pcontent]${NOT_MONO},${ROOTS} [data-pcontent]${NOT_MONO} *${NOT_MONO}{font-family:var(--paseo-content-font);}`;
const ROLE_WEIGHT_RULE = `${ROOTS} :is([data-pcontent],[data-pmono]){--paseo-default-text-weight:normal;}`;
const RULE = `${UI_RULE}${CONTENT_RULE}${ROLE_WEIGHT_RULE}`;

function sanitizeFontStack(fontStack: string): string {
  return fontStack
    .replace(/[<>{}();]/g, "")
    .replace(/[\r\n]/g, " ")
    .trim();
}

export function applyRootFonts(
  uiFontStack: string,
  contentFontStack: string,
  uiFontWeight: FontWeightSetting = null,
): void {
  if (typeof document === "undefined") return;
  const ui = sanitizeFontStack(uiFontStack);
  if (ui.length === 0) return;
  const content = sanitizeFontStack(contentFontStack) || ui;

  document.documentElement.style.setProperty("--paseo-ui-font", ui);
  document.documentElement.style.setProperty("--paseo-content-font", content);
  document.documentElement.style.setProperty(
    "--paseo-default-text-weight",
    uiFontWeight ?? "normal",
  );

  // RN-web's Text and TextInput resets use a font shorthand that also resets weight.
  // Update that default rule in place, at its original cascade priority: authored
  // Text styles still win, and nested Text keeps inheriting its parent emphasis.
  const nativeSheet = document.getElementById("react-native-stylesheet") as HTMLStyleElement | null;
  for (const rule of Array.from(nativeSheet?.sheet?.cssRules ?? [])) {
    if (rule.type !== 1) continue;
    const textRule = rule as CSSStyleRule;
    // Production class names omit the readable "text" segment. Match the
    // root reset's declarations, not its development-only name or hash.
    if (
      textRule.selectorText.startsWith(".css-") &&
      textRule.style.fontSize === "14px" &&
      textRule.style.fontWeight === "normal" &&
      textRule.style.fontFamily.length > 0 &&
      textRule.style.fontFamily !== "inherit"
    ) {
      textRule.style.fontWeight = "var(--paseo-default-text-weight, normal)";
    }
  }

  // Keep one rule element and refresh its static selectors during hot reload.
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  if (style.textContent !== RULE) style.textContent = RULE;
}
