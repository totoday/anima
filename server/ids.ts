export function nowIso(): string {
  return new Date().toISOString();
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function slackSurfaceId(surface: { channelId: string; teamId: string; threadTs?: string }): string {
  const base = `slack:${surface.teamId}:${surface.channelId}`;
  return surface.threadTs ? `${base}:thread:${surface.threadTs}` : base;
}

export function slackMessageEventId(teamId: string, channelId: string, ts: string): string {
  return `slack:${teamId}:${channelId}:${ts}`;
}
