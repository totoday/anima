import { z } from 'zod';

import type { KbFileKind } from './kb-file-types.js';

export interface KbView {
  id: string;
  label: string;
}

export const KbCreateRequest = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  path: z.string().trim().min(1),
});

export type KbCreateRequest = z.infer<typeof KbCreateRequest>;

export const KbRenameRequest = z.object({
  label: z.string().trim().min(1),
});

export type KbRenameRequest = z.infer<typeof KbRenameRequest>;

export interface KbTreeNode {
  name: string;
  path: string; // repo-relative POSIX
  type: 'dir' | 'file';
  children?: KbTreeNode[];
}

export interface KbTree {
  kb: KbView;
  nodes: KbTreeNode[];
}

export interface KbFile {
  kbId: string;
  path: string; // repo-relative POSIX
  name: string;
  kind: KbFileKind;
  size: number;
  language?: string; // syntax-highlight hint for `code`
  content?: string; // utf8 text for text-ish kinds within the inline cap
  truncated?: boolean; // text exceeded the inline cap — use the raw route instead
}
