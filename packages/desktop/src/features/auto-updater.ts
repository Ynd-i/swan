import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { UUID } from "builder-util-runtime";
import log from "electron-log/main";
import { autoUpdater } from "electron-updater";
import {
  createAppUpdateService,
  type AppUpdateCheckResult,
  type AppUpdateInstallRequest,
  type AppUpdateInstallResult,
  type AppUpdateRuntime,
  type AppUpdateRuntimeConfiguration,
  type RuntimeUpdateCheckResult,
  type RuntimeUpdateInfo,
} from "./app-update-service.js";
import {
  bucketFromStagingUserId,
  rolloutManifestSchema,
  shouldAdmitAppUpdate,
  type AppReleaseChannel,
  type AppUpdateCheckIntent,
} from "./app-update-rollout.js";

export {
  bucketFromStagingUserId,
  rolloutManifestSchema,
  shouldAdmitAppUpdate,
  type AppReleaseChannel,
  type AppUpdateCheckIntent,
  type AppUpdateCheckResult,
  type AppUpdateInstallResult,
};

let cachedStagingUserIdPromise: Promise<string> | null = null;

const UPDATE_CHANNEL_NOT_PUBLISHED_CODE = "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND";

let cachedCustomUpdateVersion: string | null | undefined;

/**
 * The update version CI stamps into a published Swan build as `paseoCustomUpdateVersion`
 * in the app's package.json. The app version stays upstream's so it keeps matching the bundled
 * daemon; the updater compares this one instead. Builds without it cannot update in place.
 */
function getCustomUpdateVersion(): string | null {
  if (cachedCustomUpdateVersion !== undefined) return cachedCustomUpdateVersion;
  cachedCustomUpdateVersion = null;
  if (!app.isPackaged) return null;
  try {
    const pkg = JSON.parse(readFileSync(path.join(app.getAppPath(), "package.json"), "utf8")) as {
      paseoCustomUpdateVersion?: unknown;
    };
    if (typeof pkg.paseoCustomUpdateVersion === "string") {
      cachedCustomUpdateVersion = pkg.paseoCustomUpdateVersion;
    }
  } catch {
    // Unreadable metadata keeps updates disabled.
  }
  return cachedCustomUpdateVersion;
}

const UPDATE_VERSION_PATTERN =
  /^(?<base>.+?)[.-]custom\.(?<release>\d+)\.(?:beta\.(?<beta>\d+)|stable)$/;

/** Reverses `updateVersion()` in scripts/custom-release.mjs: `0.11.0-custom.1.beta.2` → `v0.11.0-v1-beta2`. */
export function releaseTagOfUpdateVersion(updateVersion: string): string | null {
  const groups = UPDATE_VERSION_PATTERN.exec(updateVersion)?.groups;
  if (!groups) return null;
  return `v${groups.base}-v${groups.release}${groups.beta ? `-beta${groups.beta}` : ""}`;
}

/** The release tag of a published Swan build, shown as its version in Settings. */
export function getCustomReleaseTag(): string | null {
  const updateVersion = getCustomUpdateVersion();
  return updateVersion ? releaseTagOfUpdateVersion(updateVersion) : null;
}

function updateVersionOf(appVersion: string): string {
  return getCustomUpdateVersion() ?? appVersion;
}

interface AppUpdateLogSink {
  info(message: string, details: object): void;
}

interface AppUpdateCheckLogDetails {
  currentVersion: string;
  releaseChannel: AppReleaseChannel;
  intent: AppUpdateCheckIntent;
}

interface AppUpdateCheckCompletedLogDetails extends AppUpdateCheckLogDetails {
  targetVersion: string;
  hasUpdate: boolean;
  readyToInstall: boolean;
  errorMessage: string | null;
}

export function createAppUpdateLifecycleLogger(logger: AppUpdateLogSink) {
  return {
    checkStarted(details: AppUpdateCheckLogDetails): void {
      logger.info("[auto-updater] check started", details);
    },
    checkCompleted(details: AppUpdateCheckCompletedLogDetails): void {
      logger.info("[auto-updater] check completed", details);
    },
    updateAvailable(targetVersion: string): void {
      logger.info("[auto-updater] update available", { targetVersion });
    },
    updateDownloaded(targetVersion: string): void {
      logger.info("[auto-updater] update downloaded", { targetVersion });
    },
    downloadRequested(targetVersion: string): void {
      logger.info("[auto-updater] download requested", { targetVersion });
    },
    quitAndInstallRequested(details: AppUpdateInstallRequest): void {
      logger.info("[auto-updater] quitAndInstall requested", details);
    },
  };
}

