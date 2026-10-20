#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { experimental_createMCPClient } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { chromium } from "playwright";
import { expect } from "playwright/test";
import { runAppearanceFontSizeRegression } from "./appearance-font-size.electron.mjs";
import { runSettingsMemoryRegression } from "./settings-memory.electron.mjs";
import { runAgentDeepLinksRegression, styledResponse } from "./agent-deep-links.electron.mjs";

import { seedPluginLinks, runPluginLinksRegression } from "./plugin-links.electron.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const rootDir = path.resolve(desktopDir, "../..");
const devRunner = path.join(desktopDir, "scripts", "dev-runner.mjs");
const workspaceIds = [
  "desktop-browser-original",
  "desktop-browser-evict-one",
  "desktop-browser-evict-two",
  "desktop-browser-evict-three",
];
const timeoutMs = 90_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function reservePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) return reject(error);
        if (!address || typeof address === "string") {
          return reject(new Error("Failed to reserve a local port"));
        }
        resolve(address.port);
      });
    });
  });
}

async function waitForPort(port, label, processInfo) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (
      processInfo &&
      (processInfo.child.exitCode !== null || processInfo.child.signalCode !== null)
    ) {
      throw new Error(
        `${label} process exited before opening its port; see ${processInfo.logPath}`,
      );
    }
    const connected = await new Promise((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.setTimeout(500);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("error", () => resolve(false));
    });
    if (connected) return;
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${label} on port ${port}`);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function seedPaseoHome(paseoHome, listen, workspaceRoot) {
  const timestamp = "2026-01-01T00:00:00.000Z";
  const projects = workspaceIds.map((workspaceId, index) => {
    const cwd = path.join(workspaceRoot, `workspace-${index + 1}`);
    fs.mkdirSync(cwd, { recursive: true });
    return {
      projectId: `project-${workspaceId}`,
      rootPath: cwd,
      kind: "non_git",
      displayName: `Desktop browser project ${index + 1}`,
      customName: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };
  });
  const workspaces = workspaceIds.map((workspaceId, index) => ({
    workspaceId,
    projectId: projects[index].projectId,
    cwd: projects[index].rootPath,
    kind: "directory",
    displayName: `Desktop browser workspace ${index + 1}`,
    title: `Desktop browser workspace ${index + 1}`,
    branch: null,
    baseBranch: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    pinnedAt: null,
  }));

  writeJson(path.join(paseoHome, "config.json"), {
    version: 1,
    daemon: {
      listen,
      relay: { enabled: false },
      mcp: { enabled: true, injectIntoAgents: true },
      browserTools: { enabled: true },
      cors: { allowedOrigins: ["*"] },
    },
  });
  writeJson(path.join(paseoHome, "projects", "projects.json"), projects);
  writeJson(path.join(paseoHome, "projects", "workspaces.json"), workspaces);
}

function spawnLogged(name, command, args, options, logDir) {
  const logPath = path.join(logDir, `${name}.log`);
  const log = fs.createWriteStream(logPath, { flags: "a" });
  const child = spawn(command, args, {
    ...options,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let openStreams = 2;
  const closeLogStream = () => {
    openStreams -= 1;
    if (openStreams === 0) log.end();
  };
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  child.stdout.once("end", closeLogStream);
  child.stderr.once("end", closeLogStream);
  return { child, logPath };
}

function stopProcess(child) {
  if (!child?.pid || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    // The process may exit between the liveness check and signal delivery.
  }
}

async function waitForAppPage(browser, expoPort) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if (
          expoPort === null
            ? page.url().startsWith("paseo://app/")
            : page.url().includes(`localhost:${expoPort}`)
        )
          return page;
      }
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the real Electron app renderer");
}

async function waitForDesktopStatus(page) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const status = await page.evaluate(async () => {
        if (typeof window.paseoDesktop?.invoke !== "function") return null;
        return await window.paseoDesktop.invoke("desktop_daemon_status");
      });
      if (typeof status?.serverId === "string") return status;
    } catch (error) {
      // Metro may replace the renderer execution context during its initial load.
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(
    `Timed out waiting for the Electron desktop bridge${lastError ? `: ${String(lastError)}` : ""}`,
  );
}

async function startTargetPage() {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const pageName = { "/one": "one", "/two": "two" }[requestUrl.pathname] ?? "target";
    const title = pageName === "target" ? "Desktop browser target" : `Desktop browser ${pageName}`;
    const heading = pageName === "target" ? "Bridge target" : `Navigation page ${pageName}`;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html>
        <head><title>${title}</title>
          <style>body { min-height: 100vh; background: rgb(255, 0, 0); }</style>
          <script>
            window.frameCount = 0;
            function tick() { window.frameCount++; requestAnimationFrame(tick); }
            requestAnimationFrame(tick);
          </script>
        </head>
        <body>
          ${pageName === "target" ? "" : `<h1>${heading}</h1>`}
          <button id="bridge-target" onclick="this.textContent = 'Clicked'">Bridge target</button>
          <label for="typing-target">Typing target</label>
          <input id="typing-target" />
        </body>
      </html>`);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address !== "string", "Target page did not bind a TCP port");
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

function mcpPayload(result, command) {
  const payload = result.structuredContent;
  assert(
    payload && typeof payload === "object",
    `${command} returned no structured payload: ${JSON.stringify(result)}`,
  );
  assert(payload.ok === true, `${command} failed: ${JSON.stringify(payload)}`);
  return payload.result;
}

async function callBrowserTool(client, name, args = {}) {
  return mcpPayload(await client.callTool({ name, args }), name);
}

async function waitForGuestSelector(client, browserId) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const evaluated = await callBrowserTool(client, "browser_evaluate", {
      browserId,
      function: "() => Boolean(globalThis.__paseoSelector)",
    });
    if (JSON.parse(evaluated.resultJson) === true) {
      return true;
    }
    await delay(50);
  }
  return false;
}

async function waitForGuestActiveElement(client, browserId, elementId) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const evaluated = await callBrowserTool(client, "browser_evaluate", {
      browserId,
      function: "() => document.activeElement?.id ?? null",
    });
    if (JSON.parse(evaluated.resultJson) === elementId) {
      return true;
    }
    await delay(50);
  }
  return false;
}

