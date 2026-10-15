import { memo, useMemo } from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { SquareTerminal } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { AgentBackgroundTask } from "@getpaseo/protocol/agent-types";
import { ComposerTrackPill, ComposerTrackRow } from "@/composer/tracks";
import type { Theme } from "@/styles/theme";

const ThemedSquareTerminal = withUnistyles(SquareTerminal);
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/** Matches the subagent rows, so the two panels keep one icon column. */
const ROW_ICON_SIZE = 14;

/**
 * Shell commands and monitors the agent left running. Read-only: the daemon reports the live set,
 * and the pill disappears once it is empty.
 */
export const AgentBackgroundTasks = memo(function AgentBackgroundTasks({
  tasks,
}: {
  tasks: AgentBackgroundTask[] | undefined;
}) {
  if (!tasks?.length) return null;
  return <BackgroundTasksPill tasks={tasks} />;
});

const BackgroundTasksPill = memo(function BackgroundTasksPill({
  tasks,
}: {
  tasks: AgentBackgroundTask[];
}) {
  const { t } = useTranslation();
  const label =
    tasks.length === 1
      ? t("backgroundTasks.pillLabelOne")
      : t("backgroundTasks.pillLabelMany", { count: tasks.length });
  const segments = useMemo(() => [{ bucket: "running" as const, text: label }], [label]);

  return (
    <ComposerTrackPill
      testID="background-tasks-track-header"
      segments={segments}
      panelTitle={t("backgroundTasks.title")}
    >
      {tasks.map((task) => (
        <ComposerTrackRow key={task.id}>
          <ThemedSquareTerminal size={ROW_ICON_SIZE} uniProps={foregroundMutedColorMapping} />
          <Text style={styles.rowLabel} numberOfLines={1}>
            {task.description}
          </Text>
        </ComposerTrackRow>
      ))}
    </ComposerTrackPill>
  );
});

const styles = StyleSheet.create((theme) => ({
  // Basis stays `auto` so the text's width reaches the panel's measurement — see subagents/track.tsx.
  rowLabel: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
  },
}));
