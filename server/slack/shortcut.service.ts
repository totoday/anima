import type { WebClient } from '@slack/web-api';

import type { AgentConfig } from '../../shared/agent-config.js';
import type { AgentStatusSummary } from '../../shared/snapshot.js';
import type { Reminder, ReminderSchedule } from '../../shared/reminder.js';
import { defaultActivityRecorder, type ActivityRecorder } from '../activities/activity.service.js';
import { defaultAgentRegistryService } from '../agents/agent.service.js';
import { nowIso } from '../ids.js';
import { WakeQueueService, type InboxItem } from '../inbox/wake-queue.service.js';
import { reminderServiceForAgent, type ReminderService } from '../reminders/reminder.service.js';
import { defaultRuntimeService, RuntimeServiceError } from '../runtime/runtime.service.js';
import {
  SLACK_STOP_CONFIRM_VIEW_CALLBACK_ID,
  SLACK_VIEW_REMINDER_DETAIL_ACTION_ID,
  SLACK_VIEW_REMINDERS_ACTION_ID,
} from './shortcuts.js';

export interface SlackShortcutUser {
  id: string;
  name?: string;
  team_id?: string;
  username?: string;
}

export interface SlackShortcutBody {
  callback_id?: string;
  channel?: { id?: string; name?: string };
  message?: {
    text?: string;
    thread_ts?: string;
    ts?: string;
    user?: string;
  };
  response_url?: string;
  team?: { id?: string } | null;
  trigger_id?: string;
  type?: string;
  user?: SlackShortcutUser;
}

export interface SlackShortcutView {
  private_metadata?: string;
}

// ---------------------------------------------------------------------------
// Block Kit types (modal-safe subset)
// ---------------------------------------------------------------------------

type MrkdwnText = { type: 'mrkdwn'; text: string };
type PlainText = { type: 'plain_text'; text: string; emoji?: boolean };
type ImageElement = { type: 'image'; image_url: string; alt_text: string };
type ButtonElement = {
  type: 'button';
  text: PlainText;
  action_id: string;
  value?: string;
};

type SectionAccessory = ImageElement | ButtonElement;

type ShortcutModalBlock =
  | { type: 'section'; text: MrkdwnText; accessory?: SectionAccessory }
  | { type: 'context'; elements: Array<MrkdwnText> }
  | { type: 'header'; text: PlainText }
  | { type: 'divider' }
  | { type: 'actions'; elements: ButtonElement[] };

export type ShortcutModalView = {
  blocks: ShortcutModalBlock[];
  callback_id?: string;
  close?: PlainText;
  private_metadata?: string;
  submit?: PlainText;
  title: PlainText;
  type: 'modal';
};

// Legacy simple modal input (used for confirmations / errors)
interface ShortcutModalInput {
  callbackId?: string;
  close?: string;
  context?: string;
  lines: string[];
  privateMetadata?: string;
  submit?: string;
  title: string;
}

interface ShortcutRuntimeService {
  getStatus(agentId: string): Promise<AgentStatusSummary>;
  stopCurrentItem(agentId: string): Promise<void>;
}

interface ShortcutAgentService {
  serviceFor(agentId: string): {
    getConfig(): Promise<AgentConfig>;
  };
}

type ReminderServiceFactory = (agentId: string) => ReminderService;

interface SlackShortcutServiceDeps {
  activityRecorder?: ActivityRecorder;
  agentService?: ShortcutAgentService;
  now?: () => Date;
  reminderServiceForAgent?: ReminderServiceFactory;
  runtimeService?: ShortcutRuntimeService;
}

interface StopConfirmMetadata {
  itemId?: string;
}

export class SlackShortcutService {
  private readonly activityRecorder: ActivityRecorder;
  private readonly agentService: ShortcutAgentService;
  private readonly now: () => Date;
  private readonly reminderServiceForAgent: ReminderServiceFactory;
  private readonly runtimeService: ShortcutRuntimeService;

  constructor(deps: SlackShortcutServiceDeps = {}) {
    this.activityRecorder = deps.activityRecorder ?? defaultActivityRecorder;
    this.agentService = deps.agentService ?? defaultAgentRegistryService;
    this.now = deps.now ?? (() => new Date());
    this.reminderServiceForAgent = deps.reminderServiceForAgent ?? reminderServiceForAgent;
    this.runtimeService = deps.runtimeService ?? defaultRuntimeService;
  }

