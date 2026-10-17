import { FONT_SIZE, getContentLineHeight, type Theme } from "./theme";
import { getIsElectronMac, isWeb } from "@/constants/platform";

const webSelectableTextStyle = isWeb ? { userSelect: "text" as const } : {};

function contentHeadingSize(contentSize: number, tier: keyof typeof FONT_SIZE): number {
  return Math.round(contentSize * (FONT_SIZE[tier] / FONT_SIZE.base));
}

function contentHeadingLineHeight(contentSize: number, tier: keyof typeof FONT_SIZE): number {
  return Math.round(contentHeadingSize(contentSize, tier) * 1.3);
}

/**
 * Creates comprehensive markdown styles for react-native-markdown-display.
 *
 * Usage:
 *   const markdownStyles = useMemo(() => createMarkdownStyles(theme), [theme]);
 *   <Markdown style={markdownStyles} markdownit={parser}>{content}</Markdown>
 *
 * Always pass `markdownit` from `@/utils/markdown-parser`. Omit it and
 * react-native-markdown-display builds its own parser with `typographer: true`,
 * which rewrites a literal `(c)` as ©.
 */
export function createMarkdownStyles(theme: Theme) {
  const codeFontWeight = theme.codeFontWeight ?? (theme.contentFontWeight ? "400" : null);
  // The macOS dark theme (registered-themes.electron.ts) has a near-white accent, so prose
  // links and inline code take the reference's blue and red instead.
  const isDesktopDark = theme.colors.surface0 === "#2c2c2b";
  const linkColor = isDesktopDark ? "#7aa6e7" : theme.colors.accentBright;
  const paragraph = {
    marginTop: 0,
    marginBottom: theme.spacing[3],
    flexWrap: "wrap" as const,
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    justifyContent: "flex-start" as const,
    flexShrink: 1,
    minWidth: 0,
    width: "100%" as const,
  };

  return {
    // =========================================================================
    // BASE STYLES
    // =========================================================================

    body: {
      ...webSelectableTextStyle,
      color: theme.colors.foreground,
      fontFamily: theme.fontFamily.content,
      fontSize: theme.fontSize.content,
      ...(theme.contentFontWeight ? { fontWeight: theme.contentFontWeight } : {}),
      // Prose line-height scales with the content size, not the
      // code-size-coupled lineHeight.diff token used by code/diff surfaces.
      lineHeight: getContentLineHeight(theme.fontSize.content),
      flexShrink: 1,
      minWidth: 0,
      width: "100%" as const,
    },

    text: {
      ...webSelectableTextStyle,
      fontFamily: theme.fontFamily.content,
      flexShrink: 1,
      minWidth: 0,
      overflowWrap: "anywhere" as const,
    },

    // A paragraph's text run is a flex item; without this, one unbreakable inline
    // (a truncating pull request chip) widens it past the message column.
    textgroup: {
      flexShrink: 1,
      minWidth: 0,
    },

    paragraph,
    paragraphWithoutBottomMargin: { ...paragraph, marginBottom: 0 },

    // =========================================================================
    // HEADINGS
    // =========================================================================

    heading1: {
      ...webSelectableTextStyle,
      fontSize: contentHeadingSize(theme.fontSize.content, "4xl"),
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.foreground,
      marginTop: theme.spacing[6],
      marginBottom: theme.spacing[3],
      lineHeight: contentHeadingLineHeight(theme.fontSize.content, "4xl"),
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingBottom: theme.spacing[2],
    },

    heading2: {
      ...webSelectableTextStyle,
      fontSize: contentHeadingSize(theme.fontSize.content, "3xl"),
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.foreground,
      marginTop: theme.spacing[6],
      marginBottom: theme.spacing[3],
      lineHeight: contentHeadingLineHeight(theme.fontSize.content, "3xl"),
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingBottom: theme.spacing[2],
    },

    heading3: {
      ...webSelectableTextStyle,
      fontSize: contentHeadingSize(theme.fontSize.content, "2xl"),
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.foreground,
      marginTop: theme.spacing[4],
      marginBottom: theme.spacing[2],
      lineHeight: contentHeadingLineHeight(theme.fontSize.content, "2xl"),
    },

    heading4: {
      ...webSelectableTextStyle,
      fontSize: contentHeadingSize(theme.fontSize.content, "xl"),
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.foreground,
      marginTop: theme.spacing[4],
      marginBottom: theme.spacing[2],
      lineHeight: contentHeadingLineHeight(theme.fontSize.content, "xl"),
    },

    heading5: {
      ...webSelectableTextStyle,
      fontSize: contentHeadingSize(theme.fontSize.content, "lg"),
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.foreground,
      marginTop: theme.spacing[3],
      marginBottom: theme.spacing[1],
      lineHeight: contentHeadingLineHeight(theme.fontSize.content, "lg"),
    },

    heading6: {
      ...webSelectableTextStyle,
      fontSize: contentHeadingSize(theme.fontSize.content, "lg"),
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.foregroundMuted,
      marginTop: theme.spacing[3],
      marginBottom: theme.spacing[1],
      lineHeight: contentHeadingLineHeight(theme.fontSize.content, "lg"),
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
    },

    // =========================================================================
    // TEXT FORMATTING
    // =========================================================================

    strong: {
      ...webSelectableTextStyle,
      fontWeight: theme.contentFontWeight
        ? ({ "400": "500", "500": "600", "600": "700" } as const)[theme.contentFontWeight]
        : theme.fontWeight.medium,
    },

    em: {
      ...webSelectableTextStyle,
      fontStyle: "italic" as const,
    },

    s: {
      ...webSelectableTextStyle,
      textDecorationLine: "line-through" as const,
      color: theme.colors.foregroundMuted,
    },

    link: {
      ...webSelectableTextStyle,
      color: linkColor,
      textDecorationLine: "none" as const,
      flexShrink: 1,
      minWidth: 0,
      overflowWrap: "anywhere" as const,
    },

    blocklink: {
      ...webSelectableTextStyle,
      color: linkColor,
      textDecorationLine: "none" as const,
      flexShrink: 1,
      minWidth: 0,
      overflowWrap: "anywhere" as const,
    },

    // =========================================================================
    // CODE
    // =========================================================================

    code_inline: {
      ...webSelectableTextStyle,
      backgroundColor: theme.colors.surface2,
      color: isDesktopDark ? "#de8481" : theme.colors.foreground,
      paddingHorizontal: theme.spacing[1],
      paddingVertical: 2,
      borderRadius: theme.borderRadius.md,
      borderWidth: 0,
      ...(codeFontWeight ? { fontWeight: codeFontWeight } : {}),
      fontFamily: theme.fontFamily.mono,
      fontSize: theme.fontSize.code,
      // The inherited prose line height would enlarge any line containing a chip. File
      // and URL chips are blockified by their tooltip wrapper, so this also sizes them.
      ...(getIsElectronMac()
        ? {
            paddingHorizontal: theme.spacing[1.5],
            paddingVertical: 1,
            lineHeight: Math.round(theme.fontSize.code * 1.2),
          }
        : {}),
    },

    code_block: {
      ...webSelectableTextStyle,
      backgroundColor: theme.colors.surface2,
      color: theme.colors.foreground,
      padding: theme.spacing[3],
      borderRadius: theme.borderRadius.md,
      ...(codeFontWeight ? { fontWeight: codeFontWeight } : {}),
      fontFamily: theme.fontFamily.mono,
      fontSize: theme.fontSize.code,
      marginVertical: theme.spacing[2],
    },

    fence: {
      ...webSelectableTextStyle,
      backgroundColor: theme.colors.surface2,
      color: theme.colors.foreground,
      padding: theme.spacing[3],
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...(codeFontWeight ? { fontWeight: codeFontWeight } : {}),
      fontFamily: theme.fontFamily.mono,
      fontSize: theme.fontSize.code,
      marginVertical: theme.spacing[3],
    },

    pre: {
      marginVertical: theme.spacing[2],
    },

    // =========================================================================
    // TABLES
    // =========================================================================

    table: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      marginVertical: theme.spacing[3],
    },

    thead: {
      backgroundColor: theme.colors.surface2,
    },

    tbody: {},

    th: {
      ...webSelectableTextStyle,
      padding: theme.spacing[2],
      borderBottomWidth: 1,
      borderRightWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.foreground,
      fontSize: theme.fontSize.content,
      textAlign: "left" as const,
    },

    tr: {
      borderBottomWidth: 1,
      borderColor: theme.colors.border,
      flexDirection: "row" as const,
    },

    td: {
      ...webSelectableTextStyle,
      padding: theme.spacing[2],
      borderRightWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.foreground,
      fontSize: theme.fontSize.content,
      flex: 1,
    },

    // =========================================================================
    // LISTS
    // =========================================================================

    bullet_list: {
      paddingLeft: 0,
      width: "100%" as const,
    },

    ordered_list: {
      paddingLeft: 0,
      width: "100%" as const,
    },

    list_item: {
      marginBottom: getIsElectronMac() ? 0 : theme.spacing[1],
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      flexShrink: 1,
    },

    bullet_list_content: {
      flex: 1,
      flexShrink: 1,
    },

    ordered_list_content: {
      flex: 1,
      flexShrink: 1,
    },

    bullet_list_icon: {
      ...webSelectableTextStyle,
      color: theme.colors.foregroundMuted,
      fontFamily: theme.fontFamily.content,
      marginRight: 4,
      fontSize: theme.fontSize.content,
      lineHeight: getContentLineHeight(theme.fontSize.content),
      // The reference uses a larger, full-contrast dot with the ordered-list text indent.
      ...(getIsElectronMac()
        ? {
            color: theme.colors.foreground,
            fontSize: Math.round(theme.fontSize.content * 1.4),
            minWidth: 12,
          }
        : {}),
    },

    ordered_list_icon: {
      ...webSelectableTextStyle,
      color: getIsElectronMac() ? theme.colors.foreground : theme.colors.foregroundMuted,
      fontFamily: theme.fontFamily.content,
      marginRight: 4,
      fontSize: theme.fontSize.content,
      fontWeight: theme.contentFontWeight ?? "normal",
      lineHeight: getContentLineHeight(theme.fontSize.content),
      minWidth: 12,
    },

    // =========================================================================
    // BLOCKQUOTE
    // =========================================================================

    blockquote: {
      backgroundColor: theme.colors.surface1,
      color: `${theme.colors.foreground}cc`,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.surface2,
      paddingHorizontal: theme.spacing[4],
      paddingTop: theme.spacing[3],
      paddingBottom: 0,
      marginVertical: theme.spacing[3],
      borderRadius: theme.borderRadius.md,
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
      ...(getIsElectronMac()
        ? {
            backgroundColor: "transparent",
            borderLeftWidth: 3,
            borderLeftColor: isDesktopDark ? "#5d5d5a" : theme.colors.foregroundExtraMuted,
            paddingTop: 0,
            borderRadius: 0,
          }
        : {}),
    },

    // =========================================================================
    // HORIZONTAL RULE
    // =========================================================================

    hr: {
      backgroundColor: theme.colors.border,
      height: 1,
      marginVertical: 10,
    },

    // =========================================================================
    // IMAGES
    // =========================================================================

    image: {
      borderRadius: theme.borderRadius.md,
      marginVertical: theme.spacing[2],
    },

    // =========================================================================
    // BREAKS
    // =========================================================================

    hardbreak: {
      height: theme.spacing[2],
    },

    softbreak: {},
  };
}

