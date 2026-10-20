import { describe, expect, it } from "vitest";
import { AgentNavigationInbox, parseAgentDeepLinkFromArgv } from "./agent-navigation.js";

describe("desktop agent navigation", () => {
  it("accepts the custom agent scheme only for the custom desktop identity", () => {
    const args = ["Swan", "paseo-custom://h/server%2Fmain/agent/agent%20123"];
    expect(parseAgentDeepLinkFromArgv(args, "Swan")).toEqual({
      serverId: "server/main",
      agentId: "agent 123",
    });
    expect(parseAgentDeepLinkFromArgv(args, "Paseo")).toBeNull();
    expect(parseAgentDeepLinkFromArgv(args, "Paseo Dev")).toBeNull();
    expect(parseAgentDeepLinkFromArgv(args)).toBeNull();
  });

  it("preserves canonical agent links in official and custom launches", () => {
    for (const appName of ["Paseo", "Swan"]) {
      expect(parseAgentDeepLinkFromArgv(["paseo://h/server-1/agent/agent-2"], appName)).toEqual({
        serverId: "server-1",
        agentId: "agent-2",
      });
    }
  });

  it.each([
    "paseo-custom://app/h/server/agent/agent-1",
    "paseo-custom://h/server/agent/agent-1?message=hello",
    "paseo-custom://h/server/agent/agent-1#fragment",
    "paseo-custom://user:password@h/server/agent/agent-1",
    "paseo-custom://h:123/server/agent/agent-1",
    "paseo-custom://h/server/agent/agent-1/extra",
    "paseo-custom://h/server/agent/%ZZ",
    "paseo-custom://h/%20/agent/agent-1",
    "https://h/server/agent/agent-1",
    "paseo-custom-other://h/server/agent/agent-1",
  ])("rejects invalid or unrelated custom links: %s", (url) => {
    expect(parseAgentDeepLinkFromArgv([url], "Swan")).toBeNull();
  });
  it("finds an agent deep link among Electron launch arguments", () => {
    expect(
      parseAgentDeepLinkFromArgv([
        "/Applications/Paseo.app/Contents/MacOS/Paseo",
        "--no-sandbox",
        "paseo://h/server-1/agent/agent-2",
      ]),
    ).toEqual({ serverId: "server-1", agentId: "agent-2" });
  });

  it("holds navigation until the existing renderer is ready", () => {
    const inbox = new AgentNavigationInbox();
    const target = { serverId: "server-1", agentId: "agent-2" };

    expect(inbox.deliverOrQueue(7, target)).toBeNull();
    expect(inbox.windowReady(7)).toEqual(target);
    expect(inbox.deliverOrQueue(7, target)).toEqual(target);
  });

  it("returns only the newest navigation queued during startup", () => {
    const inbox = new AgentNavigationInbox();

    inbox.deliverOrQueue(7, { serverId: "server-1", agentId: "agent-1" });
    inbox.deliverOrQueue(7, { serverId: "server-1", agentId: "agent-2" });

    expect(inbox.windowReady(7)).toEqual({ serverId: "server-1", agentId: "agent-2" });
    expect(inbox.windowReady(7)).toBeNull();
  });
});
