import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useSessionStore } from "@/stores/session-store";
import type { PendingPermission } from "@/types/shared";

const EMPTY_PERMISSIONS: PendingPermission[] = [];

export function useAgentPendingPermissions(
  serverId: string,
  agentId?: string,
): PendingPermission[] {
  return useStoreWithEqualityFn(
    useSessionStore,
    (state) => {
      if (!agentId) return EMPTY_PERMISSIONS;
      const pending = state.sessions[serverId]?.pendingPermissions;
      if (!pending) return EMPTY_PERMISSIONS;
      const permissions = Array.from(pending.values()).filter(
        (permission) => permission.agentId === agentId,
      );
      return permissions.length > 0 ? permissions : EMPTY_PERMISSIONS;
    },
    shallow,
  );
}
