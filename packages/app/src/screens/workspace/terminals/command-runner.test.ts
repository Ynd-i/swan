import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalStreamEvent } from "@getpaseo/client/internal/daemon-client";
import {
  resolveRunnerTerminalId,
  setRunnerTerminalId,
  toTerminalCommandInput,
  whenShellReady,
} from "@/screens/workspace/terminals/command-runner";

describe("command runner terminal", () => {
  it("reuses the runner while it is live and drops it once it is gone", () => {
    setRunnerTerminalId("srv:ws", "t1");
    expect(resolveRunnerTerminalId("srv:ws", ["t0", "t1"])).toBe("t1");
    expect(resolveRunnerTerminalId("srv:ws", ["t0"])).toBeNull();
    expect(resolveRunnerTerminalId("srv:ws", ["t0", "t1"])).toBeNull();
  });

  it("keeps runners separate per workspace", () => {
    setRunnerTerminalId("srv:a", "ta");
    expect(resolveRunnerTerminalId("srv:b", ["ta"])).toBeNull();
  });

  it("ends the command with one carriage return", () => {
    expect(toTerminalCommandInput("ls\n\n")).toBe("ls\r");
  });

  it("brackets a multi-line block so the shell buffers every line before running it", () => {
    expect(toTerminalCommandInput("gh pr merge 164\ngit push\n")).toBe(
      "\x1b[200~gh pr merge 164\ngit push\x1b[201~\r",
    );
  });
});

describe("whenShellReady", () => {
  let receive: (event: TerminalStreamEvent) => void = () => {};
  const release = vi.fn(async () => {});
  const client = {
    observeTerminal: (_terminalId: string, onEvent: (event: TerminalStreamEvent) => void) => {
      receive = onEvent;
      return { release };
    },
  };
  const output = (text: string) =>
    receive({
      terminalId: "t1",
      subscriptionId: "s1",
      type: "output",
      data: new TextEncoder().encode(text),
    });

  beforeEach(() => {
    vi.useFakeTimers();
    release.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the zsh prompt marker while the rc files are still printing", () => {
    const onReady = vi.fn();
    whenShellReady(client, "t1", onReady);
    output("loading plugins...\r\n");
    vi.advanceTimersByTime(900);
    expect(onReady).not.toHaveBeenCalled();
    output("\x1b]2;~/repo\x07\x1b]633;A\x07% ");
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("treats a shell without the marker as ready once its output goes quiet", () => {
    const onReady = vi.fn();
    whenShellReady(client, "t1", onReady);
    output("bash-5.2$ ");
    vi.advanceTimersByTime(999);
    expect(onReady).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("gives up waiting on a shell that never settles", () => {
    const onReady = vi.fn();
    whenShellReady(client, "t1", onReady);
    for (let elapsed = 0; elapsed < 5000; elapsed += 500) {
      output(".");
      vi.advanceTimersByTime(500);
    }
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
