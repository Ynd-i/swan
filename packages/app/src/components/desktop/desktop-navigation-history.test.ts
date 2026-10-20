import { expect, it } from "vitest";
import {
  buildDesktopNavigationRoute,
  recordDesktopNavigation,
  moveDesktopNavigation,
} from "./desktop-navigation-history";

it("retains the chosen host in new-chat query parameters without duplicating path parameters", () => {
  expect(
    buildDesktopNavigationRoute({
      pathname: "/new",
      segments: ["new"],
      params: {
        serverId: "remote",
        dir: "/shared/repo",
        projectId: "remote-project",
        draftId: "draft",
      },
    }),
  ).toBe("/new?serverId=remote&dir=%2Fshared%2Frepo&projectId=remote-project&draftId=draft");
  expect(
    buildDesktopNavigationRoute({
      pathname: "/settings/hosts/remote/projects",
      segments: ["settings", "hosts", "[serverId]", "projects"],
      params: { serverId: "remote", view: ["files", "changes"] },
    }),
  ).toBe("/settings/hosts/remote/projects?view=files&view=changes");
});

it("omits bootstrap and agent-resolution routes from user navigation history", () => {
  const empty = { entries: [], index: -1 };
  expect(recordDesktopNavigation(empty, { route: "/", chat: null })).toBe(empty);
  expect(recordDesktopNavigation(empty, { route: "/h/host/agent/agent", chat: null })).toBe(empty);
  expect(recordDesktopNavigation(empty, { route: "/h/host/workspace/workspace", chat: null })).toBe(
    empty,
  );
});

it("keeps sibling chats distinct and replaces forward history after a new selection", () => {
  const a = {
    route: "/workspace",
    chat: { serverId: "host", workspaceId: "workspace", agentId: "a" },
  };
  const b = { ...a, chat: { ...a.chat, agentId: "b" } };
  const c = { route: "/settings/general", chat: null };
  const initial = { entries: [a], index: 0 };
  const visited = recordDesktopNavigation(initial, b);
  expect(visited).toEqual({ entries: [a, b], index: 1 });
  const back = moveDesktopNavigation(visited, -1);
  expect(back.index).toBe(0);
  expect(moveDesktopNavigation(back, 1)).toEqual(visited);
  expect(moveDesktopNavigation(back, -1)).toBe(back);
  const branched = recordDesktopNavigation(back, c);
  expect(branched).toEqual({ entries: [a, c], index: 1 });
  expect(recordDesktopNavigation(branched, { ...c })).toBe(branched);
});

it("replaces settings pages so one Back leaves settings", () => {
  const chat = {
    route: "/workspace",
    chat: { serverId: "host", workspaceId: "workspace", agentId: "a" },
  };
  const general = { route: "/settings/general", chat: null };
  const appearance = { route: "/settings/appearance", chat: null };
  const host = { route: "/settings/hosts/remote/projects", chat: null };
  let history = recordDesktopNavigation({ entries: [chat], index: 0 }, general);
  history = recordDesktopNavigation(history, appearance);
  history = recordDesktopNavigation(history, host);
  expect(history).toEqual({ entries: [chat, host], index: 1 });
  expect(moveDesktopNavigation(history, -1).index).toBe(0);
});