  async handleShortcut(input: {
    agentId: string;
    body: SlackShortcutBody;
    client: WebClient;
  }): Promise<void> {
    switch (input.body.callback_id) {
      case 'anima.home':
        await this.showHome(input);
        return;
      default:
        await this.openModal(input.client, input.body, {
          title: 'Shortcut unavailable',
          lines: ['This shortcut is not supported by this Anima build yet.'],
        });
    }
  }

  async confirmStop(input: {
    agentId: string;
    userId?: string;
    view: SlackShortcutView;
  }): Promise<ShortcutModalView> {
    const status = await this.runtimeService.getStatus(input.agentId);
    const metadata = stopConfirmMetadata(input.view);
    if (!status.currentItemId) {
      await this.recordShortcutActivity(input.agentId, 'anima.shortcut.stop', {
        outcome: 'idle',
        userId: input.userId,
      });
      return shortcutModal({
        title: 'Nothing running',
        lines: ['This agent is idle. No current turn was stopped.'],
      });
    }
    if (metadata.itemId && metadata.itemId !== status.currentItemId) {
      await this.recordShortcutActivity(input.agentId, 'anima.shortcut.stop', {
        currentItemId: status.currentItemId,
        requestedItemId: metadata.itemId,
        outcome: 'item_changed',
        userId: input.userId,
      });
      return shortcutModal({
        title: 'Item changed',
        lines: [
          'The current turn changed after this confirmation opened.',
          'Open Stop again to interrupt the new current turn.',
        ],
      });
    }

    try {
      await this.runtimeService.stopCurrentItem(input.agentId);
    } catch (error) {
      if (!(error instanceof RuntimeServiceError) || error.statusCode !== 409) throw error;
      await this.recordShortcutActivity(input.agentId, 'anima.shortcut.stop', {
        outcome: 'idle',
        userId: input.userId,
      });
      return shortcutModal({
        title: 'Nothing running',
        lines: ['This agent became idle before Stop was applied.'],
      });
    }
    await this.recordShortcutActivity(input.agentId, 'anima.shortcut.stop', {
      itemId: status.currentItemId,
      outcome: 'stop_requested',
      userId: input.userId,
    });
    return shortcutModal({
      title: 'Stop requested',
      lines: [
        `Requested stop for current item \`${escapeMrkdwn(status.currentItemId)}\`.`,
      ],
    });
  }

  /** Handles the "View all reminders" button — pushes a read-only reminder list. */
  async showRemindersView(input: {
    agentId: string;
    triggerId: string;
    client: WebClient;
  }): Promise<void> {
    const reminders = await this.reminderServiceForAgent(input.agentId).listReminders({
      statuses: ['scheduled'],
    });
    await input.client.views.push({
      trigger_id: input.triggerId,
      view: remindersView(reminders, this.now()),
    });
  }

  /** Handles a per-reminder "View →" button — pushes a single-reminder detail view. */
  async showReminderDetailView(input: {
    agentId: string;
    reminderId: string;
    triggerId: string;
    client: WebClient;
  }): Promise<void> {
    const reminders = await this.reminderServiceForAgent(input.agentId).listReminders({
      statuses: ['scheduled'],
    });
    const reminder = reminders.find((r) => r.reminderId === input.reminderId);
    if (!reminder) return; // reminder cancelled or not found — silently ignore
    await input.client.views.push({
      trigger_id: input.triggerId,
      view: reminderDetailView(reminder, this.now()),
    });
  }

  private async showHome(input: { agentId: string; body: SlackShortcutBody; client: WebClient }): Promise<void> {
    const [agent, status, reminders] = await Promise.all([
      this.agentService.serviceFor(input.agentId).getConfig(),
      this.runtimeService.getStatus(input.agentId),
      this.reminderServiceForAgent(input.agentId).listReminders({ statuses: ['scheduled'] }),
    ]);
    if (!input.body.trigger_id) return;
    await input.client.views.open({
      trigger_id: input.body.trigger_id,
      view: homeView(agent, status, reminders, this.now()),
    });
  }

