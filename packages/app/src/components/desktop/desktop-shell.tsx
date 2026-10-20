import type { ReactNode } from "react";

export const desktopShellInset = 0;
export const usesDesktopShell = false;

export function DesktopWorkspaceToolbar({ children }: { children: ReactNode }) {
  return children;
}

export function DesktopShell({ children }: { children: ReactNode; chromeEnabled: boolean }) {
  return children;
}
