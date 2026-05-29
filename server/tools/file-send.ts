import { existsSync } from 'node:fs';
import { stat as fsStat } from 'node:fs/promises';
import { basename } from 'node:path';

import { resolveSlackChannelArgument } from './slack-channel-resolver.js';
import { safeFilename } from '../storage/safe-filename.js';
import {
  completeSlackFileUpload,
  type SlackFileClient,
  type SlackFileInfo,
  uploadSlackFile,
} from './slack-file-upload.js';
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
  readStdin,
} from './tool-context.js';

export interface FileSendInputData {
  agent?: string;
  caption?: string;
  channel?: string;
  paths: string[];
  threadTs?: string;
  item?: string;
}

interface UploadedFilePayload {
  fileId: string;
  filename: string;
  mimetype: string;
  permalink?: string;
  sizeBytes: number;
  thumb360?: string;
  thumb720?: string;
  title?: string;
}

export async function runFileSend(opts: FileSendInputData): Promise<void> {
  const agentId = resolveToolAgentId(opts);
  if (!agentId) throw new Error('file send requires current agent context for audit');
  if (!opts.channel) throw new Error('file send requires --channel');
  if (!opts.paths.length) throw new Error('file send requires at least one path');

  // Validate every path up front so we fail closed before any Slack call.
  // Mirrors text-send: bad input never reaches Slack.
  const validated = await Promise.all(opts.paths.map(async (path) => {
    if (!existsSync(path)) throw new Error(`file not found: ${path}`);
    const stats = await fsStat(path);
    if (!stats.isFile()) throw new Error(`not a regular file: ${path}`);
    if (stats.size <= 0) throw new Error(`file is empty: ${path}`);
    return { path, filename: safeFilename(basename(path)), sizeBytes: stats.size };
  }));

  const { agent, client } = await slackWebClientForOpts(opts);
  const teamId = agent.slack.teamId || undefined;

  const channel = await resolveSlackChannelArgument({
    channel: opts.channel,
    client,
    teamId,
  });
  const threadTs = opts.threadTs;
  // Caption: --caption flag wins; if absent, read stdin (so a heredoc body
  // works the same way `anima message send` accepts piped text). Mirroring
  // text-send avoids the bash-quoting trap where backticks / `$(...)` inside
  // `--caption "..."` get shell-expanded before the CLI sees them.
  const caption = await captionFromOpts(opts);
  const target = await slackTargetSummary({ channel, client, teamId });

  const basePayload: Record<string, unknown> = {
    ...slackTargetPayload(channel),
    ...target,
    ...(threadTs ? { threadTs } : {}),
    fileCount: validated.length,
    files: validated.map((entry) => ({ filename: entry.filename, sizeBytes: entry.sizeBytes })),
    ...(caption ? { caption } : {}),
    tool: 'anima.file.send',
  };

  await withToolActivity({
    audit: { agentId },
    basePayload,
    effectType: 'slack.file.send',
    op: async () => {
      // Step 1+2: per-file upload URL + POST bytes. Each path's pair is
      // independent — Slack docs don't require serialization, so we run them
      // in parallel for batches (N files = 1×RTT instead of N×RTT).
      const uploaded = await Promise.all(
        validated.map((entry) => uploadSlackFile({ client, localPath: entry.path })),
      );

      // Step 3: single completeUploadExternal posts all N files as one message.
      const completed = await completeSlackFileUpload({
        channelId: channel.id,
        client,
        files: uploaded.map((file) => ({ fileId: file.fileId })),
        ...(threadTs ? { threadTs } : {}),
        ...(caption ? { caption } : {}),
      });

      // Per-file enrichment: permalink + thumbs (image only) for the audit
      // payload + UI render. Best-effort — a single failed files.info should
      // not abort the whole upload. Each file carries its own permalink;
      // there's no top-level "message permalink" because Slack groups
      // multi-file uploads into one message but only emits per-file URLs.
      const titleByFileId = new Map(completed.map((file) => [file.fileId, file.title]));
      const enriched: UploadedFilePayload[] = await Promise.all(uploaded.map(async (file) => {
        const info = await safeFetchSlackFileInfo({ client, fileId: file.fileId });
        const title = titleByFileId.get(file.fileId);
        return {
          fileId: file.fileId,
          filename: file.filename,
          mimetype: info?.mimetype ?? file.mimetype,
          sizeBytes: info?.size ?? file.sizeBytes,
          ...(info?.permalink ? { permalink: info.permalink } : {}),
          ...(info?.thumb_360 ? { thumb360: info.thumb_360 } : {}),
          ...(info?.thumb_720 ? { thumb720: info.thumb_720 } : {}),
          ...(title ? { title } : {}),
        };
      }));

      console.log(slackFileOutputLine({
        fileCount: enriched.length,
        target,
        threadTs,
      }));

      return {
        result: undefined,
        completedPayload: {
          status: 'sent',
          uploads: enriched,
        },
      };
    },
  });
}

async function safeFetchSlackFileInfo(input: {
  client: SlackFileClient;
  fileId: string;
}): Promise<SlackFileInfo | undefined> {
  try {
    return (await input.client.files.info({ file: input.fileId })).file;
  } catch {
    return undefined;
  }
}

function slackFileOutputLine(input: {
  fileCount: number;
  target: SlackTargetSummary;
  threadTs?: string;
}): string {
  const parts = [slackOutputTarget(input.target)];
  if (input.threadTs) parts.push(`thread_ts=${input.threadTs}`);
  parts.push(`files=${input.fileCount}`);
  return `uploaded successfully. ${parts.join(', ')}.`;
}

// Caption resolution: --caption wins; if absent, read stdin so a heredoc body
// works (same convention as `anima message send --text`). Returns undefined
// for the empty case so `completeUploadExternal` omits `initial_comment`.
async function captionFromOpts(opts: { caption?: string }): Promise<string | undefined> {
  if (opts.caption !== undefined) {
    return opts.caption.length > 0 ? opts.caption : undefined;
  }
  const text = await readStdin();
  return text.length > 0 ? text : undefined;
}
