import { expect, it } from "vitest";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import { ChatSectionsPersistedSchema, orderChatSections } from "./desktop-chat-sections-store";

it("still loads sections saved before pinned projects, sidebar organization and section order existed", async () => {
  const saved = {
    state: {
      sections: [{ id: "section-a", name: "Work" }],
      sortBySection: { recent: "manual" },
      chatOrderBySection: {},
      collapsedSections: [],
      hideProjects: false,
      chatSection: { "local:agent": "section-a" },
      projectSection: {},
    },
    version: 1,
  };
  const entries: Record<string, string | null> = {
    "desktop-chat-sections": JSON.stringify(saved),
  };
  const storage = createValidatedPersistStorage(
    {
      getItem: (name) => entries[name] ?? null,
      setItem: (name, value) => {
        entries[name] = value;
      },
      removeItem: (name) => {
        entries[name] = null;
      },
    },
    ChatSectionsPersistedSchema,
  );
  // A state the schema rejects is deleted, which would drop every section the user made.
  expect(await storage.getItem("desktop-chat-sections")).toEqual(saved);
  expect(entries["desktop-chat-sections"]).not.toBeNull();
});

it("orders sections by the saved drag order and slots in sections it has not placed", () => {
  // No saved order keeps custom sections above Recent and Projects.
  expect(orderChatSections([], ["a", "b"])).toEqual(["a", "b", "recent", "projects"]);
  expect(orderChatSections(["recent", "a", "projects"], ["a"])).toEqual([
    "recent",
    "a",
    "projects",
  ]);
  // A new section goes to the top of the list; a removed one is skipped.
  expect(orderChatSections(["recent", "gone", "a", "projects"], ["a", "new"])).toEqual([
    "new",
    "recent",
    "a",
    "projects",
  ]);
  // Built-in sections the saved order lacks keep their place at the end.
  expect(orderChatSections(["a"], ["a"])).toEqual(["a", "recent", "projects"]);
});
