/**
 * ⋯ overflow menu for per-agent lifecycle actions — Disable/Enable, Rotate
 * session, Remove agent. Used in both AgentHeader (desktop) and MobileTopBar.
 *
 * Renders the trigger button inline; confirm overlay modals use `fixed` so
 * they appear above everything regardless of containing context.
 */
import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Power, PowerOff, RotateCcw, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { disableAgent, enableAgent, removeAgent, rotateAgentSession, fetchAgents, refreshDashboardData } from '@/api/agents';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import ConfirmModal from './ConfirmModal';
import { queryKeys } from '@/lib/query-keys';



// ── AgentActionsMenu ──────────────────────────────────────────────────────────

/**
 * The ⋯ overflow menu for lifecycle actions. Renders a button + dropdown +
 * confirm overlay modals. Drop it anywhere in the header — the modals float
 * via fixed positioning.
 *
 * `buttonClassName` lets callers tweak sizing for desktop vs mobile contexts.
 */
export default function AgentActionsMenu({ buttonClassName }: { buttonClassName?: string }) {
  const { data: agents = [] } = useQuery({ queryKey: queryKeys.agents(), queryFn: fetchAgents });
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | undefined>();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | undefined>();
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | undefined>();

  // Click-outside to close the dropdown.
  useEffect(() => {
    if (!menuOpen) return;
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [menuOpen]);

  if (!agentId) return null;
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return null;
  const enabled = agent.enabled !== false;

  async function handleToggleEnabled(nextEnabled: boolean) {
    if (!agentId || toggling) return;
    setToggling(true);
    setToggleError(undefined);
    try {
      await (nextEnabled ? enableAgent(agentId) : disableAgent(agentId));
      setConfirmDisable(false);
      refreshDashboardData();
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : String(e));
    } finally {
      setToggling(false);
    }
  }

  async function handleRemoveAgent() {
    if (!agentId || removeBusy) return;
    setRemoveBusy(true);
    setRemoveError(undefined);
    try {
      await removeAgent(agentId);
      navigate('/');
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : String(e));
      setRemoveBusy(false);
    }
  }

  async function handleRotate() {
    if (!agentId || rotating) return;
    setRotating(true);
    setRotateError(undefined);
    try {
      await rotateAgentSession(agentId);
      setConfirmRotate(false);
      refreshDashboardData();
    } catch (e) {
      setRotateError(e instanceof Error ? e.message : String(e));
    } finally {
      setRotating(false);
    }
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <Button
          size="xs"
          variant="ghost"
          aria-label="More actions"
          onClick={() => setMenuOpen((v) => !v)}
          className={buttonClassName ?? 'min-h-[44px] min-w-[44px]'}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-10 mt-1 min-w-[180px] rounded-sm border border-border-soft bg-surface py-1 shadow-deep">
            {/* Disable / Enable — top, state-labeled, frequent + reversible */}
            {enabled ? (
              <button
                className="flex min-h-[44px] w-full items-center gap-2.5 px-3 text-left font-sans text-[13px] text-text-muted hover:bg-surface-elevated hover:text-text"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDisable(true);
                }}
              >
                <PowerOff className="h-3.5 w-3.5 shrink-0" />
                Disable when idle
              </button>
            ) : (
              <button
                disabled={toggling}
                className="flex min-h-[44px] w-full items-center gap-2.5 px-3 text-left font-sans text-[13px] text-text-muted hover:bg-surface-elevated hover:text-text disabled:opacity-50"
                onClick={() => {
                  setMenuOpen(false);
                  void handleToggleEnabled(true);
                }}
              >
                <Power className="h-3.5 w-3.5 shrink-0" />
                {toggling ? 'Saving...' : 'Enable'}
              </button>
            )}
            {/* Rotate session */}
            <button
              className="flex min-h-[44px] w-full items-center gap-2.5 px-3 text-left font-sans text-[13px] text-text-muted hover:bg-surface-elevated hover:text-text"
              onClick={() => {
                setMenuOpen(false);
                setConfirmRotate(true);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
              Rotate session
            </button>
            {/* Divider */}
            <div className="my-1 h-px bg-border-soft" />
            {/* Remove agent — destructive, bottom */}
            <button
              className="flex min-h-[44px] w-full items-center gap-2.5 px-3 text-left font-sans text-[13px] text-health-error hover:bg-health-error-soft"
              onClick={() => {
                setMenuOpen(false);
                setConfirmRemove(true);
              }}
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              Remove agent
            </button>
          </div>
        )}
      </div>

      {/* Confirm overlays — rendered via fixed positioning, work from any parent */}
      <ConfirmModal
        open={confirmDisable && enabled}
        title="Disable this agent?"
        description="If it is running now, it will stop after the current item finishes. Memory and session are preserved."
        variant="error"
        busy={toggling}
        error={toggleError}
        confirmLabel="Disable"
        busyLabel="Saving..."
        onConfirm={() => void handleToggleEnabled(false)}
        onCancel={() => {
          setConfirmDisable(false);
          setToggleError(undefined);
        }}
      />
      <ConfirmModal
        open={confirmRemove}
        title="Remove this agent?"
        description="The agent will stop running and its local Anima config will be deleted. Home files are not affected."
        variant="error"
        busy={removeBusy}
        error={removeError}
        confirmLabel="Remove"
        busyLabel="Removing…"
        onConfirm={() => void handleRemoveAgent()}
        onCancel={() => {
          setConfirmRemove(false);
          setRemoveError(undefined);
        }}
      />
      <ConfirmModal
        open={confirmRotate}
        title="Rotate primary session?"
        description="The current item keeps running. The next item starts fresh, and the current provider session is archived."
        variant="warn"
        busy={rotating}
        error={rotateError}
        confirmLabel="Confirm"
        busyLabel="Rotating…"
        onConfirm={() => void handleRotate()}
        onCancel={() => {
          setConfirmRotate(false);
          setRotateError(undefined);
        }}
      />
    </>
  );
}
