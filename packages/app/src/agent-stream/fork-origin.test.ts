import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { findForkBoundary } from "./fork-origin";

function message(id: string, minute: number): StreamItem {
  return {
    kind: "assistant_message",
    id,
    text: id,
    timestamp: new Date(Date.UTC(2026, 9, 4, 12, minute)),
  } as StreamItem;
}

const forkedAt = Date.UTC(2026, 9, 4, 12, 5);

describe("findForkBoundary", () => {
  it("ends the inherited history at the last item stamped by the fork", () => {
    const items = [message("a", 1), message("b", 5), message("c", 9)];

    expect(findForkBoundary(items, forkedAt)).toEqual({ itemId: "b", isLast: false });
  });

  it("marks a just-forked chat's newest item as last", () => {
    expect(findForkBoundary([message("a", 1), message("b", 2)], forkedAt)).toEqual({
      itemId: "b",
      isLast: true,
    });
  });

  it("finds nothing when no inherited item is loaded", () => {
    expect(findForkBoundary([message("c", 9)], forkedAt)).toBeNull();
    expect(findForkBoundary([], forkedAt)).toBeNull();
  });
});
