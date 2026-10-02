'use client';

/**
 * A page's first-visit tip, in the manner of iOS tips: a slim card at the top
 * of the page with a title and one or two sentences, put away with × and then
 * never shown again on this device (Settings can bring them back). It slides
 * in a moment after the page appears and folds away smoothly; with reduced
 * motion it simply appears and disappears.
 *
 * One tip per page, so explanations do not have to stay on screen for good.
 */

import { useEffect, useState } from 'react';

import { dismissHint, isHintDismissed } from '@/shared/data';
import { useT, type MessageKey } from '@/shared/i18n';

export type TipId =
  | 'athlete.today' | 'athlete.todayBasic' | 'athlete.calendar' | 'athlete.calendarBasic' | 'athlete.load' | 'athlete.messages'
  | 'coach.today' | 'coach.calendar' | 'coach.team' | 'coach.halls' | 'coach.history'
  | 'club.club' | 'club.halls' | 'club.messages'
  | 'hallCalendar';

/** The text keys of a tip: `tip.<id>.title` and `tip.<id>.text`. */
const TEXT: Record<TipId, { title: MessageKey; text: MessageKey }> = {
  'athlete.today': { title: 'tip.athleteToday.title', text: 'tip.athleteToday.text' },
  'athlete.todayBasic': { title: 'tip.athleteToday.title', text: 'tip.athleteTodayBasic.text' },
  'athlete.calendar': { title: 'tip.athleteCalendar.title', text: 'tip.athleteCalendar.text' },
  'athlete.calendarBasic': { title: 'tip.athleteCalendar.title', text: 'tip.athleteCalendarBasic.text' },
  'athlete.load': { title: 'tip.athleteLoad.title', text: 'tip.athleteLoad.text' },
  'athlete.messages': { title: 'tip.athleteMessages.title', text: 'tip.athleteMessages.text' },
  'coach.today': { title: 'tip.coachToday.title', text: 'tip.coachToday.text' },
  'coach.calendar': { title: 'tip.coachCalendar.title', text: 'tip.coachCalendar.text' },
  'coach.team': { title: 'tip.coachTeam.title', text: 'tip.coachTeam.text' },
  'coach.halls': { title: 'tip.coachHalls.title', text: 'tip.coachHalls.text' },
  'coach.history': { title: 'tip.coachHistory.title', text: 'tip.coachHistory.text' },
  'club.club': { title: 'tip.club.title', text: 'tip.club.text' },
  'club.halls': { title: 'tip.clubHalls.title', text: 'tip.clubHalls.text' },
  'club.messages': { title: 'tip.messages.title', text: 'tip.messages.text' },
  hallCalendar: { title: 'tip.hallCalendar.title', text: 'tip.hallCalendar.text' },
};

/** A beat after the page, so the tip is noticed as something new. */
const APPEAR_DELAY_MS = 450;
/** As long as the fold-away transition below. */
const LEAVE_MS = 420;

type Phase = 'none' | 'closed' | 'open' | 'leaving';

export function PageTip({ id }: { id: TipId }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('none');

  useEffect(() => {
    setPhase('none');
    if (isHintDismissed(`tip.${id}`)) return;
    let frame = 0;
    const timer = window.setTimeout(() => {
      // Mount folded, then open on the next frame so the transition runs.
      setPhase('closed');
      frame = window.requestAnimationFrame(() => { frame = window.requestAnimationFrame(() => setPhase('open')); });
    }, APPEAR_DELAY_MS);
    return () => { window.clearTimeout(timer); window.cancelAnimationFrame(frame); };
  }, [id]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = window.setTimeout(() => setPhase('none'), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === 'none') return null;
  const open = phase === 'open';

  function close() {
    dismissHint(`tip.${id}`);
    setPhase('leaving');
  }

  return (
    // Folds its height (grid rows) and cancels the page's gap below it (-mb-5) while closed.
    <div
      className={`grid transition-all duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${open ? 'mb-0 grid-rows-[1fr] opacity-100' : '-mb-5 grid-rows-[0fr] opacity-0'}`}
    >
      <div className="min-h-0 overflow-hidden">
        <aside
          role="note"
          aria-label={t(TEXT[id].title)}
          className={`relative flex items-start gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/80 to-slate-900/80 p-3.5 pr-11 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${open ? 'translate-y-0 scale-100' : '-translate-y-2 scale-[0.97]'}`}
        >
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-300 to-sky-400 text-slate-950 shadow-[0_4px_14px_rgba(52,211,153,0.35)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
            </svg>
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-[15px] font-bold leading-snug text-white">{t(TEXT[id].title)}</p>
            <p className="mt-0.5 text-[13px] font-medium leading-snug text-slate-300">{t(TEXT[id].text)}</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={t('tip.close')}
            className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-90"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </aside>
      </div>
    </div>
  );
}
