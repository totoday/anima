import type { Command } from 'commander';
import { z } from 'zod';

import { runMessageReact } from './reactions.js';

const GlobalFlags = z.object({});

const ReactionSchema = GlobalFlags.extend({
  channel: z.string().optional(),
  emoji: z.string().optional(),
  messageTs: z.string().optional(),
  name: z.string().optional(),
  remove: z.boolean().optional(),
});

export function registerReactionCommands(program: Command): void {
  const reaction = program
    .command('reaction')
    .description('Add or remove a reaction emoji on a Slack message (mirrors Slack reactions.* API).');

  addReactionOptions(reaction)
    .option('--remove', 'remove the reaction instead of adding it')
    .action(async (_, command) => {
      const opts = reactionInput(command.optsWithGlobals());
      await runMessageReact({ ...opts, remove: Boolean(opts.remove) });
    });

  const channelOption = '--channel <channel>';
  const channelDesc = 'channel ID (e.g. C123ABC) or name (e.g. prod)\nDM: D-prefixed channel ID (e.g. D123ABC) or @handle (e.g. @alice)';
  const messageTsOption = '--message-ts <ts>';
  const messageTsDesc = 'timestamp of the message to react to';
  const nameOption = '--name <emoji>';
  const nameDesc = 'emoji name without colons (e.g. white_check_mark, eyes)\nstandard Slack names and custom workspace emoji both work; idempotent';

  // Input:   anima reaction add --channel <id> --message-ts <ts> --name <emoji>
  // Input:   anima reaction remove --channel <id> --message-ts <ts> --name <emoji>
  // Output:  reaction (added|removed) successfully. (channel=#<name> | dm=<handle>), message_ts=<ts>, reaction=:<name>:.
  //          Idempotent: noop becomes `reaction already (present|absent) (noop). ...` (still exit 0).
  // Failure: human-readable error to stderr; exit 1.
  reaction
    .command('add')
    .description('Add a reaction emoji to a message.')
    .option(channelOption, channelDesc)
    .option(messageTsOption, messageTsDesc)
    .option(nameOption, nameDesc)
    .option('--emoji <emoji>', 'alias for --name')
    .action(async (_, command) => {
      const opts = reactionInput(command.optsWithGlobals());
      await runMessageReact({ ...opts, remove: false });
    });

  reaction
    .command('remove')
    .description('Remove a reaction emoji from a message.')
    .option(channelOption, channelDesc)
    .option(messageTsOption, messageTsDesc)
    .option(nameOption, nameDesc)
    .option('--emoji <emoji>', 'alias for --name')
    .action(async (_, command) => {
      const opts = reactionInput(command.optsWithGlobals());
      await runMessageReact({ ...opts, remove: true });
    });

  addReactionCommand(program);
}

function addReactionCommand(parent: Command): void {
  const command = parent
    .command('react [action]')
    .description('Alias for reaction add/remove. Defaults to add.');
  addReactionOptions(command)
    .option('--remove', 'remove the reaction instead of adding it')
    .action(async (action: string | undefined, _, command) => {
      const opts = reactionInput(command.optsWithGlobals());
      const normalizedAction = action?.trim().toLowerCase();
      if (normalizedAction && normalizedAction !== 'add' && normalizedAction !== 'remove') {
        throw new Error('react action must be add or remove');
      }
      await runMessageReact({
        ...opts,
        remove: normalizedAction === 'remove' || Boolean(opts.remove),
      });
    });
}

function addReactionOptions(command: Command): Command {
  return command
    .option('--channel <channel>', 'channel ID (e.g. C123ABC) or name (e.g. prod)\nDM: D-prefixed channel ID (e.g. D123ABC) or @handle (e.g. @alice)')
    .option('--message-ts <ts>', 'timestamp of the message to react to')
    .option('--name <emoji>', 'emoji name without colons (e.g. white_check_mark, eyes)')
    .option('--emoji <emoji>', 'alias for --name');
}

function reactionInput(raw: unknown): z.infer<typeof ReactionSchema> {
  const opts = ReactionSchema.parse(raw);
  return {
    ...opts,
    name: opts.name ?? opts.emoji,
  };
}
