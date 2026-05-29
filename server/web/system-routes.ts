import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { mkdir, open, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { FastifyInstance } from 'fastify';

import { resolveAnimaHome } from '../anima-home.js';
import { defaultServerSettingsService } from '../settings/settings.service.js';
import { cleanServiceEnv } from '../services/env.js';
import { defaultProviderUsageService } from '../provider-usage/provider-usage.service.js';
import { SidebarOrder } from '../../shared/server-settings.js';
import { type ServerInfo, type ServicesRestartResponse } from '../../shared/server-info.js';
import { PROVIDER_CATALOG, type ProviderAvailability } from '../../shared/provider-catalog.js';
import { HttpError } from './http.js';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ANIMACTL_SCRIPT = join(PROJECT_ROOT, 'dist/server/cli/animactl.js');
const API_SERVER_STARTED_AT = new Date().toISOString();
const API_SERVER_COMMIT = gitShortCommit();
const RESTART_AFTER_RESPONSE_DELAY_MS = 250;

export function registerSystemRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/health', async () => ({ ok: true }));
  fastify.get('/api/provider-availability', async () => detectProviderAvailability());
  fastify.get('/api/provider-usage', async () => defaultProviderUsageService.list());
  fastify.get('/api/server-info', async () => serverInfoForUi());
  fastify.post('/api/services/restart', async (_request, reply) => {
    const queued = queueServicesRestart(reply.raw);
    return reply.status(202).send(queued);
  });

  // Sidebar order — global, persisted in ANIMA_HOME/config.json.
  fastify.get('/api/sidebar-order', async () => {
    return { sidebarOrder: await defaultServerSettingsService.getSidebarOrder() };
  });

  fastify.put('/api/sidebar-order', async (request, reply) => {
    const parsed = SidebarOrder.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid sidebar order payload' });
    }
    return { sidebarOrder: await defaultServerSettingsService.setSidebarOrder(parsed.data) };
  });
}

function queueServicesRestart(response: ServerResponse): ServicesRestartResponse {
  if (!existsSync(ANIMACTL_SCRIPT)) {
    throw new HttpError(500, `animactl not found: ${ANIMACTL_SCRIPT}`);
  }
  const animaHome = resolveAnimaHome();
  const logPath = join(animaHome, 'logs', 'services-restart.log');
  response.once('finish', () => {
    const timer = setTimeout(() => {
      void restartServicesDetached(animaHome, logPath).catch((error) => {
        console.error(`Failed to queue services restart: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, RESTART_AFTER_RESPONSE_DELAY_MS);
    timer.unref();
  });
  return {
    ok: true,
    animaHome,
    delayMs: RESTART_AFTER_RESPONSE_DELAY_MS,
    logPath,
    scheduled: true,
  };
}

async function restartServicesDetached(animaHome: string, logPath: string): Promise<void> {
  let log: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await mkdir(dirname(logPath), { recursive: true });
    log = await open(logPath, 'a');
    await log.write(`\n[${new Date().toISOString()}] web app requested services restart\n`);
  } catch (error) {
    console.error(`Failed to open restart log ${logPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const child = spawn(process.execPath, [ANIMACTL_SCRIPT, 'services', 'restart'], {
    cwd: PROJECT_ROOT,
    detached: true,
    env: { ...cleanServiceEnv(), ANIMA_HOME: animaHome },
    stdio: log ? ['ignore', log.fd, log.fd] : 'ignore',
  });
  child.on('error', (error) => {
    console.error(`Failed to start services restart: ${error.message}`);
  });
  child.unref();
  await log?.close();
}

async function serverInfoForUi(): Promise<ServerInfo> {
  const [config, version, commit] = await Promise.all([
    defaultServerSettingsService.readConfig(),
    packageVersion(),
    API_SERVER_COMMIT,
  ]);
  const animaHome = resolveAnimaHome();
  return {
    animaHome,
    ...(commit ? { commit } : {}),
    dashboardPort: config.dashboardPort ?? 4174,
    env: environmentName(animaHome),
    ok: true as const,
    startedAt: API_SERVER_STARTED_AT,
    uptimeSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(API_SERVER_STARTED_AT)) / 1000)),
    version,
  };
}

async function packageVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(join(PROJECT_ROOT, 'package.json'), 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' && pkg.version ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

async function gitShortCommit(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd: PROJECT_ROOT });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

function environmentName(animaHome: string): 'dev' | 'prod' | 'custom' {
  if (resolve(animaHome) === resolve(PROJECT_ROOT, '.anima')) return 'dev';
  if (resolve(animaHome) === resolve(homedir(), '.anima')) return 'prod';
  return 'custom';
}

async function detectProviderAvailability(): Promise<{ providers: ProviderAvailability[] }> {
  return {
    providers: await Promise.all(PROVIDER_CATALOG.map(async (entry) => ({
      kind: entry.kind,
      present: await commandPresent(entry.command),
    }))),
  };
}

function commandPresent(command: string): Promise<boolean> {
  return new Promise((resolvePresent) => {
    const child = execFile(command, ['--version'], { encoding: 'utf8', timeout: 2_000 }, (error) => {
      resolvePresent(!error);
    });
    child.stdin?.end();
  });
}
