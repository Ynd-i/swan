import { useCallback } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ScrollView } from "@/components/ui/scroll-view";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import type { PendingPermission } from "@/types/shared";
import { PermissionRequestCard } from "./permission-request-card";

export function PermissionDock({
  serverId,
  permissions,
  onHeightChange,
}: {
  serverId: string;
  permissions: PendingPermission[];
  onHeightChange: (height: number) => void;
}) {
  const client = useHostRuntimeClient(serverId);
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => onHeightChange(event.nativeEvent.layout.height),
    [onHeightChange],
  );
  return (
    <View style={styles.rail} onLayout={handleLayout} testID="desktop-permission-dock">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.cards}
        keyboardShouldPersistTaps="handled"
      >
        {permissions.map((permission) => (
          <PermissionRequestCard
            key={permission.key}
            permission={permission}
            client={client}
            serverId={serverId}
            docked
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  rail: {
    width: "100%",
    maxWidth: theme.contentMaxWidth + 32,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    flexShrink: 1,
  },
  scroll: { flexGrow: 0, flexShrink: 1, maxHeight: Math.max(120, rt.screen.height * 0.6) },
  cards: { gap: 8 },
}));
