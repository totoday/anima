import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { fetchAgentReminders } from '@/api/agents';
import { queryKeys } from '@/lib/query-keys';
import { formatRelativeShort } from '@/lib/format';
import { useNow } from '@/hooks/useNow';
import type { Reminder, ReminderSchedule } from '@shared/reminder';

function describeSchedule(schedule: ReminderSchedule, nextDueAt?: string): string {
  if (schedule.kind === 'once') {
    if (!nextDueAt) return 'One-shot';
    return new Date(nextDueAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (schedule.kind === 'interval') {
    const minutes = Math.round(schedule.intervalMs / 60000);
    if (minutes < 60) return `Every ${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `Every ${hours} hour${hours === 1 ? '' : 's'}`;
    const days = Math.round(hours / 24);
    return `Every ${days} day${days === 1 ? '' : 's'}`;
  }
  if (schedule.kind === 'daily') return `Daily at ${schedule.time}`;
  const days = schedule.weekdays.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ');
  return `Weekly ${days} at ${schedule.time}`;
}

function ExpandedDetail({
  reminder,
  onViewStream,
}: {
  reminder: Reminder;
  onViewStream: () => void;
}) {
  return (
    <div className="space-y-4 rounded-sm border border-border-soft bg-surface-raised p-4">
      <div>
        <div className="caps text-text-muted">Instructions</div>
        <div className="font-serif mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-[1.6] text-text">
          {reminder.instructions}
        </div>
      </div>
      <div className="font-sans grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] tracking-wide text-text-muted">
        <div>
          <span className="text-text-subtle">Fired</span>{' '}
          <span className="font-mono ml-1">{reminder.firedCount}</span>
        </div>
        {reminder.lastFiredAt && (
          <div className="col-span-2">
            <span className="text-text-subtle">Last fired</span>{' '}
            {new Date(reminder.lastFiredAt).toLocaleString()}
          </div>
        )}
        {reminder.provenance && (
          <div className="col-span-2">
            <span className="text-text-subtle">Provenance</span>{' '}
            <span className="font-mono">
              {reminder.provenance.channelId} / {reminder.provenance.messageTs}
            </span>
          </div>
        )}
      </div>
      {reminder.lastFiredAt && (
        <button
          onClick={onViewStream}
          className="chrome text-[11px] uppercase tracking-[0.12em] text-text-muted underline decoration-border-soft underline-offset-4 hover:text-accent hover:decoration-accent"
        >
          View activity stream →
        </button>
      )}
    </div>
  );
}

function ActiveRow({
  reminder,
  now,
  onViewStream,
}: {
  reminder: Reminder;
  now: Date;
  onViewStream: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isRecurring = reminder.schedule.kind !== 'once';
  const nextDue = reminder.nextDueAt;

  return (
    <div className="border-b border-border-soft last:border-b-0">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="grid w-full grid-cols-[1fr_auto] items-start gap-3 px-1 py-3.5 text-left hover:bg-surface-elevated/40"
      >
        <div className="min-w-0">
          <div className="font-serif text-[15px] leading-snug text-text">{reminder.title}</div>
          <div className="font-sans mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] tracking-wide text-text-muted">
            <span>{describeSchedule(reminder.schedule, reminder.nextDueAt)}</span>
            {nextDue && (
              <>
                <span className="text-text-subtle">·</span>
                <span>next {formatRelativeShort(nextDue, now)}</span>
              </>
            )}
            {isRecurring && reminder.lastFiredAt && (
              <>
                <span className="text-text-subtle">·</span>
                <span>last fired {formatRelativeShort(reminder.lastFiredAt, now)}</span>
              </>
            )}
          </div>
        </div>
        <ChevronRight
          className={`mt-1.5 h-3.5 w-3.5 shrink-0 text-text-subtle transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (
        <div className="px-1 pb-4">
          <ExpandedDetail reminder={reminder} onViewStream={onViewStream} />
        </div>
      )}
    </div>
  );
}

function PastRow({
  reminder,
  now,
  onViewStream,
}: {
  reminder: Reminder;
  now: Date;
  onViewStream: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const when = reminder.cancelledAt ?? reminder.lastFiredAt ?? reminder.updatedAt;

  return (
    <div className="border-b border-border-soft last:border-b-0">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="grid w-full grid-cols-[1fr_auto] items-start gap-3 px-1 py-3.5 text-left hover:bg-surface-elevated/40"
      >
        <div className="min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-serif text-[15px] leading-snug text-text">{reminder.title}</span>
          {/* text-text (not muted) to ensure ≥WCAG AA contrast at 10px */}
          <span className="chrome shrink-0 rounded-sm border border-border-soft bg-surface-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-text">
            {reminder.status}
          </span>
          <span className="font-sans text-[11px] tracking-wide text-text-muted">
            {formatRelativeShort(when, now)}
          </span>
        </div>
        <ChevronRight
          className={`mt-1.5 h-3.5 w-3.5 shrink-0 text-text-subtle transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (
        <div className="px-1 pb-4">
          <ExpandedDetail reminder={reminder} onViewStream={onViewStream} />
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-baseline gap-4">
      <h2 className="caps text-text-muted">
        {title}
        <span className="ml-2 font-mono text-[11px] tracking-normal text-text-subtle">{count}</span>
      </h2>
      <span className="h-px flex-1 bg-border-soft" />
    </div>
  );
}

export default function Reminders() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  // Reset scroll to top when switching agents.
  useEffect(() => {
    containerRef.current?.scrollTo(0, 0);
  }, [agentId]);

  // Tick every minute so relative timestamps stay fresh.
  const now = useNow();

  const {
    data: reminders = [],
    error,
  } = useQuery({
    queryKey: queryKeys.agentReminders(agentId ?? ''),
    queryFn: () => fetchAgentReminders(agentId!),
    enabled: !!agentId,
  });

  const { active, past } = useMemo(() => {
    return {
      active: reminders
        .filter((r) => r.status === 'scheduled')
        .sort((a, b) => (a.nextDueAt ?? a.updatedAt).localeCompare(b.nextDueAt ?? b.updatedAt)),
      past: reminders
        .filter((r) => r.status === 'fired' || r.status === 'cancelled')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    };
  }, [reminders]);

  if (!agentId) return null;

  return (
    <div
      ref={containerRef}
      className="bg-surface h-full overflow-y-auto px-6 py-8 md:px-10 md:py-10"
    >
      <div className="max-w-3xl">
        {error && (
          <div className="mb-6 rounded-sm border border-border-soft bg-surface-raised px-4 py-3 text-[13px] text-text-subtle">
            {error instanceof Error ? error.message : String(error)}
          </div>
        )}
        <section className="first:mt-0">
          <SectionHeader title="Active" count={active.length} />
          {active.length === 0 ? (
            <div className="font-serif italic py-3 text-[14px] text-text-subtle">
              No active reminders.
            </div>
          ) : (
            <div className="divide-y divide-border-soft border-b border-border-soft">
              {active.map((r) => (
                <ActiveRow
                  key={r.reminderId}
                  reminder={r}
                  now={now}
                  onViewStream={() => navigate(`/agents/${agentId}/activity`)}
                />
              ))}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section className="mt-10">
            <SectionHeader title="Past" count={past.length} />
            <div className="divide-y divide-border-soft border-b border-border-soft">
              {past.map((r) => (
                <PastRow
                  key={r.reminderId}
                  reminder={r}
                  now={now}
                  onViewStream={() => navigate(`/agents/${agentId}/activity`)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
