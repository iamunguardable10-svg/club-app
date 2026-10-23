'use client';

/**
 * A slim bar at the top of every page while someone looks around the demo
 * club (docs/goal-2026-10-pilot-ready.md, piece 3): it says this is an
 * example club, switches the role in place (no detour over the start page)
 * and leads to the real ways in. After the first thing that shows the point
 * of the app (a player sends an absence, a coach plans a session) it asks
 * once whether they like it.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { HOME_FOR_ROLE } from '@/features/identity/IdentitySwitcher';
import { actAsDemoRole, leaveDemoFor } from '@/features/onboarding/demoRole';
import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';
import { dismissHint, isHintDismissed, isRemoteMode, isServerAvailable, useLocalDatabase, type IdentityRole, type LocalDatabase } from '@/shared/data';
import { useT, type MessageKey } from '@/shared/i18n';

const ROLES: { role: IdentityRole; label: MessageKey }[] = [
  { role: 'club', label: 'demo.bar.club' },
  { role: 'coach', label: 'demo.bar.coach' },
  { role: 'athlete', label: 'demo.bar.player' },
];

const PILOT_MAIL = 'ben.hebling@gmx.de';

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

export function DemoBar() {
  const t = useT();
  const router = useRouter();
  const { database } = useLocalDatabase();
  // The mode lives in this browser; decided after mounting.
  const [demo, setDemo] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [nudgeDone, setNudgeDone] = useState(true);
  useEffect(() => {
    setDemo(!isRemoteMode());
    setNudgeDone(isHintDismissed('demoNudge'));
  }, []);

  const identity = database?.activeIdentity ?? null;
  if (!demo || !database || !identity) return null;
  const canGoLive = isServerAvailable();
  const moment = canGoLive && !nudgeDone ? demoMoment(database) : null;

  function switchTo(role: IdentityRole) {
    if (!database || role === identity?.role) return;
    if (actAsDemoRole(database, role)) router.push(HOME_FOR_ROLE[role]);
  }

  function closeNudge() {
    dismissHint('demoNudge');
    setNudgeDone(true);
  }

  return (
    <>
      <div data-demo-bar className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/45 py-1.5 pl-3 pr-1.5">
        <span className="shrink-0 text-[11px] font-black uppercase tracking-[0.14em] text-amber-200" title={t('demo.bar.detail')}>{t('demo.bar.label')}</span>
        <div className="flex min-w-0 flex-1 justify-center gap-0.5 rounded-full bg-slate-950/70 p-0.5" role="group" aria-label={t('demo.bar.switch')}>
          {ROLES.map((entry) => (
            <button
              key={entry.role}
              type="button"
              onClick={() => switchTo(entry.role)}
              aria-pressed={identity.role === entry.role}
              className={`min-w-0 truncate rounded-full px-2.5 py-1 text-[11px] font-black transition ${identity.role === entry.role ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>
        {canGoLive ? (
          <button type="button" onClick={() => setSheet(true)} className="shrink-0 rounded-full bg-emerald-300 px-3 py-1.5 text-[11px] font-black text-slate-950 transition hover:bg-emerald-200">
            {t('demo.bar.start')}
          </button>
        ) : null}
      </div>
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
