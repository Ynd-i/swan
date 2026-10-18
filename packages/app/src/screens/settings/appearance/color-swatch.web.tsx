import { useEffect, useRef } from "react";
import { View } from "react-native";
import { swatchStyles, type ColorSwatchProps } from "./color-swatch-style";

const PICKER_STYLE = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
  border: 0,
  padding: 0,
} as const;

/** The swatch opens the system color picker; the color commits when the picker closes. */
export function ColorSwatch({ color, accessibilityLabel, onChange }: ColorSwatchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.value = color;
  }, [color]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const commit = () => onChange(input.value);
    input.addEventListener("change", commit);
    return () => input.removeEventListener("change", commit);
  }, [onChange]);

  return (
    <View style={[swatchStyles.swatch, { backgroundColor: color }]}>
      <input
        ref={inputRef}
        type="color"
        defaultValue={color}
        aria-label={accessibilityLabel}
        style={PICKER_STYLE}
      />
    </View>
  );
}