const updateLifecycleLog = createAppUpdateLifecycleLogger(log);

function isUpdateChannelNotPublished(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === UPDATE_CHANNEL_NOT_PUBLISHED_CODE
  );
}

export function shouldAdmitToRollout(args: {
  channel: AppReleaseChannel;
  rolloutHours: number | undefined;
  releaseDate: string | undefined;
  now: number;
  bucket: number;
}): boolean {
  return shouldAdmitAppUpdate({ ...args, intent: "automatic" });
}

export async function resolveStagingUserId(filePath: string): Promise<string> {
  try {
    const id = (await readFile(filePath, "utf8")).trim();
    if (UUID.check(id)) {
      return id;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[auto-updater] Couldn't read staging user ID, creating a blank one: ${error}`);
    }
  }

  const id = UUID.v5(randomBytes(4096), UUID.OID);

  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, id);
  } catch (error) {
    console.warn(`[auto-updater] Couldn't write out staging user ID: ${error}`);
  }

  return id;
}

export function getStagingUserId(): Promise<string> {
  if (cachedStagingUserIdPromise == null) {
    cachedStagingUserIdPromise = resolveStagingUserId(
      path.join(app.getPath("userData"), ".updaterId"),
    );
  }
  return cachedStagingUserIdPromise;
}

export function shouldInstallAppUpdateOnQuit(input: {
  platform: NodeJS.Platform;
  isAppImage: boolean;
}): boolean {
  // AppImage's no-relaunch install path blocks while launching the replacement
  // binary, which can hang after the running file has already been replaced.
  return !(input.platform === "linux" && input.isAppImage);
}

class ElectronAppUpdateRuntime implements AppUpdateRuntime {
  private configured = false;
  // On macOS every check re-runs the cached download, and each download restarts the local
  // proxy server Squirrel.Mac installs from. Once an install is requested, checks reuse the
  // last result so the server Squirrel is fetching from stays up.
  private installRequested = false;
  private lastCheck: RuntimeUpdateCheckResult | null = null;

  configure(input: AppUpdateRuntimeConfiguration): void {
    autoUpdater.autoDownload = true;
    autoUpdater.autoRunAppAfterInstall = true;
    // Paseo revalidates the current manifest before explicitly installing on quit.
    // Electron's built-in handler would install an older download without checking
    // whether a newer release has superseded it.
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = input.releaseChannel === "beta";
    autoUpdater.channel = input.releaseChannel === "beta" ? "beta" : "latest";
    autoUpdater.allowDowngrade = false;
    autoUpdater.isUserWithinRollout = async (info) => {
      try {
        return await input.shouldAdmitUpdate(info as RuntimeUpdateInfo);
      } catch {
        return true;
      }
    };

    if (this.configured) return;
    this.configured = true;

    const customUpdateVersion = getCustomUpdateVersion();
    if (customUpdateVersion) {
      // Reuse electron-updater's own SemVer class so comparisons follow its semantics exactly.
      const SemVer = autoUpdater.currentVersion.constructor as new (
        version: string,
      ) => typeof autoUpdater.currentVersion;
      Object.assign(autoUpdater, { currentVersion: new SemVer(customUpdateVersion) });
    }

    // electron-updater logs every emitted error before consumers can classify it.
    // Paseo reports genuine check, runtime, and install failures through the
    // callbacks below, so leave internal error logging disabled to avoid both
    // duplicate logs and expected missing-channel noise.
    const updaterLogger = autoUpdater.logger;
    autoUpdater.logger = {
      debug: updaterLogger?.debug ? (message) => updaterLogger.debug?.(message) : undefined,
      error: () => undefined,
      info: (message) => updaterLogger?.info(message),
      warn: (message) => updaterLogger?.warn(message),
    };

    autoUpdater.on("update-available", (info) => {
      const updateInfo = info as RuntimeUpdateInfo;
      updateLifecycleLog.updateAvailable(updateInfo.version);
      input.onUpdateAvailable(updateInfo);
    });
    autoUpdater.on("update-downloaded", (info) => {
      const updateInfo = info as RuntimeUpdateInfo;
      updateLifecycleLog.updateDownloaded(updateInfo.version);
      input.onUpdateDownloaded(updateInfo);
    });
    autoUpdater.on("error", (error) => {
      // A failed install (Squirrel.Mac reports through here) lets the user check and retry.
      this.installRequested = false;
      if (isUpdateChannelNotPublished(error)) return;
      input.onError(error);
    });
  }

