import type { MarkdownStyle } from "react-native-enriched-markdown";
import { getContentLineHeight, type Theme } from "@/styles/theme";
import { getIsElectronMac, isWeb } from "@/constants/platform";

// iOS Safari needs the prefix to override the gesture host's selection suppression.
const WEB_CONTAINER = { userSelect: "text", WebkitUserSelect: "text" } as const;

export function createMarkdownStyles(
  theme: Theme,
  { compact = false, blockGap }: { compact?: boolean; blockGap: number },
): { markdownStyle: MarkdownStyle; selectionColor: string; containerStyle?: typeof WEB_CONTAINER } {
  const fontSize = compact ? theme.fontSize.base : theme.fontSize.content;
  // Every block is followed by the same gap; the library drops it after the last block.
  const block = { marginTop: 0, marginBottom: blockGap };
  const isMac = getIsElectronMac();
  const paragraph = {
    fontSize,
    fontFamily: theme.fontFamily.content,
    ...(theme.contentFontWeight ? { fontWeight: theme.contentFontWeight } : {}),
    lineHeight: getContentLineHeight(fontSize),
    color: theme.colors.foreground,
    ...block,
  };
  const heading = (scale: number) => ({
    ...paragraph,
    fontSize: Math.round(fontSize * scale),
    lineHeight: Math.round(fontSize * scale * 1.3),
    fontWeight: "bold",
  });
  return {
    containerStyle: isWeb ? WEB_CONTAINER : undefined,
    selectionColor: theme.colors.terminal.selectionBackground,
    markdownStyle: {
      paragraph,
      h1: heading(1.6),
      h2: heading(1.4),
      h3: heading(1.2),
      h4: heading(1.1),
      h5: heading(1),
      h6: { ...heading(1), color: theme.colors.foregroundMuted },
      list: {
        ...paragraph,
        bulletColor: isMac ? theme.colors.foreground : theme.colors.foregroundMuted,
        markerColor: isMac ? theme.colors.foreground : theme.colors.foregroundMuted,
        gapWidth: 7,
        itemSpacing: 4,
        marginLeft: 20,
      },
      blockquote: {
        ...paragraph,
        color: `${theme.colors.foreground}cc`,
        backgroundColor: theme.colors.surface1,
        borderColor: theme.colors.surface2,
        borderWidth: 3,
        padding: 12,
        gapWidth: 8,
        // The macOS reference draws a bare left rule with no quote surface.
        ...(isMac
          ? {
              backgroundColor: "transparent",
              borderColor: theme.colors.foregroundExtraMuted,
              borderRadius: 0,
              padding: 0,
              gapWidth: 12,
            }
          : {}),
        admonitions: {
          note: { color: theme.colors.accentBright, backgroundColor: theme.colors.surface2 },
          tip: { color: theme.colors.statusSuccess, backgroundColor: theme.colors.surface2 },
          important: { color: theme.colors.statusMerged, backgroundColor: theme.colors.surface2 },
          warning: { color: theme.colors.statusWarning, backgroundColor: theme.colors.surface2 },
          caution: { color: theme.colors.statusDanger, backgroundColor: theme.colors.surface2 },
        },
      },
      link: { color: theme.colors.link, underline: false },
      linkVariants: {
        "^(?!https?://).+": {
          color: theme.colors.link,
        },
      },
      code: {
        fontFamily: theme.fontFamily.mono === "ui-monospace" && !isWeb ? "" : theme.fontFamily.mono,
        fontSize: theme.fontSize.code,
        color: theme.colors.inlineCode,
        backgroundColor: theme.colors.surface2,
        borderColor: "transparent",
      },
      codeBlock: {
        ...paragraph,
        fontFamily: theme.fontFamily.mono === "ui-monospace" && !isWeb ? "" : theme.fontFamily.mono,
        fontSize: theme.fontSize.code,
        backgroundColor: theme.colors.surface2,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 12,
      },
      table: {
        ...paragraph,
        borderColor: theme.colors.border,
        headerBackgroundColor: theme.colors.surface2,
        headerTextColor: theme.colors.foreground,
        rowEvenBackgroundColor: theme.colors.surface0,
        rowOddBackgroundColor: theme.colors.surface1,
      },
      taskList: {
        checkedTextColor: theme.colors.foregroundMuted,
        checkedColor: theme.colors.accent,
        checkmarkColor: theme.colors.accentForeground,
        borderColor: theme.colors.foregroundMuted,
      },
      inlineImage: { size: paragraph.lineHeight },
      image: { ...block, height: 320, resizeMode: "contain", borderRadius: 8 },
      thematicBreak: { ...block, color: theme.colors.border, height: 1 },
    },
  };
}
