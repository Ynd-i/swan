import type { McpServerConfig } from "../agent-sdk-types.js";

/** An existing `.agents` directory. Layers are ordered from lowest to highest precedence. */
export interface WorkspaceContractLayer {
  kind: "user" | "project";
  dir: string;
}

export interface WorkspaceContract {
  layers: readonly WorkspaceContractLayer[];
  mcpServers: Record<string, McpServerConfig>;
  instructions: { path: string; text: string } | null;
}

export interface WorkspaceContractInspection {
  /** The directory holding `.git`, or the cwd itself outside a repo. */
  repoRoot: string;
  trusted: boolean;
  /** Existing project `.agents` directories, repo root first. */
  projectLayers: string[];
}
