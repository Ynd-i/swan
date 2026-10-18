import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ScrollView } from "@/components/ui/scroll-view";
import { MarkdownTextSpan } from "@/components/markdown-text";
import * as Clipboard from "expo-clipboard";
import { ArrowRightToLine, Check, Copy, Code, Play, WrapText } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { HighlightToken } from "@getpaseo/highlight";
import { getIsElectronMac, isNative, isWeb } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useRunInTerminal } from "@/panels/pane-context";
import { syntaxTokenStyleFor } from "@/styles/syntax-token-styles";
import { CODE_SURFACE_DATASET } from "@/styles/code-surface";
import { highlightToKeyedLines, type KeyedLine } from "@/utils/highlight-cache";
import {
  markdownCopyCodeBlockDataSet,
  markdownCopyDataSet,
  TRAILING_CODE_LINE_BREAKS,
} from "@/assistant-selection-copy/markup";

interface HighlightedCodeBlockProps {
  code: string;
  language: string | null | undefined;
  inheritedStyles: TextStyle;
  textStyle: TextStyle;
}

// Fence info strings ("```ts", "```typescript", "```ts {1,3}") map to the
// extension-based parser table in @getpaseo/highlight. Aliases here only
// cover names that don't already match an extension key in parsers.ts.
const LANGUAGE_ALIASES: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  python: "py",
  rust: "rs",
  golang: "go",
  "c++": "cpp",
  csharp: "cs",
  "c#": "cs",
  objc: "m",
  "objective-c": "m",
  markdown: "md",
  elixir: "ex",
};

function fenceLanguageToExtension(info: string | null | undefined): string | null {
  if (!info) return null;
  const first = info.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) return null;
  const normalized = first.replace(/^\./, "");
  return LANGUAGE_ALIASES[normalized] ?? normalized;
}

const SHELL_LANGUAGES = new Set(["sh", "bash", "zsh", "fish", "shell", "shellscript"]);

function stripTerminalFenceNewline(code: string): string {
  return code.endsWith("\n") ? code.slice(0, -1) : code;
}

export const HighlightedCodeBlock = React.memo(function HighlightedCodeBlock({
  code,
  language,
  inheritedStyles,
  textStyle,
}: HighlightedCodeBlockProps) {
  // Box styles (bg / padding / border / radius / margin) go on the wrapper View
  // so the absolute copy button positions relative to the visible code area,
  // not to a parent that includes the Text's own marginVertical.
  const { containerStyle, innerTextStyle } = useMemo(
    () => splitFenceStyle(inheritedStyles, textStyle),
    [inheritedStyles, textStyle],
  );
  const renderedCode = useMemo(() => stripTerminalFenceNewline(code), [code]);
  const copyDataSet = useMemo(
    () => ({ ...CODE_SURFACE_DATASET, ...markdownCopyCodeBlockDataSet(language) }),
    [language],
  );

  const keyedLines = useMemo<KeyedLine[] | null>(
    () => highlightToKeyedLines(renderedCode, fenceLanguageToExtension(language)),
    [renderedCode, language],
  );

  const isCompact = useIsCompactFormFactor();
  const isMac = getIsElectronMac();
  const { t } = useTranslation();
  const [wrap, setWrap] = useState(true);
  const WrapActionIcon = wrap ? ArrowRightToLine : WrapText;
  const toggleWrap = useCallback(() => setWrap((value) => !value), []);
  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const controlsVisible = isHovered || isNative || isCompact;
  // Copy the code without its trailing blank lines. A fence body ends in a newline,
  // and ends in more than one when the author left a blank line before the closing
  // fence; pasting any of them into a terminal runs the last line.
  const getCode = useCallback(() => code.replace(TRAILING_CODE_LINE_BREAKS, ""), [code]);
  const runInTerminal = useRunInTerminal();
  const handleRun = useMemo(
    () =>
      runInTerminal && SHELL_LANGUAGES.has(fenceLanguageToExtension(language) ?? "")
        ? () => runInTerminal(getCode())
        : null,
    [getCode, language, runInTerminal],
  );

  const codeText = (
    <MarkdownTextSpan
      style={[innerTextStyle, isMac && (wrap ? macStyles.wrappedText : macStyles.scrollingText)]}
      copyTag="code"
    >
      {keyedLines ? renderCodeSegments(keyedLines) : renderedCode}
    </MarkdownTextSpan>
  );
  return (
    <View
      style={[containerStyle, isMac && macStyles.container]}
      dataSet={copyDataSet}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {isMac ? (
        <>
          <View style={macStyles.header} dataSet={markdownCopyDataSet.ignore}>
            <Code size={16} color={macStyles.headerText.color} />
            <Text style={macStyles.headerText}>{language || t("message.actions.plainText")}</Text>
            <View style={macStyles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(
                  wrap ? "workspace.git.diff.scrollLongLines" : "workspace.git.diff.wrapLongLines",
                )}
                aria-pressed={wrap}
                onPress={toggleWrap}
                style={macStyles.action}
              >
                <WrapActionIcon size={16} color={macStyles.headerText.color} />
              </Pressable>
              {handleRun ? <RunButton onRun={handleRun} visible inline /> : null}
              <CopyButton getCode={getCode} visible inline />
            </View>
          </View>
          <ScrollView horizontal={!wrap} style={macStyles.codeScroll} testID="markdown-code-scroll">
            {codeText}
          </ScrollView>
        </>
      ) : (
        <>
          {codeText}
          {handleRun ? <RunButton onRun={handleRun} visible={controlsVisible} /> : null}
          <CopyButton getCode={getCode} visible={controlsVisible} />
        </>
      )}
    </View>
  );
});

