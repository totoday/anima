// Per-agent identity color (cycled by index) + initial for the avatar.
// Reminder/scheduled events use the dedicated violet slot.

const PALETTE = [
  'var(--color-agent-1)', // blue
  'var(--color-agent-2)', // green
  'var(--color-agent-3)', // amber
  'var(--color-agent-4)', // pink
];

export function agentColor(index: number): string {
  return PALETTE[index % PALETTE.length]!;
}

export function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed[0]!.toUpperCase();
}
