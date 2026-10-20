import type { ExplorerDirectory } from "@/stores/session-store";
import { parentExplorerPath } from "@/utils/explorer-paths";

/** Load real entries for each match and its ancestors without expanding the saved tree. */
export async function loadExplorerSearchTree(
  paths: readonly string[],
  listDirectory: (path: string) => Promise<ExplorerDirectory>,
): Promise<Map<string, ExplorerDirectory>> {
  const visiblePaths = new Set(paths);
  const parentPaths = new Set<string>();
  for (const path of paths) {
    let parent = parentExplorerPath(path);
    while (!parentPaths.has(parent)) {
      parentPaths.add(parent);
      if (parent === ".") break;
      visiblePaths.add(parent);
      parent = parentExplorerPath(parent);
    }
  }
  const directories = new Map<string, ExplorerDirectory>();
  // Keep directory reads sequential: a remote host should not receive one burst per match.
  for (const path of parentPaths) {
    const directory = await listDirectory(path);
    directories.set(path, {
      ...directory,
      entries: directory.entries.filter((entry) => visiblePaths.has(entry.path)),
    });
  }
  return directories;
}
