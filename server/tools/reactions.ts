import { errorMessage } from '../ids.js';
import { resolveSlackChannelArgument } from './slack-channel-resolver.js';
import {
  slackOutputTarget,
  slackTargetPayload,
  slackTargetSummary,
  type SlackTargetSummary,
} from './slack-target.js';
import {
  resolveToolAgentId,
  slackWebClientForOpts,
  withToolActivity,
} from './tool-context.js';

interface MessageReactInput {
  agent?: string;
  channel?: string;
  item?: string;
  messageTs?: string;
  name?: string;
  remove?: boolean;
}

export async function runMessageReact(opts: MessageReactInput): Promise<void> {
  const agentId = resolveToolAgentId(opts);
  const action: 'added' | 'removed' = opts.remove ? 'removed' : 'added';
  if (!agentId) throw new Error('message react requires current agent context for audit');
  if (!opts.channel) throw new Error('message react requires --channel');
  const targetTs = opts.messageTs;
  if (!targetTs) throw new Error('message react requires --message-ts');
  const rawName = opts.name?.trim();
  if (!rawName) throw new Error('message react requires --name');
  const name = rawName.replace(/^:|:$/g, '');
  const { agent, client } = await slackWebClientForOpts(opts);
  const teamId = agent.slack.teamId || undefined;
  const channel = await resolveSlackChannelArgument({
    channel: opts.channel,
    client,
    teamId,
  });

  const target = await slackTargetSummary({ channel, client, teamId });
  const basePayload = {
    ...slackTargetPayload(channel),
    ...target,
    action,
    name,
    targetTs,
    tool: 'anima.message.react',
  };

  await withToolActivity({
    audit: { agentId },
    basePayload,
    effectType: 'slack.reaction',
    op: async () => {
      const reaction = { channel: channel.id, name, timestamp: targetTs };
      const idempotentCode = opts.remove ? 'no_reaction' : 'already_reacted';
      let noop = false;
      try {
        if (opts.remove) {
          await client.reactions.remove(reaction);
        } else {
          await client.reactions.add(reaction);
        }
      } catch (error) {
        if (errorMessage(error).includes(idempotentCode)) {
          noop = true;
        } else {
          throw error;
        }
      }
      console.log(slackReactionOutputLine({ action, name, messageTs: targetTs, noop, target }));
      return {
        result: undefined,
        completedPayload: {
          status: action,
          ts: targetTs,
          ...(noop ? { noop: true } : {}),
        },
      };
    },
  });
}

function slackReactionOutputLine(input: {
  action: 'added' | 'removed';
  messageTs: string;
  name: string;
  noop?: boolean;
  target: SlackTargetSummary;
}): string {
  const parts = [slackOutputTarget(input.target), `message_ts=${input.messageTs}`, `reaction=:${input.name}:`];
  const lead = input.noop
    ? `reaction already ${input.action === 'added' ? 'present' : 'absent'} (noop).`
    : `reaction ${input.action} successfully.`;
  return `${lead} ${parts.join(', ')}.`;
}
