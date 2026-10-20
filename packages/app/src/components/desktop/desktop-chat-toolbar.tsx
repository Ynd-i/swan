import { useCallback, useMemo, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { MoreHorizontal } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { withUnistyles } from "react-native-unistyles";
import { useShallow } from "zustand/shallow";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  type MenuPageDefinition,
} from "@/components/ui/dropdown-menu";
import { iconButtonChromeStyle, mutedIconColorMapping } from "@/components/ui/icon-button-chrome";
import { useSessionStore } from "@/stores/session-store";
import { useToast } from "@/contexts/toast-context";
import type { DesktopChatTarget } from "./desktop-chat-actions";
import { DesktopChatMenuItems, useChatForkPage, useDesktopChatMenu } from "./desktop-chat-menu";
import { desktopChatResumeCommand } from "./desktop-chat-copy";
import { DesktopProgressRing } from "./desktop-progress-ring";

const MoreIcon = withUnistyles(MoreHorizontal);
const Progress = withUnistyles(DesktopProgressRing);

function ChatToolbarMenu({
  agent,
  resumeCommand,
}: {
  agent: DesktopChatTarget;
  resumeCommand: string | null;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { busy, menuProps, renameModal } = useDesktopChatMenu(agent);
  const [open, setOpen] = useState(false);
  const copy = useCallback(
    async (value: string, label: string) => {
      try {
        await Clipboard.setStringAsync(value);
        toast.copied(label);
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [t, toast],
  );
  const copyAgentId = useCallback(() => {
    void copy(agent.id, t("workspace.tabs.toasts.agentIdCopiedLabel"));
  }, [agent.id, copy, t]);
  const copyResumeCommand = useCallback(() => {
    if (resumeCommand)
      void copy(resumeCommand, t("workspace.tabs.toasts.resumeCommandCopiedLabel"));
  }, [copy, resumeCommand, t]);
  const forkPage = useChatForkPage(agent);
  const pages = useMemo<MenuPageDefinition[]>(
    () => [
      ...(forkPage ? [forkPage] : []),
      {
        id: "copy",
        title: t("common.actions.copy"),
        content: (
          <>
            <DropdownMenuItem onSelect={copyAgentId}>
              {t("workspace.tabs.menu.copyAgentId")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={copyResumeCommand} disabled={!resumeCommand}>
              {t("workspace.tabs.menu.copyResumeCommand")}
            </DropdownMenuItem>
          </>
        ),
      },
    ],
    [copyAgentId, copyResumeCommand, forkPage, resumeCommand, t],
  );
  const buttonStyle = useMemo(
    () =>
      ({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) =>
        iconButtonChromeStyle({ size: "large", state: { hovered, pressed, open }, disabled: busy }),
    [open, busy],
  );
  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          style={buttonStyle}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t("desktopChat.actions")}
          testID="desktop-chat-toolbar-menu"
        >
          {busy ? (
            <Progress uniProps={mutedIconColorMapping} />
          ) : (
            <MoreIcon size={18} uniProps={mutedIconColorMapping} />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" width={220} pages={pages}>
          <DesktopChatMenuItems {...menuProps} toolbar copyPage="copy" forkPage={forkPage?.id} />
        </DropdownMenuContent>
      </DropdownMenu>
      {renameModal}
    </>
  );
}

export function DesktopChatToolbar({ serverId, agentId }: { serverId: string; agentId: string }) {
  const agent = useSessionStore(
    useShallow((state): (DesktopChatTarget & { resumeCommand: string | null }) | null => {
      const session = state.sessions[serverId];
      const source = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
      if (!source || source.archivedAt) return null;
      return {
        serverId,
        id: source.id,
        workspaceId: source.workspaceId,
        title: source.title,
        labels: source.labels,
        requiresAttention: source.requiresAttention,
        attentionReason: source.attentionReason,
        turn: source.turn,
        resumeCommand: desktopChatResumeCommand(source),
      };
    }),
  );
  return agent ? (
    <ChatToolbarMenu
      key={`${serverId}:${agentId}`}
      agent={agent}
      resumeCommand={agent.resumeCommand}
    />
  ) : null;
}