async function createCallerAgent(
  daemonPort,
  {
    workspaceId = workspaceIds[0],
    title = "Browser desktop browser E2E caller",
    initialPrompt = "Remain available while the browser bridge regression runs.",
    features,
  } = {},
) {
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${daemonPort}/mcp/agents`),
  );
  const client = await experimental_createMCPClient({ transport });
  try {
    const response = await client.callTool({
      name: "create_agent",
      args: {
        relationship: { kind: "detached" },
        workspace: { kind: "existing", workspaceId },
        title,
        provider: "mock/ten-second-stream",
        settings: { modeId: "load-test", features },
        initialPrompt,
      },
    });
    const result = response.structuredContent;
    assert(
      result && typeof result === "object",
      `create_agent returned no structured payload: ${JSON.stringify(response)}`,
    );
    assert(typeof result.agentId === "string", "create_agent returned no caller agent id");
    assert(
      result.workspaceId === workspaceId,
      `MCP caller attached to unexpected workspace ${result.workspaceId}`,
    );
    return result.agentId;
  } finally {
    await client.close();
  }
}

async function readGuest(page, browserId) {
  return await page.evaluate((id) => {
    const webview = document.querySelector(`[data-paseo-browser-id="${id}"]`);
    if (!(webview instanceof HTMLElement) || typeof webview.getWebContentsId !== "function") {
      return null;
    }
    return {
      webContentsId: webview.getWebContentsId(),
      parentId: webview.parentElement?.id ?? null,
      width: Math.round(webview.getBoundingClientRect().width),
      height: Math.round(webview.getBoundingClientRect().height),
    };
  }, browserId);
}

async function readPresentation(page, browserId) {
  return await page.evaluate((id) => {
    const surface = document.querySelector(`[data-paseo-browser-surface="${id}"]`);
    const clip = document.querySelector(`[data-testid="browser-webview-clip-${id}"]`);
    if (!(surface instanceof HTMLElement) || !(clip instanceof HTMLElement)) return null;
    const surfaceRect = surface.getBoundingClientRect();
    const clipRect = clip.getBoundingClientRect();
    const webview = surface.querySelector(`[data-paseo-browser-id="${id}"]`);
    if (!(webview instanceof HTMLElement)) return null;
    const webviewRect = webview.getBoundingClientRect();
    const outsidePoint = {
      x: Math.max(0, Math.round(clipRect.left - 1)),
      y: Math.round(clipRect.top + clipRect.height / 2),
    };
    const outsideTarget = document.elementFromPoint(outsidePoint.x, outsidePoint.y);
    return {
      surface: {
        left: Math.round(surfaceRect.left),
        top: Math.round(surfaceRect.top),
        right: Math.round(surfaceRect.right),
        bottom: Math.round(surfaceRect.bottom),
      },
      clip: {
        left: Math.round(clipRect.left),
        top: Math.round(clipRect.top),
        right: Math.round(clipRect.right),
        bottom: Math.round(clipRect.bottom),
      },
      webview: {
        left: Math.round(webviewRect.left),
        top: Math.round(webviewRect.top),
      },
      capturesOutsideInput: surface.contains(outsideTarget),
    };
  }, browserId);
}

async function readViewport(client, browserId) {
  const evaluated = await callBrowserTool(client, "browser_evaluate", {
    browserId,
    function:
      "() => ({ width: window.innerWidth, height: window.innerHeight, scale: window.devicePixelRatio })",
  });
  return JSON.parse(evaluated.resultJson);
}

async function clickGuestElement(page, client, browserId, selector) {
  const evaluated = await callBrowserTool(client, "browser_evaluate", {
    browserId,
    function: `() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }`,
  });
  const elementRect = JSON.parse(evaluated.resultJson);
  assert(elementRect, `Guest element ${selector} was unavailable`);
  await page.locator(`[data-paseo-browser-id="${browserId}"]`).click({
    position: {
      x: elementRect.x + elementRect.width / 2,
      y: elementRect.y + elementRect.height / 2,
    },
  });
}

async function selectDeviceSize(page, label) {
  await page.locator('[aria-label="Device size"]').click();
  const item = page.getByText(label, { exact: true });
  await item.waitFor({ state: "visible", timeout: timeoutMs });
  const rect = await item.boundingBox();
  assert(rect, `Device size menu item ${label} had no bounds`);
  const clip = {
    x: Math.max(0, rect.x),
    y: Math.max(0, rect.y),
    width: rect.width,
    height: rect.height,
  };
  const openPixels = await page.screenshot({ clip });
  await page.keyboard.press("Escape");
  await item.waitFor({ state: "hidden", timeout: timeoutMs });
  const closedPixels = await page.screenshot({ clip });

  await page.locator('[aria-label="Device size"]').click();
  await item.waitFor({ state: "visible", timeout: timeoutMs });
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.keyboard.press("Escape");
  return !openPixels.equals(closedPixels);
}

async function selectElementAndReadAnnotationPaint({ page, client, browserId, artifactDir }) {
  await clickGuestElement(page, client, browserId, "#bridge-target");
  const comment = page.getByRole("textbox", {
    name: "Message to the agent about this element…",
  });
  await comment.waitFor({ state: "visible", timeout: timeoutMs });
  const bounds = await comment.boundingBox();
  assert(bounds, "Element annotation comment box had no bounds");
  const receivesInput = await comment.evaluate((element) => {
    const elementBounds = element.getBoundingClientRect();
    const target = document.elementFromPoint(
      elementBounds.left + elementBounds.width / 2,
      elementBounds.top + elementBounds.height / 2,
    );
    return target === element || element.contains(target);
  });
  const clip = {
    x: Math.max(0, bounds.x),
    y: Math.max(0, bounds.y),
    width: bounds.width,
    height: bounds.height,
  };
  const openPixels = await page.screenshot({
    clip,
    path: path.join(artifactDir, "element-annotation-open.png"),
  });
  await page.keyboard.press("Escape");
  await comment.waitFor({ state: "hidden", timeout: timeoutMs });
  const closedPixels = await page.screenshot({
    clip,
    path: path.join(artifactDir, "element-annotation-closed.png"),
  });
  return receivesInput && !openPixels.equals(closedPixels);
}

async function waitForGuestLocation(client, browserId, pathname) {
  let lastLocation = null;
  await expect
    .poll(
      async () => {
        try {
          const evaluated = await callBrowserTool(client, "browser_evaluate", {
            browserId,
            function:
              "() => ({ href: location.href, pathname: location.pathname, title: document.title })",
          });
          lastLocation = JSON.parse(evaluated.resultJson);
          return lastLocation?.pathname ?? null;
        } catch (error) {
          lastLocation = { error: String(error) };
          return null;
        }
      },
      { timeout: timeoutMs },
    )
    .toBe(pathname);
  return lastLocation;
}

async function ensureExplorerSidebarOpen(page) {
  const sidebar = page.getByTestId("workspace-explorer-sidebar").filter({ visible: true });
  if ((await sidebar.count()) === 0) {
    await page.getByTestId("workspace-explorer-toggle").click();
  }
  await sidebar.waitFor({ state: "visible", timeout: timeoutMs });
}

async function assertNoVisibleMainTabs(page) {
  await expect(page.getByTestId("workspace-tabs-row").filter({ visible: true })).toHaveCount(0, {
    timeout: timeoutMs,
  });
}

function recordViewportMismatch(failures, label, actual, expected) {
  if (actual.width === expected.width && actual.height === expected.height) {
    return;
  }
  failures.push(
    `${label}: expected ${expected.width}x${expected.height}, received ${actual.width}x${actual.height}`,
  );
}

async function evaluateMain(inspectorPort, expression) {
  const [target] = await (await fetch(`http://127.0.0.1:${inspectorPort}/json/list`)).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  try {
    return await new Promise((resolve, reject) => {
      socket.addEventListener("error", reject, { once: true });
      socket.addEventListener("message", ({ data }) => {
        const response = JSON.parse(data);
        if (response.id !== 1) return;
        if (response.error || response.result?.exceptionDetails) reject(new Error(data));
        else resolve(response.result?.result?.value);
      });
      socket.addEventListener(
        "open",
        () =>
          socket.send(
            JSON.stringify({
              id: 1,
              method: "Runtime.evaluate",
              params: {
                expression,
                returnByValue: true,
                awaitPromise: true,
              },
            }),
          ),
        { once: true },
      );
    });
  } finally {
    socket.close();
  }
}

