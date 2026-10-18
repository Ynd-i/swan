import { View } from "react-native";
import { swatchStyles, type ColorSwatchProps } from "./color-swatch-style";

/** Native has no system color picker, so the hex field beside the swatch edits the color. */
export function ColorSwatch({ color }: ColorSwatchProps) {
  return <View style={[swatchStyles.swatch, { backgroundColor: color }]} />;
}
