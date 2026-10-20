import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  SidebarPopoverRoot,
  SidebarPopoverSurface,
  useSidebarPopoverAnchor,
} from "@/components/sidebar/sidebar-popover";
import { builtinSidebarNavLabelKey } from "@/sidebar-nav/model";
import { useHostUsageWithControls } from "./controls";
import { useUsagePreferences, type UsageDisplay } from "./display";
import { useUsageHostId, useUsageHostSelection } from "./hosts";
import { useUsageHostReports } from "./queries";
import { UsageSourceIcon } from "./source-icon";
import { UsageMeter } from "./meter";
import { mostConstrainedWindow, resolvePinnedUsage, type PinnedUsageSource } from "./pinned";
import type { UsageHost } from "./model";
import { UsageBody, UsageMessage } from "./usage-section";
import { usageCopy } from "./copy";
import { UsageModal } from "./usage-modal";

/** Each summary window with data on the usage host, under its source; empty while none has. */
function useUsageSummary(): readonly PinnedUsageSource[] {
  const { t } = useTranslation();
  const { preferences } = useUsagePreferences();
  const reports = useUsageHostReports(useUsageHostId());
  return useMemo(() => resolvePinnedUsage(reports, preferences, t), [preferences, reports, t]);
}

/** Whether the sidebar Usage item has anything to show. */
export function useHasUsageSummary(): boolean {
  return useUsageSummary().length > 0;
}

/**
 * The sidebar footer's usage entry: the most constrained summary window, and nothing while no
 * summary window has data, since the footer's Usage icon already opens Usage. Pressing it opens
 * the Usage modal.
 */
export function UsageSidebarItem() {
  const { t } = useTranslation();
  const label = t(builtinSidebarNavLabelKey("usage"));
  const openUsage = useOpenSidebarUsage();
  const sources = useUsageSummary();
  if (sources.length === 0) return null;
  return <PinnedUsageTrigger label={label} sources={sources} onPress={openUsage} />;
}

const OpenSidebarUsageContext = createContext<(() => void) | null>(null);

/**
 * One owner for the footer icon and summary: both open the Usage modal over the current screen.
 * The modal mounts on first open and unmounts once it has finished closing, so its host's reports
 * load only while it is shown.
 */
