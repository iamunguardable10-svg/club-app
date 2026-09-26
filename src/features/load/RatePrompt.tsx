'use client';

/**
 * "How hard was it?" — asked when a player opens the app and there are team
 * sessions they have not rated yet (piece 4, decisions in
 * docs/plan-next-runs.md). One session at a time, oldest first.
 *
 * - Save: RPE and duration, pre-filled from the session. For a game the RPE
 *   is 10 and the duration means playing minutes, as everywhere else in the
 *   app; the warmup before it is saved in the same step unless unticked.
 * - I didn't take part: the coach sees the player as absent from it.
 * - Later: closes until the app is opened next time; the sessions wait on
 *   Today ("Rate … now") and the Today tab shows how many.
 *
 * Own training (piece 22) comes through here too: planned with a length only,
 * so effort and the real length are asked now.
 */

import { useState } from 'react';

import type { AthletePendingSession } from '@/shared/data';
import { formatSessionTime } from '@/shared/format';
import { tr, useT, type MessageKey } from '@/shared/i18n';
import { displayTitle } from '@/features/sessions/sessionTypeLabels';

const RPE_KEYS: Record<number, MessageKey> = {
  1: 'rpe.1',
  2: 'rpe.2',
  3: 'rpe.3',
  4: 'rpe.4',
  5: 'rpe.5',
  6: 'rpe.6',
  7: 'rpe.7',
  8: 'rpe.8',
  9: 'rpe.9',
  10: 'rpe.10',
};

/** "Very hard" for 7, in the app language. */
export function rpeWord(value: number): string {
  return tr(RPE_KEYS[value] ?? 'rpe.5');
}

export const WARMUP_MINUTES = 20;
export const WARMUP_RPE = 3;

function sessionMinutes(session: AthletePendingSession) {
  if (!session.endsAt) return 90;
  return Math.max(5, Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60_000));
}

export function RatePrompt({
  sessions,
  defaultRpeFor,
  onSave,
  onMissed,
  onLater,
}: {
  sessions: AthletePendingSession[];
  defaultRpeFor: (session: AthletePendingSession) => number;
  onSave: (session: AthletePendingSession, rpe: number, minutes: number, withWarmup: boolean) => void;
  onMissed: (session: AthletePendingSession) => void;
  onLater: () => void;
}) {
  const session = sessions[0];
  if (!session) return null;
  // Keyed by session, so the form starts fresh for the next one.
  return <RateForm key={session.id} session={session} remaining={sessions.length} defaultRpe={defaultRpeFor(session)} onSave={onSave} onMissed={onMissed} onLater={onLater} />;
}

function RateForm({
  session,
  remaining,
  defaultRpe,
  onSave,
  onMissed,
  onLater,
}: {
  session: AthletePendingSession;
  remaining: number;
  defaultRpe: number;
  onSave: (session: AthletePendingSession, rpe: number, minutes: number, withWarmup: boolean) => void;
  onMissed: (session: AthletePendingSession) => void;
  onLater: () => void;
}) {
  const t = useT();
  const isGame = session.trainingType === 'game';
  const [rpe, setRpe] = useState(isGame ? 10 : Math.min(10, Math.max(1, Math.round(defaultRpe))));
  const [minutes, setMinutes] = useState(sessionMinutes(session));
  const [withWarmup, setWithWarmup] = useState(true);
  const load = rpe * minutes + (isGame && withWarmup ? WARMUP_RPE * WARMUP_MINUTES : 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="rate-title">
      <section className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black text-emerald-300">{remaining > 1 ? t('rate.progress', { count: remaining }) : t('rate.afterSession')}</p>
            <h2 id="rate-title" className="mt-1 text-2xl font-black">{t('rate.title')}</h2>
          </div>
          <button type="button" onClick={onLater} className="shrink-0 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300">{t('rate.later')}</button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-base font-black">{displayTitle(session.title)}</p>
          <p className="mt-0.5 text-sm font-bold text-slate-400">{formatSessionTime(session.startsAt, session.endsAt)}{session.teamName ? ` · ${session.teamName}` : ''}</p>
        </div>

        {isGame ? (
          <p className="mt-4 rounded-2xl border border-violet-300/25 bg-violet-300/[0.08] p-3 text-sm font-bold text-violet-100">{t('rate.gameNote')}</p>
        ) : (
          <fieldset className="mt-4">
            <legend className="flex w-full items-baseline justify-between text-sm font-black text-slate-200">
              <span>{t('rate.effort')}</span>
              <span className="text-emerald-200">{rpe} · {rpeWord(rpe)}</span>
            </legend>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRpe(value)}
                  aria-pressed={rpe === value}
                  aria-label={t('rate.rpeAria', { value, word: rpeWord(value) })}
                  className={`rounded-xl border py-2.5 text-base font-black transition ${rpe === value ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950/70 text-slate-200'}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label className="mt-4 block">
          <span className="flex items-baseline justify-between text-sm font-black text-slate-200">
            <span>{isGame ? t('rate.minutesPlayed') : t('rate.duration')}</span>
            <span>{t('rate.minutes', { count: minutes })}</span>
          </span>
          <input
            type="range"
            min={isGame ? 0 : 5}
            max={isGame ? 120 : 240}
            step={isGame ? 1 : 5}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
            className="mt-2 w-full accent-emerald-300"
          />
        </label>

        {isGame ? (
          <label className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-300">
            <input type="checkbox" checked={withWarmup} onChange={(event) => setWithWarmup(event.target.checked)} className="h-4 w-4 accent-emerald-300" />
            {t('rate.warmup', { minutes: WARMUP_MINUTES, rpe: WARMUP_RPE })}
          </label>
        ) : null}

        <button type="button" onClick={() => onSave(session, rpe, minutes, isGame && withWarmup)} className="mt-5 w-full rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950">
          {t('rate.save', { load })}
        </button>
        <button type="button" onClick={() => onMissed(session)} className="mt-2 w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-200">
          {session.source === 'athlete_plan' ? t('rate.didNotDo') : t('rate.didNotTakePart')}
        </button>
        <p className="mt-3 text-center text-xs font-bold text-slate-500">{t('rate.laterNote')}</p>
      </section>
    </div>
  );
}
