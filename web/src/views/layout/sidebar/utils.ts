import { agentIdFromName } from '@shared/agent-config';

/** Convert a label into a slug-safe id (lowercase, hyphens, no leading/trailing hyphens). */
export function slugify(label: string): string {
  return agentIdFromName(label);
}

export function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}