async function setWindowHidden(inspectorPort, hidden) {
  await evaluateMain(
    inspectorPort,
    `(() => { const win = process.mainModule.require('electron').BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('localhost:')); win.${hidden ? "hide" : "show"}(); if (win.isVisible() !== ${!hidden}) throw new Error('Window visibility did not change'); })()`,
  );
}

async function openAgentViaDeepLink(inspectorPort, target) {
  const url = `paseo://h/${encodeURIComponent(target.serverId)}/agent/${encodeURIComponent(target.agentId)}`;
  await evaluateMain(
    inspectorPort,
    `process.mainModule.require('electron').app.emit('open-url', { preventDefault() {} }, ${JSON.stringify(url)})`,
  );
}

async function verifyHiddenBrowserScreenshots({
  page,
  client,
  browserId,
  artifactDir,
  inspectorPort,
}) {
  const readFrames = async () => {
    const result = await callBrowserTool(client, "browser_evaluate", {
      browserId,
      function: "() => window.frameCount",
    });
    return JSON.parse(result.resultJson);
  };
  const expectAnimation = async () => {
    const start = await readFrames();
    assert(typeof start === "number", "Animation fixture was not loaded");
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if ((await readFrames()) > start + 2) return;
      await delay(50);
    }
    throw new Error("Browser did not animate in the restored window");
  };
  const measurements = [];
  const expectIdle = async (label) => {
    await delay(500); // Let Chromium consume the visibility change before sampling.
    const start = await readFrames();
    await delay(1_000); // A fixed sampling interval is the behavior under test.
    const frames = (await readFrames()) - start;
    measurements.push({ label, frames });
    writeJson(path.join(artifactDir, "hidden-browser-frames.json"), measurements);
    assert(frames === 0, `${label}: hidden browser produced ${frames} animation frames`);
  };
  try {
    await expectAnimation();
    await setWindowHidden(inspectorPort, true);
    await expectIdle("before-capture");
    await callBrowserTool(client, "browser_evaluate", {
      browserId,
      function: "() => { document.body.style.background = 'rgb(0,255,0)'; }",
    });
    const response = await client.callTool({ name: "browser_screenshot", args: { browserId } });
    mcpPayload(response, "browser_screenshot");
    const screenshot = response.content.find((item) => item.type === "image");
    assert(screenshot, "browser_screenshot returned no image");
    fs.writeFileSync(
      path.join(artifactDir, "hidden-browser-viewport.png"),
      Buffer.from(screenshot.data, "base64"),
    );
    const pixel = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return [
        ...context.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1)
          .data,
      ];
    }, screenshot.data);
    assert(
      JSON.stringify(pixel) === "[0,255,0,255]",
      `Hidden screenshot returned stale pixels: ${pixel}`,
    );
    await expectIdle("after-capture");
  } finally {
    await setWindowHidden(inspectorPort, false);
  }
  await expectAnimation();
}

async function verifyBackgroundTypingStaysInGuest({ page, client, serverId, browserId, agent }) {
  await page
    .getByTestId(`workspace-deck-entry-${serverId}:${agent.workspaceId}`)
    .getByTestId(`workspace-tab-agent_${agent.agentId}`)
    .click({ timeout: timeoutMs });
  const composer = page
    .getByRole("textbox", { name: "Message agent..." })
    .filter({ visible: true })
    .first();
  const draft = "draft the user is typing";
  await composer.click();
  await composer.pressSequentially(draft);
  assert(
    await composer.evaluate((element) => element === document.activeElement),
    "Composer did not keep focus while the user typed",
  );

  const snapshot = await callBrowserTool(client, "browser_snapshot", { browserId });
  const ref = snapshot.snapshot.match(/textbox "Typing target" \[ref=(@e\d+)\]/)?.[1];
  assert(ref, `browser_snapshot did not expose the typing target: ${snapshot.snapshot}`);
  await callBrowserTool(client, "browser_type", { browserId, ref, text: "agent text" });
  await callBrowserTool(client, "browser_keypress", { browserId, ref, key: "!" });

  // The user keeps typing in the composer while the agent types into the tab's focused field.
  await composer.click();
  await composer.press("End");
  assert(
    await composer.evaluate((element) => element === document.activeElement),
    "Composer did not take focus back from the browser tab",
  );
  await callBrowserTool(client, "browser_type", { browserId, text: " more" });
  await callBrowserTool(client, "browser_keypress", { browserId, key: "?" });

  const guestValue = JSON.parse(
    (
      await callBrowserTool(client, "browser_evaluate", {
        browserId,
        function: "() => document.getElementById('typing-target').value",
      })
    ).resultJson,
  );
  const composerValue = await composer.inputValue();
  assert(
    composerValue === draft,
    `browser_type and browser_keypress in a background tab changed the focused composer: ${JSON.stringify(composerValue)}`,
  );
  assert(
    guestValue === "agent text! more?",
    `browser_type and browser_keypress did not reach the browser tab: ${JSON.stringify(guestValue)}`,
  );
  await composer.fill("");
}

