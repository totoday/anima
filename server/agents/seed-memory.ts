import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AgentConfig } from '../../shared/agent-config.js';
import { readBundledTemplate } from '../bundled-templates.js';
import { isMissingFile } from '../storage/json-file.js';

// Template file: templates/agent-seed-memory.md
// Keep it generic — no team-specific content; operating mechanics live in the standing prompt.
const TEMPLATE_FILE = 'agent-seed-memory.md';

export async function writeSeedMemory(agent: AgentConfig): Promise<void> {
  if (!agent.homePath) throw new Error(`Agent ${agent.id}: homePath is required`);
  const memoryPath = join(agent.homePath, 'MEMORY.md');
  try {
    await readFile(memoryPath, 'utf8');
    return;
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  await writeFile(memoryPath, await renderSeedMemory(agent), 'utf8');
}

export async function renderSeedMemory(agent: Pick<AgentConfig, 'id' | 'profile'>): Promise<string> {
  const template = await readBundledTemplate(TEMPLATE_FILE);
  const displayName = agent.profile?.displayName?.trim() || agent.id;
  return template.replaceAll('{{displayName}}', displayName);
}
