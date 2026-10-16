import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { AssistantMessage } from "@/components/message";
import { settingsStyles } from "@/styles/settings";
import type { Theme } from "@/styles/theme";
import type { ChatBrief } from "./proposal";

const ChevronDownIcon = withUnistyles(ChevronDown);
const ChevronRightIcon = withUnistyles(ChevronRight);
const mutedIcon = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function BriefSection({
  label,
  text,
  bordered,
  occurrenceKey,
  testID,
}: {
  label: string;
  text: string;
  bordered: boolean;
  occurrenceKey: string;
  testID: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const accessibilityState = useMemo(() => ({ expanded: open }), [open]);
  return (
    <View style={bordered ? settingsStyles.rowBorder : undefined}>
      <Pressable
        onPress={toggle}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        testID={testID}
      >
        <Text style={styles.label}>{label}</Text>
        {open ? (
          <ChevronDownIcon size={14} uniProps={mutedIcon} />
        ) : (
          <ChevronRightIcon size={14} uniProps={mutedIcon} />
        )}
      </Pressable>
      {open ? (
        <View style={styles.body}>
          <AssistantMessage
            message={text}
            occurrenceKey={occurrenceKey}
            timestamp={0}
            phase="complete"
            spacing="compactBoth"
          />
        </View>
      ) : null}
    </View>
  );
}

/** The Task and Context of a proposed or started chat, collapsed rows inside a card. */
export const ChatBriefRows = memo(function ChatBriefRows({
  brief,
  occurrenceKey,
  bordered,
}: {
  brief: ChatBrief;
  occurrenceKey: string;
  /** Whether the first row follows another row of the same card. */
  bordered: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <BriefSection
        label={t("chatProposals.task")}
        text={brief.task}
        bordered={bordered}
        occurrenceKey={`${occurrenceKey}:task`}
        testID="chat-brief-task"
      />
      {brief.context ? (
        <BriefSection
          label={t("chatProposals.context")}
          text={brief.context}
          bordered
          occurrenceKey={`${occurrenceKey}:context`}
          testID="chat-brief-context"
        />
      ) : null}
    </>
  );
});

const styles = StyleSheet.create((theme) => ({
  header: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[4],
  },
  label: {
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
  },
  body: {
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[3],
  },
}));
