import { Text } from "react-native";
import {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
} from "react";
import type {
  CodeBlockRendererProps,
  LinkRendererProps,
  MarkdownRenderers,
} from "react-native-enriched-markdown";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useAssistantFileLinkEnvironment, useFileLink } from "@/assistant-file-links";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { HighlightedCodeBlock } from "@/components/highlighted-code-block";
import { PullRequestChip, PullRequestHoverCard } from "@/pull-request-links/link";
import { parsePullRequestLink, type PullRequestLinkTarget } from "@/pull-request-links/parse";
import type { Theme } from "@/styles/theme";
import { MermaidFence } from "./fence/mermaid";
import { markdownLinkSource } from "./source";

const ThemedCodeBlock = withUnistyles(HighlightedCodeBlock);
const codeStyle = (theme: Theme) => ({
  inheritedStyles: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
  },
  textStyle: { backgroundColor: theme.colors.surface2, padding: 12, borderRadius: 8 },
});
function WebCodeBlock({ code, language }: CodeBlockRendererProps) {
  if (language?.toLowerCase() === "mermaid") return <MermaidFence code={code} />;
  return <ThemedCodeBlock code={code} language={language} uniProps={codeStyle} />;
}

// The library styles links inline, so a stylesheet :hover rule cannot underline them.
const LINK_HOVER_STYLE = { textDecoration: "underline" } as const;

function WebLink(props: LinkRendererProps) {
  // Only a bare URL becomes a chip; authored link text stays as written.
  const pullRequest =
    props.link.sourceType === "text" ? parsePullRequestLink(props.link.url) : null;
  if (pullRequest) return <WebPullRequestLink {...props} target={pullRequest} />;
  return <WebTextLink {...props} />;
}

// The chip keeps its anchor so copied Markdown still carries the URL.
const PULL_REQUEST_ANCHOR_STYLE = { display: "contents" } as const;

function preventAnchorNavigation(event: MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault();
}

function WebPullRequestLink({
  anchorProps,
  target,
}: LinkRendererProps & { target: PullRequestLinkTarget }) {
  const anchorRef = useRef<HTMLAnchorElement>(null);
  // The chip's Pressable stops the click; replay it on the anchor so the renderer's
  // link handling opens the URL the same way as any other link.
  const pressAnchor = useCallback(() => anchorRef.current?.click(), []);
  const { serverId, workspaceRoot } = useAssistantFileLinkEnvironment();
  const host = useMemo(
    () => ({ serverId: serverId ?? "", cwd: workspaceRoot ?? "" }),
    [serverId, workspaceRoot],
  );
  return (
    <PullRequestHoverCard host={host} target={target}>
      <a
        {...anchorProps}
        ref={anchorRef}
        style={PULL_REQUEST_ANCHOR_STYLE}
        onClickCapture={preventAnchorNavigation}
      >
        <PullRequestChip
          host={host}
          target={target}
          linkStyle={styles.pullRequestLink}
          onPress={pressAnchor}
        />
      </a>
    </PullRequestHoverCard>
  );
}

function WebTextLink({ link, anchorProps, children }: LinkRendererProps) {
  const { tooltipPath, onHoverIn } = useFileLink(markdownLinkSource(link.url, link.sourceType));
  const [hovered, setHovered] = useState(false);
  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);
  const anchorStyle = useMemo(
    () => ({
      ...anchorProps.style,
      overflowWrap: "anywhere" as const,
      ...(hovered ? LINK_HOVER_STYLE : null),
    }),
    [anchorProps.style, hovered],
  );
  const anchor = (
    <a
      {...anchorProps}
      style={anchorStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </a>
  );
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild onHoverIn={onHoverIn}>
        <InlineLinkTrigger>{anchor}</InlineLinkTrigger>
      </TooltipTrigger>
      {tooltipPath ? (
        <TooltipContent side="top" align="start" maxWidth={520}>
          <Text selectable={false} style={styles.tooltipPath}>
            {tooltipPath}
          </Text>
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}
// TooltipTrigger also supplies native Pressable handlers; forward only DOM events.
// A View renders a div, which is invalid inside the library's prose paragraphs.
const InlineLinkTrigger = forwardRef<HTMLSpanElement, ComponentProps<"span">>(
  function InlineLinkTrigger({ children, onMouseEnter, onMouseLeave, onFocus, onBlur }, ref) {
    return (
      <span
        ref={ref}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {children}
      </span>
    );
  },
);
const styles = StyleSheet.create((theme) => ({
  pullRequestLink: {
    color: theme.colors.link,
  },
  tooltipPath: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
}));

export const WEB_RENDERERS: MarkdownRenderers = { codeBlock: WebCodeBlock, link: WebLink };
