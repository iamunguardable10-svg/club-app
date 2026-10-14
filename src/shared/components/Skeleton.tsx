/**
 * Placeholders for the parts of a screen whose data has not arrived yet. The
 * frame around them (header, navigation, titles) renders as usual; only the
 * content area is a skeleton. The blocks keep the size of the cards they
 * stand for, so nothing jumps when the data is there, and the shimmer is off
 * for people who prefer reduced motion.
 */

type BlockProps = { className?: string };

export function SkeletonBlock({ className = '' }: BlockProps) {
  return <div aria-hidden className={`rounded-3xl border border-slate-800/80 bg-slate-900/50 motion-safe:animate-pulse ${className}`} />;
}

/** The content of a typical screen: a large card and two rows below it. */
export function ScreenSkeleton({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={`grid gap-4 ${className}`}>
      <SkeletonBlock className="h-44" />
      <SkeletonBlock className="h-24" />
      <SkeletonBlock className="h-24" />
    </div>
  );
}
