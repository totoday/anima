import { errorMessage } from '../ids.js';

export function truncateForActivity(text: string): string {
  return text.trim().slice(0, 4000);
}

export function runtimeErrorPayload(error: unknown): Record<string, unknown> {
  return {
    error: truncateForActivity(errorMessage(error)),
  };
}

export function isFirstClassAnimaCliCommand(command: string | undefined): boolean {
  const trimmed = command?.trim();
  if (!trimmed) return false;
  const withOptionalEnv = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*`;
  return new RegExp(
    String.raw`^${withOptionalEnv}anima\s+(?:ask|message\s+(?:read|send|update|react)|file\s+send|reminder\s+(?:schedule|cancel|snooze|list)|subscription\s+(?:list|mute))\b`,
  ).test(trimmed);
}
