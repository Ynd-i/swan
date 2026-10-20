import { ActivityIndicator } from "react-native";

/** Native fallback; the desktop ring lives in the `.web.tsx` file. */
export function DesktopProgressRing({ color }: { color?: string }) {
  return <ActivityIndicator size="small" color={color} />;
}
