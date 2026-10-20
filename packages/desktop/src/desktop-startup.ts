import path from "node:path";

export interface DesktopStartupDependencies {
  hasPendingGuiLaunchRequest: boolean;
  runCliPassthroughIfRequested: () => Promise<boolean>;
  inheritLoginShellEnv: () => void;
  bootstrapGui: () => Promise<void>;
}

export async function runDesktopStartup(deps: DesktopStartupDependencies): Promise<void> {
  if (!deps.hasPendingGuiLaunchRequest && (await deps.runCliPassthroughIfRequested())) {
    return;
  }

  deps.inheritLoginShellEnv();
  await deps.bootstrapGui();
}

/** Swan was published as Paseo Custom, whose data folder holds its daemon home and settings. */
export function resolveCustomUserDataPath({
  isPackaged,
  appName,
  appDataPath,
}: {
  isPackaged: boolean;
  appName: string;
  appDataPath: string;
}): string | null {
  if (!isPackaged || appName !== "Swan") return null;
  return path.join(appDataPath, "Paseo Custom");
}

export function configureDesktopDaemonEnvironment({
  isPackaged,
  appName,
  userDataPath,
  env,
}: {
  isPackaged: boolean;
  appName: string;
  userDataPath: string;
  env: NodeJS.ProcessEnv;
}): void {
  if (!isPackaged || appName === "Paseo") return;
  env.PASEO_HOME ||= path.join(userDataPath, "daemon");
  env.PASEO_LISTEN ||= "127.0.0.1:0";
}