function renderCodeSegments(keyedLines: KeyedLine[]): React.ReactNode[] {
  const segments: React.ReactNode[] = [];
  for (let lineIndex = 0; lineIndex < keyedLines.length; lineIndex += 1) {
    const line = keyedLines[lineIndex];
    if (lineIndex > 0) {
      segments.push(<CodeTextSpan key={`${line.key}-newline`} text={"\n"} />);
    }
    for (const { key, token } of line.tokens) {
      segments.push(<TokenSpan key={`${line.key}-${key}`} token={token} />);
    }
  }
  return segments;
}

interface TokenSpanProps {
  token: HighlightToken;
}

const TokenSpan = React.memo(function TokenSpan({ token }: TokenSpanProps) {
  return (
    <MarkdownTextSpan
      monoSurface
      style={token.style ? syntaxTokenStyleFor(token.style) : undefined}
    >
      {token.text}
    </MarkdownTextSpan>
  );
});

interface CodeTextSpanProps {
  text: string;
}

const CodeTextSpan = React.memo(function CodeTextSpan({ text }: CodeTextSpanProps) {
  return <MarkdownTextSpan monoSurface>{text}</MarkdownTextSpan>;
});

interface SplitStyles {
  containerStyle: StyleProp<ViewStyle>;
  innerTextStyle: StyleProp<TextStyle>;
}

const CONTAINER_BASE: ViewStyle = { position: "relative" };
const WEB_SELECTABLE: TextStyle = isWeb ? ({ userSelect: "text" } as TextStyle) : {};

function splitFenceStyle(inheritedStyles: TextStyle, textStyle: TextStyle): SplitStyles {
  const { fontFamily, fontSize, fontWeight, color, ...box } = textStyle;
  const textOnly: TextStyle = { ...WEB_SELECTABLE };
  if (fontFamily !== undefined) textOnly.fontFamily = fontFamily;
  if (fontSize !== undefined) textOnly.fontSize = fontSize;
  if (fontWeight !== undefined) textOnly.fontWeight = fontWeight;
  if (fontSize !== undefined)
    textOnly.lineHeight = Math.round(fontSize * (getIsElectronMac() ? 1.5 : 1.45));
  if (color !== undefined) textOnly.color = color;
  return {
    containerStyle: [box as ViewStyle, CONTAINER_BASE],
    innerTextStyle: [inheritedStyles, textOnly],
  };
}

