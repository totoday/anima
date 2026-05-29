/**
 * Anima brand mark — the same lightning-bolt / "A" shape used in
 * public/favicon.svg, rendered as an inline SVG so it scales crisply at
 * any size and inherits `currentColor` from its parent context.
 *
 * Usage: <AnimaIcon className="h-4 w-4 text-accent" />
 */
export default function AnimaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 46" fill="currentColor" className={className} aria-hidden="true">
      <path d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z" />
    </svg>
  );
}
