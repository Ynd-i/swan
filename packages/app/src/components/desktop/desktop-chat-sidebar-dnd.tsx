import { useCallback, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DroppableContainer,
  type Over,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  type SortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DraggableListDragHandleProps } from "@/components/draggable-list.types";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import { hasVisibleOrderChanged, mergeWithRemainder } from "@/utils/sidebar-reorder";
import type { DesktopChatProject } from "./desktop-chat-model";
import { ChatProject } from "./desktop-chat-project";
import { CHAT_SECTION, useChatSectionsStore } from "./desktop-chat-sections-store";

// The Mac chat sidebar drags in one dnd-kit context, so a project row can leave its section:
// section headers reorder the sections below Pinned, and a project header reorders within a
// manually sorted section or drops onto another section that holds projects.

type SidebarDragData =
  | { type: "section"; sectionId: string; label: string; acceptsProjects: boolean }
  | { type: "project"; viewKey: string; sectionId: string; reorderable: boolean; label: string };

function dragData(
  item: Pick<Active | Over | DroppableContainer, "data"> | null | undefined,
): SidebarDragData | undefined {
  return item?.data.current as SidebarDragData | undefined;
}

// Project ids are view keys; section ids are prefixed so the two never collide.
function sectionDndId(sectionId: string): string {
  return `section:${sectionId}`;
}

const sidebarCollision: CollisionDetection = (args) => {
  const active = dragData(args.active);
  const only = (match: (data: SidebarDragData) => boolean) => ({
    ...args,
    droppableContainers: args.droppableContainers.filter((container) =>
      match(container.data.current as SidebarDragData),
    ),
  });
  const sectionHits = pointerWithin(only((data) => data.type === "section"));
  if (active?.type !== "project") return sectionHits;
  const ownSection = dragData(args.droppableContainers.find((c) => c.id === sectionHits[0]?.id));
  if (!active.reorderable || ownSection?.sectionId !== active.sectionId) return sectionHits;
  const rowHits = pointerWithin(
    only((data) => data.type === "project" && data.sectionId === active.sectionId),
  );
  return rowHits.length > 0 ? rowHits : sectionHits;
};

