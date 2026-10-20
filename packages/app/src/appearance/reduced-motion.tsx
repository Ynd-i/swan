import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ReduceMotion, ReducedMotionConfig, useReducedMotion } from "react-native-reanimated";
import { getIsElectronMac } from "@/constants/platform";
import type { AppSettings } from "@/hooks/use-settings/storage";

const AppReducedMotionContext = createContext<boolean | null>(null);

/** Shared controls can also render outside AppearanceProvider, without a QueryClient. */
export function useAppReducedMotion(): boolean {
  const system = useReducedMotion();
  return useContext(AppReducedMotionContext) ?? system;
}

export function AppReducedMotionProvider({
  preference,
  children,
}: {
  preference: AppSettings["reducedMotion"];
  children: ReactNode;
}) {
  if (!getIsElectronMac()) return children;
  return <MacReducedMotionProvider preference={preference}>{children}</MacReducedMotionProvider>;
}

function MacReducedMotionProvider({
  preference,
  children,
}: {
  preference: AppSettings["reducedMotion"];
  children: ReactNode;
}) {
  const [media] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)"));
  const subscribe = useCallback(
    (changed: () => void) => {
      media.addEventListener("change", changed);
      return () => media.removeEventListener("change", changed);
    },
    [media],
  );
  const snapshot = useCallback(() => media.matches, [media]);
  const system = useSyncExternalStore(subscribe, snapshot, snapshot);
  const reduced = preference === "system" ? system : preference === "on";
  return (
    <AppReducedMotionContext.Provider value={reduced}>
      <ReducedMotionConfig mode={reduced ? ReduceMotion.Always : ReduceMotion.Never} />
      {children}
    </AppReducedMotionContext.Provider>
  );
}
