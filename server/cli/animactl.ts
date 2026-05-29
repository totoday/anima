#!/usr/bin/env node
import { Command } from 'commander';

import { errorMessage } from '../ids.js';
import { registerServiceCommands } from './service.js';
import { registerServicesCommand } from './services-cli.js';

async function main(): Promise<void> {
  await createAdminCliProgram().parseAsync(process.argv);
}

export function createAdminCliProgram(): Command {
  const program = new Command();
  program
    .name('animactl')
    .description('Operate Anima server and web services')
    .option('--agent <id>')
    .showHelpAfterError()
    .configureHelp({ sortSubcommands: true });

  registerServiceCommands(program);
  registerServicesCommand(program);

  return program;
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
