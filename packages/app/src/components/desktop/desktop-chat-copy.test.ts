import { expect, it } from "vitest";
import { desktopChatResumeCommand } from "./desktop-chat-copy";

it("uses the runtime provider session rather than persistence or the Paseo agent id", () => {
  const agent = {
    id: "paseo-agent-id",
    provider: "codex" as const,
    runtimeInfo: { provider: "codex" as const, sessionId: "native-runtime-id" },
    persistence: { provider: "codex" as const, sessionId: "native-persisted-id" },
  };
  expect(desktopChatResumeCommand(agent)).toBe("codex resume native-runtime-id");
});

it("falls back to a persisted provider session when runtime metadata has no session", () => {
  expect(
    desktopChatResumeCommand({
      provider: "claude",
      runtimeInfo: { provider: "claude", sessionId: null },
      persistence: { provider: "claude", sessionId: "native-persisted-id" },
    }),
  ).toBe("claude --resume native-persisted-id");
});

it("never substitutes a Paseo agent id for missing or empty native metadata", () => {
  const agent = { id: "paseo-agent-id", provider: "codex" as const, persistence: null };
  expect(desktopChatResumeCommand(agent)).toBeNull();
  expect(
    desktopChatResumeCommand({
      ...agent,
      runtimeInfo: { provider: "codex", sessionId: "" },
    }),
  ).toBeNull();
});

it("does not invent a resume command for unsupported providers", () => {
  expect(
    desktopChatResumeCommand({
      provider: "mock",
      runtimeInfo: { provider: "mock", sessionId: "mock-native-id" },
      persistence: null,
    }),
  ).toBeNull();
});
