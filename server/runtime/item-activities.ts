import { WakeQueueService, type InboxItem } from '../inbox/wake-queue.service.js';
import { activityServiceForAgent } from '../activities/activity.service.js';
import type { Activity } from '../../shared/activity.js';

export async function activitiesForInboxItemWindow(agentId: string, itemId: string): Promise<Activity[]> {
  const item = await new WakeQueueService(agentId).find(itemId);
  const current = item
    ? (await activityServiceForAgent(agentId).readAll()).filter((activity) => activityFallsWithinItemHandling(activity, item))
    : [];
  return current.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function activityFallsWithinItemHandling(activity: Activity, item: InboxItem): boolean {
  const handling = item.handling;
  const start = handling.startedAt ?? handling.queuedAt ?? handling.createdAt;
  if (activity.createdAt < start) return false;
  const end = terminalHandlingStatus(handling.status) ? handling.updatedAt : undefined;
  if (end && activity.createdAt > end) return false;
  return true;
}

function terminalHandlingStatus(status: InboxItem['handling']['status']): boolean {
  return status === 'completed' || status === 'failed';
}
