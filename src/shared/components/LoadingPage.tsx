'use client';

import { useT, type MessageKey } from '@/shared/i18n';

/** A page-sized "Loading …" card, e.g. as a Suspense fallback in a server page. */
export function LoadingPage({ messageKey }: { messageKey: MessageKey }) {
  const t = useT();
  return (
    <main className="os-page">
      <div className="os-container">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-white">{t(messageKey)}</section>
      </div>
    </main>
  );
}
