import type { AgentConfig } from '../../shared/agent-config.js';
import { readBundledTemplate } from '../bundled-templates.js';

export async function slackAppManifestYaml(agent: AgentConfig): Promise<string> {
  const displayName = agent.profile?.displayName?.trim() || agent.id;
  const name = yamlScalar(displayName);
  const description = yamlScalar(agent.profile?.role?.trim() || `Anima agent ${displayName}.`);
  return (await readBundledTemplate('slack-app-manifest.yaml'))
    .replaceAll('${NAME}', name)
    .replaceAll('${DESCRIPTION}', description)
    .replaceAll('${DISPLAY_NAME}', name);
}

export function slackAppInstallUrl(appId: string): string {
  return `https://api.slack.com/apps/${encodeURIComponent(appId)}/install-on-team`;
}

export function slackAppManifestUrl(appId: string, teamId?: string): string {
  if (teamId?.trim()) {
    return `https://app.slack.com/app-settings/${encodeURIComponent(teamId)}/${encodeURIComponent(appId)}/app-manifest`;
  }
  return `https://api.slack.com/apps/${encodeURIComponent(appId)}/general`;
}

function yamlScalar(value: string): string {
  if (/^[A-Za-z0-9][A-Za-z0-9 _./()'-]*$/.test(value)) return value;
  return JSON.stringify(value);
}
