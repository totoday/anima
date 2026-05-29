import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_FILE = 'runtime-standing-prompt.md';
const DEFAULT_ROLE = 'general-purpose Anima agent';

let cachedTemplate: string | undefined;

export interface AnimaRuntimeProfile {
  displayName: string;
  role?: string;
}

export function buildAnimaRuntimeProfile(profile: AnimaRuntimeProfile): string {
  const name = profile.displayName.trim() || 'Anima agent';
  const role = stripTrailingPeriod(profile.role?.trim() || DEFAULT_ROLE);
  return readBundledTemplate()
    .replaceAll('{{name}}', name)
    .replaceAll('{{role}}', role);
}

function readBundledTemplate(): string {
  if (cachedTemplate !== undefined) return cachedTemplate;
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Runtime from compiled dist/server/runtime/standing-prompt.js.
    join(moduleDir, '..', '..', '..', 'templates', TEMPLATE_FILE),
    // Direct TS/dev execution from server/runtime/standing-prompt.ts.
    join(moduleDir, '..', '..', 'templates', TEMPLATE_FILE),
  ];
  for (const path of candidates) {
    try {
      cachedTemplate = readFileSync(path, 'utf8');
      return cachedTemplate;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }
  throw new Error(`Runtime standing prompt template not found: ${TEMPLATE_FILE}`);
}

function stripTrailingPeriod(value: string): string {
  return value.endsWith('.') ? value.slice(0, -1) : value;
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
