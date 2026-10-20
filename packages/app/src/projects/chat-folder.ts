// Like Codex, a chat without a project gets its own folder: ~/Documents/Paseo/<YYYY-MM-DD>/<name>.
// The daemon registers every folder as a project, so the project UI hides these by path.
const CHAT_FOLDER_PATTERN = /[\\/]Documents[\\/]Paseo[\\/]\d{4}-\d{2}-\d{2}[\\/][^\\/]+[\\/]?$/;

/** The parent for today's chat folders, in local time; the daemon expands the tilde. */
export function chatFolderParentPath(now: Date): string {
  const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
  return `~/Documents/Paseo/${day}`;
}

export function isChatFolderPath(path: string): boolean {
  return CHAT_FOLDER_PATTERN.test(path);
}
