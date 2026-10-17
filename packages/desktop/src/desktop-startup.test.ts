import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  configureDesktopDaemonEnvironment,
  resolveCustomUserDataPath,
  runDesktopStartup,
} from "./desktop-startup";

describe("desktop startup", () => {
  it("isolates a custom package's daemon while preserving explicit launch settings", () => {
    const env: NodeJS.ProcessEnv = {};
    const input = {
      isPackaged: true,
      appName: "Swan",
      userDataPath: "/tmp/Paseo Custom",
      env,
    };
    configureDesktopDaemonEnvironment(input);
    expect(env).toEqual({
      PASEO_HOME: path.join(input.userDataPath, "daemon"),
      PASEO_LISTEN: "127.0.0.1:0",
    });
    env.PASEO_HOME = "/tmp/explicit-smoke-home";
    env.PASEO_LISTEN = "127.0.0.1:17777";
    configureDesktopDaemonEnvironment(input);
    expect(env).toEqual({
      PASEO_HOME: "/tmp/explicit-smoke-home",
      PASEO_LISTEN: "127.0.0.1:17777",
    });
  });

  it.each([
    { isPackaged: false, appName: "Swan" },
    { isPackaged: true, appName: "Paseo" },
  ])("preserves existing daemon defaults for $appName packaged=$isPackaged", (identity) => {
    const env: NodeJS.ProcessEnv = {};
    configureDesktopDaemonEnvironment({ ...identity, userDataPath: "/tmp/paseo", env });
    expect(env).toEqual({});
  });

  it("keeps the packaged Swan data folder it was published with as Paseo Custom", () => {
    const appDataPath = "/Users/me/Library/Application Support";
    expect(resolveCustomUserDataPath({ isPackaged: true, appName: "Swan", appDataPath })).toBe(
      path.join(appDataPath, "Paseo Custom"),
    );
    for (const identity of [
      { isPackaged: false, appName: "Swan" },
      { isPackaged: true, appName: "Paseo" },
    ]) {
      expect(resolveCustomUserDataPath({ ...identity, appDataPath })).toBeNull();
    }
  });

  it("runs CLI passthrough before GUI login-shell env inheritance", async () => {
    const calls: string[] = [];
    await runDesktopStartup({
      hasPendingGuiLaunchRequest: false,
      runCliPassthroughIfRequested: vi.fn(async () => {
        calls.push("cli");
        return true;
      }),
      inheritLoginShellEnv: vi.fn(() => calls.push("env")),
      bootstrapGui: vi.fn(async () => {
        calls.push("gui");
      }),
    });

    expect(calls).toEqual(["cli"]);
  });

  it("keeps login-shell env inheritance on normal GUI startup", async () => {
    const calls: string[] = [];
    await runDesktopStartup({
      hasPendingGuiLaunchRequest: false,
      runCliPassthroughIfRequested: vi.fn(async () => {
        calls.push("cli");
        return false;
      }),
      inheritLoginShellEnv: vi.fn(() => calls.push("env")),
      bootstrapGui: vi.fn(async () => {
        calls.push("gui");
      }),
    });

    expect(calls).toEqual(["cli", "env", "gui"]);
  });

  it("does not route open-project launches through CLI passthrough", async () => {
    const runCliPassthroughIfRequested = vi.fn(async () => true);
    const calls: string[] = [];

    await runDesktopStartup({
      hasPendingGuiLaunchRequest: true,
      runCliPassthroughIfRequested,
      inheritLoginShellEnv: vi.fn(() => calls.push("env")),
      bootstrapGui: vi.fn(async () => {
        calls.push("gui");
      }),
    });

    expect(runCliPassthroughIfRequested).not.toHaveBeenCalled();
    expect(calls).toEqual(["env", "gui"]);
  });
});
