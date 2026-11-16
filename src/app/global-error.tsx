'use client';

/** The whole app crashed, layout included (piece 13): minimal page, reported. */

import { useEffect } from 'react';

import { reportError } from '@/features/errors/errorReporting';
import { isStaleBuildError, reloadOnce } from '@/features/install/buildVersion';
import { useT } from '@/shared/i18n';

import './globals.css';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    // An old build meeting a new one after a deploy: a fresh load fixes it.
    if (isStaleBuildError(error) && reloadOnce()) return;
    reportError('crash', error);
  }, [error]);
  return (
    <html lang="en">
      <body>
        <main className="os-page grid place-items-center px-4">
          <section className="w-full max-w-md os-panel p-6 text-white">
            <p className="text-xs font-semibold text-red-300">{t('crash.kicker')}</p>
            <h1 className="mt-1 text-2xl font-semibold">{t('crash.appTitle')}</h1>
            <p className="mt-2 text-sm text-slate-400">{t('crash.appDetail')}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={reset} className="os-success justify-center px-4 py-2 text-sm">{t('crash.tryAgain')}</button>
              <a href="/start" className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200">{t('crash.startPage')}</a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
