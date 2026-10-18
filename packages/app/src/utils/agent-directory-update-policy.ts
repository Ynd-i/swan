import equal from "fast-deep-equal";
import type { AgentBackgroundTask, AgentUsage } from "@getpaseo/protocol/agent-types";

interface AgentUpdateValue {
  updatedAt: Date | string;
  lastUsage?: AgentUsage;
  backgroundTasks?: AgentBackgroundTask[];
}

function timestamp(value: Date | string): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

export function acceptAgentDirectoryUpdate<T extends AgentUpdateValue>(
  current: T | undefined,
  incoming: T,
): T {
  if (!current || timestamp(incoming.updatedAt) >= timestamp(current.updatedAt)) return incoming;
  // The daemon reports usage and background work without advancing updatedAt.
  const lastUsageChanged =
    incoming.lastUsage !== undefined && !equal(incoming.lastUsage, current.lastUsage);
  const backgroundTasksChanged =
    incoming.backgroundTasks !== undefined &&
    !equal(incoming.backgroundTasks, current.backgroundTasks);
  if (!lastUsageChanged && !backgroundTasksChanged) return current;
  return {
    ...current,
    ...(lastUsageChanged ? { lastUsage: incoming.lastUsage } : {}),
    ...(backgroundTasksChanged ? { backgroundTasks: incoming.backgroundTasks } : {}),
  };
}
