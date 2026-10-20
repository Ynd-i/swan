import { useCallback, useEffect, useMemo, useState } from "react";
import { router, useGlobalSearchParams, usePathname, useSegments, type Href } from "expo-router";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import {
  moveDesktopNavigation,
  buildDesktopNavigationRoute,
  recordDesktopNavigation,
  type DesktopNavigationHistory,
} from "./desktop-navigation-history";
import { useActiveDesktopChat } from "./use-desktop-chat";

export function useDesktopNavigationHistory() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const segments = useSegments();
  const resolvingOpenIntent = Boolean(params.open);
  const chat = useActiveDesktopChat();
  const entry = useMemo(() => {
    if (chat) return { route: buildHostWorkspaceRoute(chat.serverId, chat.workspaceId), chat };
    return { route: buildDesktopNavigationRoute({ pathname, params, segments }), chat: null };
  }, [pathname, params, segments, chat]);
  const [history, setHistory] = useState<DesktopNavigationHistory>({ entries: [], index: -1 });
  useEffect(() => {
    if (resolvingOpenIntent) return;
    setHistory((current) => recordDesktopNavigation(current, entry));
  }, [entry, resolvingOpenIntent]);

  const move = useCallback(
    (offset: number) => {
      const next = moveDesktopNavigation(history, offset);
      if (next === history) return;
      const target = next.entries[next.index]!;
      setHistory(next);
      if (target.chat) navigateToAgent({ ...target.chat, pin: true });
      else router.navigate(target.route as Href);
    },
    [history],
  );
  return {
    chat,
    canGoBack: history.index > 0,
    canGoForward: history.index < history.entries.length - 1,
    back: useCallback(() => move(-1), [move]),
    forward: useCallback(() => move(1), [move]),
  };
}
