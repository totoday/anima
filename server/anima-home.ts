import { AsyncLocalStorage } from 'node:async_hooks';
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const animaHomeScope = new AsyncLocalStorage<string>();

export function resolveAnimaHome(): string {
  const scopedHome = animaHomeScope.getStore();
  if (scopedHome) return scopedHome;
  const envHome = process.env.ANIMA_HOME?.trim();
  if (envHome) return resolve(envHome);
  const local = resolve('.anima');
  if (isDirectory(local)) return local;
  return join(homedir(), '.anima');
}

export function withAnimaHome<T>(dir: string, body: () => Promise<T>): Promise<T> {
  return animaHomeScope.run(resolve(dir), body);
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
