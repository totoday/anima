import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';

import type { Command } from 'commander';

import { defaultAgentRegistryService } from '../agents/agent.service.js';
import { WakeQueueService, type InboxItem } from '../inbox/wake-queue.service.js';
import { defaultServerSettingsService } from '../settings/settings.service.js';
import { resolveAnimaHome } from '../anima-home.js';
import {
  isServiceRunning,
  printStatus,
  startService,
  stopService,
  type ServiceSpec,
  type SupervisorOptions,
} from '../services/supervisor.js';
import type { GlobalCliOptions } from './shared.js';

const DEFAULT_DASHBOARD_PORT = 4174;
const DEFAULT_RESTART_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const RESTART_IDLE_POLL_MS = 1000;
type ServiceId = 'agent' | 'web';
type ServicesCliOptions = GlobalCliOptions & {
  force?: boolean;
  idleTimeoutMs?: number;
  only?: ServiceId;
};

interface RestartBlocker {
  agentId: string;
  item: InboxItem;
}

export function registerServicesCommand(program: Command): void {
  const services = program
    .command('services')
    .description('Supervise the agent and web daemons for this environment');

  services
    .command('start')
    .description('Start the agent and web app as background processes')
    .option('--only <service>', 'Start only one service: agent or web')
    .action(async (_, command) => {
      const opts = command.optsWithGlobals() as ServicesCliOptions;
      await runStart(opts);
    });

  services
    .command('stop')
    .description('Stop the agent and web app background processes')
    .option('--only <service>', 'Stop only one service: agent or web')
    .action(async (_, command) => {
      const opts = command.optsWithGlobals() as ServicesCliOptions;
      await runStop(opts);
    });

  services
    .command('restart')
    .description('Stop and start the agent and web app background processes')
    .option('--only <service>', 'Restart only one service: agent or web')
    .option('--force', 'Restart even if agent inboxes are running or queued')
    .option(
      '--idle-timeout-ms <ms>',
      'How long to wait for agent inboxes to become idle before failing',
      parseNonNegativeInteger,
      DEFAULT_RESTART_IDLE_TIMEOUT_MS,
    )
    .action(async (_, command) => {
      const opts = command.optsWithGlobals() as ServicesCliOptions;
      await runRestart(opts);
    });

  services
    .command('status')
    .description('Report the agent and web app daemon status')
    .option('--only <service>', 'Show only one service: agent or web')
    .action(async (_, command) => {
      const opts = command.optsWithGlobals() as ServicesCliOptions;
      await runStatus(opts);
    });
}

async function runStart(opts: ServicesCliOptions): Promise<void> {
  const { specs, supervisor } = await resolveServices(opts);
  for (const spec of specs) await startService(spec, supervisor);
  await printStatus(specs);
}

async function runStop(opts: ServicesCliOptions): Promise<void> {
  const { specs } = await resolveServices(opts);
  assertCanControlServices(specs);
  for (const spec of specs) await stopService(spec);
  await printStatus(specs);
}

async function runRestart(opts: ServicesCliOptions): Promise<void> {
  const { specs, supervisor } = await resolveServices(opts);
  assertCanControlServices(specs);
  await assertRestartGate(specs, opts);
  for (const spec of specs) await stopService(spec);
  for (const spec of specs) await startService(spec, supervisor);
  await printStatus(specs);
}

async function runStatus(opts: ServicesCliOptions): Promise<void> {
  const { specs } = await resolveServices(opts);
  await printStatus(specs);
}

async function resolveServices(opts: ServicesCliOptions): Promise<{ specs: ServiceSpec[]; supervisor: SupervisorOptions }> {
  const animaHome = resolveAnimaHome();
  const { host: dashboardHost, port: dashboardPort } = await defaultServerSettingsService.getDashboardSettings({
    defaultHost: '0.0.0.0',
    defaultPort: DEFAULT_DASHBOARD_PORT,
  });
  // For the status URL display: 0.0.0.0 means all interfaces, show 127.0.0.1 for local access.
  const dashboardDisplayHost = dashboardHost === '0.0.0.0' ? '127.0.0.1' : dashboardHost;

  const allSpecs: ServiceSpec[] = [
    {
      args: ['server'],
      animaHome,
      id: 'agent',
      logName: 'agent.log',
      matchAny: [' server'],
    },
    {
      args: ['web', '--host', dashboardHost, '--port', String(dashboardPort)],
      animaHome,
      id: 'web',
      legacyIds: ['ui'],
      logName: 'web.log',
      matchAny: [' web ', ' ui '],
      url: `http://${dashboardDisplayHost}:${dashboardPort}`,
    },
  ];
  if (opts.only && opts.only !== 'agent' && opts.only !== 'web') {
    throw new Error('--only must be "agent" or "web"');
  }
  const specs = opts.only ? allSpecs.filter((spec) => spec.id === opts.only) : allSpecs;

  const animactl = fileURLToPath(new URL('./animactl.js', import.meta.url));
  const cwd = process.cwd();
  return { specs, supervisor: { animactl, cwd } };
}

