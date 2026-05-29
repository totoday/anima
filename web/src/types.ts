import type { SlackFileMeta } from '@shared/inbox';

export type SlackFile = SlackFileMeta & { localPath?: string };
