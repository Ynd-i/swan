import type { McpServerConfig } from "../agent-sdk-types.js";
import type { HooksByEvent } from "./hooks-json.js";

/** An existing `.agents` directory. Layers are ordered from lowest to highest precedence. */
export interface WorkspaceContractLayer {
  kind: "user" | "project";
  dir: string;
}

/** The hooks that a layer's `hooks/hooks.json` declares. */
export interface WorkspaceContractLayerHooks extends WorkspaceContractLayer {
  hooks: HooksByEvent;
}

export interface WorkspaceContract {
  layers: readonly WorkspaceContractLayer[];
  mcpServers: Record<string, McpServerConfig>;
  instructions: { path: string; text: string } | null;
  /** Layers that declare at least one hook, in layer order. */
  hooks: WorkspaceContractLayerHooks[];
}

/**
 * The contract parts that each provider maps itself. The daemon computes them at every launch,
 * and they never reach the stored agent record.
 */
export interface LaunchWorkspaceContract {
  /** Trusted project `.agents` directories, repo root first. */
  projectLayers: string[];
  hooks: WorkspaceContractLayerHooks[];
}

export interface WorkspaceContractInspection {
  /** The directory holding `.git`, or the cwd itself outside a repo. */
  repoRoot: string;
  trusted: boolean;
  /** Existing project `.agents` directories, repo root first. */
  projectLayers: string[];
}
