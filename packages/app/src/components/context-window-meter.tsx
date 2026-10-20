import { useState } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { AgentContextUsage } from "@getpaseo/protocol/agent-types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getIsElectronMac } from "@/constants/platform";
import { useFetchQuery } from "@/data/query";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { formatTokenCount } from "./context-window-meter.utils";

interface ContextWindowMeterProps {
  serverId: string;
  agentId: string;
  maxTokens: number | null;
  usedTokens: number | null;
  totalCostUsd?: number | null;
  showPercentage?: boolean;
  /** Reserve the meter footprint and show a loading ring while usage is pending. */
  pending?: boolean;
  /** Optional glyph envelope for icon-toolbar alignment. */
  glyphSize?: number;
}

const SVG_SIZE = 14;
const COMPACT_SVG_SIZE = 12;
const COMPACT_CENTER = COMPACT_SVG_SIZE / 2;
const COMPACT_RADIUS = 5;
const STROKE_WIDTH = 2;
const COMPACT_STROKE_WIDTH = 1.75;
const COMPACT_CIRCUMFERENCE = 2 * Math.PI * COMPACT_RADIUS;
// The track tints the foreground instead of using a surface token: the macOS composer is
// surface3 itself, so a surface-coloured track disappears into it.
const TRACK_OPACITY = 0.3;
const BUFFER_OPACITY = 0.6;

