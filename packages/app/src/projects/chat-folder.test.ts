import { describe, expect, it } from "vitest";
import { chatFolderParentPath, isChatFolderPath } from "./chat-folder";

describe("chat folders", () => {
  it("dates the parent folder in local time", () => {
    expect(chatFolderParentPath(new Date(2026, 0, 5, 23, 59))).toBe("~/Documents/Paseo/2026-01-05");
  });

  it("recognizes chat folders on macOS, Linux and Windows", () => {
    expect(isChatFolderPath("/Users/me/Documents/Paseo/2026-10-03/brave-fox")).toBe(true);
    expect(isChatFolderPath("/home/me/Documents/Paseo/2026-10-03/brave-fox/")).toBe(true);
    expect(isChatFolderPath("C:\\Users\\me\\Documents\\Paseo\\2026-10-03\\brave-fox")).toBe(true);
  });

  it("leaves other projects alone", () => {
    expect(isChatFolderPath("/Users/me/Documents/Paseo")).toBe(false);
    expect(isChatFolderPath("/Users/me/Documents/Paseo/2026-10-03")).toBe(false);
    expect(isChatFolderPath("/Users/me/Documents/Paseo/2026-10-03/app/src")).toBe(false);
    expect(isChatFolderPath("/Users/me/dev/paseo")).toBe(false);
  });
});
