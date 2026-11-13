'use client';

/**
 * While someone looks around the demo club (docs/goal-2026-10-pilot-ready.md,
 * piece 3): a pill in the page head says this is an example club, switches
 * the role in place (no detour over the start page) and leads to the real
 * ways in. After the first thing that shows the point
 * of the app (a player sends an absence, a coach plans a session) it asks
 * once whether they like it.
 */

import { PILOT_MAIL } from '@/features/landing/pilotMail';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { HOME_FOR_ROLE } from '@/features/identity/IdentitySwitcher';
import { actAsDemoRole, leaveDemoFor } from '@/features/onboarding/demoRole';
import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';
import { useEscape } from '@/shared/hooks/useEscape';
import { dismissHint, isHintDismissed, isRemoteMode, isServerAvailable, useLocalDatabase, type IdentityRole, type LocalDatabase } from '@/shared/data';
import { useT, type MessageKey } from '@/shared/i18n';

const ROLES: { role: IdentityRole; label: MessageKey }[] = [
  { role: 'club', label: 'demo.bar.club' },
  { role: 'coach', label: 'demo.bar.coach' },
  { role: 'athlete', label: 'demo.bar.player' },
];


/** What the visitor did in the demo that shows what the app is for, if anything. */
function demoMoment(database: LocalDatabase): 'absence' | 'session' | null {
  const identity = database.activeIdentity;
  if (!identity) return null;
  if (identity.role === 'athlete') {
    return database.availability.some((entry) => !entry.seeded && entry.personId === identity.personId && entry.status === 'out') ? 'absence' : null;
  }
  if (identity.role === 'coach') {
    const seededAt = new Date(database.seededAt).getTime();
    return database.sessions.some((session) => new Date(session.createdAt).getTime() > seededAt + 1000) ? 'session' : null;
  }
  return null;
}

/** Whether this browser shows the demo club; decided after mounting. */
function useDemo() {
  const { database } = useLocalDatabase();
  const [demo, setDemo] = useState(false);
  useEffect(() => setDemo(!isRemoteMode()), []);
  const identity = database?.activeIdentity ?? null;
  return demo && database && identity ? { database, identity } : null;
}

/**
 * The demo switch as one pill in the page head (audit 2026-11, proposal 13):
 * "Demo · Trainer" opens the role switch and the way out, so the content
 * starts at the top of the page again.
 */
export function DemoPill() {
  const t = useT();
  const router = useRouter();
  const state = useDemo();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEscape(() => setOpen(false), open);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  }, [open]);
  if (!state) return null;
  const { database, identity } = state;
  const canGoLive = isServerAvailable();
  const current = ROLES.find((entry) => entry.role === identity.role) ?? ROLES[0];

  function switchTo(role: IdentityRole) {
    setOpen(false);
    if (role === identity.role) return;
    if (actAsDemoRole(database, role)) router.push(HOME_FOR_ROLE[role]);
  }

  return (
    <div ref={menu} className="relative" data-demo-bar>
      <button type="button" data-demo-pill onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" title={t('demo.bar.detail')}
        className="flex h-10 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/80 pl-3 pr-2.5 text-xs font-black text-slate-200 transition hover:border-slate-500">
        <span className="uppercase tracking-[0.12em] text-amber-200">{t('demo.bar.label')}</span>
        <span className="text-white">{t(current.label)}</span>
        <span aria-hidden className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open ? (
        <div role="menu" aria-label={t('demo.bar.switch')} className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-slate-700 bg-slate-950 p-2 shadow-2xl">
          <p className="px-3 pb-1 pt-2 text-xs font-bold text-slate-400">{t('demo.bar.switch')}</p>
          {ROLES.map((entry) => (
            <button key={entry.role} type="button" role="menuitemradio" aria-checked={identity.role === entry.role} onClick={() => switchTo(entry.role)}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-black transition ${identity.role === entry.role ? 'bg-slate-800 text-white' : 'text-slate-200 hover:bg-slate-900'}`}>
              {t(entry.label)}
              {identity.role === entry.role ? <span aria-hidden className="text-emerald-300">✓</span> : null}
            </button>
          ))}
          {canGoLive ? (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); setSheet(true); }} className="mt-2 w-full rounded-xl bg-emerald-300 px-3 py-2.5 text-sm font-black text-slate-950 transition hover:bg-emerald-200">
              {t('demo.bar.start')}
            </button>
          ) : null}
        </div>
      ) : null}
      {sheet ? <StartOwnSheet onClose={() => setSheet(false)} /> : null}
    </div>
  );
}

/** After the first thing that shows the point of the app, asked once in the content. */
export function DemoNudge() {
  const t = useT();
  const state = useDemo();
  const [nudgeDone, setNudgeDone] = useState(true);
  const [sheet, setSheet] = useState(false);
  useEffect(() => setNudgeDone(isHintDismissed('demoNudge')), []);
  if (!state) return sheet ? <StartOwnSheet onClose={() => setSheet(false)} /> : null;
  const moment = isServerAvailable() && !nudgeDone ? demoMoment(state.database) : null;
  function closeNudge() {
    dismissHint('demoNudge');
    setNudgeDone(true);
  }
  return (
    <>
      {moment ? (
        <section className="flex items-start gap-3 rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.07] p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white">{t('demo.nudge.title')}</p>
            <p className="mt-1 text-sm text-slate-300">{t(moment === 'absence' ? 'demo.nudge.absence' : 'demo.nudge.session')}</p>
            <button type="button" onClick={() => { closeNudge(); setSheet(true); }} className="mt-3 rounded-full bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950">{t('demo.nudge.action')}</button>
          </div>
          <button type="button" onClick={closeNudge} aria-label={t('demo.nudge.close')} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg text-slate-400 hover:bg-slate-800 hover:text-white">×</button>
        </section>
      ) : null}
      {sheet ? <StartOwnSheet onClose={() => setSheet(false)} /> : null}
    </>
  );
}

/** The real ways in, from the demo: join a team, found a club, sign in. */
function StartOwnSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  useBodyScrollLock(true);
  const pilot = `mailto:${PILOT_MAIL}?subject=${encodeURIComponent(t('landing.mail.subject'))}&body=${encodeURIComponent(t('landing.mail.body'))}`;
  const ways: { title: MessageKey; detail: MessageKey; path: '/join' | '/found' | '/login' }[] = [
    { title: 'demo.start.join', detail: 'demo.start.joinDetail', path: '/join' },
    { title: 'demo.start.found', detail: 'demo.start.foundDetail', path: '/found' },
    { title: 'demo.start.signIn', detail: 'demo.start.signInDetail', path: '/login' },
  ];
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center sm:px-4" role="dialog" aria-modal="true" aria-labelledby="demo-start-title" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl border border-slate-700 bg-slate-950 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:pb-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="demo-start-title" className="text-xl font-black text-white">{t('demo.start.title')}</h2>
            <p className="mt-1 text-sm text-slate-400">{t('demo.start.detail')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('demo.nudge.close')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-700 text-lg text-slate-300 hover:text-white">×</button>
        </div>
        <ul className="mt-4 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/45">
          {ways.map((way) => (
            <li key={way.path}>
              <button type="button" onClick={() => leaveDemoFor(way.path)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-900">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-slate-100">{t(way.title)}</span>
                  <span className="block text-xs text-slate-400">{t(way.detail)}</span>
                </span>
                <span aria-hidden className="text-lg font-black text-slate-500">›</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          {t('demo.start.noCode')} <a href={pilot} className="font-bold text-sky-300 underline">{t('demo.start.pilot')}</a>
        </p>
      </div>
    </div>
  );
}
