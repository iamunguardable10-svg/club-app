'use client';

/** A page crashed (piece 13): say so, report it, offer a way on. */

import { useEffect, useState } from 'react';

import { reportError } from '@/features/errors/errorReporting';
import { ReportProblemDialog } from '@/features/errors/ReportProblemDialog';
import { useT } from '@/shared/i18n';

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  const [reporting, setReporting] = useState(false);
  useEffect(() => reportError('crash', error), [error]);
  return (
    <main className="os-page grid place-items-center px-4">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/80 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-red-300">{t('crash.kicker')}</p>
        <h1 className="mt-1 text-2xl font-black">{t('crash.pageTitle')}</h1>
        <p className="mt-2 text-sm text-slate-400">{t('crash.pageDetail')}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="os-success justify-center px-4 py-2 text-sm">{t('crash.tryAgain')}</button>
          <a href="/" className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200">{t('crash.startPage')}</a>
          <button type="button" onClick={() => setReporting(true)} className="px-2 py-2 text-xs font-bold text-slate-400 underline">{t('crash.tellUs')}</button>
        </div>
      </section>
      <ReportProblemDialog isOpen={reporting} onClose={() => setReporting(false)} />
    </main>
  );
}
