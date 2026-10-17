import { describe, expect, it } from "vitest";
import { parsePullRequestLink } from "./parse";

describe("parsePullRequestLink", () => {
  it("parses a github.com pull request URL", () => {
    expect(parsePullRequestLink("https://github.com/Ynd-i/codex-app/pull/9")).toEqual({
      url: "https://github.com/Ynd-i/codex-app/pull/9",
      owner: "Ynd-i",
      repo: "codex-app",
      number: 9,
    });
  });

  it("drops query, hash, and trailing slash from the canonical URL", () => {
    expect(
      parsePullRequestLink("https://ghe.example.com/acme/api/pull/183/?w=1#discussion")?.url,
    ).toBe("https://ghe.example.com/acme/api/pull/183");
  });

  it.each([
    "https://github.com/Ynd-i/codex-app/pull/9/files",
    "https://github.com/Ynd-i/codex-app/issues/9",
    "https://github.com/Ynd-i/codex-app/pulls",
    "ftp://github.com/Ynd-i/codex-app/pull/9",
    "packages/app/src/pull/9",
  ])("ignores %s", (href) => {
    expect(parsePullRequestLink(href)).toBeNull();
  });
});
