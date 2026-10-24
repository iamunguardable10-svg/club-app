'use client';

/**
 * "How hard was it?" — asked when a player opens the app and there are team
 * sessions they have not rated yet (piece 4, decisions in
 * docs/plan-next-runs.md). One session at a time, oldest first.
 *
 * - Save: RPE and duration, pre-filled from the session. For a game the
 *   warmup is asked first (the player's usual warmup effort and length,
 *   pre-selected), then the game: RPE 10 and the playing minutes, pre-selected
 *   from the player's average for that team. Both are saved together; "No
 *   warmup" leaves it out.
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

/** What the prompt starts with, from the player's own history (`AthleteLoadWorkspace`). */
export type RateDefaults = {
  rpe: number;
  minutes?: number;
  warmupRpe: number;
  warmupMinutes: number;
  /** Most playing minutes in a game of this sport, overtime included (`sports.ts`). */
  maxMinutes?: number;
};
export type WarmupRating = { rpe: number; minutes: number };

function sessionMinutes(session: AthletePendingSession) {
  if (!session.endsAt) return 90;
  return Math.max(5, Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60_000));
}

export function RatePrompt({
  sessions,
  defaultsFor,
  onSave,
  onMissed,
  onLater,
}: {
  sessions: AthletePendingSession[];
  defaultsFor: (session: AthletePendingSession) => RateDefaults;
  onSave: (session: AthletePendingSession, rpe: number, minutes: number, warmup: WarmupRating | null) => void;
  onMissed: (session: AthletePendingSession) => void;
  onLater: () => void;
}) {
  const session = sessions[0];
  if (!session) return null;
  // Keyed by session, so the form starts fresh for the next one.
  return <RateForm key={session.id} session={session} remaining={sessions.length} defaults={defaultsFor(session)} onSave={onSave} onMissed={onMissed} onLater={onLater} />;
}

function RpePicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const t = useT();
  return (
    <fieldset className="mt-4">
      <legend className="flex w-full items-baseline justify-between text-sm font-black text-slate-200">
        <span>{t('rate.effort')}</span>
        <span className="text-emerald-200">{value} · {rpeWord(value)}</span>
      </legend>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            aria-label={t('rate.rpeAria', { value: option, word: rpeWord(option) })}
            className={`rounded-xl border py-2.5 text-base font-black transition ${value === option ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950/70 text-slate-200'}`}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function MinutesSlider({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step: number }) {
  const t = useT();
  return (
    <label className="mt-4 block">
      <span className="flex items-baseline justify-between text-sm font-black text-slate-200">
        <span>{label}</span>
        <span>{t('rate.minutes', { count: value })}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-emerald-300" />
    </label>
  );
}

function RateForm({
  session,
  remaining,
  defaults,
  onSave,
  onMissed,
  onLater,
}: {
  session: AthletePendingSession;
  remaining: number;
  defaults: RateDefaults;
  onSave: (session: AthletePendingSession, rpe: number, minutes: number, warmup: WarmupRating | null) => void;
  onMissed: (session: AthletePendingSession) => void;
  onLater: () => void;
}) {
  const t = useT();
  const isGame = session.trainingType === 'game';
  const [rpe, setRpe] = useState(isGame ? 10 : Math.min(10, Math.max(1, Math.round(defaults.rpe))));
  // Room for overtime or extra time, as far as the sport goes.
  const maxMinutes = isGame ? defaults.maxMinutes ?? 150 : 240;
  const [minutes, setMinutes] = useState(Math.min(maxMinutes, defaults.minutes ?? sessionMinutes(session)));
  // A game asks the warmup first, then the game itself.
  const [stage, setStage] = useState<'warmup' | 'main'>(isGame ? 'warmup' : 'main');
  const [warmup, setWarmup] = useState<WarmupRating | null>({ rpe: defaults.warmupRpe, minutes: defaults.warmupMinutes });
  const load = rpe * minutes + (isGame && warmup ? warmup.rpe * warmup.minutes : 0);
  const steps = isGame ? (
    <p className="mt-1 text-xs font-black text-slate-400">{t(stage === 'warmup' ? 'rate.step.warmup' : 'rate.step.game')}</p>
  ) : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="rate-title">
      <section className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black text-emerald-300">{remaining > 1 ? t('rate.progress', { count: remaining }) : t('rate.afterSession')}</p>
            <h2 id="rate-title" className="mt-1 text-2xl font-black">{stage === 'warmup' ? t('rate.warmupTitle') : t('rate.title')}</h2>
            {steps}
          </div>
          <button type="button" onClick={onLater} className="shrink-0 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300">{t('rate.later')}</button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-base font-black">{stage === 'warmup' ? t('rate.warmupBefore', { title: displayTitle(session.title) }) : displayTitle(session.title)}</p>
          <p className="mt-0.5 text-sm font-bold text-slate-400">{formatSessionTime(session.startsAt, session.endsAt, session.trainingType)}{session.teamName ? ` · ${session.teamName}` : ''}</p>
        </div>

        {stage === 'warmup' ? (
          <>
            <RpePicker value={warmup?.rpe ?? defaults.warmupRpe} onChange={(value) => setWarmup({ rpe: value, minutes: warmup?.minutes ?? defaults.warmupMinutes })} />
            <MinutesSlider label={t('rate.duration')} value={warmup?.minutes ?? defaults.warmupMinutes} onChange={(value) => setWarmup({ rpe: warmup?.rpe ?? defaults.warmupRpe, minutes: value })} min={5} max={60} step={5} />
            <button type="button" onClick={() => { setWarmup((current) => current ?? { rpe: defaults.warmupRpe, minutes: defaults.warmupMinutes }); setStage('main'); }} className="mt-5 w-full rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950">
              {t('rate.toGame')}
            </button>
            <button type="button" onClick={() => { setWarmup(null); setStage('main'); }} className="mt-2 w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-200">
              {t('rate.noWarmup')}
            </button>
          </>
        ) : (
          <>
            {isGame ? (
              <p className="mt-4 rounded-2xl border border-violet-300/25 bg-violet-300/[0.08] p-3 text-sm font-bold text-violet-100">{t('rate.gameNote')}</p>
            ) : (
              <RpePicker value={rpe} onChange={setRpe} />
            )}
            <MinutesSlider label={isGame ? t('rate.minutesPlayed') : t('rate.duration')} value={minutes} onChange={setMinutes} min={isGame ? 0 : 5} max={maxMinutes} step={isGame ? 1 : 5} />
            {isGame ? (
              <button type="button" onClick={() => setStage('warmup')} className="mt-3 flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-left text-sm font-bold text-slate-300">
                <span>{warmup ? t('rate.warmupSummary', { minutes: warmup.minutes, rpe: warmup.rpe }) : t('rate.warmupNone')}</span>
                <span className="text-xs font-black text-sky-300">{t('rate.change')}</span>
              </button>
            ) : null}
            <button type="button" onClick={() => onSave(session, rpe, minutes, isGame ? warmup : null)} className="mt-5 w-full rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950">
              {t('rate.save', { load })}
            </button>
          </>
        )}
        <button type="button" onClick={() => onMissed(session)} className="mt-2 w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-200">
          {session.source === 'athlete_plan' ? t('rate.didNotDo') : t('rate.didNotTakePart')}
        </button>
        <p className="mt-3 text-center text-xs font-bold text-slate-500">{t('rate.laterNote')}</p>
      </section>
    </div>
  );
}
