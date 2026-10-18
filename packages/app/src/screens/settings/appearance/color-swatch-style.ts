import { StyleSheet } from "react-native-unistyles";

export interface ColorSwatchProps {
  color: string;
  accessibilityLabel: string;
  onChange: (hex: string) => void;
}

export const swatchStyles = StyleSheet.create((theme) => ({
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    overflow: "hidden",
  },
}));
