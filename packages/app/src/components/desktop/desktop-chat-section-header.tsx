import { useCallback, useMemo, useState, type ReactNode, type Ref } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { DraggableListDragHandleProps } from "@/components/draggable-list.types";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  type MenuPageDefinition,
} from "@/components/ui/dropdown-menu";
import type { Theme } from "@/styles/theme";
import type { ChatSectionSort } from "./desktop-chat-model";

const DownIcon = withUnistyles(ChevronDown);
const RightIcon = withUnistyles(ChevronRight);
const MoreIcon = withUnistyles(MoreHorizontal);
const mutedIcon = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/**
 * A sidebar section title. Pressing it collapses the section; hovering reveals its sort menu and
 * any extra actions, the way the reference sidebar reveals `…` and `+` beside a section.
 */
export function ChatSectionHeader({
  title,
  collapsed,
  onToggle,
  sort,
  onSortChange,
  actions,
  contextMenu,
  dragHandleProps,
  testID,
}: {
  title: string;
  collapsed: boolean;
  onToggle?: () => void;
  sort?: ChatSectionSort;
  onSortChange?: (sort: ChatSectionSort) => void;
  actions?: ReactNode;
  /** A right-click menu on the header, with any submenu pages it declares. */
  contextMenu?: { items: ReactNode; pages?: MenuPageDefinition[] };
  /** Drags the whole section; dnd-kit's role would replace the title button's. */
  dragHandleProps?: DraggableListDragHandleProps;
  testID: string;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const enter = useCallback(() => setHovered(true), []);
  const leave = useCallback(() => setHovered(false), []);
  const sortLatest = useCallback(() => onSortChange?.("latest"), [onSortChange]);
  const sortManual = useCallback(() => onSortChange?.("manual"), [onSortChange]);
  const revealed = hovered || menuOpen || contextOpen;
  const accessibilityState = useMemo(() => ({ expanded: !collapsed }), [collapsed]);
  const chevron = collapsed ? (
    <RightIcon size={13} uniProps={mutedIcon} />
  ) : (
    <DownIcon size={13} uniProps={mutedIcon} />
  );
  const {
    role: _dragRole,
    tabIndex: _dragTabIndex,
    "aria-roledescription": _dragRoleDescription,
    ...dragAttributes
  } = dragHandleProps?.attributes ?? {};
  const header = (
    <View
      {...dragAttributes}
      {...dragHandleProps?.listeners}
      ref={dragHandleProps?.setActivatorNodeRef as unknown as Ref<View>}
      style={styles.header}
      onPointerEnter={enter}
      onPointerLeave={leave}
      testID={testID}
    >
      <Pressable
        onPress={onToggle}
        disabled={!onToggle}
        style={styles.titleButton}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={accessibilityState}
        testID={`${testID}-toggle`}
      >
        <Text style={styles.title}>{title}</Text>
        {collapsed || revealed ? chevron : null}
      </Pressable>
      <View style={[styles.actions, !revealed && styles.hidden]}>
        {sort ? (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              onFocus={enter}
              onBlur={leave}
              style={styles.actionButton}
              accessibilityRole="button"
              accessibilityLabel={t("desktopChat.sections.actions")}
              testID={`${testID}-menu`}
            >
              <MoreIcon size={16} uniProps={mutedIcon} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" width={190}>
              <DropdownMenuItem
                selected={sort === "latest"}
                onSelect={sortLatest}
                testID={`${testID}-sort-latest`}
              >
                {t("desktopChat.sections.sortLatest")}
              </DropdownMenuItem>
              <DropdownMenuItem
                selected={sort === "manual"}
                onSelect={sortManual}
                testID={`${testID}-sort-manual`}
              >
                {t("desktopChat.sections.sortManual")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {actions}
      </View>
    </View>
  );
  if (!contextMenu) return header;
  return (
    <ContextMenu open={contextOpen} onOpenChange={setContextOpen}>
      <ContextMenuTrigger contextOnly>{header}</ContextMenuTrigger>
      <ContextMenuContent width={220} pages={contextMenu.pages} testID={`${testID}-context`}>
        {contextMenu.items}
      </ContextMenuContent>
    </ContextMenu>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    height: 44,
    paddingTop: 12,
    paddingLeft: 8,
    paddingRight: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  titleButton: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 4 },
  title: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.base },
  actions: { flexDirection: "row", alignItems: "center" },
  hidden: { opacity: 0 },
  actionButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
}));
