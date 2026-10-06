'use client';

/** Three calm promises, then an explicit practice-or-explore choice. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { enablePush, isPushSupported, pushPermission } from '@/features/notifications/push';
import { getActivePerson, hasIdentityRole, isClubAdmin, isRemoteMode, teamsForPerson, useLocalDatabase } from '@/shared/data';
import { clubRoleText } from '@/features/club/clubRoleText';
import { errorText, useT, type MessageKey } from '@/shared/i18n';

export type WelcomeRole = 'athlete' | 'coach' | 'club';
const COPY: Record<WelcomeRole | 'lead', { promise: MessageKey; secondTitle: MessageKey; secondText: MessageKey }> = {
  athlete: { promise: 'welcome.practice.athlete', secondTitle: 'welcome.athlete.today.title', secondText: 'welcome.practice.athleteSecond' },
  coach: { promise: 'welcome.practice.coach', secondTitle: 'welcome.coach.calendar.title', secondText: 'welcome.practice.coachSecond' },
  club: { promise: 'welcome.practice.admin', secondTitle: 'welcome.club.club.title', secondText: 'welcome.practice.adminSecond' },
  lead: { promise: 'welcome.practice.lead', secondTitle: 'welcome.practice.leadTitle', secondText: 'welcome.practice.leadSecond' },
};

function NotifyToggle() {
  const t = useT();
  const [state, setState] = useState<'idle' | 'busy' | 'on' | string>('idle');
  const can = isRemoteMode() && isPushSupported() && pushPermission() === 'default';
  if (!can && state === 'idle') return null;
  return (
    <div className="grid gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={state === 'on'}
        disabled={state === 'busy' || state === 'on'}
        onClick={() => {
          setState('busy');
          enablePush().then(() => setState('on')).catch((caught) => setState(errorText(t, caught)));
        }}
        className="flex items-center justify-between gap-4 py-2 text-left text-sm text-slate-400 disabled:cursor-default"
      >
        <span>{t(state === 'on' ? 'welcome.notify.on' : 'welcome.notify.button')}</span>
        <span aria-hidden className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 ${state === 'on' ? 'bg-emerald-300/70' : 'bg-slate-700'}`}>
          <span className={`h-4 w-4 rounded-full bg-slate-100 ${state === 'on' ? 'translate-x-4' : ''}`} />
        </span>
      </button>
      {state !== 'idle' && state !== 'busy' && state !== 'on' ? <p role="alert" className="text-xs text-rose-200">{state}</p> : null}
    </div>
  );
}

function WelcomeIcon({ slide }: { slide: number }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-7 w-7">
    {slide === 0 ? <><circle cx="12" cy="8" r="3.5" /><path d="M5 20v-1a7 7 0 0 1 14 0v1" /></>
      : slide === 1 ? <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2" /></>
      : <><path d="M12 3 4.5 6v5c0 5 3.5 8 7.5 10 4-2 7.5-5 7.5-10V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>}
  </svg>;
}

export function Welcome({ role, onClose }: { role: WelcomeRole; onClose: (choice: 'tour' | 'explore') => void }) {
  const t = useT();
  const { database } = useLocalDatabase();
  const person = database ? getActivePerson(database) : null;
  const teamNames = database && person ? teamsForPerson(database, person.id).map((team) => team.name).join(', ') : '';
  const roleLine = database && person && role === 'club' ? clubRoleText(database, person.id) : t('welcome.practice.roleLine', { role: t(role === 'coach' ? 'role.coach' : 'role.athlete'), team: teamNames });
  const copy = COPY[role === 'club' && database && !isClubAdmin(database, person?.id ?? null) ? 'lead' : role];
  const roleCount = database && person ? (['athlete', 'coach', 'club'] as const).filter((r) => hasIdentityRole(database, person.id, r)).length : 1;
  const [index, setIndex] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const go = useCallback((target: number) => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTo({ left: Math.max(0, Math.min(2, target)) * node.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose('explore');
      else if (event.key === 'ArrowRight') go(index + 1);
      else if (event.key === 'ArrowLeft') go(index - 1);
      else if (event.key === 'Enter' && event.target === dialog.current) { if (index === 2) onClose('tour'); else go(index + 1); }
      else if (event.key === 'Tab') {
        const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button') ?? [])].filter((node) => !node.closest('[aria-hidden="true"]'));
        const first = focusable[0]; const last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [go, index, onClose]);
  return (
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={t('welcome.label')} tabIndex={-1} data-welcome
      className="fixed inset-0 z-[300] flex flex-col bg-slate-950 text-white outline-none">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between px-6 pt-[calc(1.25rem+env(safe-area-inset-top))]">
        <p className="text-sm font-bold text-slate-400">{database?.club.name ?? 'Club OS'}</p>
        <button type="button" onClick={() => onClose('explore')} className="rounded-full px-3 py-2 text-xs text-slate-400">{t('welcome.skip')}</button>
      </div>
      <div ref={scroller} onScroll={(event) => setIndex(Math.round(event.currentTarget.scrollLeft / Math.max(1, event.currentTarget.clientWidth)))}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[0, 1, 2].map((slide) => (
          <section key={slide} aria-hidden={slide !== index} inert={slide !== index} className="flex w-full shrink-0 snap-center flex-col justify-center px-7">
            <div className="mx-auto w-full max-w-sm">
              <span aria-hidden className="mb-8 grid h-14 w-14 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200"><WelcomeIcon slide={slide} /></span>
              <h2 className="text-3xl font-bold tracking-tight">{slide === 0 ? t('welcome.practice.hello', { name: person?.firstName ?? '' }) : slide === 1 ? t(copy.secondTitle) : t('welcome.practice.ready')}</h2>
              {slide === 0 ? <p className="mt-3 text-sm font-bold text-emerald-200">{roleLine}</p> : null}
              <p className="mt-4 text-base leading-relaxed text-slate-300">{t(slide === 0 ? copy.promise : slide === 1 ? copy.secondText : 'welcome.practice.safe')}</p>
              {slide === 1 ? (
                <div className="mt-8 divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/50 px-4">
                  {[role === 'athlete' ? 'nav.today' : role === 'coach' ? 'nav.calendar' : 'nav.club', role === 'athlete' ? 'nav.calendar' : role === 'coach' ? 'nav.team' : 'nav.halls', 'nav.messages'].map((key) => <p key={key} className="flex justify-between py-4 text-sm font-bold">{t(key as MessageKey)}<span aria-hidden className="text-slate-600">›</span></p>)}
                </div>
              ) : null}
              {slide === 2 ? <div className="mt-6"><NotifyToggle /></div> : null}
              {slide === 2 && roleCount > 1 ? <p className="mt-4 text-sm text-slate-400">{t('welcome.roles')}</p> : null}
            </div>
          </section>
        ))}
      </div>
      <div className="mx-auto grid w-full max-w-lg gap-4 px-7 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
        <p aria-live="polite" className="text-center text-xs text-slate-500">{t('tour.progress', { step: index + 1, total: 3 })}</p>
        <button type="button" data-welcome-next onClick={() => index === 2 ? onClose('tour') : go(index + 1)} className="rounded-2xl bg-emerald-300 px-5 py-3.5 text-sm font-bold text-slate-950 transition active:scale-[.98]">{t(index === 2 ? 'welcome.practice.tour' : 'welcome.next')}</button>
        {index === 2 ? <button type="button" data-welcome-explore onClick={() => onClose('explore')} className="rounded-xl py-2 text-sm font-bold text-slate-400">{t('welcome.practice.explore')}</button> : null}
      </div>
    </div>
  );
}