async function runRegression({
  page,
  client,
  serverId,
  targetUrl,
  callerAgentId,
  typingAgent,
  artifactDir,
  inspectorPort,
}) {
  const failures = [];
  const originalWorkspaceId = workspaceIds[0];
  // The Mac chat sidebar lists the caller chat instead of a row for its workspace.
  const originalWorkspaceRow = page
    .locator(
      `[data-testid="sidebar-workspace-row-${serverId}:${originalWorkspaceId}"], [data-testid="desktop-chat-${serverId}:${callerAgentId}"]`,
    )
    .first();
  await originalWorkspaceRow.waitFor({ state: "visible", timeout: timeoutMs });
  await originalWorkspaceRow.click();

  await page.evaluate(() => {
    if (document.getElementById("overlay-root")) return;
    const overlayRoot = document.createElement("div");
    overlayRoot.id = "overlay-root";
    overlayRoot.style.position = "fixed";
    overlayRoot.style.inset = "0";
    overlayRoot.style.pointerEvents = "none";
    document.body.appendChild(overlayRoot);
  });

  const created = await callBrowserTool(client, "browser_new_tab", { url: targetUrl });
  const browserId = created.browserId;
  assert(typeof browserId === "string", "browser_new_tab returned no browserId");

  const originalDeck = page.getByTestId(`workspace-deck-entry-${serverId}:${originalWorkspaceId}`);
  await originalDeck.getByTestId(`workspace-tab-browser_${browserId}`).click();
  await page.waitForFunction(
    (id) => {
      const webview = document.querySelector(`[data-paseo-browser-id="${id}"]`);
      const surface = webview?.parentElement;
      return (
        surface?.getAttribute("aria-hidden") === "false" && surface.style.pointerEvents === "auto"
      );
    },
    browserId,
    { timeout: timeoutMs },
  );
  const firstGuest = await readGuest(page, browserId);
  assert(firstGuest, "Original browser guest was not attached to its workspace pane");
  recordViewportMismatch(
    failures,
    "Responsive viewport follows the visible browser pane",
    await readViewport(client, browserId),
    { width: firstGuest.width, height: firstGuest.height },
  );

  await clickGuestElement(page, client, browserId, "#typing-target");
  assert(
    await waitForGuestActiveElement(client, browserId, "typing-target"),
    "Physical browser click did not focus the guest input",
  );
  const focusedGuest = await page.evaluate(
    (id) => window.paseoDesktop?.browser?.focus?.(id),
    browserId,
  );
  assert(focusedGuest === true, "Electron did not focus the registered browser guest");

  const deviceSizeMenuPainted = await selectDeviceSize(page, "iPhone SE · 375×667");
  assert(deviceSizeMenuPainted, "Device size menu did not paint above the browser surface");
  const deviceViewport = await readViewport(client, browserId);
  recordViewportMismatch(
    failures,
    "device size menu paints and receives input above the browser surface",
    deviceViewport,
    { width: 375, height: 667 },
  );

  await callBrowserTool(client, "browser_wait", {
    browserId,
    text: "Bridge target",
    timeoutMs: 5_000,
  });
  const resizedScreenshot = await callBrowserTool(client, "browser_screenshot", { browserId });
  assert(
    resizedScreenshot.width === Math.round(375 * deviceViewport.scale) &&
      resizedScreenshot.height === Math.round(667 * deviceViewport.scale),
    `Screenshot after resize returned ${resizedScreenshot.width}×${resizedScreenshot.height}`,
  );
  const requestedViewport = { width: 640, height: 480 };
  await callBrowserTool(client, "browser_resize", { browserId, ...requestedViewport });
  recordViewportMismatch(
    failures,
    "browser_resize updates the visible shared viewport",
    await readViewport(client, browserId),
    requestedViewport,
  );

  const oversizedViewport = { width: 2560, height: 1440 };
  await callBrowserTool(client, "browser_resize", { browserId, ...oversizedViewport });
  recordViewportMismatch(
    failures,
    "oversized preset preserves the requested guest viewport",
    await readViewport(client, browserId),
    oversizedViewport,
  );
  await page.waitForFunction(
    ({ id, width, height }) => {
      const webview = document.querySelector(`[data-paseo-browser-id="${id}"]`);
      return (
        webview instanceof HTMLElement &&
        Math.round(webview.getBoundingClientRect().width) === width &&
        Math.round(webview.getBoundingClientRect().height) === height
      );
    },
    { id: browserId, ...oversizedViewport },
    { timeout: timeoutMs },
  );
  const presentation = await readPresentation(page, browserId);
  assert(presentation, "Oversized browser presentation geometry was unavailable");
  if (
    presentation.surface.left < presentation.clip.left ||
    presentation.surface.top < presentation.clip.top ||
    presentation.surface.right > presentation.clip.right ||
    presentation.surface.bottom > presentation.clip.bottom
  ) {
    failures.push(
      `oversized browser surface stays inside its pane: ${JSON.stringify(presentation)}`,
    );
  }
  if (presentation.capturesOutsideInput) {
    failures.push("oversized browser surface captures input outside its pane");
  }
  await callBrowserTool(client, "browser_resize", { browserId, ...oversizedViewport });
  const repeatedResizePresentation = await readPresentation(page, browserId);
  assert(repeatedResizePresentation, "Repeated resize presentation geometry was unavailable");
  if (
    repeatedResizePresentation.webview.left !== presentation.webview.left ||
    repeatedResizePresentation.webview.top !== presentation.webview.top
  ) {
    failures.push(
      `repeating an oversized resize preserves the guest offset: before ${JSON.stringify(presentation.webview)}, after ${JSON.stringify(repeatedResizePresentation.webview)}`,
    );
  }
  await callBrowserTool(client, "browser_resize", { browserId, ...requestedViewport });

  await selectDeviceSize(page, "Responsive");
  const responsiveViewport = await readViewport(client, browserId);

  await originalDeck.getByTestId(`workspace-tab-agent_${callerAgentId}`).click();
  await page.waitForFunction(
    ({ id, webContentsId }) => {
      const webview = document.querySelector(`[data-paseo-browser-id="${id}"]`);
      return (
        webview?.parentElement?.getAttribute("data-paseo-browser-surface") === id &&
        webview.parentElement.style.width === "1px" &&
        webview.parentElement.style.pointerEvents === "none" &&
        webview.getWebContentsId() === webContentsId
      );
    },
    { id: browserId, webContentsId: firstGuest.webContentsId },
    { timeout: timeoutMs },
  );
  try {
    await callBrowserTool(client, "browser_screenshot", { browserId });
  } catch (error) {
    failures.push(`inactive browser remains captureable: ${String(error)}`);
  }
  recordViewportMismatch(
    failures,
    "inactive browser preserves the shared viewport",
    await readViewport(client, browserId),
    responsiveViewport,
  );
  const focusContinuitySentinel = "preserve-browser-document-across-focus";
  await callBrowserTool(client, "browser_evaluate", {
    browserId,
    function: `() => {
      globalThis.__paseoFocusContinuity = ${JSON.stringify(focusContinuitySentinel)};
      globalThis.__paseoViewportTransitions = [{ width: innerWidth, height: innerHeight }];
      addEventListener('resize', () => {
        globalThis.__paseoViewportTransitions.push({ width: innerWidth, height: innerHeight });
      });
      return globalThis.__paseoFocusContinuity;
    }`,
  });
  await page.evaluate((id) => {
    const webview = document.querySelector(`[data-paseo-browser-id="${id}"]`);
    if (!webview) throw new Error(`Browser webview ${id} was unavailable`);
    const events = [];
    globalThis.__paseoBrowserReactivationEvents = events;
    for (const name of [
      "did-start-loading",
      "did-navigate-in-page",
      "load-commit",
      "did-stop-loading",
    ]) {
      webview.addEventListener(name, (event) => {
        events.push({
          name,
          url: event.url ?? null,
          isMainFrame: event.isMainFrame ?? null,
        });
      });
    }
  }, browserId);

  await originalDeck.getByTestId(`workspace-tab-browser_${browserId}`).click();
  await page.waitForFunction(
    ({ id, webContentsId }) => {
      const webview = document.querySelector(`[data-paseo-browser-id="${id}"]`);
      return (
        webview?.parentElement?.getAttribute("data-paseo-browser-surface") === id &&
        webview.parentElement.style.pointerEvents === "auto" &&
        webview.getWebContentsId() === webContentsId
      );
    },
    { id: browserId, webContentsId: firstGuest.webContentsId },
    { timeout: timeoutMs },
  );
  await page.waitForTimeout(1_500);
  const reactivationEvents = await page.evaluate(
    () => globalThis.__paseoBrowserReactivationEvents ?? [],
  );
  const unexpectedReactivationCommits = reactivationEvents.filter(
    (event) => event.name === "did-navigate-in-page" || event.name === "load-commit",
  );
  assert(
    unexpectedReactivationCommits.length === 0,
    `responsive browser reactivation committed the current document: ${JSON.stringify(unexpectedReactivationCommits)}`,
  );
  const viewportTransitionsResult = await callBrowserTool(client, "browser_evaluate", {
    browserId,
    function: "() => globalThis.__paseoViewportTransitions ?? []",
  });
  const viewportTransitions = JSON.parse(viewportTransitionsResult.resultJson);
  const collapsedViewport = viewportTransitions.find(
    (viewport) => viewport.width <= 1 || viewport.height <= 1,
  );
  assert(
    collapsedViewport === undefined,
    `responsive browser reactivation collapsed the guest viewport: ${JSON.stringify(viewportTransitions)}`,
  );
  const continuityResult = await callBrowserTool(client, "browser_evaluate", {
    browserId,
    function: "() => globalThis.__paseoFocusContinuity ?? null",
  });
  const continuityValue = JSON.parse(continuityResult.resultJson);
  if (continuityValue !== focusContinuitySentinel) {
    failures.push(
      `focusing the browser tab preserves the current document: expected ${JSON.stringify(focusContinuitySentinel)}, received ${JSON.stringify(continuityValue)}`,
    );
  }

  for (const workspaceId of workspaceIds.slice(1)) {
    await page.getByTestId(`sidebar-workspace-row-${serverId}:${workspaceId}`).click();
    await page
      .getByTestId(`workspace-deck-entry-${serverId}:${workspaceId}`)
      .waitFor({ state: "visible" });
  }

  await page.waitForFunction(
    ({ id, previousWebContentsId }) => {
      const webview = document.querySelector(`[data-paseo-browser-id="${id}"]`);
      return (
        webview?.parentElement?.getAttribute("data-paseo-browser-surface") === id &&
        webview.parentElement.style.width === "1px" &&
        typeof webview.getWebContentsId === "function" &&
        webview.getWebContentsId() === previousWebContentsId
      );
    },
    { id: browserId, previousWebContentsId: firstGuest.webContentsId },
    { timeout: timeoutMs },
  );
  const parkedGuest = await readGuest(page, browserId);
  assert(parkedGuest, "Browser guest was not parked after workspace eviction");

  await verifyHiddenBrowserScreenshots({ page, client, browserId, artifactDir, inspectorPort });

  const listed = await callBrowserTool(client, "browser_list_tabs");
  assert(
    listed.tabs.some((tab) => tab.browserId === browserId),
    "browser_list_tabs lost the original tab after workspace eviction",
  );

  const snapshot = await callBrowserTool(client, "browser_snapshot", { browserId });
  const ref = snapshot.snapshot.match(/button "Bridge target" \[ref=(@e\d+)\]/)?.[1];
  assert(ref, `browser_snapshot did not expose the target button: ${snapshot.snapshot}`);

  const clicked = await callBrowserTool(client, "browser_click", { browserId, ref });
  assert(
    clicked.browserId === browserId && clicked.ref === ref,
    "browser_click targeted another tab",
  );
  await callBrowserTool(client, "browser_wait", {
    browserId,
    text: "Clicked",
    timeoutMs: 5_000,
  });
  await verifyBackgroundTypingStaysInGuest({
    page,
    client,
    serverId,
    browserId,
    agent: typingAgent,
  });

  await originalWorkspaceRow.click();
  await originalDeck.getByTestId(`workspace-tab-browser_${browserId}`).click();
  await page.waitForFunction(
    ({ id, webContentsId }) => {
      const webview = document.querySelector(`[data-paseo-browser-id="${id}"]`);
      return (
        webview?.parentElement?.getAttribute("data-paseo-browser-surface") === id &&
        webview.parentElement.style.pointerEvents === "auto" &&
        webview.getWebContentsId() === webContentsId
      );
    },
    { id: browserId, webContentsId: firstGuest.webContentsId },
    { timeout: timeoutMs },
  );
  recordViewportMismatch(
    failures,
    "browser viewport survives workspace eviction and reattachment",
    await readViewport(client, browserId),
    responsiveViewport,
  );

  const annotateButton = originalDeck.getByRole("button", { name: "Annotate element" });
  await page.evaluate((id) => {
    const webview = document.querySelector(`[data-paseo-browser-id="${id}"]`);
    if (!(webview instanceof HTMLElement)) throw new Error(`Browser webview ${id} was unavailable`);
    globalThis.__paseoOriginalIsLoadingDescriptor = Object.getOwnPropertyDescriptor(
      webview,
      "isLoading",
    );
    Object.defineProperty(webview, "isLoading", {
      configurable: true,
      value: () => true,
    });
  }, browserId);
  await annotateButton.click();
  await page.waitForTimeout(100);
  assert(
    !(await originalDeck.getByRole("button", { name: "Cancel element selector" }).isVisible()),
    "Element selector started while the guest reported a genuine load",
  );
  const selectorDuringLoad = await callBrowserTool(client, "browser_evaluate", {
    browserId,
    function: "() => Boolean(globalThis.__paseoSelector)",
  });
  assert(
    JSON.parse(selectorDuringLoad.resultJson) === false,
    "Selector injected while the guest reported a genuine load",
  );
  assert(
    await page.getByText("Wait for the page to finish loading").isVisible(),
    "Element selector loading failure was not visible",
  );
  await page.evaluate((id) => {
    const webview = document.querySelector(`[data-paseo-browser-id="${id}"]`);
    if (!(webview instanceof HTMLElement)) throw new Error(`Browser webview ${id} was unavailable`);
    const descriptor = globalThis.__paseoOriginalIsLoadingDescriptor;
    if (descriptor) Object.defineProperty(webview, "isLoading", descriptor);
    else delete webview.isLoading;
    delete globalThis.__paseoOriginalIsLoadingDescriptor;
  }, browserId);

  const readyStateResult = await callBrowserTool(client, "browser_evaluate", {
    browserId,
    function: "() => document.readyState",
  });
  assert(
    JSON.parse(readyStateResult.resultJson) === "complete",
    "Local browser document did not finish loading",
  );
  // Reproduce the report's mismatch: the guest is complete, but the pane's
  // last loading signal says it is not ready.
  await page.evaluate((id) => {
    const webview = document.querySelector(`[data-paseo-browser-id="${id}"]`);
    if (!(webview instanceof HTMLElement)) {
      throw new Error(`Browser webview ${id} was unavailable`);
    }
    webview.dispatchEvent(new Event("did-start-loading"));
  }, browserId);

  await annotateButton.click();
  const annotateSelectorActive = await waitForGuestSelector(client, browserId);
  await page.screenshot({ path: path.join(artifactDir, "local-page-annotate-selector.png") });
  if (!annotateSelectorActive) {
    failures.push("loaded local browser remains ready for element annotation");
  }

  await originalDeck.getByRole("button", { name: "Cancel element selector" }).click();
  await delay(10_000);
  const screenshotButton = originalDeck.getByRole("button", { name: "Screenshot element" });
  await screenshotButton.click();
  const screenshotSelectorActive = await waitForGuestSelector(client, browserId);
  if (!screenshotSelectorActive) {
    failures.push("loaded local browser remains ready for element screenshots");
  }
  await delay(20_500);
  const selectorAfterPriorTimeout = await callBrowserTool(client, "browser_evaluate", {
    browserId,
    function: "() => Boolean(globalThis.__paseoSelector)",
  });
  if (JSON.parse(selectorAfterPriorTimeout.resultJson) !== true) {
    failures.push("a previous selector timeout does not destroy the current selector session");
  }
  await page.screenshot({ path: path.join(artifactDir, "local-page-screenshot-selector.png") });
  await originalDeck.getByRole("button", { name: "Cancel element selector" }).click();

  await originalDeck.getByTestId(`workspace-tab-agent_${callerAgentId}`).click();
  await page.getByTestId("sidebar-search").click();
  await page.getByTestId("command-center-input").fill("Split pane right");
  await page.getByText("Split pane right", { exact: true }).click();
  assert(
    (await originalDeck.getByTestId("workspace-tabs-row").filter({ visible: true }).count()) === 2,
    "Split pane command did not produce two visible panes",
  );
  await originalDeck.getByTestId(`workspace-tab-browser_${browserId}`).last().click();
  await originalDeck
    .getByTestId(`browser-webview-clip-${browserId}`)
    .waitFor({ state: "visible", timeout: timeoutMs });

  const splitAnnotateButton = originalDeck.getByRole("button", { name: "Annotate element" });
  await splitAnnotateButton.click();
  assert(
    await waitForGuestSelector(client, browserId),
    "Element selector did not start in the split browser pane",
  );
  assert(
    await selectElementAndReadAnnotationPaint({
      page,
      client,
      browserId,
      artifactDir,
    }),
    "Element annotation comment box did not paint or receive input above the browser surface",
  );

  if (failures.length > 0) {
    throw new Error(`Browser viewport regressions:\n- ${failures.join("\n- ")}`);
  }

  return {
    browserId,
    originalWebContentsId: firstGuest.webContentsId,
    finalWebContentsId: parkedGuest.webContentsId,
    viewport: "passed",
    guestFocus: "passed",
    overlayPlane: "passed",
    inactiveCapture: "passed",
    hiddenWindowCapture: "passed",
    list: "passed",
    snapshot: "passed",
    click: "passed",
    localPageSelectors: "passed",
  };
}

