import { describe, expect, it } from "vitest";
import { canForkNatively, type ForkAgentSource } from "./use-fork-agent";

const idleCodex: ForkAgentSource = {
  provider: "codex",
  status: "idle",
  capabilities: {
    supportsStreaming: true,
    supportsSessionPersistence: true,
    supportsDynamicModes: false,
    supportsMcpServers: true,
    supportsReasoningStream: true,
    supportsToolInvocations: true,
    supportsNativeFork: true,
  },
  cwd: "/repo",
};
const pinnedTurn = { boundaryCursor: { epoch: "epoch-1", seq: 4 } };

describe("canForkNatively", () => {
  it("forks a pinned turn or an idle chat natively into a new tab", () => {
    const host = { hostSupportsNativeFork: true, target: "tab" as const };
    expect(canForkNatively({ ...host, agent: idleCodex, boundary: pinnedTurn })).toBe(true);
    expect(canForkNatively({ ...host, agent: idleCodex })).toBe(true);
    expect(
      canForkNatively({
        ...host,
        agent: { ...idleCodex, status: "running" },
        boundary: pinnedTurn,
      }),
    ).toBe(true);
  });

  it("keeps the history attachment for running chats, new workspaces and other providers", () => {
    const host = { hostSupportsNativeFork: true, target: "tab" as const };
    expect(canForkNatively({ ...host, agent: { ...idleCodex, status: "running" } })).toBe(false);
    expect(
      canForkNatively({ ...host, agent: idleCodex, boundary: { boundaryMessageId: "m" } }),
    ).toBe(false);
    expect(canForkNatively({ ...host, target: "workspace", agent: idleCodex })).toBe(false);
    expect(
      canForkNatively({
        ...host,
        agent: {
          ...idleCodex,
          capabilities: { ...idleCodex.capabilities!, supportsNativeFork: false },
        },
      }),
    ).toBe(false);
    expect(canForkNatively({ ...host, hostSupportsNativeFork: false, agent: idleCodex })).toBe(
      false,
    );
  });
});
