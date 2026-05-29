// API contract types for the web snapshot and agent activity view. Consumed by server and web.

export interface ProviderSessionRecord {
  id: string;
  kind: string;
  updatedAt: string;
}

export interface ArchivedProviderSessionRecord extends ProviderSessionRecord {
  archivedAt: string;
  archivedBy: 'operator';
  kind: string;
  note?: string;
}

export interface AgentStatusSummary {
  agentId: string;
  currentItemStartedAt?: string;
  currentItemId?: string;
  queueDepth: number;
  itemCount: number;
}

export interface AgentSessionSummary {
  archived?: ArchivedProviderSessionRecord[];
  createdAt: string;
  currentStartedAt?: string;
  latestProviderStats?: ProviderSessionStatsSummary;
  lifetimeTokens?: number;
  current?: ProviderSessionRecord;
  updatedAt: string;
}

export interface ProviderSessionStatsSummary {
  activityId: string;
  autoCompactWindow?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  contextWindow?: number;
  createdAt: string;
  currentContextTokens?: number;
  inputTokens?: number;
  model?: string;
  outputTokens?: number;
  runtimeKind?: string;
  serviceTier?: string;
  sessionCompactionCount?: number;
  sessionTokenUsage?: number;
  terminalReason?: string;
  totalTokens?: number;
  usedTokens?: number;
}