interface RunButtonProps {
  onRun: () => void;
  visible: boolean;
  inline?: boolean;
}

const RunButton = React.memo(function RunButton({
  onRun,
  visible,
  inline = false,
}: RunButtonProps) {
  const { t } = useTranslation();
  const visibilityStyle = visible
    ? copyButtonStyles.containerVisible
    : copyButtonStyles.containerHidden;
  const wrapperStyle = useMemo(
    () => [
      copyButtonStyles.container,
      inline ? copyButtonStyles.inline : copyButtonStyles.runOffset,
      visibilityStyle,
    ],
    [inline, visibilityStyle],
  );
  return (
    <Pressable
      onPress={onRun}
      style={wrapperStyle}
      pointerEvents={visible ? "auto" : "none"}
      accessibilityRole="button"
      accessibilityLabel={t("message.actions.runInTerminal")}
      hitSlop={8}
      dataSet={markdownCopyDataSet.ignore}
    >
      {({ hovered }) => (
        <Play
          size={14}
          color={
            hovered ? copyButtonStyles.iconHoveredColor.color : copyButtonStyles.iconColor.color
          }
        />
      )}
    </Pressable>
  );
});

interface CopyButtonProps {
  getCode: () => string;
  visible: boolean;
  inline?: boolean;
}

const COPIED_RESET_MS = 1500;

const CopyButton = React.memo(function CopyButton({
  getCode,
  visible,
  inline = false,
}: CopyButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    },
    [],
  );

  const handlePress = useCallback(async () => {
    const content = getCode();
    if (!content) return;
    await Clipboard.setStringAsync(content);
    setCopied(true);
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => {
      setCopied(false);
      resetRef.current = null;
    }, COPIED_RESET_MS);
  }, [getCode]);

  const visibilityStyle = visible
    ? copyButtonStyles.containerVisible
    : copyButtonStyles.containerHidden;
  const wrapperStyle = useMemo(
    () => [copyButtonStyles.container, inline && copyButtonStyles.inline, visibilityStyle],
    [inline, visibilityStyle],
  );

  return (
    <Pressable
      onPress={handlePress}
      style={wrapperStyle}
      pointerEvents={visible ? "auto" : "none"}
      accessibilityRole="button"
      accessibilityLabel={copied ? t("message.actions.copied") : t("message.actions.copyCode")}
      hitSlop={8}
      dataSet={markdownCopyDataSet.ignore}
    >
      {({ hovered }) => {
        const iconColor = hovered
          ? copyButtonStyles.iconHoveredColor.color
          : copyButtonStyles.iconColor.color;
        return copied ? (
          <Check size={14} color={iconColor} />
        ) : (
          <Copy size={14} color={iconColor} />
        );
      }}
    </Pressable>
  );
});

const copyButtonStyles = StyleSheet.create((theme) => ({
  container: {
    position: "absolute",
    top: theme.spacing[2],
    right: theme.spacing[2],
    padding: theme.spacing[1],
  },
  inline: { position: "relative", top: 0, right: 0, padding: 6 },
  runOffset: { right: theme.spacing[2] + 28 },
  containerVisible: {
    opacity: 1,
  },
  containerHidden: {
    opacity: 0,
  },
  iconColor: {
    color: theme.colors.foregroundMuted,
  },
  iconHoveredColor: {
    color: theme.colors.foreground,
  },
}));

const macStyles = StyleSheet.create((theme, rt) => ({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: rt.themeName === "dark" ? theme.colors.surface1 : theme.colors.surface2,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 12,
    minWidth: 0,
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerText: {
    fontFamily: theme.fontFamily.ui,
    fontWeight: theme.fontWeight.normal,
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
    flexShrink: 1,
  },
  actions: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 12 },
  action: { padding: 6 },
  codeScroll: { flexGrow: 0, minWidth: 0 },
  wrappedText: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", minWidth: 0 },
  scrollingText: { whiteSpace: "pre", overflowWrap: "normal", minWidth: 0 },
}));
