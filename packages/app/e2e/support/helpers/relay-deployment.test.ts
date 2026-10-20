import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Page, Route } from "@playwright/test";
import { connectDaemonWebAppOnlyThroughRelay } from "./relay-deployment";
import { buildPairingLink } from "./host-confirmation";
import { getAvailableHostDaemonPort } from "./isolated-host-daemon";
import { startLocalElixirRelay } from "./local-elixir-relay";
import { startPackagedWebDaemon } from "./packaged-web-daemon";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock:
    vi.fn<
      (
        command: string,
        args: string[],
        options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => void
    >(),
}));

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  execFile: execFileMock,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function allocatePorts(ports: number[]) {
  return vi.spyOn(net, "createServer").mockImplementation(() => {
    const port = ports.shift();
    if (port === undefined) throw new Error("Port candidates exhausted");
    const server = new EventEmitter();
    return Object.assign(server, {
      listen(_port: number, _host: string, ready: () => void) {
        ready();
      },
      address() {
        return { port };
      },
      close(done: () => void) {
        done();
      },
    }) as unknown as net.Server;
  });
}

it("rejects production, primary-host and caller-excluded port candidates", async () => {
  vi.stubEnv("E2E_DAEMON_PORT", "60100");
  const allocator = allocatePorts([6767, 6768, 60100, 60101, 60102]);
  expect(await getAvailableHostDaemonPort([60101])).toBe(60102);
  expect(allocator).toHaveBeenCalledTimes(5);
});

it("keeps the packaged daemon off protected ports and its local relay port", async () => {
  allocatePorts([6767, 6768, 60103, 60104]);
  let listen: string | undefined;
  execFileMock.mockImplementation((_command, args, _options, callback) => {
    if (args[1] === "start") {
      const config = JSON.parse(readFileSync(path.join(args[3], "config.json"), "utf8"));
      listen = config.daemon.listen;
    }
    callback(new Error("Stopped before the real CLI"), "", "");
  });
  await expect(startPackagedWebDaemon({ relayEndpoint: "127.0.0.1:60103" })).rejects.toThrow(
    "Stopped before the real CLI",
  );
  expect(listen).toBe("127.0.0.1:60104");
});

it("reports a missing mix executable immediately instead of polling relay readiness", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "relay-spawn-failure-"));
  await writeFile(path.join(root, "mix.exs"), "# Test fixture: no relay code is executed.\n");
  vi.stubEnv("PASEO_RELAY_CHECKOUT", root);
  vi.stubEnv("PATH", "");
  const fetch = vi.spyOn(globalThis, "fetch");
  try {
    await expect(startLocalElixirRelay()).rejects.toThrow(/spawn mix ENOENT/);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 2_000);

it.each([
  ["6767", "document"],
  ["6767", "fetch"],
  ["6768", "document"],
  ["6768", "fetch"],
])("aborts protected HTTP port %s for %s before any forwarding", async (port, resourceType) => {
  let handler: ((route: Route) => Promise<void>) | undefined;
  const stop = new Error("Stopped before browser navigation");
  const page = {
    route: vi.fn(async (pattern: string | RegExp, callback: (route: Route) => Promise<void>) => {
      if (pattern === "**/*") handler = callback;
    }),
    routeWebSocket: vi.fn(async () => {}),
    addInitScript: vi.fn(async () => {
      throw stop;
    }),
  } as unknown as Page;
  const serverId = "test-relay-host";
  await expect(
    connectDaemonWebAppOnlyThroughRelay(page, {
      serverId,
      port: 60105,
      home: "/unused-test-home",
      origin: "http://127.0.0.1:60105",
      pairingOfferUrl: async () =>
        buildPairingLink({
          serverId,
          relayEndpoint: "127.0.0.1:60106",
          daemonPublicKeyB64: "test-public-key",
        }),
      close: async () => {},
    }),
  ).rejects.toBe(stop);
  expect(handler).toBeTypeOf("function");
  const request = {
    url: () => `http://127.0.0.1:${port}/test`,
    resourceType: () => resourceType,
  };
  const route = {
    request: () => request,
    abort: vi.fn(async () => {}),
    continue: vi.fn(async () => {}),
    fetch: vi.fn(async () => ({ text: async () => "<html></html>" })),
    fulfill: vi.fn(async () => {}),
  };
  await handler!(route as unknown as Route);
  expect(route.abort).toHaveBeenCalledExactlyOnceWith();
  expect(route.fetch).not.toHaveBeenCalled();
  expect(route.continue).not.toHaveBeenCalled();
  expect(route.fulfill).not.toHaveBeenCalled();
});
