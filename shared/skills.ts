export interface SkillSummary {
  /** Directory name — stable identifier. */
  dirName: string;
  /** Human-readable name from SKILL.md frontmatter, falls back to dirName. */
  name: string;
  /** Trigger description from SKILL.md frontmatter, if present. */
  description?: string;
}

export interface AgentSkills {
  /** Skills from the global skills directory (provider-dependent path). */
  global: SkillSummary[];
  /** Skills local to this agent's home directory. */
  local: SkillSummary[];
  /** Absolute path that was scanned for global skills. */
  globalPath: string;
  /** Absolute path that was scanned for local skills. */
  localPath: string;
}
