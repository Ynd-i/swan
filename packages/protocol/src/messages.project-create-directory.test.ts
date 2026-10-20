import { describe, expect, it } from "vitest";
import { SessionInboundMessageSchema } from "./messages";

// createParents is optional: older clients omit it, and the daemon must keep it when sent.
describe("ProjectCreateDirectoryRequest createParents", () => {
  const base = {
    type: "project.create_directory.request" as const,
    parentPath: "~/Documents/Paseo/2026-10-03",
    name: "chat",
    requestId: "req-1",
  };

  it("parses a request without createParents", () => {
    expect(SessionInboundMessageSchema.parse(base)).toEqual(base);
  });

  it("keeps createParents through inbound parsing", () => {
    expect(SessionInboundMessageSchema.parse({ ...base, createParents: true })).toEqual({
      ...base,
      createParents: true,
    });
  });
});
