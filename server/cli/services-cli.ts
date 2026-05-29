import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';

import type { Command } from 'commander';

import { defaultServerSettingsService } from '../settings/settings.service.js';
import { resolveAnimaHome } from '../anima-home.js';
import {
  DEFAULT_RESTART_IDLE_TIMEOUT_MS,
  listRestartBlockers,
  restartBlockedError,
  waitForRestartIdle,
} from '../services/restart-gate.js';
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
type ServiceId = 'agent' | 'web';
type ServicesCliOptions = GlobalCliOptions & {
  force?: boolean;
  idleTimeoutMs?: number;
  only?: ServiceId;
};

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

function parseNonNegativeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('--idle-timeout-ms must be a non-negative integer');
  }
  return parsed;
}
