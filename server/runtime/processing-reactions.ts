import { errorMessage } from '../ids.js';
import type { InboxItem } from '../inbox/wake-queue.service.js';
import { createSlackWebClient } from '../slack/client.js';
import { isSlackEvent } from '../inbox/slack-events.js';

const DEFAULT_PROCESSING_REACTION = 'eyes';

interface SlackProcessingReaction {
  channel: string;
  name: string;
  timestamp: string;
}

interface SlackProcessingReactionClient {
  add(input: SlackProcessingReaction): Promise<void>;
  remove(input: SlackProcessingReaction): Promise<void>;
}

interface SlackProcessingReactionContext {
  item: InboxItem;
}

export function slackReactionClient(token: string): SlackProcessingReactionClient {
  const client = createSlackWebClient(token);
  return {
    add: async (reaction) => {
      await client.reactions.add(reaction);
    },
    remove: async (reaction) => {
      await client.reactions.remove(reaction);
    },
  };
}

export async function addProcessingReaction(input: {
  context: SlackProcessingReactionContext;
  logger?: Pick<Console, 'error'>;
  name?: string;
  reactionClient?: SlackProcessingReactionClient;
}): Promise<void> {
  const reaction = processingReactionForEvent(input.context.item, input.name ?? DEFAULT_PROCESSING_REACTION);
  if (!reaction || !input.reactionClient) return;
  try {
    await input.reactionClient.add(reaction);
  } catch (error) {
    if (isIgnoredReactionError(error, 'already_reacted')) return;
    input.logger?.error(`Slack processing reaction add failed for item ${input.context.item.id}: ${errorMessage(error)}`);
  }
}

export async function removeProcessingReactions(input: {
  context: SlackProcessingReactionContext;
  logger?: Pick<Console, 'error'>;
  name?: string;
  reactionClient?: SlackProcessingReactionClient;
}): Promise<void> {
  if (!input.reactionClient) return;
  const reactions = uniqueProcessingReactions(
    [input.context.item],
    input.name ?? DEFAULT_PROCESSING_REACTION,
  );
  for (const reaction of reactions) {
    try {
      await input.reactionClient.remove(reaction);
    } catch (error) {
      if (isIgnoredReactionError(error, 'no_reaction')) continue;
      input.logger?.error(`Slack processing reaction remove failed for item ${input.context.item.id}: ${errorMessage(error)}`);
    }
  }
}

function uniqueProcessingReactions(events: InboxItem[], name: string): SlackProcessingReaction[] {
  const reactions = new Map<string, SlackProcessingReaction>();
  for (const event of events) {
    const reaction = processingReactionForEvent(event, name);
    if (!reaction) continue;
    reactions.set(`${reaction.channel}:${reaction.timestamp}:${reaction.name}`, reaction);
  }
  return Array.from(reactions.values());
}

function processingReactionForEvent(event: InboxItem, name: string): SlackProcessingReaction | undefined {
  if (!isSlackEvent(event)) return undefined;
  return {
    channel: event.channelId,
    name,
    timestamp: event.messageTs,
  };
}

function isIgnoredReactionError(error: unknown, code: string): boolean {
  return errorMessage(error).includes(code);
}
