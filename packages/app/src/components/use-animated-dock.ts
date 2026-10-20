import { useLayoutEffect, useState } from "react";
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useAppReducedMotion } from "@/appearance/reduced-motion";
import { usesDesktopShell } from "@/components/desktop/desktop-shell";

export const SIDEBAR_TOGGLE_TIMING = {
  duration: 220,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
};

/**
 * Slides a desktop side panel open and closed by animating its width. `rendered` stays true
 * until the closing animation finishes, so callers keep the panel mounted that long.
 */
export function useAnimatedDock(open: boolean, width: number) {
  const visibility = useSharedValue(open ? 1 : 0);
  const prefersReducedMotion = useAppReducedMotion();
  const animate = usesDesktopShell && !prefersReducedMotion;
  const [rendered, setRendered] = useState(open);

  useLayoutEffect(() => {
    if (open) {
      setRendered(true);
      visibility.value = animate ? withTiming(1, SIDEBAR_TOGGLE_TIMING) : 1;
      return;
    }
    if (!animate) {
      visibility.value = 0;
      setRendered(false);
      return;
    }
    visibility.value = withTiming(0, SIDEBAR_TOGGLE_TIMING, (finished) => {
      if (finished) runOnJS(setRendered)(false);
    });
  }, [animate, open, visibility]);

  const style = useAnimatedStyle(() => ({ width: width * visibility.value }), [width]);
  return { rendered, style };
}
