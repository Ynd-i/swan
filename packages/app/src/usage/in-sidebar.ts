import { useCallback } from "react";
import { useSidebarNavItems } from "@/sidebar-nav/use-sidebar-nav-items";

/**
 * Whether the sidebar footer shows the Usage summary: the same switch as Settings > Sidebar.
 * Window rows pin to the summary only while it is on.
 */
export function useUsageInSidebar(): {
  /** False where the sidebar has no Usage item at all, as on the Mac rail. */
  available: boolean;
  inSidebar: boolean;
  setInSidebar: (visible: boolean) => void;
} {
  const { items, setVisible } = useSidebarNavItems("footer");
  const item = items.find((entry) => entry.key === "usage");
  const setInSidebar = useCallback(
    (visible: boolean) => setVisible("usage", visible),
    [setVisible],
  );
  return { available: Boolean(item), inSidebar: item?.visible === true, setInSidebar };
}
