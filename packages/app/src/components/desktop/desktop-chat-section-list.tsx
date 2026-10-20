import { useCallback } from "react";
import { DraggableList } from "@/components/draggable-list";
import type { DraggableRenderItemInfo } from "@/components/draggable-list.types";
import { SidebarGroupToggleRow } from "@/components/sidebar/sidebar-group-toggle-row";
import { useLimitedSidebarGroup } from "@/components/sidebar/use-limited-sidebar-group";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { mergeWithRemainder } from "@/utils/sidebar-reorder";
import { desktopChatKey, type ChatSectionSort } from "./desktop-chat-model";
import { ChatRow } from "./desktop-chat-row";
import { useChatSectionsStore } from "./desktop-chat-sections-store";

function chatKeyExtractor(agent: AggregatedAgent): string {
  return desktopChatKey(agent);
}

/** A section's chats, draggable while the section is in manual order. */
export function SectionChatList({
  sectionId,
  chats,
  sort,
  selectedKey,
  limit,
  indented = false,
  moreTestID,
}: {
  sectionId: string;
  chats: AggregatedAgent[];
  sort: ChatSectionSort;
  selectedKey: string | null;
  limit?: number;
  indented?: boolean;
  moreTestID: string;
}) {
  const setChatOrder = useChatSectionsStore((state) => state.setChatOrder);
  const { visibleItems, expanded, canToggle, toggleExpanded } = useLimitedSidebarGroup(
    chats,
    limit,
  );
  const handleDragEnd = useCallback(
    (reordered: AggregatedAgent[]) =>
      setChatOrder(
        sectionId,
        mergeWithRemainder({
          currentOrder: chats.map(desktopChatKey),
          reorderedVisibleKeys: reordered.map(desktopChatKey),
        }),
      ),
    [chats, sectionId, setChatOrder],
  );
  const renderItem = useCallback(
    ({ item, dragHandleProps }: DraggableRenderItemInfo<AggregatedAgent>) => (
      <ChatRow
        agent={item}
        selectedKey={selectedKey}
        indented={indented}
        dragHandleProps={dragHandleProps}
      />
    ),
    [indented, selectedKey],
  );
  return (
    <>
      {sort === "manual" ? (
        <DraggableList
          testID={`desktop-section-list-${sectionId}`}
          data={visibleItems}
          keyExtractor={chatKeyExtractor}
          renderItem={renderItem}
          onDragEnd={handleDragEnd}
          scrollEnabled={false}
          useDragHandle
        />
      ) : (
        visibleItems.map((agent) => (
          <ChatRow
            key={desktopChatKey(agent)}
            agent={agent}
            selectedKey={selectedKey}
            indented={indented}
          />
        ))
      )}
      {canToggle ? (
        <SidebarGroupToggleRow
          expanded={expanded}
          onPress={toggleExpanded}
          indented={indented}
          testID={moreTestID}
        />
      ) : null}
    </>
  );
}
