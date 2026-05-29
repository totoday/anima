// Disk schema for reconstructable caches under ANIMA_HOME/cache.
//
// Current layout:
//   cache/slack/files/<teamId>/<fileId>/meta.json
//   cache/slack/files/<teamId>/<fileId>/<safe original filename>
//   cache/slack/teams/<teamId>/directory.json
//
// The inbox keeps Slack file metadata for the product surface. The cache only
// records downloaded bytes so duplicate files shared across agents are stored
// once per Slack workspace.

import { join } from 'node:path';

import { z } from 'zod';

import { resolveAnimaHome } from '../../anima-home.js';
import { JsonStore } from '../json-store.js';
import type { SlackConversationInfo, SlackUserInfo } from '../../slack/slack.helper.js';

export const SlackFileCacheMeta = z.object({
  id: z.string(),
  mimetype: z.string(),
  name: z.string(),
  sizeBytes: z.number(),
  teamId: z.string(),
});

export type SlackFileCacheMeta = z.infer<typeof SlackFileCacheMeta>;

export interface SlackWorkspaceDirectoryFile {
  channels: SlackConversationInfo[];
  channelsSyncedAt?: string;
  teamId: string;
  users: SlackUserInfo[];
  usersSyncedAt?: string;
  workspace?: {
    iconUrl?: string;
    syncedAt: string;
  };
}

export const SlackWorkspaceDirectoryFileSchema = z.object({
  channels: z.array(z.object({ id: z.string() }).passthrough()).default([]),
  channelsSyncedAt: z.string().optional(),
  teamId: z.string(),
  users: z.array(z.object({ id: z.string() }).passthrough()).default([]),
  usersSyncedAt: z.string().optional(),
  workspace: z.object({
    iconUrl: z.string().optional(),
    syncedAt: z.string(),
  }).optional(),
});

export const getSlackFileCacheMetaStore = (teamId: string, fileId: string): JsonStore<Partial<SlackFileCacheMeta>> =>
  new JsonStore<Partial<SlackFileCacheMeta>>({
    empty: () => ({}),
    parse: SlackFileCacheMeta.partial().parse,
    path: () => join(slackFileCacheDir(teamId, fileId), 'meta.json'),
  });

export function slackFileCacheDir(teamId: string, fileId: string): string {
  return join(resolveAnimaHome(), 'cache', 'slack', 'files', teamId, fileId);
}

export const getSlackWorkspaceDirectoryStore = (teamId: string): JsonStore<SlackWorkspaceDirectoryFile> =>
  new JsonStore<SlackWorkspaceDirectoryFile>({
    empty: () => ({ channels: [], teamId, users: [] }),
    parse: (value) => SlackWorkspaceDirectoryFileSchema.parse(value) as SlackWorkspaceDirectoryFile,
    path: () => join(resolveAnimaHome(), 'cache', 'slack', 'teams', teamId, 'directory.json'),
  });
