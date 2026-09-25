'use client';

/** The whole app crashed, layout included (piece 13): minimal page, reported. */

import { useEffect } from 'react';

import { reportError } from '@/features/errors/errorReporting';

import './globals.css';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError('crash', error), [error]);
  return (
    <html lang="en">
      <body>
        <main className="os-page grid place-items-center px-4">
          <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/80 p-6 text-white">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-red-300">Something went wrong</p>
            <h1 className="mt-1 text-2xl font-black">Club OS stopped working</h1>
            <p className="mt-2 text-sm text-slate-400">The error was reported automatically.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={reset} className="os-success justify-center px-4 py-2 text-sm">Try again</button>
              <a href="/" className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200">Start page</a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
