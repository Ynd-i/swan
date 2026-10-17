import { useCallback, useMemo, useState } from "react";
import {
  AppWindow,
  Archive,
  Circle,
  CircleCheck,
  Copy,
  GitFork,
  List,
  Pencil,
  Pin,
  PinOff,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { withUnistyles } from "react-native-unistyles";
import { buildAgentDeepLink } from "@getpaseo/protocol/agent-deep-link";
import type { AssistantForkTarget } from "@/components/assistant-fork-menu";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { ContextMenuItem } from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSubTrigger,
  type MenuPageDefinition,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/contexts/toast-context";
import { getIsElectronMac } from "@/constants/platform";
import { getDesktopHost } from "@/desktop/host";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { useForkAgent } from "@/hooks/use-fork-agent";
import { useHostFeature } from "@/runtime/host-features";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import { confirmDialog } from "@/utils/confirm-dialog";
import type { DesktopChatTarget } from "./desktop-chat-actions";
import {
  chainPinnedAt,
  desktopChatKey,
  desktopChatPinnedAt,
  isDesktopChatUnread,
} from "./desktop-chat-model";
import { archiveEmptiedWorkspaces, useDesktopChatMutation } from "./use-desktop-chat";

const ArchiveIcon = withUnistyles(Archive);
const RenameIcon = withUnistyles(Pencil);
const PinIcon = withUnistyles(Pin);
const UnpinIcon = withUnistyles(PinOff);
const ReadIcon = withUnistyles(CircleCheck);
const UnreadIcon = withUnistyles(Circle);
const CopyIcon = withUnistyles(Copy);
const SectionIcon = withUnistyles(List);
const ForkIcon = withUnistyles(GitFork);
const WindowIcon = withUnistyles(AppWindow);
const mutedIcon = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const renameLeading = <RenameIcon size={16} uniProps={mutedIcon} />;
const pinLeading = <PinIcon size={16} uniProps={mutedIcon} />;
const unpinLeading = <UnpinIcon size={16} uniProps={mutedIcon} />;
const archiveLeading = <ArchiveIcon size={16} uniProps={mutedIcon} />;
const readLeading = <ReadIcon size={16} uniProps={mutedIcon} />;
const unreadLeading = <UnreadIcon size={16} uniProps={mutedIcon} />;
const copyLeading = <CopyIcon size={16} uniProps={mutedIcon} />;
const sectionLeading = <SectionIcon size={16} uniProps={mutedIcon} />;
const forkLeading = <ForkIcon size={16} uniProps={mutedIcon} />;
const windowLeading = <WindowIcon size={16} uniProps={mutedIcon} />;

/**
 * The chat menu in the reference's order; each optional entry appears when its prop is given.
 * The titlebar menu (`toolbar`) puts Archive third and read state last, as the reference does.
 */
export function DesktopChatMenuItems({
  context,
  toolbar,
  nested,
  pinned,
  unread,
  disabled,
  onPin,
  onRead,
  onRename,
  onArchive,
  onOpenInNewWindow,
  copyPage,
  sectionPage,
  forkPage,
}: {
  context?: boolean;
  toolbar?: boolean;
  /** An earlier chat of a handoff chain: pin and archive belong to the chat that continues it. */
  nested?: boolean;
  pinned: boolean;
  unread: boolean;
  disabled: boolean;
  onPin: () => void;
  onRead: () => void;
  onRename: () => void;
  onArchive: () => void;
  onOpenInNewWindow?: () => void;
  copyPage?: string;
  /** The page id of a `Section ›` submenu the surface declares. */
  sectionPage?: string;
  /** The page id of a `Fork ›` submenu the surface declares. */
  forkPage?: string;
}) {
  const { t } = useTranslation();
  const Item = context ? ContextMenuItem : DropdownMenuItem;
  const readItem = (
    <Item onSelect={onRead} disabled={disabled} leading={unread ? readLeading : unreadLeading}>
      {t(unread ? "desktopChat.markRead" : "desktopChat.markUnread")}
    </Item>
  );
  const archiveItem = (
    <Item
      onSelect={onArchive}
      disabled={disabled}
      destructive={!getIsElectronMac()}
      leading={archiveLeading}
    >
      {t("agentList.archiveSheet.archive")}
    </Item>
  );
  return (
    <>
      <Item onSelect={onRename} disabled={disabled} leading={renameLeading}>
        {t("renameModal.rename")}
      </Item>
      {nested ? null : (
        <Item onSelect={onPin} disabled={disabled} leading={pinned ? unpinLeading : pinLeading}>
          {t(pinned ? "sidebar.workspace.actions.unpin" : "sidebar.workspace.actions.pin")}
        </Item>
      )}
      {toolbar ? archiveItem : readItem}
      {sectionPage ? (
        <DropdownMenuSubTrigger id={sectionPage} leading={sectionLeading} disabled={disabled}>
          {t("desktopChat.sections.section")}
        </DropdownMenuSubTrigger>
      ) : null}
      {copyPage ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuSubTrigger id={copyPage} leading={copyLeading} disabled={disabled}>
            {t("common.actions.copy")}
          </DropdownMenuSubTrigger>
        </>
      ) : null}
      {forkPage ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuSubTrigger id={forkPage} leading={forkLeading} disabled={disabled}>
            {t("desktopChat.fork")}
          </DropdownMenuSubTrigger>
        </>
      ) : null}
      {onOpenInNewWindow ? (
        <>
          <DropdownMenuSeparator />
          <Item onSelect={onOpenInNewWindow} leading={windowLeading}>
            {t("sidebar.project.actions.openNewWindow")}
          </Item>
        </>
      ) : null}
      {nested ? null : (
        <>
          <DropdownMenuSeparator />
          {toolbar ? readItem : archiveItem}
        </>
      )}
    </>
  );
}

