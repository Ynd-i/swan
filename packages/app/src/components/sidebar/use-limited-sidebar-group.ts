import { useCallback, useMemo, useState } from "react";

const INITIAL_VISIBLE_ITEMS = 20;

export function useLimitedSidebarGroup<T>(
  items: readonly T[],
  initialVisibleItems = INITIAL_VISIBLE_ITEMS,
) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = useMemo(
    () => (expanded ? items.slice() : items.slice(0, initialVisibleItems)),
    [expanded, initialVisibleItems, items],
  );
  const canToggle = items.length > initialVisibleItems;
  const toggleExpanded = useCallback(() => setExpanded((current) => !current), []);

  return { visibleItems, expanded, canToggle, toggleExpanded };
}