function assertCanControlServices(specs: ServiceSpec[]): void {
  if (!specs.some((spec) => spec.id === 'agent')) return;
  const isRuntimeItem = Boolean(process.env.ANIMA_INBOX_ITEM_ID || process.env.ANIMA_AGENT_ID);
  if (!isRuntimeItem) return;

  const runtimeHome = process.env.ANIMA_RUNTIME_HOME;
  if (runtimeHome && resolvePath(runtimeHome) !== resolvePath(resolveAnimaHome())) return;

  throw new Error(
    'Refusing to stop or restart the agent service from inside its own active runtime. '
      + 'Use an external shell or idle-gated restart for full restarts, or pass --only web for web-only reloads.',
  );
}

async function assertRestartGate(specs: ServiceSpec[], opts: ServicesCliOptions): Promise<void> {
  const agentSpec = specs.find((spec) => spec.id === 'agent');
  if (!agentSpec || opts.force || !(await isServiceRunning(agentSpec))) return;

  await waitForRestartIdle(opts.idleTimeoutMs ?? DEFAULT_RESTART_IDLE_TIMEOUT_MS);

  const finalBlockers = await listRestartBlockers();
  if (finalBlockers.length > 0) throw restartBlockedError(finalBlockers, 'Agents became busy before restart.');
}

async function waitForRestartIdle(timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  let loggedWait = false;
  while (true) {
    const blockers = await listRestartBlockers();
    if (blockers.length === 0) return;

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= timeoutMs) throw restartBlockedError(blockers, 'Timed out waiting for agents to become idle.');

    if (!loggedWait) {
      console.error(`Waiting for agents to become idle before restart (timeout ${formatDurationMs(timeoutMs)}).`);
      loggedWait = true;
    }
    await sleep(Math.min(RESTART_IDLE_POLL_MS, timeoutMs - elapsedMs));
  }
}

async function listRestartBlockers(): Promise<RestartBlocker[]> {
  const blockers: RestartBlocker[] = [];
  for (const agentId of await defaultAgentRegistryService.listAgentIds()) {
    for (const item of await new WakeQueueService(agentId).list()) {
      if (item.handling.status !== 'queued' && item.handling.status !== 'running') continue;
      blockers.push({ agentId, item });
    }
  }
  return blockers.sort((a, b) =>
    blockerSortKey(a).localeCompare(blockerSortKey(b)),
  );
}

function blockerSortKey(blocker: RestartBlocker): string {
  return `${blocker.agentId}:${itemStatusAt(blocker.item)}:${blocker.item.id}`;
}

function restartBlockedError(blockers: RestartBlocker[], prefix: string): Error {
  return new Error([
    `${prefix} Restart blocked because agent inboxes are not idle:`,
    ...blockers.map(formatBlocker),
    'Use --force to restart anyway.',
  ].join('\n'));
}

function formatBlocker({ agentId, item }: RestartBlocker): string {
  const handling = item.handling;
  const parts = [
    `agent=${agentId}`,
    `status=${handling.status}`,
    `item=${item.id}`,
    `since=${itemStatusAt(item)}`,
    handling.workerId ? `worker=${handling.workerId}` : undefined,
    itemSummary(item) ? `text=${JSON.stringify(itemSummary(item))}` : undefined,
  ].filter(Boolean);
  return `- ${parts.join(' ')}`;
}

function itemStatusAt(item: InboxItem): string {
  return item.handling.startedAt ?? item.handling.queuedAt ?? item.handling.updatedAt;
}

function itemSummary(item: InboxItem): string {
  if (item.kind === 'slack' || item.kind === 'onboarding') return truncate(item.text);
  if (item.kind === 'choice_response') {
    const actor = item.answeredBy.handle ?? item.answeredBy.displayName ?? item.answeredBy.slackUserId;
    return truncate(`${actor}: ${item.optionLabel}`);
  }
  return item.kind;
}

function truncate(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

function parseNonNegativeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('--idle-timeout-ms must be a non-negative integer');
  }
  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
