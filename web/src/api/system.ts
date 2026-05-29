import { apiRequest, jsonInit } from './client';
import type { ProviderAvailability } from '@shared/provider-catalog';
import type { ProviderUsageResponse } from '@shared/provider-usage';
import type { ServerInfo } from '@shared/server-info';
import type { SidebarOrder } from '@shared/server-settings';

export type { SidebarOrder } from '@shared/server-settings';

// ---------------------------------------------------------------------------
// Sidebar order
// ---------------------------------------------------------------------------

export async function fetchSidebarOrder(): Promise<SidebarOrder> {
  const body = await apiRequest<{ sidebarOrder: SidebarOrder }>('/api/sidebar-order');
  return body.sidebarOrder;
}

export async function saveSidebarOrder(order: SidebarOrder): Promise<SidebarOrder> {
  const body = await apiRequest<{ sidebarOrder: SidebarOrder }>(
    '/api/sidebar-order',
    jsonInit('PUT', order),
  );
  return body.sidebarOrder;
}

export async function fetchProviderAvailability(): Promise<ProviderAvailability[]> {
  const body = await apiRequest<{ providers: ProviderAvailability[] }>('/api/provider-availability');
  return body.providers;
}

export async function fetchProviderUsage(): Promise<ProviderUsageResponse> {
  return apiRequest('/api/provider-usage');
}

export async function fetchServerInfo(): Promise<ServerInfo> {
  return apiRequest('/api/server-info');
}

interface RestartServicesResult {
  animaHome: string;
  delayMs: number;
  logPath: string;
  ok: true;
  scheduled: true;
}

export async function restartServices(): Promise<RestartServicesResult> {
  return apiRequest('/api/services/restart', jsonInit('POST'));
}

export async function pingHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}
