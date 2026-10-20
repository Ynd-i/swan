import path from "node:path";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { app, BrowserWindow, Notification, ipcMain, nativeImage } from "electron";
import log from "electron-log/main";
import { getDesktopSettingsStore } from "../settings/desktop-settings-electron.js";

interface NotificationInput {
  title?: unknown;
  body?: unknown;
  data?: unknown;
}

interface NotificationClickPayload {
  data?: Record<string, unknown>;
}

const activeNotifications = new Set<Notification>();
// Each window receives the same agent attention event; show it once.
const recentNotificationKeys = new Set<string>();

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getNotificationIcon(): Electron.NativeImage | null {
  const candidates = [
    path.resolve(__dirname, "../assets/icon.png"),
    path.resolve(__dirname, "../assets/64x64.png"),
    path.resolve(__dirname, "../assets/128x128.png"),
  ];

  for (const iconPath of candidates) {
    if (!existsSync(iconPath)) {
      continue;
    }
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      return icon;
    }
  }

  return null;
}

function focusSenderWindow(sender: Electron.WebContents): BrowserWindow | null {
  const win = BrowserWindow.fromWebContents(sender) ?? BrowserWindow.getAllWindows()[0] ?? null;
  if (!win || win.isDestroyed()) {
    return null;
  }
  win.show();
  if (win.isMinimized()) {
    win.restore();
  }
  win.focus();
  return win;
}

/**
 * macOS requires a notification to have been shown at least once before
 * the app appears in System Preferences > Notifications. We fire a
 * silent no-op notification during startup to ensure registration.
 */
export function ensureNotificationCenterRegistration(): void {
  if (process.platform !== "darwin" || !Notification.isSupported()) {
    return;
  }

  const probe = new Notification({ title: app.name, silent: true });
  probe.on("show", () => probe.close());
  probe.on("failed", (_event, error) =>
    log.warn("[notifications] registration probe failed", error),
  );
  setTimeout(() => probe.close(), 2_000);
  probe.show();
}

export function registerNotificationHandlers(): void {
  ipcMain.handle("paseo:notification:isSupported", () => {
    return Notification.isSupported();
  });

  ipcMain.handle("paseo:notification:send", async (event, rawInput?: NotificationInput) => {
    if (!Notification.isSupported()) {
      return false;
    }

    const title = toTrimmedString(rawInput?.title);
    if (!title) {
      return false;
    }

    const body = toTrimmedString(rawInput?.body) ?? undefined;
    const data = toRecord(rawInput?.data);
    if (data) {
      const key = JSON.stringify([title, body, data]);
      if (recentNotificationKeys.has(key)) {
        return true;
      }
      recentNotificationKeys.add(key);
      setTimeout(() => recentNotificationKeys.delete(key), 5_000);
    }
    const icon = getNotificationIcon();
    const settings = await getDesktopSettingsStore().get();
    const notification = new Notification({
      title,
      ...(body ? { body } : {}),
      ...(icon ? { icon } : {}),
      silent: !settings.notifications.playSound,
    });

    activeNotifications.add(notification);

    notification.on("click", () => {
      const win = focusSenderWindow(event.sender);
      if (win && data && Object.keys(data).length > 0) {
        const payload: NotificationClickPayload = { data };
        win.webContents.send("paseo:event:notification-click", payload);
      }
      activeNotifications.delete(notification);
    });

    notification.on("close", () => {
      activeNotifications.delete(notification);
    });

    // macOS reports a refused notification (for example when the app is not allowed to
    // notify) through "failed"; wait for it so the renderer does not report false success.
    const delivered = Promise.race([
      once(notification, "show").then(() => true),
      once(notification, "failed").then(([, error]) => {
        activeNotifications.delete(notification);
        log.warn("[notifications] show failed", error);
        return false;
      }),
      // ponytail: some platforms never emit "show"; assume delivered after 2s
      new Promise<boolean>((resolve) => setTimeout(resolve, 2_000, true)),
    ]);
    notification.show();
    return await delivered;
  });
}