export function SidebarDndContext({
  sectionOrder,
  children,
}: {
  /** Every draggable section in order, including a hidden Projects section. */
  sectionOrder: string[];
  children: ReactNode;
}) {
  const setSectionOrder = useChatSectionsStore((state) => state.setSectionOrder);
  const moveProject = useChatSectionsStore((state) => state.moveProject);
  const getProjectOrder = useSidebarOrderStore((state) => state.getProjectOrder);
  const setProjectOrder = useSidebarOrderStore((state) => state.setProjectOrder);
  const [dragged, setDragged] = useState<SidebarDragData | null>(null);
  // The distance keeps a header click a click: it still collapses the section or project.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));
  const start = useCallback(
    (event: DragStartEvent) => setDragged(dragData(event.active) ?? null),
    [],
  );
  const cancel = useCallback(() => setDragged(null), []);
  const end = useCallback(
    ({ active, over }: DragEndEvent) => {
      setDragged(null);
      const from = dragData(active);
      const to = dragData(over);
      if (!from || !to || active.id === over?.id) return;
      if (from.type === "section") {
        if (to.type !== "section") return;
        setSectionOrder(
          arrayMove(
            sectionOrder,
            sectionOrder.indexOf(from.sectionId),
            sectionOrder.indexOf(to.sectionId),
          ),
        );
        return;
      }
      if (to.type === "project") {
        // The collision only offers rows of the dragged project's own, manually sorted section.
        const { items, index } = active.data.current!.sortable;
        const reorderedVisibleKeys = arrayMove(
          (items as string[]).slice(),
          index as number,
          over!.data.current!.sortable.index as number,
        );
        const currentOrder = getProjectOrder();
        if (!hasVisibleOrderChanged({ currentOrder, reorderedVisibleKeys })) return;
        setProjectOrder(mergeWithRemainder({ currentOrder, reorderedVisibleKeys }));
        return;
      }
      if (!to.acceptsProjects || to.sectionId === from.sectionId) return;
      moveProject(from.viewKey, to.sectionId === CHAT_SECTION.projects ? null : to.sectionId);
    },
    [getProjectOrder, moveProject, sectionOrder, setProjectOrder, setSectionOrder],
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sidebarCollision}
      onDragStart={start}
      onDragCancel={cancel}
      onDragEnd={end}
    >
      {children}
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {dragged ? (
            <View style={styles.chip}>
              <Text numberOfLines={1} style={styles.chipText}>
                {dragged.label}
              </Text>
            </View>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

export function SortableSections({
  sectionIds,
  children,
}: {
  sectionIds: string[];
  children: ReactNode;
}) {
  const ids = useMemo(() => sectionIds.map(sectionDndId), [sectionIds]);
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      {children}
    </SortableContext>
  );
}

/** A sortable row's header handle and the wrapper style that slides and dims it while dragging. */
function useSortableRow(id: string, data: SidebarDragData) {
  const sortable = useSortable({ id, data });
  const { attributes, listeners, setActivatorNodeRef, transform, transition, isDragging } =
    sortable;
  const dragHandleProps = useMemo<DraggableListDragHandleProps>(
    () => ({
      attributes: attributes as unknown as Record<string, unknown>,
      listeners,
      setActivatorNodeRef: setActivatorNodeRef as (node: unknown) => void,
    }),
    [attributes, listeners, setActivatorNodeRef],
  );
  const translate = CSS.Translate.toString(transform);
  const style = useMemo(
    () => ({ transform: translate, transition, opacity: isDragging ? 0.4 : 1 }),
    [isDragging, transition, translate],
  );
  return { sortable, dragHandleProps, style };
}

/** A section below Pinned; its header drags it, and it lights up as a project's drop target. */
export function SortableSection({
  sectionId,
  label,
  acceptsProjects,
  children,
}: {
  sectionId: string;
  label: string;
  acceptsProjects: boolean;
  children: (dragHandleProps: DraggableListDragHandleProps) => ReactNode;
}) {
  const { sortable, dragHandleProps, style } = useSortableRow(sectionDndId(sectionId), {
    type: "section",
    sectionId,
    label,
    acceptsProjects,
  });
  const { active, isOver } = sortable;
  const dragging = dragData(active);
  const dropTarget =
    isOver && acceptsProjects && dragging?.type === "project" && dragging.sectionId !== sectionId;
  return (
    <div ref={sortable.setNodeRef} style={style}>
      <View style={[styles.section, dropTarget && styles.dropTarget]}>
        {children(dragHandleProps)}
      </View>
    </div>
  );
}

// Projects sorted by recent activity cannot be reordered, so their rows stay put while dragging.
const keepPlace: SortingStrategy = () => null;

/** A section's projects, each dragged by its header. */
export function SortableProjects({
  sectionId,
  projects,
  reorderable,
  selectedKey,
}: {
  sectionId: string;
  projects: DesktopChatProject[];
  reorderable: boolean;
  selectedKey: string | null;
}) {
  const ids = useMemo(() => projects.map((entry) => entry.project.viewKey), [projects]);
  return (
    <SortableContext
      id={`projects:${sectionId}`}
      items={ids}
      strategy={reorderable ? verticalListSortingStrategy : keepPlace}
    >
      {projects.map((entry) => (
        <SortableProject
          key={entry.project.viewKey}
          entry={entry}
          sectionId={sectionId}
          reorderable={reorderable}
          selectedKey={selectedKey}
        />
      ))}
    </SortableContext>
  );
}

function SortableProject({
  entry,
  sectionId,
  reorderable,
  selectedKey,
}: {
  entry: DesktopChatProject;
  sectionId: string;
  reorderable: boolean;
  selectedKey: string | null;
}) {
  const viewKey = entry.project.viewKey;
  const { sortable, dragHandleProps, style } = useSortableRow(viewKey, {
    type: "project",
    viewKey,
    sectionId,
    reorderable,
    label: entry.project.projectName,
  });
  return (
    <div ref={sortable.setNodeRef} style={style}>
      <ChatProject entry={entry} selectedKey={selectedKey} dragHandleProps={dragHandleProps} />
    </div>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: { borderRadius: 8 },
  dropTarget: {
    backgroundColor: theme.colors.surfaceSidebarHover,
    outlineColor: theme.colors.border,
    outlineStyle: "solid",
    outlineWidth: 1,
  },
  // Sized by the overlay to the dragged block; the chip keeps to its first row.
  chip: {
    height: 30,
    justifyContent: "center",
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebarSelected,
  },
  chipText: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
}));
