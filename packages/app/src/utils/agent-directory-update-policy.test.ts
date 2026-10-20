import { describe, expect, it } from "vitest";
import { acceptAgentDirectoryUpdate } from "./agent-directory-update-policy";

describe("acceptAgentDirectoryUpdate", () => {
  const current = {
    updatedAt: "2026-10-15T10:00:01.000Z",
    title: "current",
    backgroundTasks: [{ id: "b-shell", description: "Sleep for 15 seconds" }],
  };

  it("takes background task changes from a snapshot whose updatedAt did not advance", () => {
    const accepted = acceptAgentDirectoryUpdate(current, {
      updatedAt: "2026-10-15T10:00:00.000Z",
      title: "stale",
      backgroundTasks: [],
    });

    expect(accepted).toEqual({ ...current, backgroundTasks: [] });
  });

  it("keeps the current agent when an older snapshot reports nothing new", () => {
    const accepted = acceptAgentDirectoryUpdate(current, {
      updatedAt: "2026-10-15T10:00:00.000Z",
      title: "stale",
      backgroundTasks: current.backgroundTasks,
    });

    expect(accepted).toBe(current);
  });
});
