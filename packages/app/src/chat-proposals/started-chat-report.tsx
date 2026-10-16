import { memo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { BriefSection } from "./brief-rows";
import { LinkedChatLine } from "./linked-chat-line";
import type { StartedChatReport } from "./proposal";

/** Stands in for a report note: the started chat that ended a turn, then its reply, collapsed. */
export const StartedChatReports = memo(function StartedChatReports({
  serverId,
  messageId,
  reports,
}: {
  serverId: string;
  messageId: string;
  reports: readonly StartedChatReport[];
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.container} testID="started-chat-reports">
      {reports.map((report) => (
        <View key={report.chatId} style={styles.report}>
          <LinkedChatLine
            serverId={serverId}
            agentId={report.chatId}
            label={t(
              report.outcome === "failed"
                ? "chatProposals.reportFailed"
                : "chatProposals.reportFrom",
            )}
            fallbackTitle={report.title}
            testID="started-chat-report-source"
          />
          {report.reply ? (
            <View style={settingsStyles.card}>
              <BriefSection
                label={t("chatProposals.reply")}
                text={report.reply}
                bordered={false}
                occurrenceKey={`report:${messageId}:${report.chatId}`}
                testID="started-chat-report-reply"
              />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[3],
    marginVertical: theme.spacing[4],
  },
  report: {
    gap: theme.spacing[2],
  },
}));
