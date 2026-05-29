import type {
  ConversationsHistoryResponse,
  ConversationsRepliesResponse,
  WebClient,
} from '@slack/web-api';

import { resolveSlackChannelArgument } from './slack-channel-resolver.js';
import {
  slackTargetSummary,
  slackThreadSummary,
  type SlackChannelKind,
  type SlackTargetSummary,
  type SlackThreadSummary,
} from './slack-target.js';
import {
  resolveToolAgentId,
  slackWebClientForOpts,
  withToolActivity,
} from './tool-context.js';
import {
  slackTranscriptOutput,
  slackTranscriptUserLabels,
  type SlackConversationMessage,
} from './slack-transcript.js';

interface MessageGlobalInput {
  agent?: string;
  item?: string;
}

export interface MessageReadInput extends MessageGlobalInput {
  after?: string;
  around?: string;
  before?: string;
  channel?: string;
  cursor?: string;
  inclusive?: boolean;
  json?: boolean;
  latest?: string;
  limit?: number;
  oldest?: string;
  threadTs?: string;
}

interface SlackReadRequest {
  after?: string;
  around?: string;
  before?: string;
  channel: string;
  channelDisplayName: string;
  channelKind: SlackChannelKind;
  channelName?: string;
  client: WebClient;
  cursor?: string;
  dmHandle?: string;
  dmUserId?: string;
  inclusive?: boolean;
  latest?: string;
  limit: number;
  oldest?: string;
  teamId?: string;
  threadTs?: string;
}

type SlackReadTool = 'anima.message.read';
type SlackConversationReadResponse = ConversationsHistoryResponse | ConversationsRepliesResponse;
type SlackConversationReadMessage =
  | NonNullable<ConversationsHistoryResponse['messages']>[number]
  | NonNullable<ConversationsRepliesResponse['messages']>[number];

export async function runMessageRead(opts: MessageReadInput): Promise<void> {
  const threadTs = opts.threadTs;
  const mode: 'history' | 'replies' = threadTs ? 'replies' : 'history';
  const request = await slackReadRequest({ ...opts, threadTs }, mode);
  if (mode === 'replies' && !request.threadTs) throw new Error('Missing --thread-ts');
  await runSlackReadTool({
    opts,
    request,
    tool: 'anima.message.read',
    execute: () =>
      mode === 'replies'
        ? request.client.conversations.replies({
            channel: request.channel,
            ...(request.cursor ? { cursor: request.cursor } : {}),
            ...(request.inclusive !== undefined ? { inclusive: request.inclusive } : {}),
            ...(request.latest ? { latest: request.latest } : {}),
            limit: request.limit,
            ...(request.oldest ? { oldest: request.oldest } : {}),
            ts: request.threadTs as string,
          })
        : request.client.conversations.history({
            channel: request.channel,
            ...(request.cursor ? { cursor: request.cursor } : {}),
            ...(request.inclusive !== undefined ? { inclusive: request.inclusive } : {}),
            ...(request.latest ? { latest: request.latest } : {}),
            limit: request.limit,
            ...(request.oldest ? { oldest: request.oldest } : {}),
          }),
  });
}