  async checkForUpdates(): Promise<RuntimeUpdateCheckResult | null> {
    if (this.installRequested) return this.lastCheck;
    try {
      const result = await autoUpdater.checkForUpdates();
      this.lastCheck = result
        ? {
            isUpdateAvailable: result.isUpdateAvailable,
            updateInfo: result.updateInfo as RuntimeUpdateInfo,
          }
        : null;
      return this.lastCheck;
    } catch (error) {
      if (isUpdateChannelNotPublished(error)) return null;
      throw error;
    }
  }

  downloadUpdate(targetVersion: string): Promise<unknown> {
    updateLifecycleLog.downloadRequested(targetVersion);
    return autoUpdater.downloadUpdate();
  }

  quitAndInstall({ targetVersion, isSilent, isForceRunAfter }: AppUpdateInstallRequest): void {
    this.installRequested = true;
    autoUpdater.autoRunAppAfterInstall = isForceRunAfter;
    updateLifecycleLog.quitAndInstallRequested({
      targetVersion,
      isSilent,
      isForceRunAfter,
    });
    // The check before every install restarts the proxy server while it re-serves the download.
    // downloadUpdate() joins that in-flight download, which resolves once Squirrel.Mac points at
    // the new server; installing before that sends Squirrel to the closed one, and nothing happens.
    autoUpdater.downloadUpdate().then(
      () => autoUpdater.quitAndInstall(isSilent, isForceRunAfter),
      () => {
        // The updater's error event already reported the failure.
        this.installRequested = false;
      },
    );
  }
}

const appUpdateService = createAppUpdateService({
  runtime: new ElectronAppUpdateRuntime(),
  isPackaged: () => app.isPackaged,
  // Only the upstream application may consume its release feed. A published Swan
  // build carries its own feed and update version; other renamed builds stay manual.
  unavailableReason: () =>
    app.getName() === "Paseo" || getCustomUpdateVersion()
      ? null
      : "Automatic updates are disabled for custom builds. Install a new custom build manually.",
  now: () => Date.now(),
  bucket: async () => bucketFromStagingUserId(await getStagingUserId()),
  reportCheckError: (error) => {
    console.error("[auto-updater] Failed to check for updates:", error);
  },
  reportRuntimeError: (error) => {
    console.error("[auto-updater] Updater event failed:", error);
  },
  reportInstallError: (message) => {
    console.error("[auto-updater] Failed to download/install update:", message);
  },
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function checkForAppUpdate({
  currentVersion,
  releaseChannel,
  intent,
}: {
  currentVersion: string;
  releaseChannel: AppReleaseChannel;
  intent: AppUpdateCheckIntent;
}): Promise<AppUpdateCheckResult> {
  const version = updateVersionOf(currentVersion);
  updateLifecycleLog.checkStarted({ currentVersion: version, releaseChannel, intent });
  const result = await appUpdateService.checkForAppUpdate({
    currentVersion: version,
    releaseChannel,
    intent,
  });
  updateLifecycleLog.checkCompleted({
    currentVersion: version,
    targetVersion: result.latestVersion,
    releaseChannel,
    intent,
    hasUpdate: result.hasUpdate,
    readyToInstall: result.readyToInstall,
    errorMessage: result.errorMessage,
  });
  return result;
}

export async function downloadAndInstallUpdate(
  {
    currentVersion,
    releaseChannel,
  }: {
    currentVersion: string;
    releaseChannel: AppReleaseChannel;
  },
  onBeforeQuit?: () => Promise<void>,
): Promise<AppUpdateInstallResult> {
  return appUpdateService.downloadAndInstallUpdate(
    { currentVersion: updateVersionOf(currentVersion), releaseChannel },
    onBeforeQuit,
  );
}

export async function installAppUpdateOnQuit({
  currentVersion,
  releaseChannel,
  signal,
}: {
  currentVersion: string;
  releaseChannel: AppReleaseChannel;
  signal: AbortSignal;
}): Promise<boolean> {
  if (
    !shouldInstallAppUpdateOnQuit({
      platform: process.platform,
      isAppImage: Boolean(process.env.APPIMAGE),
    })
  ) {
    return false;
  }

  return appUpdateService.installUpdateOnQuit({
    currentVersion: updateVersionOf(currentVersion),
    releaseChannel,
    signal,
  });
}