async function runWebviewNavigationRegression({ page, client, serverId, targetUrl, artifactDir }) {
  const workspaceId = workspaceIds[0];
  await assertNoVisibleMainTabs(page);

  const originalDeck = page.getByTestId(`workspace-deck-entry-${serverId}:${workspaceId}`);
  await originalDeck.waitFor({ state: "visible", timeout: timeoutMs });
  await expect(page.getByTestId("desktop-chat-title")).toHaveText("Browser navigation-only chat");
  const composer = page
    .getByRole("textbox", { name: "Message agent...", exact: true })
    .filter({ visible: true });
  await composer.waitFor({ state: "visible", timeout: timeoutMs });
  const draft = "Keep the main chat draft during real browser navigation.";
  await composer.fill(draft);

  const oneUrl = new URL("/one", targetUrl).toString();
  const twoUrl = new URL("/two", targetUrl).toString();
  const created = await callBrowserTool(client, "browser_new_tab", { url: oneUrl });
  const browserId = created.browserId;
  assert(typeof browserId === "string", "browser_new_tab returned no browserId");

  await ensureExplorerSidebarOpen(page);
  await assertNoVisibleMainTabs(page);
  assert(
    (await originalDeck.getByTestId(`workspace-tab-browser_${browserId}`).count()) === 0,
    "Browser tab appeared in the removed main workspace tab row",
  );

  const toolbar = page.getByTestId("desktop-explorer-toolbar");
  const browserTab = toolbar.getByTestId(`explorer-sidebar-tab-browser_${browserId}`);
  await browserTab.waitFor({ state: "visible", timeout: timeoutMs });
  await browserTab.click();
  assert(
    (await browserTab.getAttribute("aria-selected")) === "true",
    "Explorer browser tab did not become selected",
  );

  await originalDeck
    .getByTestId(`browser-webview-clip-${browserId}`)
    .waitFor({ state: "visible", timeout: timeoutMs });
  await waitForGuestLocation(client, browserId, "/one");
  const firstGuest = await readGuest(page, browserId);
  assert(firstGuest, "Browser guest was not attached for real navigation");

  const address = originalDeck
    .getByRole("textbox", { name: "Browser URL", exact: true })
    .filter({ visible: true });
  await address.waitFor({ state: "visible", timeout: timeoutMs });
  await address.fill(twoUrl);
  await address.press("Enter");
  const afterSubmit = await waitForGuestLocation(client, browserId, "/two");
  assert(afterSubmit.href === twoUrl, `Submitted URL mismatch: ${JSON.stringify(afterSubmit)}`);
  await page.screenshot({ path: path.join(artifactDir, "browser-navigation-webview.png") });

  const backButton = originalDeck.getByRole("button", { name: "Back", exact: true }).last();
  await expect(backButton).toBeEnabled({ timeout: timeoutMs });
  await backButton.click();
  await waitForGuestLocation(client, browserId, "/one");

  const forwardButton = originalDeck.getByRole("button", { name: "Forward", exact: true }).last();
  await expect(forwardButton).toBeEnabled({ timeout: timeoutMs });
  await forwardButton.click();
  await waitForGuestLocation(client, browserId, "/two");

  await assertNoVisibleMainTabs(page);
  assert(
    (await composer.inputValue()) === draft,
    `Main chat draft changed while navigating browser: ${await composer.inputValue()}`,
  );
  assert(
    (await readGuest(page, browserId))?.webContentsId === firstGuest.webContentsId,
    "Browser navigation replaced the resident guest WebContents",
  );

  await toolbar.getByTestId(`explorer-sidebar-tab-close-browser_${browserId}`).click();
  await expect.poll(async () => (await readGuest(page, browserId)) === null).toBe(true);
  await expect(browserTab).toHaveCount(0, { timeout: timeoutMs });
  const listed = await callBrowserTool(client, "browser_list_tabs");
  assert(
    !listed.tabs.some((tab) => tab.browserId === browserId),
    "browser_list_tabs still returned the closed browser tab",
  );
  assert(
    (await composer.inputValue()) === draft,
    `Main chat draft changed after closing browser: ${await composer.inputValue()}`,
  );

  return {
    browserId,
    webContentsId: firstGuest.webContentsId,
    submittedUrl: twoUrl,
    backForward: "passed",
    closeCleanup: "passed",
    draftPreserved: true,
    mainTabsHidden: true,
  };
}

