import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { once } from "node:events";
import { getAvailableHostDaemonPort } from "./isolated-host-daemon";
import path from "node:path";
import { killProcessTree } from "./spawn-node";

export interface LocalElixirRelay {
  endpoint: string;
  port: number;
  start(): Promise<void>;
  stop(): Promise<void>;
  close(): Promise<void>;
}

async function waitUntilReady(
  port: number,
  child: ChildProcess,
  recentOutput: () => string,
): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Elixir relay exited before becoming ready (code ${String(child.exitCode)}, signal ${String(child.signalCode)}).\n${recentOutput()}`,
      );
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ready`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
      lastError = new Error(`Relay readiness returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Elixir relay did not become ready on port ${port}: ${lastError instanceof Error ? lastError.message : String(lastError)}\n${recentOutput()}`,
  );
}

export async function startLocalElixirRelay(): Promise<LocalElixirRelay> {
  if (process.platform === "win32") {
    throw new Error("The local Elixir relay-deployment Playwright project is POSIX-only.");
  }

  const relayRoot =
    process.env.PASEO_RELAY_CHECKOUT ?? path.resolve(__dirname, "../../../../../..", "paseo-relay");
  if (!existsSync(path.join(relayRoot, "mix.exs"))) {
    throw new Error(
      `Expected the Elixir relay checkout at ${relayRoot}. Set PASEO_RELAY_CHECKOUT to override it.`,
    );
  }

  const port = await getAvailableHostDaemonPort();
  let child: ChildProcess | null = null;
  let output: string[] = [];

  const start = async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      throw new Error("Elixir relay is already running");
    }
    output = [];
    child = spawn("mix", ["run", "--no-halt"], {
      cwd: relayRoot,
      env: {
        ...process.env,
        MIX_ENV: "prod",
        PASEO_RELAY_HOST: "127.0.0.1",
        PASEO_RELAY_PORT: String(port),
        PASEO_RELAY_MIN_CLUSTER_SIZE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const capture = (chunk: Buffer) => {
      output.push(chunk.toString("utf8"));
      output = output.join("").split("\n").slice(-80);
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    try {
      await once(child, "spawn");
      await waitUntilReady(port, child, () => output.join("\n"));
    } catch (error) {
      if (child.pid !== undefined) await killProcessTree(child);
      throw error;
    }
  };

  const stop = async () => {
    if (!child) return;
    await killProcessTree(child);
    child = null;
  };

  await start();
  return {
    endpoint: `127.0.0.1:${port}`,
    port,
    start,
    stop,
    close: stop,
  };
}
