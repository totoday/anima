import type { Command } from 'commander';
import { z } from 'zod';

import { startRuntimeHost } from '../runtime/host.js';
import { startWebHost } from '../web/host.js';

const GlobalFlags = z.object({
  agent: z.string().optional(),
});

const ServerSchema = GlobalFlags;

const WebSchema = GlobalFlags.extend({
  host: z.string().optional(),
  port: z.coerce.number().int().positive().optional(),
});

type ServerOptions = z.infer<typeof ServerSchema>;
type WebOptions = z.infer<typeof WebSchema>;

export function registerServiceCommands(program: Command): void {
  program
    .command('server')
    .description('Run the Anima server: Slack listener, reminder scheduler, and worker loop')
    .action(async (_, command) => {
      const opts = ServerSchema.parse(command.optsWithGlobals());
      await server(opts);
    });

  program
    .command('web')
    .description('Run the local Anima web app')
    .option('--host <host>')
    .option('--port <port>')
    .action(async (_, command) => {
      const opts = WebSchema.parse(command.optsWithGlobals());
      await web(opts);
    });
}

async function server(opts: ServerOptions): Promise<void> {
  await startRuntimeHost(opts);
}

async function web(opts: WebOptions): Promise<void> {
  await startWebHost(opts);
}
