import { truncateForActivity } from './activity-text.js';

export function copyNumber(
  source: Record<string, unknown> | undefined,
  target: Record<string, unknown>,
  from: string,
  to: string,
): void {
  const value = source?.[from];
  if (typeof value === 'number' && Number.isFinite(value)) target[to] = value;
}

export function copyString(
  source: Record<string, unknown> | undefined,
  target: Record<string, unknown>,
  from: string,
  to: string,
): void {
  const value = source?.[from];
  if (typeof value === 'string' && value) target[to] = value;
}

export function copyBoolean(
  source: Record<string, unknown> | undefined,
  target: Record<string, unknown>,
  from: string,
  to: string,
): void {
  const value = source?.[from];
  if (typeof value === 'boolean') target[to] = value;
}

export function copyActivityPreview(
  source: Record<string, unknown> | undefined,
  target: Record<string, unknown>,
  from: string,
  to: string,
): void {
  const value = source?.[from];
  if (typeof value === 'string' && value) target[to] = truncateForActivity(value);
}