async function slackReadRequest(opts: MessageReadInput, mode: 'history' | 'replies'): Promise<SlackReadRequest> {
  const { agent, client } = await slackWebClientForOpts(opts);
  const teamId = agent.slack.teamId || undefined;

  if (!opts.channel) throw new Error('Missing --channel');
  const channel = await resolveSlackChannelArgument({
    channel: opts.channel,
    client,
    teamId,
  });

  const agentRangeSelectors = [opts.around, opts.before, opts.after].filter(Boolean);
  if (agentRangeSelectors.length > 1) {
    throw new Error('Pass only one of --around, --before, or --after');
  }
  if (agentRangeSelectors.length > 0 && (opts.latest || opts.oldest || opts.cursor)) {
    throw new Error('Do not combine --around, --before, or --after with --oldest, --latest, or --cursor');
  }
  const latest = opts.latest ?? opts.around ?? opts.before;
  const oldest = opts.oldest ?? opts.after;
  const inclusive = opts.inclusive ?? (opts.around ? true : undefined);
  const threadTs = opts.threadTs;
  const limitDefault = mode === 'replies' ? 50 : 20;
  const limit = Math.min(opts.limit ?? limitDefault, 200);

  return {
    ...(opts.after ? { after: opts.after } : {}),
    ...(opts.around ? { around: opts.around } : {}),
    ...(opts.before ? { before: opts.before } : {}),
    channel: channel.id,
    client,
    ...(channel.name ? { channelName: channel.name } : {}),
    ...('dmHandle' in channel && channel.dmHandle ? { dmHandle: channel.dmHandle } : {}),
    ...('dmUserId' in channel && channel.dmUserId ? { dmUserId: channel.dmUserId } : {}),
    ...(opts.cursor ? { cursor: opts.cursor } : {}),
    ...(inclusive ? { inclusive } : {}),
    ...(latest ? { latest } : {}),
    limit,
    ...(oldest ? { oldest } : {}),
    ...(teamId ? { teamId } : {}),
    ...(threadTs ? { threadTs } : {}),
    ...(await slackTargetSummary({ channel, client, teamId })),
  };
}

async function runSlackReadTool(input: {
  execute: () => Promise<SlackConversationReadResponse>;
  opts: MessageReadInput;
  request: SlackReadRequest;
  tool: SlackReadTool;
}): Promise<void> {
  const agentId = resolveToolAgentId(input.opts);
  if (!agentId) throw new Error('message read requires current agent context for audit');
  const basePayload = slackReadActivityPayload(input.tool, input.request);

  await withToolActivity({
    audit: { agentId },
    basePayload,
    op: async () => {
      const response = await input.execute();
      const messages = slackMessagesWithTimestamps(response.messages);
      const auth = await input.request.client.auth.test().catch(() => undefined);
      const cacheTeamId = auth?.team_id ?? input.request.teamId;
      const cacheContext = { ...(cacheTeamId ? { teamId: cacheTeamId } : {}) };
      const userLabels = await slackTranscriptUserLabels(messages, input.request.client, cacheTeamId);
      console.log(
        slackTranscriptOutput(messages, input.request, userLabels, {
          hasMore: response.has_more ?? false,
          nextCursor: response.response_metadata?.next_cursor ?? '',
        }, cacheContext),
      );
      return {
        result: undefined,
        completedPayload: {
          hasMore: response.has_more ?? false,
          messageCount: messages.length,
          nextCursor: response.response_metadata?.next_cursor ?? '',
        },
      };
    },
  });
}

function slackReadActivityPayload(tool: SlackReadTool, request: SlackReadRequest): Record<string, unknown> {
  return {
    ...(request.after ? { after: request.after } : {}),
    ...(request.around ? { around: request.around } : {}),
    ...(request.before ? { before: request.before } : {}),
    channel: request.channel,
    ...slackReadOutputTarget(request),
    ...(request.channelName ? { channelName: request.channelName } : {}),
    ...(request.cursor ? { cursor: request.cursor } : {}),
    ...(request.dmHandle ? { dmHandle: request.dmHandle } : {}),
    ...(request.dmUserId ? { dmUserId: request.dmUserId } : {}),
    ...(request.latest ? { latest: request.latest } : {}),
    limit: request.limit,
    ...(request.oldest ? { oldest: request.oldest } : {}),
    ...(request.threadTs ? { threadTs: request.threadTs } : {}),
    tool,
  };
}

function slackReadOutputTarget(request: SlackReadRequest): SlackTargetSummary & Partial<SlackThreadSummary> {
  const target = {
    channelDisplayName: request.channelDisplayName,
    channelKind: request.channelKind,
  };
  return request.threadTs
    ? { ...target, ...slackThreadSummary(target, request.threadTs) }
    : target;
}

function slackMessagesWithTimestamps(messages: SlackConversationReadMessage[] | undefined): SlackConversationMessage[] {
  return (messages ?? [])
    .filter((message): message is SlackConversationReadMessage & { ts: string } => typeof message.ts === 'string')
    .map((message) => message as SlackConversationMessage);
}
