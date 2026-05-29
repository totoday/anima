import type { ProviderUsageError } from '../../shared/provider-usage.js';

export interface FetchJsonOptions {
  body?: string;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  timeoutMs?: number;
  url: string;
}

export interface FetchJsonResult {
  data?: unknown;
  error?: ProviderUsageError;
  status?: number;
}

export async function fetchJson({
  body,
  headers = {},
  method = 'GET',
  timeoutMs = 10_000,
  url,
}: FetchJsonOptions): Promise<FetchJsonResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      body,
      headers,
      method,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (response.status === 401 || response.status === 403) {
      return {
        error: { type: 'unauthorized', message: `Provider usage request was rejected (${response.status})` },
        status: response.status,
      };
    }
    if (!response.ok) {
      return {
        error: { type: 'unknown', message: `Provider usage request failed (${response.status})` },
        status: response.status,
      };
    }
    return { data: await response.json(), status: response.status };
  } catch (error) {
    clearTimeout(timeout);
    return {
      error: {
        type: 'network_error',
        message: error instanceof Error ? error.message : 'Provider usage request failed',
      },
    };
  }
}

export function bearer(token: string): string {
  const trimmed = token.trim();
  return trimmed.toLowerCase().startsWith('bearer ') ? trimmed : `Bearer ${trimmed}`;
}
