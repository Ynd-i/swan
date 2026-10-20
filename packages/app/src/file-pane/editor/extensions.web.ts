import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { createCodeMirrorHighlightStyle, type HighlightStyle } from "@getpaseo/highlight";
import { getIsElectronMac } from "@/constants/platform";

export interface EditorVisualTheme {
  colorScheme: "light" | "dark";
  background: string;
  foreground: string;
  cursor: string;
  foregroundMuted: string;
  border: string;
  selection: string;
  monoFont: string;
  codeFontSize: number;
  codeFontWeight: "400" | "500" | "600" | null;
  syntax: Record<HighlightStyle, string>;
}

export function editorBaseExtensions(onSave: () => void) {
  return [
    lineNumbers(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    highlightActiveLine(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([
      { key: "Mod-s", preventDefault: true, run: () => (onSave(), true) },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
    ]),
  ];
}

export function editorTheme(theme: EditorVisualTheme) {
  const isMac = getIsElectronMac();
  return [
    EditorView.theme(
      {
        "&": {
          height: "100%",
          backgroundColor: theme.background,
          color: theme.foreground,
          fontFamily: theme.monoFont,
          fontSize: `${theme.codeFontSize}px`,
        },
        ".cm-scroller": {
          overflow: "auto",
          fontFamily: theme.monoFont,
          lineHeight: isMac ? "1.8" : "1.45",
        },
        ".cm-panels": { backgroundColor: theme.background, color: theme.foreground },
        ".cm-panels-top": { borderBottom: "none" },
        ".cm-searchMatch": { backgroundColor: theme.selection },
        ".cm-searchMatch-selected": {
          backgroundColor: theme.selection,
          outline: `1px solid ${theme.cursor}`,
        },
        ".cm-content": {
          caretColor: theme.foreground,
          padding: isMac ? "0 0 8px" : "16px 0",
          ...(isMac ? { fontWeight: theme.codeFontWeight ?? "600" } : {}),
        },
        ".cm-cursor, .cm-dropCursor": { borderLeftColor: theme.cursor },
        ".cm-gutters": {
          backgroundColor: theme.background,
          color: theme.foregroundMuted,
          borderRight: isMac ? "none" : `1px solid ${theme.border}`,
        },
        ...(isMac
          ? {
              ".cm-lineNumbers .cm-gutterElement": {
                minWidth: "40px",
                padding: "0 14px 0 6px",
              },
            }
          : {}),
        ".cm-activeLine": { backgroundColor: "transparent" },
        ".cm-activeLineGutter": { backgroundColor: "transparent", color: theme.foreground },
        "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
          backgroundColor: theme.selection,
        },
        ".cm-selectionBackground, ::selection": {
          backgroundColor: theme.selection,
        },
        "&.cm-focused": { outline: "none" },
      },
      { dark: theme.colorScheme === "dark" },
    ),
    syntaxHighlighting(createCodeMirrorHighlightStyle(theme.syntax)),
  ];
}
