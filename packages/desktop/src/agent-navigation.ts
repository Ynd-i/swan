import { parseAgentDeepLink, type AgentDeepLinkTarget } from "@getpaseo/protocol/agent-deep-link";

/** Custom external links share the canonical agent route and all its validation. */
export function parseDesktopAgentDeepLink(
  input: string,
  appName = "Paseo",
): AgentDeepLinkTarget | null {
  if (appName === "Swan") {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return null;
    }
    if (url.protocol === "paseo-custom:") {
      url.protocol = "paseo:";
      return parseAgentDeepLink(url.href);
    }
  }
  return parseAgentDeepLink(input);
}

export function parseAgentDeepLinkFromArgv(
  argv: string[],
  appName = "Paseo",
): AgentDeepLinkTarget | null {
  for (const arg of argv) {
    const target = parseDesktopAgentDeepLink(arg, appName);
    if (target) {
      return target;
    }
  }
  return null;
}

export class AgentNavigationInbox {
  private readonly readyWindows = new Set<number>();
  private readonly pendingByWindow = new Map<number, AgentDeepLinkTarget>();

  windowLoading(webContentsId: number): void {
    this.readyWindows.delete(webContentsId);
  }

  windowReady(webContentsId: number): AgentDeepLinkTarget | null {
    this.readyWindows.add(webContentsId);
    const pending = this.pendingByWindow.get(webContentsId) ?? null;
    this.pendingByWindow.delete(webContentsId);
    return pending;
  }

  deliverOrQueue(webContentsId: number, target: AgentDeepLinkTarget): AgentDeepLinkTarget | null {
    if (this.readyWindows.has(webContentsId)) {
      return target;
    }
    this.pendingByWindow.set(webContentsId, target);
    return null;
  }

  removeWindow(webContentsId: number): void {
    this.readyWindows.delete(webContentsId);
    this.pendingByWindow.delete(webContentsId);
  }
}
