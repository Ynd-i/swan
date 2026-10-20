import { parseHostWorkspaceRouteFromPathname } from "@/utils/host-routes";

export interface DesktopNavigationEntry {
  route: string;
  chat: { serverId: string; workspaceId: string; agentId: string } | null;
}

export interface DesktopNavigationHistory {
  entries: DesktopNavigationEntry[];
  index: number;
}

export function buildDesktopNavigationRoute(input: {
  pathname: string;
  params: Record<string, string | string[] | undefined>;
  segments: readonly string[];
}): string {
  const pathParameters = new Set<string>();
  for (const segment of input.segments) {
    const match = segment.match(/^\[(?:\.\.\.)?(.+)\]$/);
    if (match) pathParameters.add(match[1]!);
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input.params)) {
    if (pathParameters.has(key) || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  const search = query.toString();
  return input.pathname + (search ? `?${search}` : "");
}

export function recordDesktopNavigation(
  history: DesktopNavigationHistory,
  entry: DesktopNavigationEntry,
): DesktopNavigationHistory {
  const pathname = entry.route.split("?")[0] ?? "";
  // Bootstrap and workspace hydration are transitions, not user destinations.
  if (
    pathname === "/" ||
    /^\/h\/[^/]+(?:\/agent\/[^/]+)?$/.test(pathname) ||
    (!entry.chat && parseHostWorkspaceRouteFromPathname(pathname))
  )
    return history;
  const current = history.entries[history.index];
  if (
    current?.route === entry.route &&
    current.chat?.serverId === entry.chat?.serverId &&
    current.chat?.workspaceId === entry.chat?.workspaceId &&
    current.chat?.agentId === entry.chat?.agentId
  ) {
    return history;
  }
  // Settings pages replace each other, so one Back leaves settings: the Mac settings
  // header has no back button of its own.
  const keep = isSettingsRoute(current?.route) && isSettingsRoute(entry.route) ? 0 : 1;
  const entries = [...history.entries.slice(0, history.index + keep), entry];
  return { entries, index: entries.length - 1 };
}

function isSettingsRoute(route: string | undefined): boolean {
  return route === "/settings" || Boolean(route?.startsWith("/settings/"));
}

export function moveDesktopNavigation(
  history: DesktopNavigationHistory,
  offset: number,
): DesktopNavigationHistory {
  if (history.entries.length === 0) return history;
  const index = Math.max(0, Math.min(history.entries.length - 1, history.index + offset));
  return index === history.index ? history : { ...history, index };
}
