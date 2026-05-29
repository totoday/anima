import type { Command } from 'commander';
import { spawn } from 'node:child_process';

import {
  DEFAULT_RUNTIME_PACKAGE,
  currentRuntimePackageInfo,
  ensureManagedRuntime,
  installManagedRuntime,
  readManagedRuntimeStatus,
  resolveManagedAnimaHome,
  type RuntimeInstallOptions,
  type RuntimeStatus,
} from '../runtime/managed-runtime.js';

interface RuntimeCliOptions {
  channel?: string;
  force?: boolean;
  idleTimeoutMs?: number;
  npm?: string;
  only?: 'agent' | 'web';
  packageName?: string;
  runtimeDir?: string;
  skipInstall?: boolean;
  version?: string;
}

type ServiceCommand = 'restart' | 'start' | 'status' | 'stop';

export function registerRuntimeCommand(program: Command): void {
  const runtime = program
    .command('runtime')
    .description('Manage the local npm-installed Anima runtime');
  registerRuntimeCommands(runtime, { topLevel: false });
}

export function registerTopLevelRuntimeCommands(program: Command): void {
  program
    .description('Control the local npm-installed Anima runtime')
    .showHelpAfterError()
    .configureHelp({ sortSubcommands: true });
  registerRuntimeCommands(program, { topLevel: true });
}

function registerRuntimeCommands(program: Command, options: { topLevel: boolean }): void {
  program
    .command('install')
    .description('Install Anima into the managed runtime directory')
    .option('--channel <tag>', 'npm dist-tag to install, for example latest or canary')
    .option('--version <version>', 'exact package version to install')
    .option('--runtime-dir <path>', 'runtime directory (default: ~/.anima/runtime/current)')
    .option('--package-name <name>', 'npm package name to install', DEFAULT_RUNTIME_PACKAGE)
    .option('--npm <command>', 'npm command to use', 'npm')
    .action(async (options: RuntimeCliOptions) => {
      const result = await installManagedRuntime(runtimeInstallOptions(options, { defaultChannel: 'latest' }));
      printInstallResult(result.metadata.version, result.metadata.specifier, result.paths.runtimeDir, result.installed);
    });

  const statusCommand = program
    .command('status')
    .description(options.topLevel ? 'Show managed runtime and local service status' : 'Show the managed runtime installation status')
    .option('--runtime-dir <path>', 'runtime directory (default: ~/.anima/runtime/current)')
    .option('--package-name <name>', 'npm package name to inspect', DEFAULT_RUNTIME_PACKAGE);
  statusCommand.action(async (commandOptions: RuntimeCliOptions) => {
    if (options.topLevel) {
      await runManagedServiceCommand('status', commandOptions);
      return;
    }
    const status = await readManagedRuntimeStatus({
      packageName: commandOptions.packageName,
      runtimeDir: commandOptions.runtimeDir,
    });
    printRuntimeStatus(status);
    if (!status.installed) process.exitCode = 1;
  });

  if (options.topLevel) {
    program
      .command('runtime-status')
      .description('Show only the managed runtime installation status')
      .option('--runtime-dir <path>', 'runtime directory (default: ~/.anima/runtime/current)')
      .option('--package-name <name>', 'npm package name to inspect', DEFAULT_RUNTIME_PACKAGE)
      .action(async (commandOptions: RuntimeCliOptions) => {
        const status = await readManagedRuntimeStatus({
          packageName: commandOptions.packageName,
          runtimeDir: commandOptions.runtimeDir,
        });
        printRuntimeStatus(status);
        if (!status.installed) process.exitCode = 1;
      });
  }

  serviceCommand(program, 'start', { installable: true })
    .description('Install the managed runtime if needed, then start local Anima services')
    .action(async (options: RuntimeCliOptions) => {
      await runManagedServiceCommand('start', options);
    });

  serviceCommand(program, 'restart', { installable: true })
    .description('Install the managed runtime if needed, then idle-gated restart local Anima services')
    .option('--force', 'Restart even if agent inboxes are running or queued')
    .option('--idle-timeout-ms <ms>', 'How long to wait for idle agents before failing', parseNonNegativeInteger)
    .action(async (options: RuntimeCliOptions) => {
      await runManagedServiceCommand('restart', options);
    });

  serviceCommand(program, 'stop')
    .description('Stop local Anima services from the managed runtime')
    .action(async (options: RuntimeCliOptions) => {
      await runManagedServiceCommand('stop', options);
    });

  if (!options.topLevel) {
    serviceCommand(program, 'service-status')
      .description('Show managed runtime and local service status')
      .action(async (commandOptions: RuntimeCliOptions) => {
        await runManagedServiceCommand('status', commandOptions);
      });
  }
}

