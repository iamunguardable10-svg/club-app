'use client';

import { useT, type MessageKey } from '@/shared/i18n';
import { ScreenSkeleton } from './Skeleton';

/**
 * A page-sized placeholder in the shape of a page (a head, then cards), e.g.
 * as a Suspense fallback: nothing jumps when the real page arrives, and there
 * is no spinner and no "Loading …" sentence to read.
 */
export function LoadingPage({ messageKey }: { messageKey: MessageKey }) {
  const t = useT();
  return (
    <main className="os-page md:pl-60">
      <div className="mx-auto w-full max-w-6xl px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-8 md:pt-8">
        <div aria-hidden className="os-skeleton h-7 w-40 rounded-lg" />
        <ScreenSkeleton label={t(messageKey)} className="mt-6" />
      </div>
    </main>
  );
}
