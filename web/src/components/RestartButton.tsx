import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { fetchAgents, fetchAgentStatuses } from '@/api/agents';
import { pingHealth, restartServices } from '@/api/system';
import { Button } from './ui/button';
import { queryKeys } from '@/lib/query-keys';

type Phase = 'idle' | 'restarting' | 'recovered' | 'failed';

const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_INTERVAL_MS = 1_000;
const ACTIVE_NAME_INLINE_LIMIT = 4;

export default function RestartButton({ compact = false }: { compact?: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number>(0);
  const { data: agents = [] } = useQuery({ queryKey: queryKeys.agents(), queryFn: fetchAgents });
  const { data: agentStatuses = [] } = useQuery({ queryKey: queryKeys.agentStatuses(), queryFn: fetchAgentStatuses });

  // Snapshot the active-agent set at confirm time so the modal copy doesn't
  // flicker if SSE pushes mid-decision. Re-derived each render until the
  // user opens the dialog — they should see the most current state when
  // they reach for the button.
  const activeNames = computeActiveAgentNames(agents, agentStatuses);

  async function performRestart() {
    setConfirmOpen(false);
    setError(null);
    try {
      await restartServices();
      startedAt.current = Date.now();
      setPhase('restarting');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('failed');
    }
  }

  useEffect(() => {
    if (phase !== 'restarting') return;
    let sawDown = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (Date.now() - startedAt.current > HEALTH_TIMEOUT_MS) {
        setError('Restart timed out after 30s. Check logs.');
        setPhase('failed');
        return;
      }
      const ok = await pingHealth();
      if (!ok) {
        sawDown = true;
      } else if (sawDown) {
        // Only treat health as "recovered" once we've observed the
        // web app go down — otherwise we're seeing the pre-restart
        // web app still answering and would skip the actual restart.
        setPhase('recovered');
        window.location.reload();
        return;
      }
      timeoutId = setTimeout(tick, HEALTH_POLL_INTERVAL_MS);
    }

    timeoutId = setTimeout(tick, HEALTH_POLL_INTERVAL_MS);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [phase]);

  return (
    <>
      {compact ? (
        /* Compact variant — icon + label, right-aligned in a row.
           Used by ServerPanel to keep the trigger away from the sidebar
           footer Server button. All modal/overlay/polling logic unchanged. */
        <button
          onClick={() => {
            if (phase === 'idle') setConfirmOpen(true);
          }}
          disabled={phase === 'restarting'}
          className={[
            'flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] transition-colors',
            phase === 'restarting'
              ? 'cursor-wait text-text-on-spine-subtle'
              : 'cursor-pointer border border-spine-border/60 text-text-on-spine-muted hover:border-spine-border hover:text-text-on-spine focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
          ].join(' ')}
          title={phase === 'failed' && error ? error : 'Restart Anima services'}
        >
          <RefreshCw className={`h-2.5 w-2.5 ${phase === 'restarting' ? 'animate-spin' : ''}`} />
          <span>{phase === 'restarting' ? 'Restarting…' : 'Restart'}</span>
        </button>
      ) : (
        /* Default variant — full-width chrome bar (sidebar footer). */
        <>
          <button
            onClick={() => {
              if (phase === 'idle') setConfirmOpen(true);
            }}
            disabled={phase === 'restarting'}
            className={[
              'chrome flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-[11px] uppercase tracking-[0.1em] transition-colors',
              phase === 'restarting'
                ? 'cursor-wait text-text-on-spine-subtle'
                : 'cursor-pointer text-text-on-spine-muted hover:bg-spine-elevated hover:text-text-on-spine focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
            ].join(' ')}
            title="Restart Anima services"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${phase === 'restarting' ? 'animate-spin' : ''}`} />
            <span>{phase === 'restarting' ? 'Restarting…' : 'Restart services'}</span>
          </button>
          {phase === 'failed' && error && (
            <div className="mt-1 px-2 text-[11px] text-health-error">{error}</div>
          )}
        </>
      )}
      {confirmOpen && (
        <RestartConfirmModal
          activeNames={activeNames}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void performRestart()}
        />
      )}
      {phase === 'restarting' && <RestartOverlay />}
    </>
  );
}

// Modal: editorial overlay (not the inline warn-panel pattern Profile uses
// for in-view confirms — Restart is a global destructive action, so it gets
// a true overlay). Palette escalates with risk: idle = health-warn, active
// agents present = health-error. Same family as the failure-row 3-signal
// stack — acknowledges risk without rendering panic.
function RestartConfirmModal({
  activeNames,
  onCancel,
  onConfirm,
}: {
  activeNames: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const hasActive = activeNames.length > 0;
  const palette = hasActive
    ? { border: 'border-health-error/40', bg: 'bg-health-error-soft', rule: 'bg-health-error' }
    : { border: 'border-health-warn/40', bg: 'bg-health-warn-soft', rule: 'bg-health-warn' };

  // Esc to cancel; click on backdrop also cancels. Confirm requires explicit
  // button press.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-page/70 backdrop-blur-sm"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="restart-confirm-title"
        className={`relative w-full max-w-xl rounded-sm border ${palette.border} ${palette.bg} p-7 pl-8 shadow-deep`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal proportions:
            sized as a true decision-stage overlay, not a paragraph callout
            like Profile's inline confirm-rotate panel. Wider (max-w-xl),
            more breathing room (p-7), bumped type scale (17/15), default
            button size (h-8) so the destructive primary feels weighty
            enough for a global restart. */}
        <span aria-hidden className={`absolute left-0 top-4 bottom-4 w-px ${palette.rule}`} />
        <div id="restart-confirm-title" className="font-serif text-[17px] font-semibold text-text">
          {hasActive ? 'Restart while agents are still working?' : 'Restart Anima services?'}
        </div>
        <div className="font-serif mt-2 text-[15px] leading-relaxed text-text-muted">
          {hasActive ? (
            <ActiveBody names={activeNames} />
          ) : (
            'The web app reconnects automatically. Provider sessions and reminder schedules persist.'
          )}
        </div>
        <div className="mt-5 flex gap-2">
          <Button onClick={onConfirm} variant="destructive">
            {hasActive ? 'Restart anyway' : 'Restart'}
          </Button>
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// Body for the active state: "<count> agent(s) mid-item: <names>. Restarting
// will interrupt their current items." Names inline up to ACTIVE_NAME_INLINE_LIMIT
// — beyond that, collapse with "+N others" to keep the line readable. iris-
// locked structure (1779216910.360489): specific > abstract; named agents
// give restart decision context.
function ActiveBody({ names }: { names: string[] }) {
  const count = names.length;
  const plural = count === 1 ? '' : 's';
  let listLabel: string;
  if (count <= ACTIVE_NAME_INLINE_LIMIT) {
    listLabel = names.join(', ');
  } else {
    const head = names.slice(0, ACTIVE_NAME_INLINE_LIMIT).join(', ');
    const rest = count - ACTIVE_NAME_INLINE_LIMIT;
    listLabel = `${head}, +${rest} other${rest === 1 ? '' : 's'}`;
  }
  return (
    <>
      {count} agent{plural} mid-item: {listLabel}. Restarting will interrupt their current items.
    </>
  );
}

function computeActiveAgentNames(
  agents: { id: string; profile?: { displayName?: string } }[],
  agentStatuses: { agentId: string; currentItemId?: string; queueDepth: number }[],
): string[] {
  const nameById = new Map(agents.map((a) => [a.id, a.profile?.displayName ?? a.id]));
  const active: string[] = [];
  for (const status of agentStatuses) {
    if (status.currentItemId || status.queueDepth > 0) {
      active.push(nameById.get(status.agentId) ?? status.agentId);
    }
  }
  return active;
}

function RestartOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-page/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-sm border border-border-soft bg-surface px-10 py-7 shadow-deep">
        <RefreshCw className="h-6 w-6 animate-spin text-accent" />
        <div className="font-serif text-[16px] font-medium text-text">
          Restarting Anima services…
        </div>
        <div className="font-sans text-[12px] text-text-muted">
          The web app will reload automatically when services are back.
        </div>
      </div>
    </div>
  );
}
