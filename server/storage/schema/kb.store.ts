// Disk schema for kbs/<kbId>/config.json.
// KB configs store server-local root paths; web/API responses must redact them.

import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { resolveAnimaHome } from '../../anima-home.js';
import { JsonStore } from '../json-store.js';

export const KB_ID = /^[A-Za-z0-9._-]+$/;

export const KbRecord = z.object({
  // URL-safe slug used in /kb/<id>/... routes. This is not a filesystem path.
  id: z.string().regex(KB_ID),
  label: z.string().min(1),
  path: z.string().min(1),
}).strict();

export type KbRecord = z.infer<typeof KbRecord>;

const KbFileConfig = z.object({
  label: z.string().min(1),
  path: z.string().min(1),
}).strict();

type KbFileConfig = z.infer<typeof KbFileConfig>;

function getKbConfigFileStore(id: string): JsonStore<KbFileConfig> {
  assertKbId(id);
  return new JsonStore<KbFileConfig>({
    empty: () => ({ label: '', path: '' }),
    parse: KbFileConfig.parse,
    path: () => kbConfigPath(id),
  });
}

function kbConfigPath(id: string): string {
  return join(kbDir(id), 'config.json');
}

function kbConfigExists(id: string): boolean {
  return existsSync(kbConfigPath(id));
}

function kbsDir(): string {
  return join(resolveAnimaHome(), 'kbs');
}

function kbDir(id: string): string {
  return join(kbsDir(), id);
}

export class KbStore {
  private readonly file: JsonStore<KbFileConfig>;

  constructor(private readonly id: string) {
    assertKbId(id);
    this.file = getKbConfigFileStore(id);
  }

  exists(): boolean {
    return kbConfigExists(this.id);
  }

  async read(): Promise<KbRecord> {
    return { id: this.id, ...(await this.file.read()) };
  }

  async write(kb: KbRecord): Promise<KbRecord> {
    if (kb.id !== this.id) throw new Error('kb id is immutable');
    const next = KbRecord.parse(kb);
    await this.file.write({ label: next.label, path: next.path });
    return next;
  }

  async update(op: (current: KbRecord) => KbRecord): Promise<KbRecord> {
    const next = await this.file.update((current) => {
      const updated = KbRecord.parse(op({ id: this.id, ...current }));
      if (updated.id !== this.id) throw new Error('kb id is immutable');
      return { label: updated.label, path: updated.path };
    });
    return { id: this.id, ...next };
  }

  async remove(): Promise<void> {
    await rm(kbDir(this.id), { force: true, recursive: true });
  }
}

export class KbRegistryStore {
  async listIds(): Promise<string[]> {
    if (!existsSync(kbsDir())) return [];
    const entries = await readdir(kbsDir(), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && KB_ID.test(entry.name) && kbConfigExists(entry.name))
      .map((entry) => entry.name)
      .sort();
  }

  async list(): Promise<KbRecord[]> {
    return Promise.all((await this.listIds()).map((id) => new KbStore(id).read()));
  }
}

function assertKbId(id: string): void {
  if (!KB_ID.test(id)) throw new Error(`bad kb id: ${id}`);
}
