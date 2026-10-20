import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  CornerDownRight,
  ListEnd,
  ListX,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react-native";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Theme } from "@/styles/theme";

const QueueIcon = withUnistyles(ListEnd);
const SteerIcon = withUnistyles(CornerDownRight);
const DeleteIcon = withUnistyles(Trash2);
const MoreIcon = withUnistyles(MoreHorizontal);
const EditIcon = withUnistyles(Pencil);
const TurnOffIcon = withUnistyles(ListX);
const mutedIcon = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const editLeading = <EditIcon size={16} uniProps={mutedIcon} />;
const turnOffLeading = <TurnOffIcon size={16} uniProps={mutedIcon} />;

interface DesktopQueuedMessageRowProps {
  id: string;
  text: string;
  onSteer: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onTurnOffQueue: () => void;
}

/** Codex's queued message: Steer sends it into the running turn; the menu edits it or ends queueing. */
export function DesktopQueuedMessageRow({
  id,
  text,
  onSteer,
  onDelete,
  onEdit,
  onTurnOffQueue,
}: DesktopQueuedMessageRowProps) {
  const { t } = useTranslation();
  const steer = useCallback(() => onSteer(id), [id, onSteer]);
  const remove = useCallback(() => onDelete(id), [id, onDelete]);
  const edit = useCallback(() => onEdit(id), [id, onEdit]);
  const deleteLabel = t("composer.queue.delete");
  return (
    <View style={styles.row} testID="composer-queued-message">
      <QueueIcon size={16} uniProps={mutedIcon} />
      <Text style={styles.text} numberOfLines={1} ellipsizeMode="tail">
        {text}
      </Text>
      <Pressable
        onPress={steer}
        style={steerStyle}
        accessibilityRole="button"
        testID="composer-queued-message-steer"
      >
        <SteerIcon size={16} uniProps={mutedIcon} />
        <Text style={styles.steerLabel}>{t("composer.queue.steer")}</Text>
      </Pressable>
      <HeaderToggleButton
        onPress={remove}
        tooltipLabel={deleteLabel}
        tooltipKeys={[]}
        tooltipSide="top"
        accessibilityRole="button"
        accessibilityLabel={deleteLabel}
        testID="composer-queued-message-delete"
      >
        <DeleteIcon size={16} uniProps={mutedIcon} />
      </HeaderToggleButton>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={styles.moreButton}
          accessibilityRole="button"
          accessibilityLabel={t("composer.queue.more")}
          testID="composer-queued-message-more"
        >
          <MoreIcon size={16} uniProps={mutedIcon} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" width={200}>
          <DropdownMenuItem onSelect={edit} leading={editLeading}>
            {t("composer.queue.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onTurnOffQueue} leading={turnOffLeading}>
            {t("composer.queue.turnOff")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

function steerStyle({ hovered }: { hovered?: boolean }) {
  return hovered ? [styles.steer, styles.steerHovered] : styles.steer;
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  text: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  steer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    height: 28,
    paddingHorizontal: theme.spacing[2],
    borderRadius: 6,
  },
  steerHovered: { backgroundColor: theme.colors.surface2 },
  steerLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  moreButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
}));