/**
 * The `Fork ›` page: the chat's history seeds a new chat in its workspace or a new workspace.
 * Null on hosts that cannot build fork context.
 */
export function useChatForkPage(agent: DesktopChatTarget): MenuPageDefinition | null {
  const { t } = useTranslation();
  const toast = useToast();
  const source = useSessionStore((state) => {
    const session = state.sessions[agent.serverId];
    return session?.agents.get(agent.id) ?? session?.agentDetails.get(agent.id) ?? null;
  });
  const supported = useHostFeature(agent.serverId, "agentForkContext");
  const forkAgent = useForkAgent({ serverId: agent.serverId, toast });
  const forkInto = useCallback(
    (target: AssistantForkTarget) => {
      if (source)
        void forkAgent({
          agentId: agent.id,
          agent: source,
          workspaceId: agent.workspaceId,
          target,
        });
    },
    [agent.id, agent.workspaceId, forkAgent, source],
  );
  const forkChat = useCallback(() => forkInto("tab"), [forkInto]);
  const forkWorkspace = useCallback(() => forkInto("workspace"), [forkInto]);
  const pageId = `chat-fork-${desktopChatKey(agent)}`;
  return useMemo(
    () =>
      supported && source
        ? {
            id: pageId,
            title: t("desktopChat.fork"),
            content: (
              <>
                <DropdownMenuItem
                  onSelect={forkChat}
                  leading={forkLeading}
                  testID="desktop-chat-fork-chat"
                >
                  {t("desktopChat.forkNewChat")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={forkWorkspace}
                  leading={forkLeading}
                  testID="desktop-chat-fork-workspace"
                >
                  {t("message.actions.forkInNewWorkspace")}
                </DropdownMenuItem>
              </>
            ),
          }
        : null,
    [forkChat, forkWorkspace, pageId, source, supported, t],
  );
}

const NO_HANDOFFS: readonly DesktopChatTarget[] = [];

/**
 * `handoffs` are the earlier chats nested under `agent`; pinning and archiving apply to the whole
 * chain.
 */
export function useDesktopChatMenu(
  agent: DesktopChatTarget,
  handoffs: readonly DesktopChatTarget[] = NO_HANDOFFS,
) {
  const { t } = useTranslation();
  const toast = useToast();
  const { update, pendingAgent } = useDesktopChatMutation();
  const { archiveAgent, isArchivingAgent } = useArchiveAgent();
  const [renaming, setRenaming] = useState(false);
  const pinned = chainPinnedAt(agent, handoffs) !== null;
  const unread = isDesktopChatUnread(agent);
  const busy =
    pendingAgent !== null || isArchivingAgent({ serverId: agent.serverId, agentId: agent.id });
  const markRead = useCallback(() => {
    void update(agent, { kind: "read" }).catch(() => {});
  }, [agent, update]);
  const togglePin = useCallback(() => {
    if (!pinned) {
      void update(agent, { kind: "pin", pinnedAt: new Date().toISOString() }).catch(() => {});
      return;
    }
    const members = [agent, ...handoffs].filter((member) => desktopChatPinnedAt(member) !== null);
    void (async () => {
      for (const member of members) await update(member, { kind: "unpin" });
    })().catch(() => {});
  }, [agent, handoffs, pinned, update]);
  const toggleRead = useCallback(() => {
    void update(agent, { kind: unread ? "read" : "unread" }).catch(() => {});
  }, [agent, unread, update]);
  const rename = useCallback(() => setRenaming(true), []);
  const closeRename = useCallback(() => setRenaming(false), []);
  const submitRename = useCallback(
    (value: string) => update(agent, { kind: "rename", title: value }),
    [agent, update],
  );
  const openInNewWindow = useCallback(() => {
    void getDesktopHost()
      ?.window?.openNew?.({
        agentLink: buildAgentDeepLink({ serverId: agent.serverId, agentId: agent.id }),
      })
      ?.catch(() => toast.error(t("sidebar.project.actions.openNewWindowFailed")));
  }, [agent.id, agent.serverId, t, toast]);
  const archive = useCallback(() => {
    // The earlier chats go first, so the sidebar never promotes one while the chain is archived.
    const members = [...handoffs, agent];
    void (async () => {
      if (
        members.some((member) => member.turn.phase === "open") &&
        !(await confirmDialog({
          title: t("workspace.tabs.confirmations.archiveRunningAgentTitle"),
          message: t("workspace.tabs.confirmations.archiveRunningAgentMessage"),
          confirmLabel: t("agentList.archiveSheet.archive"),
          cancelLabel: t("common.actions.cancel"),
          destructive: true,
        }))
      )
        return;
      for (const member of members) {
        await archiveAgent({ serverId: member.serverId, agentId: member.id });
      }
      await archiveEmptiedWorkspaces(members);
    })().catch((error) => toast.error(error instanceof Error ? error.message : String(error)));
  }, [agent, archiveAgent, handoffs, t, toast]);
  return {
    busy,
    unread,
    markRead,
    menuProps: {
      pinned,
      unread,
      disabled: busy,
      onPin: togglePin,
      onRead: toggleRead,
      onRename: rename,
      onArchive: archive,
      onOpenInNewWindow: getDesktopHost()?.window?.openNew ? openInNewWindow : undefined,
    },
    renameModal: (
      <AdaptiveRenameModal
        visible={renaming}
        title={t("renameModal.rename")}
        initialValue={agent.title ?? ""}
        onClose={closeRename}
        onSubmit={submitRename}
        testID={`desktop-chat-rename-${desktopChatKey(agent)}`}
      />
    ),
  };
}