/**
 * Creates a smaller variant of markdown styles for compact UI elements
 * like thought bubbles, tooltips, or side panels.
 */
export function createCompactMarkdownStyles(theme: Theme) {
  const baseStyles = createMarkdownStyles(theme);

  return {
    ...baseStyles,

    body: {
      ...baseStyles.body,
      fontSize: theme.fontSize.content,
      lineHeight: getContentLineHeight(theme.fontSize.content),
    },

    heading1: {
      ...baseStyles.heading1,
      fontSize: contentHeadingSize(theme.fontSize.content, "2xl"),
      marginTop: theme.spacing[4],
      marginBottom: theme.spacing[2],
      lineHeight: contentHeadingLineHeight(theme.fontSize.content, "2xl"),
    },

    heading2: {
      ...baseStyles.heading2,
      fontSize: contentHeadingSize(theme.fontSize.content, "xl"),
      marginTop: theme.spacing[3],
      marginBottom: theme.spacing[2],
      lineHeight: contentHeadingLineHeight(theme.fontSize.content, "xl"),
    },

    heading3: {
      ...baseStyles.heading3,
      fontSize: contentHeadingSize(theme.fontSize.content, "lg"),
      marginTop: theme.spacing[3],
      marginBottom: theme.spacing[1],
      lineHeight: contentHeadingLineHeight(theme.fontSize.content, "lg"),
    },

    paragraph: {
      ...baseStyles.paragraph,
      marginBottom: theme.spacing[2],
    },

    code_inline: {
      ...baseStyles.code_inline,
      fontSize: theme.fontSize.code,
    },

    code_block: {
      ...baseStyles.code_block,
      fontSize: theme.fontSize.code,
      padding: theme.spacing[2],
    },

    fence: {
      ...baseStyles.fence,
      fontSize: theme.fontSize.code,
      padding: theme.spacing[2],
    },
  };
}
