import type { FastifyInstance } from 'fastify';

import { redactAgentConfig } from '../agents/agent-config-ops.js';
import { agentSlackServiceForAgent } from '../agents/agent-slack.service.js';
import {
  AgentConnectSlackRequest,
  AgentSetOwnerRequest,
  AgentSlackValidateRequest,
} from '../../shared/agent-config.js';
import { AgentSlackManifestUpgradeRequest } from '../../shared/slack-manifest.js';

export function registerAgentSlackRoutes(fastify: FastifyInstance): void {
  fastify.post<{ Params: { agentId: string } }>(
    '/api/agents/:agentId/slack/tokens/validate',
    async (request) =>
      agentSlackServiceForAgent(request.params.agentId).validateTokens(AgentSlackValidateRequest.parse(request.body)),
  );
  fastify.post<{ Params: { agentId: string } }>(
    '/api/agents/:agentId/slack/connect',
    async (request) =>
      redactAgentConfig(
        await agentSlackServiceForAgent(request.params.agentId).connect(AgentConnectSlackRequest.parse(request.body)),
      ),
  );
  fastify.get<{ Params: { agentId: string } }>(
    '/api/agents/:agentId/slack/manifest-update',
    async (request) => agentSlackServiceForAgent(request.params.agentId).getManifestUpdateInfo(),
  );
  fastify.post<{ Params: { agentId: string } }>(
    '/api/agents/:agentId/slack/manifest-upgrade',
    async (request) =>
      redactAgentConfig(
        await agentSlackServiceForAgent(request.params.agentId).upgradeManifestVersion(
          AgentSlackManifestUpgradeRequest.parse(request.body),
        ),
      ),
  );
  fastify.get<{ Params: { agentId: string } }>(
    '/api/agents/:agentId/slack/users',
    async (request) => ({ users: await agentSlackServiceForAgent(request.params.agentId).listUsers() }),
  );
  fastify.post<{ Params: { agentId: string } }>(
    '/api/agents/:agentId/slack/owner',
    async (request) =>
      redactAgentConfig(
        await agentSlackServiceForAgent(request.params.agentId).setOwner(AgentSetOwnerRequest.parse(request.body)),
      ),
  );
  fastify.post<{ Params: { agentId: string } }>(
    '/api/agents/:agentId/slack/sync-avatar',
    async (request) =>
      redactAgentConfig(await agentSlackServiceForAgent(request.params.agentId).syncDisplayInfo()),
  );
  fastify.get<{ Params: { agentId: string } }>(
    '/api/agents/:agentId/slack/install',
    async (request, reply) => {
      const url = await agentSlackServiceForAgent(request.params.agentId).getInstallUrl();
      return reply.status(302).header('cache-control', 'no-store').header('location', url).send();
    },
  );
}
