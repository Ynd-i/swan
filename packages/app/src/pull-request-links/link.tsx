import { useMemo, type ReactNode } from "react";
import {
  Image,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { GitPullRequest } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { ForgeChangeRequestPreview } from "@getpaseo/protocol/messages";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/status-badge";
import { PullRequestStateIcon } from "@/git/pull-request-state-icon";
import type { Theme } from "@/styles/theme";
import { formatTimeAgo } from "@/utils/time";
import type { PullRequestLinkTarget } from "./parse";
import {
  getPullRequestPreviewState,
  usePullRequestPreview,
  type PullRequestPreviewHost,
  type PullRequestPreviewState,
} from "./use-preview";

const ThemedGitPullRequest = withUnistyles(GitPullRequest);
const pendingIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const INLINE_TRIGGER_STYLE: ViewStyle = {
  // RN doesn't type "inline-flex" but RN-web honors it, which keeps the trigger in the text flow.
  display: "inline-flex" as ViewStyle["display"],
  maxWidth: "100%",
};

const BADGE_VARIANT: Record<PullRequestPreviewState, StatusBadgeVariant> = {
  open: "success",
  draft: "muted",
  merged: "muted",
  closed: "error",
};

function formatRepoRef(target: PullRequestLinkTarget): string {
  return `${target.owner}/${target.repo}#${target.number}`;
}

export function PullRequestHoverCard({
  host,
  target,
  children,
}: {
  host: PullRequestPreviewHost;
  target: PullRequestLinkTarget;
  children: ReactNode;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger style={INLINE_TRIGGER_STYLE}>{children}</HoverCardTrigger>
      <HoverCardContent placement="top" alignment="start" style={styles.card}>
        <PullRequestPreviewCard host={host} target={target} />
      </HoverCardContent>
    </HoverCard>
  );
}

/** Replaces a bare pull request URL with `owner/repo#N · title`, the way the forge's own UI cites it. */
export function PullRequestChip({
  host,
  target,
  linkStyle,
  onPress,
}: {
  host: PullRequestPreviewHost;
  target: PullRequestLinkTarget;
  /** The markdown link style, so the chip reads as a link in the current theme. */
  linkStyle: StyleProp<TextStyle>;
  onPress: () => void;
}) {
  const preview = usePullRequestPreview({ host, url: target.url, enabled: true })?.data;
  const textStyle = useMemo(() => [linkStyle, styles.chipText], [linkStyle]);
  const label = preview?.title
    ? `${formatRepoRef(target)} · ${preview.title}`
    : formatRepoRef(target);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={chipStyle}
      testID="pull-request-link-chip"
    >
      {preview ? (
        <PullRequestStateIcon state={stateIcon(getPullRequestPreviewState(preview))} size={13} />
      ) : (
        <ThemedGitPullRequest size={13} uniProps={pendingIconMapping} />
      )}
      <Text style={textStyle} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function chipStyle({ hovered }: { hovered?: boolean }) {
  return [styles.chip, hovered && styles.chipHovered];
}

function stateIcon(state: PullRequestPreviewState): "open" | "merged" | "closed" {
  return state === "draft" ? "open" : state;
}

function PullRequestPreviewCard({
  host,
  target,
}: {
  host: PullRequestPreviewHost;
  target: PullRequestLinkTarget;
}) {
  const { t } = useTranslation();
  const query = usePullRequestPreview({ host, url: target.url, enabled: true });
  const preview = query?.data;
  return (
    <View testID="pull-request-link-card">
      {preview ? (
        <PreviewDetails target={target} preview={preview} />
      ) : (
        <View style={styles.section}>
          <Text style={styles.metaText} numberOfLines={1}>
            {formatRepoRef(target)}
          </Text>
          <Text style={styles.metaText} numberOfLines={3}>
            {previewFallbackText({ query, url: target.url, loading: t("common.loading") })}
          </Text>
        </View>
      )}
    </View>
  );
}

function previewFallbackText({
  query,
  url,
  loading,
}: {
  query: ReturnType<typeof usePullRequestPreview>;
  url: string;
  loading: string;
}): string {
  if (query?.isPending) return loading;
  if (query?.error) return query.error.message;
  return url;
}

function PreviewDetails({
  target,
  preview,
}: {
  target: PullRequestLinkTarget;
  preview: ForgeChangeRequestPreview;
}) {
  const { t } = useTranslation();
  const state = getPullRequestPreviewState(preview);
  const updatedAt = useMemo(
    () => (preview.updatedAt ? formatTimeAgo(new Date(preview.updatedAt)) : null),
    [preview.updatedAt],
  );
  const badgeIcon = useMemo(
    () => <PullRequestStateIcon state={stateIcon(state)} size={12} />,
    [state],
  );
  const avatarSource = useMemo(
    () =>
      preview.authorLogin
        ? { uri: `${new URL(target.url).origin}/${preview.authorLogin}.png?size=40` }
        : null,
    [preview.authorLogin, target.url],
  );
  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <StatusBadge
          size="xs"
          variant={BADGE_VARIANT[state]}
          label={t(`workspace.git.pr.states.${state}`)}
          leading={badgeIcon}
        />
        <Text style={styles.flexMetaText} numberOfLines={1}>
          {`${target.owner}/${target.repo} #${preview.number}`}
        </Text>
        {updatedAt ? <Text style={styles.metaText}>{updatedAt}</Text> : null}
      </View>
      <Text style={styles.title} numberOfLines={3}>
        {preview.title}
      </Text>
      <View style={styles.footerRow}>
        {avatarSource ? <Image source={avatarSource} style={styles.avatar} /> : null}
        <Text style={styles.flexMetaText} numberOfLines={1}>
          {preview.authorLogin ?? ""}
        </Text>
        <View style={styles.diffStat}>
          <Text style={styles.additions}>{`+${preview.additions.toLocaleString()}`}</Text>
          <Text style={styles.deletions}>{`−${preview.deletions.toLocaleString()}`}</Text>
        </View>
        <View style={styles.filesPill}>
          <Text style={styles.metaText}>
            {t("workspace.git.pr.previewFiles", { count: preview.changedFiles })}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    maxWidth: "100%",
    minWidth: 0,
    paddingHorizontal: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    verticalAlign: "bottom",
  },
  chipHovered: {
    backgroundColor: theme.colors.surface3,
  },
  chipText: {
    fontSize: theme.fontSize.base,
    flexShrink: 1,
    minWidth: 0,
  },
  card: {
    width: 360,
  },
  section: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  flexMetaText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  metaText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  avatar: {
    width: 18,
    height: 18,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
  },
  diffStat: {
    flexDirection: "row",
    gap: theme.spacing[1],
  },
  additions: {
    color: theme.colors.statusSuccess,
    fontSize: theme.fontSize.sm,
  },
  deletions: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
  },
  filesPill: {
    paddingHorizontal: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
}));