export function runtimeInstallOptions(
  options: RuntimeCliOptions,
  defaults: { defaultChannel?: string; defaultVersion?: string } = {},
): RuntimeInstallOptions {
  return {
    channel: options.version ? undefined : options.channel ?? defaults.defaultChannel,
    npmCommand: options.npm,
    packageName: options.packageName,
    runtimeDir: options.runtimeDir,
    version: options.version ?? defaults.defaultVersion,
  };
}

export function printRuntimeStatus(status: RuntimeStatus): void {
  if (!status.installed) {
    console.log('runtime: not installed');
    console.log(`dir: ${status.paths.runtimeDir}`);
    console.log('Run `npx @totoday/animactl start` to install and start the local runtime.');
    return;
  }
  console.log(`runtime: ${status.packageName}@${status.version ?? 'unknown'}`);
  console.log(`dir: ${status.paths.runtimeDir}`);
  console.log(`animactl: ${status.paths.animactlScript}`);
  if (status.metadata) {
    console.log(`requested: ${status.metadata.requested}`);
    console.log(`installedAt: ${status.metadata.installedAt}`);
  }
}

function printInstallResult(version: string, specifier: string, runtimeDir: string, installed: boolean): void {
  const action = installed ? 'installed' : 'using';
  console.log(`runtime: ${action} ${specifier} -> ${version}`);
  console.log(`dir: ${runtimeDir}`);
}

function serviceCommand(runtime: Command, name: string, options: { installable?: boolean } = {}): Command {
  const command = runtime
    .command(name)
    .option('--only <service>', 'Limit the service command to agent or web')
    .option('--runtime-dir <path>', 'runtime directory (default: ~/.anima/runtime/current)')
    .option('--package-name <name>', 'npm package name to inspect/use', DEFAULT_RUNTIME_PACKAGE);
  if (options.installable) {
    command
      .option('--npm <command>', 'npm command to use', 'npm')
      .option('--channel <tag>', 'npm dist-tag to install before start/restart, for example latest or canary')
      .option('--version <version>', 'exact package version to install before start/restart')
      .option('--skip-install', 'Use the currently installed runtime without running npm install first');
  }
  return command;
}

async function runManagedServiceCommand(command: ServiceCommand, options: RuntimeCliOptions): Promise<void> {
  assertServiceOptions(options);
  const packageName = options.packageName ?? DEFAULT_RUNTIME_PACKAGE;
  const shouldInstall = (command === 'start' || command === 'restart') && !options.skipInstall;
  const status = shouldInstall
    ? undefined
    : await readManagedRuntimeStatus({ packageName, runtimeDir: options.runtimeDir });

  const paths = shouldInstall
    ? (await installRuntimeForService(options)).paths
    : status?.paths;
  if (!paths) throw new Error('Unable to resolve managed runtime paths.');

  if (!shouldInstall) {
    if (command === 'status' && status) printRuntimeStatus(status);
    if (!status?.installed) {
      process.exitCode = 1;
      return;
    }
  }

  const exitCode = await runAnimactlServices(paths.animactlScript, paths.packageDir, command, options);
  if (exitCode !== 0) process.exitCode = exitCode;
}

async function installRuntimeForService(options: RuntimeCliOptions): Promise<{ paths: RuntimeStatus['paths'] }> {
  const current = await currentRuntimePackageInfo();
  const result = await ensureManagedRuntime(runtimeInstallOptions({
    ...options,
    packageName: options.packageName ?? current.name,
  }, {
    defaultVersion: options.channel ? undefined : current.version,
  }));
  const action = result.installed ? 'installed' : 'using';
  console.log(`runtime: ${action} ${result.metadata.packageName}@${result.metadata.version}`);
  console.log(`dir: ${result.paths.runtimeDir}`);
  return { paths: result.paths };
}

function assertServiceOptions(options: RuntimeCliOptions): void {
  if (options.only && options.only !== 'agent' && options.only !== 'web') {
    throw new Error('--only must be "agent" or "web"');
  }
  if (options.channel && options.version) throw new Error('Choose either --version or --channel, not both.');
}

async function runAnimactlServices(
  animactlScript: string,
  packageDir: string,
  command: ServiceCommand,
  options: RuntimeCliOptions,
): Promise<number> {
  const args = [animactlScript, 'services', command];
  if (options.only) args.push('--only', options.only);
  if (command === 'restart') {
    if (options.force) args.push('--force');
    if (options.idleTimeoutMs !== undefined) args.push('--idle-timeout-ms', String(options.idleTimeoutMs));
  }

  return new Promise((resolveDone, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: packageDir,
      env: {
        ...process.env,
        ANIMA_HOME: resolveManagedAnimaHome(),
      },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`animactl services ${command} exited from signal ${signal}`));
      else resolveDone(code ?? 1);
    });
  });
}

function parseNonNegativeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error('value must be a non-negative integer');
  return parsed;
}
