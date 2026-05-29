// Disk schema for agents/<agentId>/usage.json.
// This is per-agent runtime accounting, not API presentation state.

import { join } from 'node:path';

import { z } from 'zod';

import { JsonStore } from '../json-store.js';
import { agentsDir } from './agent.store.js';

export const AgentUsage = z.object({
  totalTokens: z.number().optional(),
  updatedAt: z.string().optional(),
});

export type AgentUsage = z.infer<typeof AgentUsage>;

function getAgentUsageFileStore(agentId: string): JsonStore<AgentUsage> {
  return new JsonStore<AgentUsage>({
    empty: () => ({}),
    parse: AgentUsage.parse,
    path: () => join(agentsDir(), agentId, 'usage.json'),
  });
}

export class AgentUsageStore {
  private readonly file: JsonStore<AgentUsage>;

  constructor(agentId: string) {
    this.file = getAgentUsageFileStore(agentId);
  }

  async read(): Promise<AgentUsage> {
    return this.file.read();
  }

  async update(op: (current: AgentUsage) => AgentUsage | Promise<AgentUsage>): Promise<AgentUsage> {
    return this.file.update(op);
  }
}
