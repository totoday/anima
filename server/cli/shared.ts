export interface GlobalCliOptions {
  agent?: string;
}

export function resolveAgentIdFrom(agent: string | undefined): string | undefined {
  return agent ?? (process.env.ANIMA_AGENT_ID?.trim() || undefined);
}

export function resolveItemIdFrom(item: string | undefined): string | undefined {
  return item ?? (process.env.ANIMA_INBOX_ITEM_ID?.trim() || undefined);
}