function agentLinksExecutable() {
  if (process.env.PASEO_DESKTOP_AGENT_LINKS_ONLY !== "1") return null;
  const executable = process.env.PASEO_DESKTOP_AGENT_LINKS_EXECUTABLE;
  assert(process.platform === "darwin", "Custom agent-link regression requires macOS");
  assert(
    executable && path.isAbsolute(executable),
    "Set an absolute PASEO_DESKTOP_AGENT_LINKS_EXECUTABLE for the already-built Custom bundle",
  );
  return executable;
}

function desktopTestEnvironment(runtimeDir, agentLinksOnly, browserNavigationOnly) {
  assert(!(agentLinksOnly && browserNavigationOnly), "Choose only one desktop regression mode");
  if (browserNavigationOnly) {
    assert(
      process.platform === "darwin",
      "Desktop browser navigation-only regression requires macOS",
    );
  }
  if (!agentLinksOnly && !browserNavigationOnly) return process.env;
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        ["PATH", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "SHELL"].includes(key),
      ),
    ),
    HOME: runtimeDir,
    USERPROFILE: runtimeDir,
    PASEO_SERVER_ID: agentLinksOnly ? "agent-links-host" : "browser-navigation-host",
    PASEO_DISABLE_SINGLE_INSTANCE_LOCK: "0",
  };
}

