import { useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import type { ChatSectionSort } from "./desktop-chat-model";

// ponytail: sections live in this machine's storage only; sync them through agent labels if
// another client ever needs them.

/** The built-in sections; custom sections use generated ids that never collide with these. */
export const CHAT_SECTION = { pinned: "pinned", recent: "recent", projects: "projects" } as const;

const DEFAULT_SORT: Record<string, ChatSectionSort> = {
  [CHAT_SECTION.pinned]: "manual",
  [CHAT_SECTION.projects]: "manual",
};

/** `projects` nests each project's chats under it; `merged` keeps every chat in Recent. */
export type SidebarOrganize = "projects" | "merged";

export interface ChatSection {
  id: string;
  name: string;
}

interface ChatSectionsPersistedState {
  sections: ChatSection[];
  sortBySection: Record<string, ChatSectionSort>;
  chatOrderBySection: Record<string, string[]>;
  collapsedSections: string[];
  hideProjects: boolean;
  /** Chat key (`serverId:agentId`) to custom section id. */
  chatSection: Record<string, string>;
  /** Project view key to custom section id. */
  projectSection: Record<string, string>;
  /** Project view keys shown in Pinned, in pin order. */
  pinnedProjects: string[];
  organize: SidebarOrganize;
  /** Custom section ids, Recent and Projects, in the order the user dragged them. */
  sectionOrder: string[];
}

interface ChatSectionsState extends ChatSectionsPersistedState {
  /** The notification view replaces the sections while open; it is not persisted. */
  inboxOpen: boolean;
  toggleInbox: () => void;
  setSort: (sectionId: string, sort: ChatSectionSort) => void;
  setChatOrder: (sectionId: string, keys: string[]) => void;
  toggleCollapsed: (sectionId: string) => void;
  setHideProjects: (hide: boolean) => void;
  createSection: (name: string) => string;
  renameSection: (sectionId: string, name: string) => void;
  removeSection: (sectionId: string) => void;
  moveChat: (chatKey: string, sectionId: string | null) => void;
  moveProject: (viewKey: string, sectionId: string | null) => void;
  togglePinnedProject: (viewKey: string) => void;
  setOrganize: (organize: SidebarOrganize) => void;
  setSectionOrder: (sectionIds: string[]) => void;
}

const SortSchema = z.enum(["latest", "manual"]);
export const ChatSectionsPersistedSchema = z.strictObject({
  sections: z.array(z.strictObject({ id: z.string(), name: z.string() })),
  sortBySection: z.record(z.string(), SortSchema),
  chatOrderBySection: z.record(z.string(), z.array(z.string())),
  collapsedSections: z.array(z.string()),
  hideProjects: z.boolean(),
  chatSection: z.record(z.string(), z.string()),
  projectSection: z.record(z.string(), z.string()),
  // Fields added after the first release stay optional so earlier saved state still loads.
  pinnedProjects: z.array(z.string()).optional(),
  organize: z.enum(["projects", "merged"]).optional(),
  sectionOrder: z.array(z.string()).optional(),
});

export function sectionSort(
  state: Pick<ChatSectionsPersistedState, "sortBySection">,
  sectionId: string,
): ChatSectionSort {
  return state.sortBySection[sectionId] ?? DEFAULT_SORT[sectionId] ?? "latest";
}

/**
 * The draggable sections below Pinned. Without a saved order, custom sections come first and then
 * Recent and Projects; a section the saved order has not placed yet takes that default slot, and
 * saved ids that no longer exist are skipped.
 */
export function orderChatSections(
  saved: readonly string[],
  customIds: readonly string[],
): string[] {
  const builtIn = [CHAT_SECTION.recent, CHAT_SECTION.projects];
  const known = new Set([...customIds, ...builtIn]);
  const placed = saved.filter((id) => known.has(id));
  const unplaced = (id: string) => !placed.includes(id);
  return [...customIds.filter(unplaced), ...placed, ...builtIn.filter(unplaced)];
}

function withEntry(record: Record<string, string>, key: string, value: string | null) {
  const next = { ...record };
  if (value) next[key] = value;
  else delete next[key];
  return next;
}

function withoutSection(record: Record<string, string>, sectionId: string) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== sectionId));
}

