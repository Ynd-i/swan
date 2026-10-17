import { useCallback, useMemo } from "react";
import { Bell, Search } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { SidebarDisplayPreferencesMenu } from "@/components/sidebar/display-preferences/menu";
import type { DraggableListDragHandleProps } from "@/components/draggable-list.types";
import { useSidebarModel } from "@/components/sidebar/sidebar-model";
import { Button } from "@/components/ui/button";
import { useAggregatedAgents } from "@/hooks/use-aggregated-agents";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import type { Theme } from "@/styles/theme";
import { buildDesktopChatSidebar, partitionChatSections } from "./desktop-chat-model";
import { HandoffChainsContext } from "./desktop-chat-row";
import { ChatInbox } from "./desktop-chat-inbox";
import { SectionDialogsProvider } from "./desktop-chat-section-menus";
import {
  CustomSection,
  PinnedSection,
  ProjectsSection,
  RecentSection,
} from "./desktop-chat-sections";
import {
  CHAT_SECTION,
  orderChatSections,
  useChatSectionsStore,
} from "./desktop-chat-sections-store";
import { SidebarDndContext, SortableSection, SortableSections } from "./desktop-chat-sidebar-dnd";
import { useActiveDesktopChat } from "./use-desktop-chat";
import { usesDesktopShell } from "./desktop-shell";

const SearchIcon = withUnistyles(Search);
const BellIcon = withUnistyles(Bell);
const mutedIcon = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const activeIcon = (theme: Theme) => ({ color: theme.colors.foreground });
function openSearch() {
  useKeyboardShortcutsStore.getState().setCommandCenterOpen(true);
}

// Electron on Windows and Linux keeps the workspace sidebar.
export function DesktopChatSidebarHeader() {
  return usesDesktopShell ? <ChatSidebarHeader /> : null;
}

export function DesktopChatSidebar(props: { onAddProject: () => void }) {
  return usesDesktopShell ? (
    <SectionDialogsProvider>
      <ChatSidebarList {...props} />
    </SectionDialogsProvider>
  ) : null;
}

function ChatSidebarHeader() {
  const { t } = useTranslation();
  const inboxOpen = useChatSectionsStore((state) => state.inboxOpen);
  const toggleInbox = useChatSectionsStore((state) => state.toggleInbox);
  const inboxState = useMemo(() => ({ selected: inboxOpen }), [inboxOpen]);
  return (
    <View style={styles.header}>
      <Text style={styles.brand}>Swan</Text>
      <View style={styles.spacer} />
      <SidebarDisplayPreferencesMenu chatMode />
      <HeaderToggleButton
        onPress={toggleInbox}
        tooltipLabel={t("desktopChat.sections.notifications")}
        tooltipKeys={[]}
        tooltipSide="bottom"
        accessibilityRole="button"
        accessibilityLabel={t("desktopChat.sections.notifications")}
        accessibilityState={inboxState}
        style={inboxOpen ? styles.activeHeaderButton : undefined}
        testID="desktop-chat-inbox-toggle"
      >
        <BellIcon size={18} uniProps={inboxOpen ? activeIcon : mutedIcon} />
      </HeaderToggleButton>
      <HeaderToggleButton
        onPress={openSearch}
        tooltipLabel={t("sidebar.sections.search")}
        tooltipKeys={[]}
        tooltipSide="bottom"
        accessibilityRole="button"
        accessibilityLabel={t("sidebar.sections.search")}
        testID="sidebar-search"
      >
        <SearchIcon size={18} uniProps={mutedIcon} />
      </HeaderToggleButton>
    </View>
  );
}

/**
 * Pinned, then custom sections, Recent and Projects, as in the reference sidebar, until the user
 * drags the sections into another order.
 */