const meterStyle = ({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
  styles.container,
  hovered && styles.containerHovered,
];

type Theme = ReturnType<typeof useUnistyles>["theme"];

interface ContextWindowRow {
  key: string;
  label: string;
  tokens: number;
  swatchStyle: { backgroundColor: string; opacity: number };
  segmentStyle: { flex: number; backgroundColor: string; opacity: number };
}

function buildRow(input: {
  key: string;
  label: string;
  tokens: number;
  color: string;
  opacity: number;
}): ContextWindowRow {
  const { key, label, tokens, color, opacity } = input;
  return {
    key,
    label,
    tokens,
    swatchStyle: { backgroundColor: color, opacity },
    segmentStyle: { flex: tokens, backgroundColor: color, opacity },
  };
}

function isValidMaxTokens(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidUsedTokens(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function getUsagePercentage(maxTokens: number, usedTokens: number): number | null {
  if (!isValidMaxTokens(maxTokens) || !isValidUsedTokens(usedTokens)) {
    return null;
  }
  return (usedTokens / maxTokens) * 100;
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function formatSessionCost(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value < 0.01) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(2)}`;
}

function getProgressColor(percentage: number, theme: Theme): string {
  if (percentage > 90) {
    return theme.colors.destructive;
  }
  if (percentage >= 70) {
    return theme.colors.palette.amber[500];
  }
  return theme.colors.foregroundMuted;
}

/**
 * Asks the agent's provider what fills its window, once per usage value, only while the popup
 * is open and the agent is idle: Claude answers with an extra API request.
 */
function useContextUsageBreakdown(input: {
  serverId: string;
  agentId: string;
  usedTokens: number | null;
  open: boolean;
  pending: boolean;
}): AgentContextUsage | null {
  const { serverId, agentId, usedTokens, open, pending } = input;
  const client = useHostRuntimeClient(serverId);
  // COMPAT(agentContextUsage): added in Paseo Custom v0.11.0-beta.3-v1-beta6, remove gate after 2027-04-04.
  const supported = useHostFeature(serverId, "agentContextUsage");
  const query = useFetchQuery({
    queryKey: ["agentContextUsage", serverId, agentId, usedTokens],
    queryFn: () => (client ? client.getAgentContextUsage(agentId) : null),
    enabled: open && !pending && supported && client !== null && usedTokens !== null,
    dataShape: "value",
    // Keyed by the usage it describes, so an answer never goes stale.
    immutableWhen: () => true,
    retry: false,
  });
  return query.data ?? null;
}

/** Rows in the order the bar paints them: largest category first, then buffer and free space. */
function buildContextWindowRows(input: {
  usage: AgentContextUsage;
  categoryColors: readonly string[];
  theme: Theme;
  t: TFunction;
}): ContextWindowRow[] {
  const { usage, categoryColors, theme, t } = input;
  const rows = [...usage.categories]
    .sort((left, right) => right.tokens - left.tokens)
    .map((category, index) =>
      buildRow({
        key: `category-${index}`,
        label: category.name,
        tokens: category.tokens,
        color: categoryColors[index] ?? theme.colors.foregroundMuted,
        opacity: 1,
      }),
    );
  if (usage.bufferTokens > 0) {
    rows.push(
      buildRow({
        key: "buffer",
        label: t("contextWindow.buffer"),
        tokens: usage.bufferTokens,
        color: theme.colors.foregroundMuted,
        opacity: BUFFER_OPACITY,
      }),
    );
  }
  rows.push(
    buildRow({
      key: "free",
      label: t("contextWindow.free"),
      tokens: Math.max(0, usage.maxTokens - usage.usedTokens - usage.bufferTokens),
      color: theme.colors.foregroundMuted,
      opacity: TRACK_OPACITY,
    }),
  );
  return rows;
}

function formatWindowShare(tokens: number, maxTokens: number): string {
  return `${((tokens / maxTokens) * 100).toFixed(1)}%`;
}

function getMeterGeometry(showPercentage: boolean, glyphSize?: number) {
  if (showPercentage) {
    return {
      svgSize: COMPACT_SVG_SIZE,
      center: COMPACT_CENTER,
      radius: COMPACT_RADIUS,
      strokeWidth: COMPACT_STROKE_WIDTH,
      circumference: COMPACT_CIRCUMFERENCE,
      containerStyle: styles.containerWithLabel,
    };
  }
  const resolvedSize = glyphSize ?? SVG_SIZE;
  const resolvedStrokeWidth = glyphSize ? 2 : STROKE_WIDTH;
  return {
    svgSize: resolvedSize,
    center: resolvedSize / 2,
    radius: (resolvedSize - resolvedStrokeWidth) / 2,
    strokeWidth: resolvedStrokeWidth,
    circumference: Math.PI * (resolvedSize - resolvedStrokeWidth),
    containerStyle: styles.container,
  };
}

export function ContextWindowMeter({
  serverId,
  agentId,
  maxTokens,
  usedTokens,
  totalCostUsd,
  showPercentage = false,
  pending = false,
  glyphSize,
}: ContextWindowMeterProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const breakdown = useContextUsageBreakdown({ serverId, agentId, usedTokens, open, pending });
  const percentage =
    maxTokens !== null && usedTokens !== null ? getUsagePercentage(maxTokens, usedTokens) : null;
  const geometry = getMeterGeometry(showPercentage, glyphSize);

  // No usage yet: reserve the footprint with a track-only ring while a session is
  // active so the real ring fades in without shifting siblings. Render nothing when
  // no usage is expected.
  if (percentage === null || maxTokens === null || usedTokens === null) {
    if (!pending) {
      return null;
    }
    return (
      <View style={geometry.containerStyle}>
        <Svg
          width={geometry.svgSize}
          height={geometry.svgSize}
          viewBox={`0 0 ${geometry.svgSize} ${geometry.svgSize}`}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Circle
            cx={geometry.center}
            cy={geometry.center}
            r={geometry.radius}
            fill="none"
            stroke={theme.colors.foregroundMuted}
            strokeOpacity={TRACK_OPACITY}
            strokeWidth={geometry.strokeWidth}
          />
        </Svg>
        {showPercentage ? <View style={styles.skeletonLabel} /> : null}
      </View>
    );
  }

  const clampedPercentage = clampPercentage(percentage);
  const roundedPercentage = Math.round(percentage);
  const { svgSize, center, radius, strokeWidth, circumference, containerStyle } = geometry;
  const dashOffset = circumference - (clampedPercentage / 100) * circumference;
  const progressColor = getProgressColor(clampedPercentage, theme);
  const formattedSessionCost =
    typeof totalCostUsd === "number" ? formatSessionCost(totalCostUsd) : null;
  const windowUsage: AgentContextUsage = breakdown ?? {
    maxTokens,
    usedTokens,
    bufferTokens: 0,
    categories: [{ name: t("contextWindow.used"), tokens: usedTokens }],
  };
  const { palette } = theme.colors;
  const rows = buildContextWindowRows({
    usage: windowUsage,
    categoryColors: breakdown
      ? [
          palette.blue[500],
          palette.orange[500],
          palette.green[500],
          palette.amber[500],
          palette.purple[500],
        ]
      : [progressColor],
    theme,
    t,
  });

  return (
    <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile onOpenChange={setOpen}>
      <TooltipTrigger asChild triggerRefProp="ref">
        <Pressable
          style={showPercentage ? containerStyle : meterStyle}
          testID="context-window-meter"
          accessibilityRole="image"
          accessibilityLabel={t("contextWindow.accessibility", {
            percentage: roundedPercentage,
          })}
        >
          <Svg
            width={svgSize}
            height={svgSize}
            viewBox={`0 0 ${svgSize} ${svgSize}`}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={theme.colors.foregroundMuted}
              strokeOpacity={TRACK_OPACITY}
              strokeWidth={strokeWidth}
            />
            <Circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={progressColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              // SVG strokes start at three o'clock; the ring reads clockwise from twelve.
              transform={`rotate(-90 ${center} ${center})`}
            />
          </Svg>
          {showPercentage ? (
            <Text style={styles.percentageLabel}>{`${roundedPercentage}%`}</Text>
          ) : null}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        offset={8}
        maxWidth={340}
        testID="context-window-meter-tooltip"
      >
        <View style={styles.tooltipContent}>
          <View style={styles.tooltipHeader}>
            <Text style={styles.tooltipTitle}>{t("contextWindow.title")}</Text>
            <Text style={styles.tooltipSummary}>
              {t("contextWindow.summary", {
                used: formatTokenCount(windowUsage.usedTokens, 1),
                max: formatTokenCount(windowUsage.maxTokens, 1),
                percentage: Math.round((windowUsage.usedTokens / windowUsage.maxTokens) * 100),
              })}
            </Text>
          </View>
          <View style={styles.windowBar}>
            {rows.map((row) => (
              <View key={row.key} style={row.segmentStyle} />
            ))}
          </View>
          <View style={styles.windowRows}>
            {rows.map((row) => (
              <View key={row.key} style={styles.windowRow} testID="context-window-meter-row">
                <View style={[styles.windowSwatch, row.swatchStyle]} />
                <Text style={styles.windowRowLabel} numberOfLines={1}>
                  {row.label}
                </Text>
                <Text style={styles.windowRowTokens}>{formatTokenCount(row.tokens, 1)}</Text>
                <Text style={styles.windowRowShare}>
                  {formatWindowShare(row.tokens, windowUsage.maxTokens)}
                </Text>
              </View>
            ))}
          </View>
          {formattedSessionCost ? (
            <Text style={styles.tooltipDetail}>
              {t("contextWindow.sessionCost", { cost: formattedSessionCost })}
            </Text>
          ) : null}
        </View>
      </TooltipContent>
    </Tooltip>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    width: 28,
    height: 28,
    borderRadius: getIsElectronMac() ? theme.borderRadius.md : theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  // On Mac the ring's box shows only on hover, tinted like the composer's icon buttons.
  containerHovered: getIsElectronMac()
    ? { backgroundColor: theme.colors.interactionHighlight }
    : {},
  containerWithLabel: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
  },
  percentageLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  skeletonLabel: {
    width: 22,
    height: theme.fontSize.base,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
  },
  tooltipContent: {
    gap: theme.spacing[2],
    minWidth: 280,
  },
  tooltipHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  tooltipTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  tooltipSummary: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  windowBar: {
    flexDirection: "row",
    height: 6,
    borderRadius: theme.borderRadius.full,
    overflow: "hidden",
  },
  windowRows: {
    gap: theme.spacing[1],
  },
  windowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  windowSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  windowRowLabel: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  windowRowTokens: {
    minWidth: 48,
    textAlign: "right",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  windowRowShare: {
    minWidth: 44,
    textAlign: "right",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  tooltipDetail: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
  },
}));
