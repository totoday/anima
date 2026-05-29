import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { AgentConfig } from '../../shared/agent-config.js';
import type { AgentSkills, SkillSummary } from '../../shared/skills.js';
import { resolveAgentHomePath } from './agent-config-ops.js';

const GLOBAL_AGENTS_SKILLS = join(homedir(), '.agents', 'skills');
const GLOBAL_CODEX_SKILLS = join(homedir(), '.codex', 'skills');

export async function scanAgentSkills(agent: AgentConfig): Promise<AgentSkills> {
  const isCodex = agent.provider.kind === 'codex-cli';
  const globalPath = isCodex ? GLOBAL_CODEX_SKILLS : GLOBAL_AGENTS_SKILLS;
  const localPath = join(resolveAgentHomePath(agent), '.claude', 'skills');
  const [global, local] = await Promise.all([
    scanSkillDir(globalPath, isCodex),
    scanSkillDir(localPath, false),
  ]);
  return { global, globalPath, local, localPath };
}

async function scanSkillDir(dir: string, excludeSystem: boolean): Promise<SkillSummary[]> {
  let dirNames: string[];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    dirNames = entries
      .filter((entry) => {
        if (!entry.isDirectory()) return false;
        if (excludeSystem && entry.name === '.system') return false;
        if (entry.name.startsWith('.')) return false;
        return true;
      })
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }

  const results = await Promise.all(dirNames.map((dirName) => readSkill(dir, dirName)));
  return results.filter((skill): skill is SkillSummary => skill !== null);
}

async function readSkill(base: string, dirName: string): Promise<SkillSummary | null> {
  try {
    const content = await readFile(join(base, dirName, 'SKILL.md'), 'utf8');
    const frontmatter = parseSkillFrontmatter(content);
    return {
      dirName,
      name: frontmatter.name ?? dirName,
      ...(frontmatter.description ? { description: frontmatter.description } : {}),
    };
  } catch {
    return null;
  }
}

interface SkillFrontmatter {
  description?: string;
  name?: string;
}

function parseSkillFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result: SkillFrontmatter = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const keyValue = line.match(/^(\w+)\s*:\s*(.*)/);
    if (!keyValue) continue;
    const key = keyValue[1]!;
    const value = keyValue[2]!.trim();
    if (key === 'description' && value) result.description = value;
    if (key === 'name' && value) result.name = value;
  }
  return result;
}