  async handMessageToAgent(input: {
    agentId: string;
    body: SlackShortcutBody;
  }): Promise<void> {
    const message = input.body.message;
    const channelId = input.body.channel?.id;
    const teamId = input.body.team?.id;
    if (!message?.ts || !channelId || !teamId) {
      await this.respondToMessageShortcut(input.body, { text: 'I could not read the source message for this handoff.' });
      return;
    }

    const receivedAt = slackTsToIsoOrNow(message.ts);
    const now = nowIso();
    const threadTs = message.thread_ts ?? message.ts;
    const item: InboxItem = {
      actor: {
        ...(message.user ? { userId: message.user } : {}),
      },
      channelId,
      ...(input.body.channel?.name ? { channelName: input.body.channel.name } : {}),
      handling: { createdAt: now, queuedAt: now, status: 'queued', updatedAt: now },
      id: `slack-shortcut-handoff:${teamId}:${channelId}:${message.ts}`,
      kind: 'slack',
      messageTs: message.ts,
      receivedAt,
      teamId,
      text: handoffText(message.text ?? '', input.body.user?.id),
      threadTs,
    };
    const result = await new WakeQueueService(input.agentId).enqueue(item);
    await this.recordShortcutActivity(input.agentId, 'anima.shortcut.handoff', {
      channelId,
      duplicate: result.duplicate,
      itemId: result.item.id,
      messageTs: message.ts,
      queued: result.queued,
      threadTs,
      userId: input.body.user?.id,
    });
    await this.respondToMessageShortcut(input.body, {
      text: result.duplicate
        ? 'This message was already handed to the agent.'
        : 'Handed to the agent. It will reply in this thread.',
    });
  }

  private async openModal(client: WebClient, body: SlackShortcutBody, input: ShortcutModalInput): Promise<void> {
    if (!body.trigger_id) return;
    await client.views.open({
      trigger_id: body.trigger_id,
      view: shortcutModal(input),
    });
  }

  private async respondToMessageShortcut(body: SlackShortcutBody, input: { text: string }): Promise<void> {
    if (!body.response_url) return;
    await fetch(body.response_url, {
      body: JSON.stringify({ response_type: 'ephemeral', text: input.text }),
      headers: { 'content-type': 'application/json; charset=utf-8' },
      method: 'POST',
    });
  }

  private async recordShortcutActivity(agentId: string, type: string, payload: Record<string, unknown>): Promise<void> {
    await this.activityRecorder.record(agentId, { type, payload });
  }
}

export const defaultSlackShortcutService = new SlackShortcutService();

export function userIdFromShortcutBody(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  const user = body['user'];
  return isRecord(user) && typeof user['id'] === 'string' ? user['id'] : undefined;
}

// ---------------------------------------------------------------------------
// Home view builder
// ---------------------------------------------------------------------------

/**
 * Builds the redesigned Home modal:
 *
 *  ┌─ agent identity (name + role) ─────────────────────────────┐
 *  ├─ divider ───────────────────────────────────────────────────┤
 *  ├─ status (✅ Idle / ⚙️ Working · 14m / ⏳ Queued) ──────────┤
 *  │  [queued context line if state='queued']                    │
 *  ├─ divider ───────────────────────────────────────────────────┤
 *  ├─ reminders (preview or "None scheduled") ──────────────────┤
 *  │  [View all (N) →] button if N > 0                          │
 *  └─────────────────────────────────────────────────────────────┘
 *
 *  Busy state: modal submit = "Stop" (carries itemId in private_metadata,
 *  triggers the existing confirmStop flow — no raw ID shown in the UI).
 */
