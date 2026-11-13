'use client';

/**
 * The load terms, explained once (Ben, 2026-11-13: "the technical terms
 * belong in it; the first time someone opens Load they are explained").
 * Four short cards, one at a time: for players RPE, AU, ACWR and the rest;
 * for coaches what the players enter, ACWR, how to steer with it, and the
 * rest. Opens by itself the first time (`useLoadIntro`), and from the
 * "i" whenever wanted.
 */

import { useEffect, useState, type ReactNode } from 'react';

import { ZoneScale } from '@/features/load/LoadHints';
import { dismissHint, isHintDismissed } from '@/shared/data';
import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';
import { useT, type MessageKey } from '@/shared/i18n';

export type LoadIntroRole = 'athlete' | 'coach';

type Page = { title: MessageKey; body: MessageKey[]; extra?: 'scale' | 'rpe' };

const PAGES: Record<LoadIntroRole, Page[]> = {
  athlete: [
    { title: 'loadIntro.player.rpe.title', body: ['loadIntro.player.rpe.body'], extra: 'rpe' },
    { title: 'loadIntro.player.au.title', body: ['loadIntro.player.au.body'] },
    { title: 'loadIntro.acwr.title', body: ['loadIntro.player.acwr.body'], extra: 'scale' },
    { title: 'loadIntro.more.title', body: ['loadIntro.more.room', 'loadIntro.more.monotony', 'loadIntro.more.strain', 'loadIntro.more.forecast'] },
  ],
  coach: [
    { title: 'loadIntro.coach.input.title', body: ['loadIntro.coach.input.body'], extra: 'rpe' },
    { title: 'loadIntro.acwr.title', body: ['loadIntro.coach.acwr.body'], extra: 'scale' },
    { title: 'loadIntro.coach.steer.title', body: ['loadIntro.coach.steer.low', 'loadIntro.coach.steer.ok', 'loadIntro.coach.steer.high', 'loadIntro.coach.steer.forecast'] },
    { title: 'loadIntro.more.title', body: ['loadIntro.more.room', 'loadIntro.more.monotony', 'loadIntro.coach.more.start'] },
  ],
};

const HINT = { athlete: 'loadIntroPlayer', coach: 'loadIntroCoach' } as const;

/** Open the first time on this device; `ready` waits until there is something to explain. */
export function useLoadIntro(role: LoadIntroRole, ready = true) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (ready && !isHintDismissed(HINT[role])) setOpen(true); }, [ready, role]);
  return {
    open,
    show: () => setOpen(true),
    close: () => { dismissHint(HINT[role]); setOpen(false); },
  };
}

function RpeScale() {
  const t = useT();
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
      {([[1, 'rpe.1'], [5, 'rpe.5'], [10, 'rpe.10']] as const).map(([value, word]) => (
        <div key={value} className="rounded-2xl border border-slate-800 bg-slate-900/70 px-2 py-3">
          <p className="text-2xl font-black tabular-nums text-emerald-200">{value}</p>
          <p className="mt-0.5 text-[11px] font-bold text-slate-400">{t(word)}</p>
        </div>
      ))}
    </div>
  );
}

export function LoadIntro({ role, onClose }: { role: LoadIntroRole; onClose: () => void }) {
  const t = useT();
  const pages = PAGES[role];
  const [index, setIndex] = useState(0);
  const page = pages[index];
  const last = index === pages.length - 1;
  useBodyScrollLock(true);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lines: ReactNode = page.body.length === 1
    ? <p className="mt-2 text-sm leading-relaxed text-slate-300">{t(page.body[0])}</p>
    : <ul className="mt-3 grid gap-2.5">{page.body.map((key) => <li key={key} className="text-sm leading-relaxed text-slate-300">{t(key)}</li>)}</ul>;

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/80 px-3 pb-3 pt-10 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="load-intro-title">
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300">{t('loadIntro.kicker', { step: index + 1, total: pages.length })}</p>
          <button type="button" onClick={onClose} className="text-xs font-bold text-slate-400 underline">{t('loadIntro.skip')}</button>
        </div>
        <div key={index} className="wizard-step">
          <h2 id="load-intro-title" className="mt-2 text-2xl font-black leading-tight text-white">{t(page.title)}</h2>
          {lines}
          {page.extra === 'scale' ? <ZoneScale /> : page.extra === 'rpe' ? <RpeScale /> : null}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <div className="flex flex-1 gap-1" aria-hidden>
            {pages.map((entry, position) => <span key={entry.title + position} className={`h-1.5 flex-1 rounded-full ${position <= index ? 'bg-emerald-300' : 'bg-slate-800'}`} />)}
          </div>
          {index > 0 ? <button type="button" onClick={() => setIndex(index - 1)} aria-label={t('onboarding.back')} className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-700 text-lg font-black text-slate-300">‹</button> : null}
          <button type="button" onClick={() => (last ? onClose() : setIndex(index + 1))} className="rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-black text-slate-950">
            {last ? t('loadIntro.done') : t('common.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
