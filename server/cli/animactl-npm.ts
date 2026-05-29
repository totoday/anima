#!/usr/bin/env node
import { Command } from 'commander';

import { errorMessage } from '../ids.js';
import { registerTopLevelRuntimeCommands } from './runtime-cli.js';

async function main(): Promise<void> {
  await createAnimactlNpmProgram().parseAsync(process.argv);
}

export function createAnimactlNpmProgram(): Command {
  const program = new Command();
  program.name('animactl');
  registerTopLevelRuntimeCommands(program);
  return program;
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