function homeView(
  agent: AgentConfig,
  status: AgentStatusSummary,
  reminders: Reminder[],
  now: Date,
): ShortcutModalView {
  const displayName = agent.profile.displayName;
  const role = agent.profile.role;
  const state: 'idle' | 'busy' | 'queued' = status.currentItemId
    ? 'busy'
    : status.queueDepth > 0
      ? 'queued'
      : 'idle';

  const blocks: ShortcutModalBlock[] = [];

  // ── Agent identity ──────────────────────────────────────────
  // Name + role (if set) + owner attribution on a context line below
  const identityText = role.trim()
    ? `*${escapeMrkdwn(displayName)}*\n${escapeMrkdwn(role)}`
    : `*${escapeMrkdwn(displayName)}*`;
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: identityText } });

  if (agent.owner) {
    const ownerLabel = agent.owner.handle
      ? `@${escapeMrkdwn(agent.owner.handle)}`
      : escapeMrkdwn(agent.owner.displayName);
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Owner: ${ownerLabel}` }],
    });
  }

  blocks.push({ type: 'divider' });

  // ── Status ──────────────────────────────────────────────────
  const statusEmoji = state === 'busy' ? ':gear:' : state === 'queued' ? ':hourglass_flowing_sand:' : ':white_check_mark:';
  const statusLabel = state === 'busy' ? 'Working' : state === 'queued' ? 'Queued' : 'Idle';
  const elapsed = state === 'busy' && status.currentItemStartedAt
    ? `  ·  ${elapsedLabel(status.currentItemStartedAt, now)}`
    : '';
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `${statusEmoji}  *${statusLabel}*${elapsed}` },
  });
  // Queue depth intentionally omitted — "X items queued" is engine jargon
  // that most users don't need to see (steering mode).

  blocks.push({ type: 'divider' });

  // ── Reminders ───────────────────────────────────────────────
  if (reminders.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: ':alarm_clock:  *Reminders*\n_None scheduled_' },
    });
  } else {
    // Preview: first upcoming reminder (listReminders returns sorted by nextDueAt)
    const next = reminders[0]!;
    const nextDue = next.nextDueAt ? humanDueLabel(next.nextDueAt, now) : '';
    const preview = nextDue
      ? `_Next: "${escapeMrkdwn(next.title)}"  ·  ${nextDue}_`
      : `_${escapeMrkdwn(next.title)}_`;
    const count = reminders.length;
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:alarm_clock:  *Reminders*  ·  ${count} scheduled\n${preview}`,
      },
    });
    blocks.push({
      type: 'actions',
      elements: [{
        action_id: SLACK_VIEW_REMINDERS_ACTION_ID,
        text: { emoji: true, text: `View all (${count})  →`, type: 'plain_text' },
        type: 'button',
      }],
    });
  }

  return {
    blocks,
    close: { text: 'Close', type: 'plain_text' },
    // Busy state: carry Stop confirmation — itemId in private_metadata, submit = 'Stop'.
    // The raw itemId never appears in any block text, only in metadata for confirmStop().
    ...(state === 'busy' ? {
      callback_id: SLACK_STOP_CONFIRM_VIEW_CALLBACK_ID,
      private_metadata: JSON.stringify({ itemId: status.currentItemId } satisfies StopConfirmMetadata),
      submit: { text: 'Stop', type: 'plain_text' },
    } : {}),
    title: { text: 'Home', type: 'plain_text' },
    type: 'modal',
  };
}

// ---------------------------------------------------------------------------
// Reminders drill-down view builder (views.push, read-only)
// ---------------------------------------------------------------------------

/**
 * Read-only list of scheduled reminders. Each item has a "View →" accessory
 * button that pushes a detail view for that reminder (title + due + instructions).
 */
function remindersView(reminders: Reminder[], now: Date): ShortcutModalView {
  const blocks: ShortcutModalBlock[] = [];

  if (reminders.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No reminders scheduled._' },
    });
  } else {
    for (const r of reminders) {
      const due = r.nextDueAt ? humanDueLabel(r.nextDueAt, now) : '';
      const recurrence = scheduleLabel(r.schedule);
      const meta = [due, recurrence].filter(Boolean).join('  ·  ');
      blocks.push({
        accessory: {
          action_id: SLACK_VIEW_REMINDER_DETAIL_ACTION_ID,
          text: { emoji: false, text: 'View →', type: 'plain_text' },
          type: 'button',
          value: r.reminderId,
        },
        text: {
          text: `*${escapeMrkdwn(r.title)}*${meta ? `\n_${escapeMrkdwn(meta)}_` : ''}`,
          type: 'mrkdwn',
        },
        type: 'section',
      });
    }
  }

  return {
    blocks,
    close: { text: 'Close', type: 'plain_text' },
    title: { text: 'Reminders', type: 'plain_text' },
    type: 'modal',
  };
}

/**
 * Single-reminder detail view (views.push from the reminders list).
 * Shows full instructions — the main reason totoday wants to drill down.
 */
