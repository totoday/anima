import { forwardRef } from 'react';
import { Pencil } from 'lucide-react';

// ── Layout primitives ────────────────────────────────────────────────────────

export const Field = forwardRef<HTMLDivElement, { label: string; children: React.ReactNode; highlight?: boolean }>(
  function Field({ label, children, highlight }, ref) {
    return (
      <div
        ref={ref}
        className={[
          'grid grid-cols-[6rem_1fr] md:grid-cols-[8rem_1fr] items-start gap-3 md:gap-4 rounded-sm py-2.5 md:py-3 transition-[box-shadow] duration-300',
          highlight ? 'shadow-[0_0_0_2px_var(--color-accent)]' : 'shadow-none',
        ].join(' ')}
      >
        <span className="chrome pt-1 text-[11px] tracking-wide text-text-muted">{label}</span>
        <div className="min-w-0">{children}</div>
      </div>
    );
  },
);

export function ReadonlyValue({ value, mono = false }: { value?: string; mono?: boolean }) {
  if (value === undefined || value === null) {
    return <span className="font-serif italic text-[14px] text-text-subtle">—</span>;
  }
  return (
    <span className={mono ? 'font-mono text-[12px] md:text-[13px] text-text' : 'font-serif text-[13px] md:text-[15px] text-text'}>
      {value}
    </span>
  );
}

// Used for the "This session" block heading.
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="caps text-text-muted">{title}</h2>
        <span className="h-px flex-1 bg-border-soft" />
      </div>
      <div>{children}</div>
    </section>
  );
}

// ── Editing primitives ────────────────────────────────────────────────────────

export function EditAffordance({
  onEdit,
  children,
}: {
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}
      className="group -mx-2 -my-1 flex min-w-0 cursor-text items-center gap-2 rounded-sm px-2 py-1 outline-none transition-colors hover:bg-surface-elevated focus-visible:bg-surface-elevated"
    >
      <span className="min-w-0">{children}</span>
      <Pencil className="size-3.5 shrink-0 text-text-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-50" />
    </div>
  );
}

export function SavedHint() {
  return <span className="font-sans text-[11px] tracking-wide text-health-ok">Saved</span>;
}

export function ErrorHint({ message }: { message: string }) {
  return <span className="font-sans text-[11px] tracking-wide text-health-error">{message}</span>;
}

export function extractError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