// Assignments and orders are never pruned against the current lists: those are empty on a cold
// start, before any host connects. Readers ignore keys that no longer match anything.
export const useChatSectionsStore = create<ChatSectionsState>()(
  persist(
    (set) => ({
      sections: [],
      sortBySection: {},
      chatOrderBySection: {},
      collapsedSections: [],
      hideProjects: false,
      chatSection: {},
      projectSection: {},
      pinnedProjects: [],
      organize: "projects",
      sectionOrder: [],
      inboxOpen: false,
      toggleInbox: () => set((state) => ({ inboxOpen: !state.inboxOpen })),
      setSort: (sectionId, sort) =>
        set((state) => ({ sortBySection: { ...state.sortBySection, [sectionId]: sort } })),
      setChatOrder: (sectionId, keys) =>
        set((state) => ({
          chatOrderBySection: { ...state.chatOrderBySection, [sectionId]: keys },
        })),
      toggleCollapsed: (sectionId) =>
        set((state) => ({
          collapsedSections: state.collapsedSections.includes(sectionId)
            ? state.collapsedSections.filter((id) => id !== sectionId)
            : [...state.collapsedSections, sectionId],
        })),
      setHideProjects: (hideProjects) => set({ hideProjects }),
      createSection: (name) => {
        const id = `section-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        set((state) => ({ sections: [...state.sections, { id, name }] }));
        return id;
      },
      renameSection: (sectionId, name) =>
        set((state) => ({
          sections: state.sections.map((section) =>
            section.id === sectionId ? { ...section, name } : section,
          ),
        })),
      // Removing a section returns its chats and projects to their default places.
      removeSection: (sectionId) =>
        set((state) => ({
          sections: state.sections.filter((section) => section.id !== sectionId),
          chatSection: withoutSection(state.chatSection, sectionId),
          projectSection: withoutSection(state.projectSection, sectionId),
        })),
      moveChat: (chatKey, sectionId) =>
        set((state) => ({ chatSection: withEntry(state.chatSection, chatKey, sectionId) })),
      moveProject: (viewKey, sectionId) =>
        set((state) => ({ projectSection: withEntry(state.projectSection, viewKey, sectionId) })),
      togglePinnedProject: (viewKey) =>
        set((state) => ({
          pinnedProjects: state.pinnedProjects.includes(viewKey)
            ? state.pinnedProjects.filter((key) => key !== viewKey)
            : [...state.pinnedProjects, viewKey],
        })),
      setOrganize: (organize) => set({ organize }),
      setSectionOrder: (sectionOrder) => set({ sectionOrder }),
    }),
    {
      name: "desktop-chat-sections",
      storage: createValidatedPersistStorage(AsyncStorage, ChatSectionsPersistedSchema),
      partialize: (state) => ({
        sections: state.sections,
        sortBySection: state.sortBySection,
        chatOrderBySection: state.chatOrderBySection,
        collapsedSections: state.collapsedSections,
        hideProjects: state.hideProjects,
        chatSection: state.chatSection,
        projectSection: state.projectSection,
        pinnedProjects: state.pinnedProjects,
        organize: state.organize,
        sectionOrder: state.sectionOrder,
      }),
      version: 1,
    },
  ),
);

const NO_ORDER: string[] = [];

export function useSectionSort(sectionId: string) {
  const sort = useChatSectionsStore((state) => sectionSort(state, sectionId));
  const order = useChatSectionsStore((state) => state.chatOrderBySection[sectionId] ?? NO_ORDER);
  const setSortFor = useChatSectionsStore((state) => state.setSort);
  const setSort = useCallback(
    (next: ChatSectionSort) => setSortFor(sectionId, next),
    [sectionId, setSortFor],
  );
  return { sort, order, setSort };
}

export function useSectionCollapsed(sectionId: string) {
  const collapsed = useChatSectionsStore((state) => state.collapsedSections.includes(sectionId));
  const toggleFor = useChatSectionsStore((state) => state.toggleCollapsed);
  const toggle = useCallback(() => toggleFor(sectionId), [sectionId, toggleFor]);
  return { collapsed, toggle };
}