function reminderDetailView(reminder: Reminder, now: Date): ShortcutModalView {
  const blocks: ShortcutModalBlock[] = [];

  const due = reminder.nextDueAt ? humanDueLabel(reminder.nextDueAt, now) : '';
  const recurrence = scheduleLabel(reminder.schedule);
  const meta = [due, recurrence].filter(Boolean).join('  ·  ');

  // Title + due/schedule row
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*${escapeMrkdwn(reminder.title)}*${meta ? `\n_${escapeMrkdwn(meta)}_` : ''}`,
    },
  });

  // Instructions (the main content totoday wants to see).
  // Truncated to ~2900 chars to stay under Slack's 3000-char section limit;
  // in practice instructions are almost always under this, but agent-written
  // reminders can be long and Slack silently rejects the whole view if exceeded.
  // Limit is applied *after* escapeMrkdwn so HTML entity expansion
  // (&lt; &gt; &amp; = 3-4 chars each) doesn't sneak us past 3000.
  const SECTION_LIMIT = 2900;
  if (reminder.instructions.trim()) {
    const escaped = escapeMrkdwn(reminder.instructions);
    const text = escaped.length > SECTION_LIMIT
      ? `${escaped.slice(0, SECTION_LIMIT)}…`
      : escaped;
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text },
    });
  }

  return {
    blocks,
    // Use "Close" not "Back" — in a views.push stack, Slack's bottom close button
    // closes the *entire* modal (not just the top view). Navigation back one level
    // uses Slack's native ← arrow in the top-left. "Back" would be misleading.
    close: { text: 'Close', type: 'plain_text' },
    title: { text: 'Reminder', type: 'plain_text' },
    type: 'modal',
  };
}

// ---------------------------------------------------------------------------
// Simple modal (confirmations, errors) — unchanged from previous design
// ---------------------------------------------------------------------------

function shortcutModal(input: ShortcutModalInput): ShortcutModalView {
  type LegacyBlock =
    | { type: 'section'; text: MrkdwnText }
    | { type: 'context'; elements: Array<MrkdwnText> };
  const blocks: LegacyBlock[] = [
    ...input.lines.map((line): { type: 'section'; text: MrkdwnText } => ({
      text: { text: line, type: 'mrkdwn' },
      type: 'section',
    })),
    ...(input.context ? [{
      elements: [{ text: input.context, type: 'mrkdwn' as const }],
      type: 'context' as const,
    }] : []),
  ];
  return {
    blocks,
    ...(input.callbackId ? { callback_id: input.callbackId } : {}),
    close: { text: input.close ?? 'Close', type: 'plain_text' },
    ...(input.privateMetadata ? { private_metadata: input.privateMetadata } : {}),
    ...(input.submit ? { submit: { text: input.submit, type: 'plain_text' } } : {}),
    title: { text: input.title.slice(0, 24), type: 'plain_text' },
    type: 'modal',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "in 2h", "in 45m", "in 1d 3h", "overdue" */
function humanDueLabel(dueAt: string, now: Date): string {
  const ms = Date.parse(dueAt) - now.getTime();
  if (ms < 0) return 'overdue';
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return 'in <1m';
  if (totalMin < 60) return `in ${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `in ${d}d ${rh}h` : `in ${d}d`;
}

/** "repeating daily", "weekly Mon/Wed", "every 4h", "once" */
function scheduleLabel(schedule: ReminderSchedule): string {
  switch (schedule.kind) {
    case 'once': return 'once';
    case 'daily': return 'repeating daily';
    case 'weekly': return `weekly ${schedule.weekdays.slice(0, 3).join('/')}`;
    case 'interval': {
      const ms = schedule.intervalMs;
      if (ms < 3_600_000) return `every ${Math.round(ms / 60_000)}m`;
      if (ms < 86_400_000) return `every ${Math.round(ms / 3_600_000)}h`;
      return `every ${Math.round(ms / 86_400_000)}d`;
    }
  }
}

function elapsedLabel(startedAt: string, now: Date): string {
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return 'elapsed unknown';
  const seconds = Math.max(0, Math.floor((now.getTime() - startedMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}


function slackTsToIsoOrNow(ts: string): string {
  const seconds = Number(ts.split('.')[0]);
  if (!Number.isFinite(seconds)) return nowIso();
  return new Date(seconds * 1000).toISOString();
}

function stopConfirmMetadata(view: SlackShortcutView): StopConfirmMetadata {
  if (!view.private_metadata) return {};
  try {
    const parsed = JSON.parse(view.private_metadata) as unknown;
    if (!isRecord(parsed)) return {};
    const itemId = typeof parsed['itemId'] === 'string' ? parsed['itemId'] : undefined;
    return itemId ? { itemId } : {};
  } catch {
    return {};
  }
}

function handoffText(text: string, handedByUserId: string | undefined): string {
  const body = text.trim() || '(message had no text)';
  return [
    handedByUserId
      ? `<@${handedByUserId}> used the Slack message shortcut to hand you this message as a task.`
      : 'A teammate used the Slack message shortcut to hand you this message as a task.',
    'Reply in this thread with your result.',
    '',
    body,
  ].join('\n');
}

function escapeMrkdwn(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
