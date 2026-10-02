/**
 * The two marks a message card needs, kept quiet so the text stays in front:
 * a pin for important messages (they stay on top until their date) and a
 * dot for what is new.
 */

export function PinIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4h6l-1 6 3 3H7l3-3-1-6z" />
      <path d="M12 16v5" />
    </svg>
  );
}

export function NewDot({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center">
      <span aria-hidden className="h-2 w-2 rounded-full bg-sky-400" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