async function main() {
  const customExecutable = agentLinksExecutable();
  const agentLinksOnly = customExecutable !== null;
  const browserNavigationOnly = process.env.PASEO_DESKTOP_BROWSER_NAVIGATION_ONLY === "1";
  const fullBrowserSuite = !(agentLinksOnly || browserNavigationOnly);
  const artifactDir =
    process.env.PASEO_DESKTOP_BROWSER_E2E_ARTIFACT_DIR ??
    fs.mkdtempSync(path.join(os.tmpdir(), "paseo-desktop-browser-e2e-artifacts-"));
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "paseo-desktop-browser-e2e-"));
  fs.mkdirSync(artifactDir, { recursive: true });
  const paseoHome = path.join(runtimeDir, "paseo-home");
  const userData = path.join(runtimeDir, "electron-user-data");
  const workspaceRoot = path.join(runtimeDir, "workspaces");
  fs.mkdirSync(paseoHome, { recursive: true });

  const [daemonPort, expoPort, cdpPort, inspectorPort, remotePort] = await Promise.all([
    reservePort(),
    reservePort(),
    reservePort(),
    reservePort(),
    reservePort(),
  ]);
  assert(
    [daemonPort, expoPort, cdpPort, inspectorPort, remotePort].every(
      (port) => port !== 6767 && port !== 6768,
    ),
    "Reserved a protected daemon port",
  );
  assert(
    new Set([daemonPort, expoPort, cdpPort, inspectorPort, remotePort]).size === 5,
    "Reserved duplicate test ports",
  );
  const listen = `127.0.0.1:${daemonPort}`;
  seedPaseoHome(paseoHome, listen, workspaceRoot);
  const target = agentLinksOnly ? null : await startTargetPage();
  if (fullBrowserSuite) {
    seedPluginLinks(paseoHome, workspaceIds[0], target.url, workspaceIds[1]);
  }
  const remoteHome = path.join(runtimeDir, "remote-home");
  if (fullBrowserSuite)
    seedPaseoHome(
      remoteHome,
      `127.0.0.1:${remotePort}`,
      path.join(runtimeDir, "remote-workspaces"),
    );
  const children = [];
  let browser = null;
  let client = null;

  try {
    // Observe the real Electron shell handoff without launching a user's browser.
    const openerDirectory = path.join(runtimeDir, "url-handler");
    const externalOpenLog = path.join(artifactDir, "external-opens.txt");
    fs.mkdirSync(openerDirectory, { recursive: true });
    fs.writeFileSync(externalOpenLog, "");
    fs.writeFileSync(
      path.join(openerDirectory, "xdg-open"),
      '#!/bin/sh\nprintf "%s\\n" "$1" >> "$PASEO_TEST_EXTERNAL_OPEN_LOG"\n',
      { mode: 0o755 },
    );
    const commonEnv = {
      ...desktopTestEnvironment(runtimeDir, agentLinksOnly, browserNavigationOnly),
      PATH: `${openerDirectory}${path.delimiter}${process.env.PATH}`,
      PASEO_TEST_EXTERNAL_OPEN_LOG: externalOpenLog,
      PASEO_HOME: paseoHome,
      PASEO_LISTEN: listen,
      PASEO_DAEMON_ENDPOINT: `localhost:${daemonPort}`,
      PASEO_CORS_ORIGINS: "*",
      PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD: "0",
      PASEO_DICTATION_ENABLED: "0",
      PASEO_VOICE_MODE_ENABLED: "0",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    };
    const daemon = spawnLogged(
      "daemon",
      process.execPath,
      ["--import", "tsx", path.join(rootDir, "packages/server/scripts/dev-runner.ts")],
      { cwd: rootDir, env: { ...commonEnv, PASEO_NODE_ENV: "development" } },
      artifactDir,
    );
    children.push(daemon.child);
    await waitForPort(daemonPort, "daemon", daemon);

    if (agentLinksOnly) {
      const serverId = "agent-links-host";
      const agentA = await createCallerAgent(daemonPort, {
        title: "Deep link chat A",
        initialPrompt: "Synthetic deep link fixture A.",
      });
      const agentB = await createCallerAgent(daemonPort, {
        title: "Deep link chat B",
        initialPrompt: "Synthetic deep link fixture B.",
      });
      const styledAgent = await createCallerAgent(daemonPort, {
        title: "Styled response",
        initialPrompt: "Show styled text.",
        features: { mockAssistantResponse: styledResponse },
      });
      const desktopEnv = {
        ...commonEnv,
        PASEO_ELECTRON_USER_DATA_DIR: userData,
        PASEO_ELECTRON_FLAGS: `--remote-debugging-address=127.0.0.1 --remote-debugging-port=${cdpPort}`,
      };
      const desktop = spawnLogged(
        "agent-links-desktop",
        customExecutable,
        [
          `--inspect=127.0.0.1:${inspectorPort}`,
          "--lang=en-US",
          `paseo-custom://h/${serverId}/agent/${encodeURIComponent(agentA)}`,
        ],
        { cwd: rootDir, env: desktopEnv },
        artifactDir,
      );
      children.push(desktop.child);
      await waitForPort(cdpPort, "Custom Electron CDP", desktop);
      await waitForPort(inspectorPort, "Custom Electron inspector", desktop);
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
      const page = await waitForAppPage(browser, null);
      const status = await waitForDesktopStatus(page);
      assert(status.serverId === serverId, "Custom desktop attached to the wrong host");
      try {
        const report = await runAgentDeepLinksRegression({
          page,
          serverId,
          workspaceId: workspaceIds[0],
          agentA,
          agentB,
          styledAgent,
          userData,
          artifactDir,
          evaluateMain: (expression) => evaluateMain(inspectorPort, expression),
          launchSecondInstance: (url) => {
            const second = spawnLogged(
              "agent-links-second-instance",
              customExecutable,
              ["--lang=en-US", url],
              { cwd: rootDir, env: { ...desktopEnv, PASEO_ELECTRON_FLAGS: "" } },
              artifactDir,
            );
            children.push(second.child);
            return second.child;
          },
        });
        writeJson(path.join(artifactDir, "result.json"), report);
        console.log(
          "Custom agent links passed: cold argv, real second instance, open-url handler, draft preservation and invalid URL rejection.",
        );
      } catch (error) {
        await page
          .screenshot({ path: path.join(artifactDir, "agent-links-failure.png") })
          .catch(() => {});
        throw error;
      }
      return;
    }

    if (browserNavigationOnly) {
      assert(target, "Navigation-only regression needs a local target page");
      const desktop = spawnLogged(
        "browser-navigation-desktop",
        process.execPath,
        [devRunner, `--inspect=127.0.0.1:${inspectorPort}`, "--lang=en-US"],
        {
          cwd: rootDir,
          env: {
            ...commonEnv,
            EXPO_PORT: String(expoPort),
            EXPO_DEV_URL: `http://localhost:${expoPort}`,
            PASEO_ELECTRON_REMOTE_DEBUGGING_PORT: String(cdpPort),
            PASEO_ELECTRON_USER_DATA_DIR: userData,
            PASEO_ELECTRON_FLAGS: `--remote-debugging-address=127.0.0.1 --remote-debugging-port=${cdpPort}`,
          },
        },
        artifactDir,
      );
      children.push(desktop.child);
      await waitForPort(cdpPort, "Electron CDP", desktop);
      await waitForPort(inspectorPort, "Electron inspector", desktop);

      browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
      const page = await waitForAppPage(browser, expoPort);
      const status = await waitForDesktopStatus(page);
      assert(
        status.serverId === "browser-navigation-host",
        "Navigation test attached to the wrong host",
      );
      const callerAgentId = await createCallerAgent(daemonPort, {
        title: "Browser navigation-only chat",
        initialPrompt: "Synthetic local browser navigation fixture.",
      });
      await openAgentViaDeepLink(inspectorPort, {
        serverId: status.serverId,
        agentId: callerAgentId,
      });
      const transport = new StreamableHTTPClientTransport(
        new URL(
          `http://127.0.0.1:${daemonPort}/mcp/agents?callerAgentId=${encodeURIComponent(callerAgentId)}`,
        ),
      );
      client = await experimental_createMCPClient({ transport });
      const navigation = await runWebviewNavigationRegression({
        page,
        client,
        serverId: status.serverId,
        targetUrl: target.url,
        artifactDir,
      });
      writeJson(path.join(artifactDir, "result.json"), { navigation, callerAgentId });
      console.log(
        `Desktop browser navigation-only passed: ${navigation.browserId} navigated /one -> /two -> back -> forward and cleaned up.`,
      );
      return;
    }

    const remoteDaemon = spawnLogged(
      "remote-daemon",
      process.execPath,
      ["--import", "tsx", path.join(rootDir, "packages/server/scripts/dev-runner.ts")],
      {
        cwd: rootDir,
        env: {
          ...commonEnv,
          PASEO_HOME: remoteHome,
          PASEO_LISTEN: `127.0.0.1:${remotePort}`,
          PASEO_SERVER_ID: "plugin-links-remote",
          PASEO_NODE_ENV: "development",
        },
      },
      artifactDir,
    );
    children.push(remoteDaemon.child);
    await waitForPort(remotePort, "remote daemon", remoteDaemon);

    const desktopArgs = [
      process.execPath,
      devRunner,
      `--inspect=127.0.0.1:${inspectorPort}`,
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
    ];
    const desktopCommand = process.platform === "linux" ? "xvfb-run" : desktopArgs.shift();
    const desktopCommandArgs =
      process.platform === "linux"
        ? ["-a", "--server-args=-screen 0 1280x800x24", ...desktopArgs]
        : desktopArgs;
    const desktop = spawnLogged(
      "desktop",
      desktopCommand,
      desktopCommandArgs,
      {
        cwd: rootDir,
        env: {
          ...commonEnv,
          EXPO_PORT: String(expoPort),
          EXPO_DEV_URL: `http://localhost:${expoPort}`,
          PASEO_ELECTRON_REMOTE_DEBUGGING_PORT: String(cdpPort),
          PASEO_ELECTRON_USER_DATA_DIR: userData,
          PASEO_ELECTRON_FLAGS: `--remote-debugging-address=127.0.0.1 --remote-debugging-port=${cdpPort}`,
        },
      },
      artifactDir,
    );
    children.push(desktop.child);
    await waitForPort(cdpPort, "Electron CDP", desktop);

    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    const page = await waitForAppPage(browser, expoPort);
    const status = await waitForDesktopStatus(page);

    const checkPluginLinks = () =>
      runPluginLinksRegression({
        page,
        remotePort,
        workspaceId: workspaceIds[0],
        remoteWorkspaceId: workspaceIds[1],
        url: target.url,
        artifactDir,
        externalOpenLog: process.platform === "linux" ? externalOpenLog : null,
      });
    if (process.env.PASEO_DESKTOP_PLUGIN_LINKS_ONLY === "1") {
      const pluginLinks = await checkPluginLinks();
      writeJson(path.join(artifactDir, "result.json"), { pluginLinks });
      console.log("Plugin external links and workspace browser passed.");
      return;
    }
    const settingsMemory = await runSettingsMemoryRegression(page);
    if (process.env.PASEO_DESKTOP_SETTINGS_MEMORY_ONLY === "1") {
      writeJson(path.join(artifactDir, "result.json"), { settingsMemory });
      console.log(
        `Desktop Settings memory regression passed: ${settingsMemory.detachedAfterWarmRound} detached panes after warm and stress rotations.`,
      );
      return;
    }

    await runAppearanceFontSizeRegression(page);

    const callerAgentId = await createCallerAgent(daemonPort);
    const typingAgent = {
      workspaceId: workspaceIds.at(-1),
      agentId: await createCallerAgent(daemonPort, { workspaceId: workspaceIds.at(-1) }),
    };
    const transport = new StreamableHTTPClientTransport(
      new URL(
        `http://127.0.0.1:${daemonPort}/mcp/agents?callerAgentId=${encodeURIComponent(callerAgentId)}`,
      ),
    );
    client = await experimental_createMCPClient({ transport });
    const report = await runRegression({
      page,
      client,
      serverId: status.serverId,
      targetUrl: target.url,
      inspectorPort,
      callerAgentId,
      typingAgent,
      artifactDir,
    });
    const pluginLinks = await checkPluginLinks();
    writeJson(path.join(artifactDir, "result.json"), { ...report, settingsMemory, pluginLinks });
    console.log(
      `Browser desktop browser E2E passed: WebContents ${report.originalWebContentsId} remained ${report.finalWebContentsId}; viewport, inactive capture, focus continuity, list, snapshot, click, local-page selectors passed.`,
    );
  } catch (error) {
    console.error(`Browser desktop browser E2E failed. Artifacts: ${artifactDir}`);
    console.error(error);
    throw error;
  } finally {
    await client?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    for (const child of children.toReversed()) stopProcess(child);
    if (target) await closeServer(target.server);
    await delay(1_000);
    try {
      fs.rmSync(runtimeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (error) {
      console.warn(`Failed to remove isolated E2E state ${runtimeDir}`, error);
    }
  }
}

await main();
