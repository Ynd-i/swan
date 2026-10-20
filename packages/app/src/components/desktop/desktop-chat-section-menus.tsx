import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { withUnistyles } from "react-native-unistyles";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  type MenuPageDefinition,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/contexts/toast-context";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import type { Theme } from "@/styles/theme";
import { confirmDialog } from "@/utils/confirm-dialog";
import { useChatSectionsStore, type ChatSection } from "./desktop-chat-sections-store";
import { archiveEmptiedWorkspaces } from "./use-desktop-chat";

const PlusIcon = withUnistyles(Plus);
const mutedIcon = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const newSectionLeading = <PlusIcon size={16} uniProps={mutedIcon} />;

interface SectionDialogs {
  /** Opens the New section dialog; `onCreated` receives the new section's id. */
  create: (onCreated?: (sectionId: string) => void) => void;
  edit: (section: ChatSection) => void;
}

const SectionDialogsContext = createContext<SectionDialogs | null>(null);

/** Hosts the section dialogs once, so a menu that opens one can close underneath it. */
export function SectionDialogsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const createSection = useChatSectionsStore((state) => state.createSection);
  const renameSection = useChatSectionsStore((state) => state.renameSection);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ChatSection | null>(null);
  const onCreatedRef = useRef<((sectionId: string) => void) | undefined>(undefined);
  const dialogs = useMemo<SectionDialogs>(
    () => ({
      create: (onCreated) => {
        onCreatedRef.current = onCreated;
        setCreating(true);
      },
      edit: setEditing,
    }),
    [],
  );
  const closeCreate = useCallback(() => setCreating(false), []);
  const submitCreate = useCallback(
    (name: string) => {
      const sectionId = createSection(name.trim());
      onCreatedRef.current?.(sectionId);
    },
    [createSection],
  );
  const closeEdit = useCallback(() => setEditing(null), []);
  const submitEdit = useCallback(
    (name: string) => {
      if (editing) renameSection(editing.id, name.trim());
    },
    [editing, renameSection],
  );
  return (
    <SectionDialogsContext.Provider value={dialogs}>
      {children}
      <AdaptiveRenameModal
        visible={creating}
        title={t("desktopChat.sections.newSection")}
        description={t("desktopChat.sections.createDescription")}
        initialValue=""
        placeholder={t("desktopChat.sections.namePlaceholder")}
        submitLabel={t("desktopChat.sections.create")}
        onClose={closeCreate}
        onSubmit={submitCreate}
        testID="desktop-section-create"
      />
      <AdaptiveRenameModal
        visible={editing !== null}
        title={t("desktopChat.sections.editTitle")}
        initialValue={editing?.name ?? ""}
        placeholder={t("desktopChat.sections.namePlaceholder")}
        submitLabel={t("desktopChat.sections.save")}
        onClose={closeEdit}
        onSubmit={submitEdit}
        testID="desktop-section-edit"
      />
    </SectionDialogsContext.Provider>
  );
}

export function useSectionDialogs(): SectionDialogs | null {
  return useContext(SectionDialogsContext);
}

function SectionMoveItem({
  section,
  selected,
  onMove,
}: {
  section: ChatSection;
  selected: boolean;
  onMove: (sectionId: string | null) => void;
}) {
  // Choosing the current section again takes the item back out of it.
  const select = useCallback(
    () => onMove(selected ? null : section.id),
    [onMove, section.id, selected],
  );
  return (
    <DropdownMenuItem
      selected={selected}
      onSelect={select}
      testID={`desktop-section-move-${section.id}`}
    >
      {section.name}
    </DropdownMenuItem>
  );
}

/** The `Section ›` page of a chat or project menu: its sections, then New section…. */
export function useSectionMovePage(
  pageId: string,
  current: string | undefined,
  onMove: (sectionId: string | null) => void,
): MenuPageDefinition {
  const { t } = useTranslation();
  const sections = useChatSectionsStore((state) => state.sections);
  const dialogs = useSectionDialogs();
  const createAndMove = useCallback(() => dialogs?.create(onMove), [dialogs, onMove]);
  return useMemo(
    () => ({
      id: pageId,
      title: t("desktopChat.sections.section"),
      content: (
        <>
          {sections.map((section) => (
            <SectionMoveItem
              key={section.id}
              section={section}
              selected={current === section.id}
              onMove={onMove}
            />
          ))}
          {sections.length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            leading={newSectionLeading}
            onSelect={createAndMove}
            testID="desktop-section-move-new"
          >
            {t("desktopChat.sections.newSectionMenu")}
          </DropdownMenuItem>
        </>
      ),
    }),
    [createAndMove, current, onMove, pageId, sections, t],
  );
}

/** Archives every chat in a section or project after one confirmation that names the count. */
export function useArchiveChats(chats: AggregatedAgent[], message: string) {
  const { t } = useTranslation();
  const toast = useToast();
  const { archiveAgent } = useArchiveAgent();
  return useCallback(() => {
    void (async () => {
      const confirmed = await confirmDialog({
        title: t("desktopChat.sections.archiveChats"),
        message,
        confirmLabel: t("agentList.archiveSheet.archive"),
        cancelLabel: t("common.actions.cancel"),
        destructive: true,
      });
      if (!confirmed) return;
      for (const agent of chats)
        await archiveAgent({ serverId: agent.serverId, agentId: agent.id });
      await archiveEmptiedWorkspaces(chats);
    })().catch((error) => toast.error(error instanceof Error ? error.message : String(error)));
  }, [archiveAgent, chats, message, t, toast]);
}
