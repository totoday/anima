import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isMissingFile } from './storage/json-file.js';

// templates/ ships at the repo root, outside dist. Relative to this module that's
// two levels up when compiled (dist/server/bundled-templates.js) and one in dev
// (server/bundled-templates.ts); try both so the same call works either way.
export async function readBundledTemplate(filename: string): Promise<string> {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(moduleDir, '..', '..', 'templates', filename),
    join(moduleDir, '..', 'templates', filename),
  ];
  for (const path of candidates) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }
  throw new Error(`Bundled template not found: ${filename}`);
}