export function UsageSidebarRoot({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const openUsage = useCallback(() => {
    setMounted(true);
    setOpen(true);
  }, []);
  const closeUsage = useCallback(() => setOpen(false), []);
  const unmountUsage = useCallback(() => setMounted(false), []);

  return (
    <OpenSidebarUsageContext.Provider value={openUsage}>
      {children}
      {mounted ? <UsageModal visible={open} onClose={closeUsage} onDismiss={unmountUsage} /> : null}
    </OpenSidebarUsageContext.Provider>
  );
}

/** Both sidebar entry points send the same open command. */
export function useOpenSidebarUsage(): () => void {
  const openUsage = useContext(OpenSidebarUsageContext);
  if (!openUsage) throw new Error("Sidebar Usage must be inside UsageSidebarRoot.");
  return openUsage;
}

/**
 * The Mac rail's usage button: the usage summary in a popover beside the rail instead of the
 * Usage modal, so it reads as part of the rail. The popover mounts on first press.
 */
export function UsageRailPopover({
  renderTrigger,
}: {
  renderTrigger: (onPress: () => void) => ReactNode;
}) {
  const { t } = useTranslation();
  const { display } = useUsagePreferences();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const show = useCallback(() => {
    setMounted(true);
    setOpen(true);
  }, []);
  return (
    <SidebarPopoverRoot open={open} onOpenChange={setOpen}>
      <RailUsageAnchor>{renderTrigger(show)}</RailUsageAnchor>
      {mounted ? (
        <UsageSheet title={t(builtinSidebarNavLabelKey("usage"))} display={display} />
      ) : null}
    </SidebarPopoverRoot>
  );
}

function RailUsageAnchor({ children }: { children: ReactNode }) {
  const { anchorTo } = useSidebarPopoverAnchor("UsageRailPopover");
  return (
    <View ref={anchorTo} collapsable={false}>
      {children}
    </View>
  );
}

/** The rail popover's body: the usage host's reports with pins, its controls in the title row. */
function UsageSheet({ title, display }: { title: string; display: UsageDisplay }) {
  const { serverId, connectedHosts, select } = useUsageHostSelection();
  if (!serverId) {
    return (
      <SidebarPopoverSurface section="rail" title={title} testID="sidebar-usage-sheet">
        <View style={styles.sheetBody} testID="usage-expanded">
          <UsageMessage text={usageCopy.noHosts} />
        </View>
      </SidebarPopoverSurface>
    );
  }
  return (
    <HostUsageSheet
      key={serverId}
      title={title}
      serverId={serverId}
      hosts={connectedHosts}
      onSelectHost={select}
      display={display}
    />
  );
}

function HostUsageSheet({
  title,
  serverId,
  hosts,
  onSelectHost,
  display,
}: {
  title: string;
  serverId: string;
  hosts: UsageHost[];
  onSelectHost: (serverId: string) => void;
  display: UsageDisplay;
}) {
  const hostSelection = useMemo(
    () => ({ hosts, serverId, onSelect: onSelectHost }),
    [hosts, onSelectHost, serverId],
  );
  const { view, refresh, controls } = useHostUsageWithControls(hostSelection);
  return (
    <SidebarPopoverSurface
      section="rail"
      title={title}
      sheetTrailing={controls}
      testID="sidebar-usage-sheet"
    >
      <View style={styles.sheetBody} testID="usage-expanded">
        <UsageBody serverId={serverId} view={view} display={display} onRefresh={refresh} />
      </View>
    </SidebarPopoverSurface>
  );
}

function triggerStyle({ hovered }: PressableStateCallbackType & { hovered?: boolean }) {
  return hovered ? [styles.trigger, styles.triggerHovered] : styles.trigger;
}

/**
 * One fixed-size summary however many sources are pinned: the most constrained window's source
 * icon, meter and "54% wk", then "+N" for the other sources. The full breakdown is one press away.
 */
function PinnedUsageTrigger({
  label,
  sources,
  onPress,
}: {
  label: string;
  sources: readonly PinnedUsageSource[];
  onPress: () => void;
}) {
  const top = mostConstrainedWindow(sources);
  if (!top) return null;
  const { source, window } = top;
  const more = sources.length - 1;
  const accessibilityLabel = `${label}: ${window.label}${more > 0 ? `, +${more}` : ""}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={triggerStyle}
      testID="sidebar-usage"
    >
      <View testID="sidebar-usage-source">
        <UsageSourceIcon svg={source.icon} size={14} />
      </View>
      <UsageMeter percent={window.percent} tone={window.tone} style={styles.meter} />
      <Text style={styles.percent} numberOfLines={1} testID="sidebar-usage-pinned-window">
        {window.percentText}
        {window.shortLabel === "" ? null : (
          <Text style={styles.windowLabel}>{` ${window.shortLabel}`}</Text>
        )}
      </Text>
      {more > 0 ? (
        <Text style={styles.more} numberOfLines={1} testID="sidebar-usage-more">
          {`+${more}`}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    // Same row geometry and leading rail as Add project and the footer icons.
    minHeight: 28,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  triggerHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  meter: {
    width: 28,
    height: 6,
    borderRadius: 3,
    marginLeft: theme.spacing[1.5],
    marginRight: theme.spacing[1.5],
  },
  percent: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  windowLabel: {
    color: theme.colors.foregroundMuted,
  },
  more: {
    flexShrink: 0,
    marginLeft: theme.spacing[2],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  sheetBody: {
    padding: theme.spacing[3],
    gap: theme.spacing[3],
  },
}));
