import { useCallback, useState } from "react";
import { Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useAppReducedMotion } from "@/appearance/reduced-motion";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";

// The clip reaches this far left into the row padding or gap, so the left fade of a scrolled
// title never covers its first letters at rest.
const LEAD = 8;
const FADE = 16;
// Codex scrolls 2em per second at the 13px sidebar size.
const SCROLL_PX_PER_SECOND = 26;

/**
 * Codex's sidebar title: it spans the whole row, fades out where it overflows or meets the
 * trailing controls instead of showing an ellipsis, and scrolls to its end while `scrolling`.
 */
export function DesktopSidebarTitle({
  title,
  style,
  reserve,
  scrolling,
}: {
  title: string;
  style: StyleProp<TextStyle>;
  /** Width the trailing controls cover at the right edge of the title. */
  reserve: number;
  scrolling: boolean;
}) {
  const reducedMotion = useAppReducedMotion();
  const [clipWidth, setClipWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const measureClip = useCallback(
    (event: LayoutChangeEvent) => setClipWidth(event.nativeEvent.layout.width),
    [],
  );
  const measureText = useCallback(
    (event: LayoutChangeEvent) => setTextWidth(event.nativeEvent.layout.width),
    [],
  );
  const visible = clipWidth - reserve;
  const overflowing = clipWidth > 0 && LEAD + textWidth > visible;
  const distance =
    overflowing && scrolling && !reducedMotion ? LEAD + textWidth - (visible - FADE) : 0;
  const lead = distance > 0 ? `transparent, #000 ${LEAD}px` : "#000";
  const mask = overflowing
    ? `linear-gradient(to right, ${lead}, #000 calc(100% - ${reserve + FADE}px), transparent calc(100% - ${reserve}px))`
    : undefined;
  return (
    <View
      onLayout={measureClip}
      // Web-only mask properties are missing from the React Native style types.
      style={[
        styles.clip,
        inlineUnistylesStyle({ maskImage: mask, WebkitMaskImage: mask }) as never,
      ]}
    >
      <Text
        onLayout={measureText}
        style={[
          style,
          styles.text,
          // Leaving the row drops the duration, so the title snaps back to its start.
          inlineUnistylesStyle({
            transform: [{ translateX: -distance }],
            transitionDuration: `${distance / SCROLL_PX_PER_SECOND}s`,
          }),
        ]}
      >
        {/* One line: React Native Web text keeps newlines, and prompt titles can have them. */}
        {title.replace(/\s+/g, " ").trim()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    overflow: "hidden",
    marginLeft: -LEAD,
    paddingLeft: LEAD,
  },
  // Sized to its content so the clip can measure how far the title overflows.
  text: {
    flexShrink: 0,
    transitionProperty: "transform",
    transitionTimingFunction: "linear",
  },
});
