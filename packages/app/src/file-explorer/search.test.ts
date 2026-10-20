import { expect, it } from "vitest";
import { loadExplorerSearchTree } from "./search";
import { flattenExplorerTree } from "./tree";
import type { ExplorerDirectory, ExplorerEntry } from "@/stores/session-store";

it("loads unopened ancestors once, retains real metadata and omits unrelated siblings", async () => {
  const entry = (path: string, kind: "file" | "directory"): ExplorerEntry => ({
    path,
    name: path.split("/").at(-1)!,
    kind,
    size: 42,
    modifiedAt: "2026-10-01T00:00:00Z",
  });
  const needle = entry("src/deep/needle.ts", "file");
  const directories = new Map<string, ExplorerDirectory>([
    [".", { path: ".", entries: [entry("src", "directory"), entry("other.ts", "file")] }],
    ["src", { path: "src", entries: [entry("src/deep", "directory")] }],
    ["src/deep", { path: "src/deep", entries: [needle, entry("src/deep/other.ts", "file")] }],
  ]);
  const reads: string[] = [];
  const result = await loadExplorerSearchTree([needle.path, needle.path], async (path) => {
    reads.push(path);
    return directories.get(path)!;
  });
  expect(reads).toEqual(["src/deep", "src", "."]);
  expect(
    flattenExplorerTree({
      directories: result,
      expandedPaths: new Set(result.keys()),
      sortOption: "name",
      showHiddenFiles: false,
    }),
  ).toEqual([
    { entry: directories.get(".")!.entries[0], depth: 0 },
    { entry: directories.get("src")!.entries[0], depth: 1 },
    { entry: needle, depth: 2 },
  ]);
  expect(directories.get("src/deep")!.entries).toHaveLength(2);
});
