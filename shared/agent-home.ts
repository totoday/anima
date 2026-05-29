export const DEFAULT_TEAM_KB_ROOT = '~/anima-team';
export const DEFAULT_AGENT_HOMES_ROOT = '~/anima-team/agents';

export function defaultAgentHomePath(agentId: string, agentsRoot = DEFAULT_AGENT_HOMES_ROOT): string {
  return `${agentsRoot.replace(/\/+$/, '')}/${agentId}`;
}