function ChatSidebarList({ onAddProject }: { onAddProject: () => void }) {
  const { t } = useTranslation();
  const { projects, allProjects } = useSidebarModel();
  const { agents } = useAggregatedAgents({ demand: false });
  const selected = useActiveDesktopChat();
  const selectedKey = selected ? `${selected.serverId}:${selected.agentId}` : null;
  const sections = useChatSectionsStore((state) => state.sections);
  const chatSection = useChatSectionsStore((state) => state.chatSection);
  const projectSection = useChatSectionsStore((state) => state.projectSection);
  const hideProjects = useChatSectionsStore((state) => state.hideProjects);
  const pinnedProjects = useChatSectionsStore((state) => state.pinnedProjects);
  const inboxOpen = useChatSectionsStore((state) => state.inboxOpen);
  const savedSectionOrder = useChatSectionsStore((state) => state.sectionOrder);
  const model = useMemo(() => buildDesktopChatSidebar({ projects, agents }), [projects, agents]);
  const partition = useMemo(
    () =>
      partitionChatSections({
        recent: model.recent,
        projects: model.projects,
        sections,
        chatSection,
        projectSection,
        pinnedProjects,
        handoffs: model.handoffs,
      }),
    [
      chatSection,
      model.handoffs,
      model.projects,
      model.recent,
      pinnedProjects,
      projectSection,
      sections,
    ],
  );
  const inboxChats = useMemo(() => [...model.pinned, ...model.recent], [model]);
  const sectionOrder = useMemo(
    () =>
      orderChatSections(
        savedSectionOrder,
        sections.map((section) => section.id),
      ),
    [savedSectionOrder, sections],
  );
  const shownSections = useMemo(
    () => (hideProjects ? sectionOrder.filter((id) => id !== CHAT_SECTION.projects) : sectionOrder),
    [hideProjects, sectionOrder],
  );
  const renderSection = useCallback(
    (sectionId: string, dragHandleProps: DraggableListDragHandleProps) => {
      if (sectionId === CHAT_SECTION.recent)
        return (
          <RecentSection
            chats={partition.recent}
            selectedKey={selectedKey}
            dragHandleProps={dragHandleProps}
          />
        );
      if (sectionId === CHAT_SECTION.projects)
        return (
          <ProjectsSection
            projects={partition.projects}
            selectedKey={selectedKey}
            onAddProject={onAddProject}
            dragHandleProps={dragHandleProps}
          />
        );
      const section = partition.custom.find((custom) => custom.id === sectionId);
      return section ? (
        <CustomSection
          section={section}
          selectedKey={selectedKey}
          dragHandleProps={dragHandleProps}
        />
      ) : null;
    },
    [onAddProject, partition, selectedKey],
  );
  const sectionLabel = (sectionId: string) => {
    if (sectionId === CHAT_SECTION.recent) return t("agentList.dateSections.recent");
    if (sectionId === CHAT_SECTION.projects) return t("desktopChat.sections.projects");
    return sections.find((section) => section.id === sectionId)?.name ?? "";
  };
  return (
    <ScrollView
      style={styles.list}
      contentContainerStyle={styles.listContent}
      testID="sidebar-project-list"
    >
      <HandoffChainsContext.Provider value={model.handoffs}>
        {inboxOpen ? (
          <ChatInbox chats={inboxChats} selectedKey={selectedKey} />
        ) : (
          <SidebarDndContext sectionOrder={sectionOrder}>
            <PinnedSection
              chats={model.pinned}
              projects={partition.pinnedProjects}
              selectedKey={selectedKey}
            />
            <SortableSections sectionIds={shownSections}>
              {shownSections.map((sectionId) => (
                <SortableSection
                  key={sectionId}
                  sectionId={sectionId}
                  label={sectionLabel(sectionId)}
                  acceptsProjects={sectionId !== CHAT_SECTION.recent}
                >
                  {(dragHandleProps) => renderSection(sectionId, dragHandleProps)}
                </SortableSection>
              ))}
            </SortableSections>
          </SidebarDndContext>
        )}
        {model.projects.length === 0 && model.recent.length === 0 && model.pinned.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.secondaryText}>
              {t(allProjects.length > 0 ? "sidebar.filterEmpty.description" : "sessions.empty")}
            </Text>
            {allProjects.length === 0 ? (
              <Button variant="ghost" onPress={onAddProject}>
                {t("sidebar.actions.addProject")}
              </Button>
            ) : null}
          </View>
        ) : null}
      </HandoffChainsContext.Provider>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: { height: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 4 },
  brand: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  spacer: { flex: 1 },
  activeHeaderButton: { backgroundColor: theme.colors.surfaceSidebarSelected, borderRadius: 8 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 8, paddingBottom: 16 },
  secondaryText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    flexShrink: 1,
  },
  empty: { padding: 8, gap: 12 },
}));
