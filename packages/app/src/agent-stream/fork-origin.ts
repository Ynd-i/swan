import type { StreamItem } from "@/types/stream";

export interface ForkBoundary {
  itemId: string;
  /** No newer item yet, so the turn actions below it render in the list's live footer. */
  isLast: boolean;
}

/**
 * The last inherited item of a native fork: the newest one stamped no later than the fork.
 * `items` are oldest first. History pages load newest first, so when any inherited item is
 * loaded, the last one is too.
 */
export function findForkBoundary(
  items: readonly StreamItem[],
  forkedAt: number,
): ForkBoundary | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]!.timestamp.getTime() <= forkedAt) {
      return { itemId: items[index]!.id, isLast: index === items.length - 1 };
    }
  }
  return null;
}
