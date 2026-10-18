import { mkdir, readdir, readlink, rm, stat, symlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { Logger } from "pino";

/**
 * Claude Code only discovers personal skills in `~/.claude/skills`, so each skill in
 * `~/.agents/skills` gets a symlink there. Real directories are never replaced:
 * Paseo's bundled skill sync and the user own those.
 *
 * @returns the number of links created or removed.
 */
export async function mirrorAgentsSkillsIntoClaude(params: {
  home: string;
  logger: Logger;
}): Promise<number> {
  const agentsSkills = join(params.home, ".agents", "skills");
  const claudeSkills = join(params.home, ".claude", "skills");
  try {
    const skills = await listMirrorableSkills(agentsSkills);
    if (skills === null) return 0;
    const entries = await readdir(claudeSkills, { withFileTypes: true }).catch(ifMissing([]));

    let changes = 0;
    const occupied = new Set<string>();
    for (const entry of entries) {
      const linkPath = join(claudeSkills, entry.name);
      const target = entry.isSymbolicLink()
        ? resolve(claudeSkills, await readlink(linkPath))
        : null;
      const ownedLink = target !== null && target.startsWith(agentsSkills + sep);
      const wanted = skills.get(entry.name);
      if (!ownedLink) {
        occupied.add(entry.name);
        if (wanted) params.logger.debug({ path: linkPath }, "Claude skill exists; not mirrored");
        continue;
      }
      if (target === wanted || (wanted === undefined && (await exists(target)))) {
        occupied.add(entry.name);
        continue;
      }
      await rm(linkPath);
      changes++;
    }

    for (const [name, target] of skills) {
      if (occupied.has(name)) continue;
      await mkdir(claudeSkills, { recursive: true });
      const created = await symlink(target, join(claudeSkills, name), "dir").then(
        () => true,
        ifExists(false),
      );
      if (created) changes++;
    }
    return changes;
  } catch (error) {
    params.logger.warn({ err: error }, "Failed to mirror ~/.agents/skills into ~/.claude/skills");
    return 0;
  }
}

/** Skill name to absolute directory, or null when `~/.agents/skills` does not exist. */
async function listMirrorableSkills(agentsSkills: string): Promise<Map<string, string> | null> {
  const names = await readdir(agentsSkills).catch(ifMissing(null));
  if (names === null) return null;
  const skills = new Map<string, string>();
  for (const name of names.filter(isMirrorableName)) {
    const dir = join(agentsSkills, name);
    if ((await stat(join(dir, "SKILL.md")).catch(() => null))?.isFile()) skills.set(name, dir);
  }
  return skills;
}

function isMirrorableName(name: string): boolean {
  return !name.startsWith(".") && name !== "synced" && !name.startsWith("anthropic-skills");
}

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null)) !== null;
}

function ifMissing<T>(fallback: T): (error: NodeJS.ErrnoException) => T {
  return (error) => {
    if (error.code === "ENOENT") return fallback;
    throw error;
  };
}

function ifExists<T>(fallback: T): (error: NodeJS.ErrnoException) => T {
  return (error) => {
    if (error.code === "EEXIST") return fallback;
    throw error;
  };
}
