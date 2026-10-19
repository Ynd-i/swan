import { useAppReducedMotion } from "@/appearance/reduced-motion";
import { useLayoutEffect, useMemo, useState } from "react";
import { View } from "react-native";
import Animated, {
  makeMutable,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { SYNCED_LOADER_FRAME_COUNT, getSyncedLoaderStep } from "@/components/synced-loader-state";

const THINKING_MARK_SHEET = require("../../assets/images/thinking-mark-sheet.png");
const sharedStep = makeMutable(0);
const activeLoaderCount = makeMutable(0);
const clockRunning = makeMutable(false);
let nextStepListenerId = 1;

function advanceSharedStep(): void {
  "worklet";
  if (activeLoaderCount.value === 0) {
    clockRunning.value = false;
    return;
  }

  const nextStep = getSyncedLoaderStep(Date.now());
  if (sharedStep.value !== nextStep) {
    sharedStep.value = nextStep;
  }
  requestAnimationFrame(advanceSharedStep);
}

function registerStepListener(
  step: SharedValue<number>,
  registered: SharedValue<boolean>,
  listenerId: number,
): void {
  "worklet";
  if (registered.value) {
    return;
  }

  registered.value = true;
  step.value = getSyncedLoaderStep(Date.now());
  sharedStep.addListener(listenerId, (nextStep) => {
    step.value = nextStep;
  });
  activeLoaderCount.value += 1;

  if (!clockRunning.value) {
    clockRunning.value = true;
    sharedStep.value = step.value;
    requestAnimationFrame(advanceSharedStep);
  }
}

function unregisterStepListener(registered: SharedValue<boolean>, listenerId: number): void {
  "worklet";
  if (!registered.value) {
    return;
  }

  registered.value = false;
  sharedStep.removeListener(listenerId);
  activeLoaderCount.value -= 1;
}

function useSyncedLoaderStep(active: boolean, reduceMotion: boolean): SharedValue<number> {
  // The local value lets retained loaders detach from the app-wide clock without
  // unmounting their animated views or leaving hidden style worklets subscribed.
  const step = useSharedValue(reduceMotion ? 0 : getSyncedLoaderStep(Date.now()));
  const registered = useSharedValue(false);
  const [listenerId] = useState(() => nextStepListenerId++);

  useLayoutEffect(() => {
    if (!active || reduceMotion) {
      return;
    }

    scheduleOnUI(registerStepListener, step, registered, listenerId);
    return () => {
      scheduleOnUI(unregisterStepListener, registered, listenerId);
    };
  }, [active, listenerId, reduceMotion, registered, step]);

  return step;
}

export function SyncedLoader({ size = 20 }: { size?: number }) {
  const active = useRetainedPanelActive();
  const reduceMotion = useAppReducedMotion();
  const step = useSyncedLoaderStep(active, reduceMotion);

  // The sheet stacks every frame top to bottom; the window shows one frame and the sheet
  // jumps a whole frame per step, the way Claude's flipbook does.
  const windowStyle = useMemo(
    () => ({ width: size, height: size, overflow: "hidden" }) as const,
    [size],
  );
  const sheetStyle = useAnimatedStyle(() => ({
    width: size,
    height: size * SYNCED_LOADER_FRAME_COUNT,
    transform: [{ translateY: -step.value * size }],
  }));

  return (
    <View style={windowStyle} testID="synced-loader">
      <Animated.Image source={THINKING_MARK_SHEET} style={sheetStyle} />
    </View>
  );
}
