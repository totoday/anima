import { runtimeSessionServiceForAgent, tokenDeltaForActivities } from './runtime-session.service.js';

export { tokenDeltaForActivities };

export function readAgentLifetimeTokens(agentId: string): Promise<number | undefined> {
  return runtimeSessionServiceForAgent(agentId).readLifetimeTokens();
}

export function recordLifetimeTokenUsageForItem(agentId: string, itemId: string): Promise<number | undefined> {
  return runtimeSessionServiceForAgent(agentId).recordLifetimeTokenUsageForItem(itemId);
}
