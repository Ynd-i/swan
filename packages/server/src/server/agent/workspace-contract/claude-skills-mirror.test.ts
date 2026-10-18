import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createTestLogger } from "../../../test-utils/test-logger.js";
import { mirrorAgentsSkillsIntoClaude } from "./claude-skills-mirror.js";

const logger = createTestLogger();

function createHome(): { home: string; agentsSkills: string; claudeSkills: string } {
  const home = mkdtempSync(join(tmpdir(), "claude-skills-mirror-"));
  return {
    home,
    agentsSkills: join(home, ".agents", "skills"),
    claudeSkills: join(home, ".claude", "skills"),
  };
}

function addSkill(agentsSkills: string, name: string): string {
  const dir = join(agentsSkills, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `# ${name}\n`);
  return dir;
}

describe("mirrorAgentsSkillsIntoClaude", () => {
  test("links every skill that has a SKILL.md", async () => {
    const { home, agentsSkills, claudeSkills } = createHome();
    const review = addSkill(agentsSkills, "review");
    mkdirSync(join(agentsSkills, "notes"), { recursive: true });

    const changes = await mirrorAgentsSkillsIntoClaude({ home, logger });

    expect(changes).toBe(1);
    expect(readdirSync(claudeSkills)).toEqual(["review"]);
    expect(readlinkSync(join(claudeSkills, "review"))).toBe(review);
  });

  test("a second run changes nothing", async () => {
    const { home, agentsSkills, claudeSkills } = createHome();
    addSkill(agentsSkills, "review");
    await mirrorAgentsSkillsIntoClaude({ home, logger });
    const before = lstatSync(join(claudeSkills, "review")).mtimeMs;

    const changes = await mirrorAgentsSkillsIntoClaude({ home, logger });

    expect(changes).toBe(0);
    expect(lstatSync(join(claudeSkills, "review")).mtimeMs).toBe(before);
  });

  test("leaves real directories and foreign links alone", async () => {
    const { home, agentsSkills, claudeSkills } = createHome();
    addSkill(agentsSkills, "paseo");
    addSkill(agentsSkills, "shared");
    mkdirSync(join(claudeSkills, "paseo"), { recursive: true });
    writeFileSync(join(claudeSkills, "paseo", "SKILL.md"), "# bundled\n");
    const foreign = mkdtempSync(join(tmpdir(), "claude-skills-foreign-"));
    symlinkSync(foreign, join(claudeSkills, "shared"));

    const changes = await mirrorAgentsSkillsIntoClaude({ home, logger });

    expect(changes).toBe(0);
    expect(lstatSync(join(claudeSkills, "paseo")).isDirectory()).toBe(true);
    expect(readlinkSync(join(claudeSkills, "shared"))).toBe(foreign);
  });

  test("removes links whose skill is gone and repoints links into the wrong skill", async () => {
    const { home, agentsSkills, claudeSkills } = createHome();
    const review = addSkill(agentsSkills, "review");
    mkdirSync(claudeSkills, { recursive: true });
    symlinkSync(join(agentsSkills, "deleted"), join(claudeSkills, "deleted"));
    symlinkSync(join(agentsSkills, "other"), join(claudeSkills, "review"));

    const changes = await mirrorAgentsSkillsIntoClaude({ home, logger });

    expect(changes).toBe(3);
    expect(readdirSync(claudeSkills)).toEqual(["review"]);
    expect(readlinkSync(join(claudeSkills, "review"))).toBe(review);
  });

  test("ignores dotfiles and reserved names", async () => {
    const { home, agentsSkills, claudeSkills } = createHome();
    for (const name of [".hidden", "synced", "anthropic-skills", "anthropic-skills-pdf", "kept"]) {
      addSkill(agentsSkills, name);
    }

    await mirrorAgentsSkillsIntoClaude({ home, logger });

    expect(readdirSync(claudeSkills)).toEqual(["kept"]);
  });

  test("writes nothing without ~/.agents/skills", async () => {
    const { home } = createHome();

    const changes = await mirrorAgentsSkillsIntoClaude({ home, logger });

    expect(changes).toBe(0);
    expect(existsSync(join(home, ".claude"))).toBe(false);
  });
});
