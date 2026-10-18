import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { McpServerConfig } from "../agent-sdk-types.js";
import { parseHooksJson } from "./hooks-json.js";
import {
  AGENTS_DIR,
  TRUSTED_ROOTS_CONFIG_KEY,
  inspectWorkspaceContract,
  isDirectory,
} from "./inspect-workspace-contract.js";
import { parseMcpJson } from "./mcp-json.js";
import type {
  WorkspaceContract,
  WorkspaceContractLayer,
  WorkspaceContractLayerHooks,
} from "./types.js";

const RESERVED_MCP_SERVER_NAME = "paseo";

/**
 * Reads the `.agents` contract that applies to `cwd`: the user layer under `home`,
 * then every `.agents` directory from the git repo root down to `cwd`. Project layers
 * apply only when the repo root is at or below one of `trustedRoots`, because they
 * launch repo-defined commands. Unreadable or malformed files are reported through
 * `onWarning` and skipped.
 */
export async function loadWorkspaceContract(params: {
  home: string;
  cwd: string;
  /** Absolute or `~`-prefixed directories, as written in the daemon config. */
  trustedRoots: readonly string[];
  onWarning: (message: string) => void;
}): Promise<WorkspaceContract> {
  const { onWarning } = params;
  const home = resolve(params.home);
  const layers = await resolveLayers(home, resolve(params.cwd), params.trustedRoots, onWarning);

  const entries: Array<[string, McpServerConfig]> = [];
  const hooks: WorkspaceContractLayerHooks[] = [];
  for (const layer of layers) {
    const servers = await parseOptionalFile(join(layer.dir, ".mcp.json"), parseMcpJson, onWarning);
    entries.push(...Object.entries(servers ?? {}));
    const layerHooks = await parseOptionalFile(
      join(layer.dir, "hooks", "hooks.json"),
      parseHooksJson,
      onWarning,
    );
    if (layerHooks && Object.keys(layerHooks).length > 0) {
      hooks.push({ ...layer, hooks: layerHooks });
    }
  }
  // Later entries win, so a nearer layer overrides a farther one.
  const mcpServers = Object.fromEntries(entries);
  if (mcpServers[RESERVED_MCP_SERVER_NAME]) {
    onWarning(`MCP server name '${RESERVED_MCP_SERVER_NAME}' is reserved for Paseo; entry ignored`);
    delete mcpServers[RESERVED_MCP_SERVER_NAME];
  }

  const instructionsPath = join(home, AGENTS_DIR, "AGENTS.md");
  const instructionsText = await readOptionalFile(instructionsPath, onWarning);
  const instructions = instructionsText?.trim()
    ? { path: instructionsPath, text: instructionsText }
    : null;

  return { layers, mcpServers, instructions, hooks };
}

async function resolveLayers(
  home: string,
  cwd: string,
  trustedRoots: readonly string[],
  onWarning: (message: string) => void,
): Promise<WorkspaceContractLayer[]> {
  const userDir = join(home, AGENTS_DIR);
  const userLayers: WorkspaceContractLayer[] = (await isDirectory(userDir))
    ? [{ kind: "user", dir: userDir }]
    : [];
  const { repoRoot, trusted, projectLayers } = await inspectWorkspaceContract({
    home,
    cwd,
    trustedRoots,
  });
  if (projectLayers.length > 0 && !trusted) {
    onWarning(
      `Ignoring project .agents under untrusted repo root ${repoRoot}; add it to ${TRUSTED_ROOTS_CONFIG_KEY} to apply them`,
    );
    return userLayers;
  }
  return [...userLayers, ...projectLayers.map((dir) => ({ kind: "project" as const, dir }))];
}

async function parseOptionalFile<T>(
  path: string,
  parse: (text: string, options: { onWarning: (message: string) => void }) => T,
  onWarning: (message: string) => void,
): Promise<T | null> {
  const text = await readOptionalFile(path, onWarning);
  return text === null
    ? null
    : parse(text, { onWarning: (message) => onWarning(`${path}: ${message}`) });
}

async function readOptionalFile(
  path: string,
  onWarning: (message: string) => void,
): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      onWarning(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  }
}
