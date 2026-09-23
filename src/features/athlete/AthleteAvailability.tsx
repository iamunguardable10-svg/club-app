'use client';

/**
 * Reporting availability for upcoming sessions.
 *
 * This screen did not exist before: /athlete/availability was a placeholder,
 * and what the coach saw was generated from a hash of the session id, so
 * nobody had ever reported anything. Everything here is new.
 *
 * The old placeholder set the bar and it is worth keeping: reporting should
 * take under ten seconds and work properly on a phone. So the common case —
 * "I'll be there" or "I'm out" — is one tap, and only the two cases that
 * genuinely need more (how late, why out) ask a follow-up question.
 */

import { useState } from 'react';

import {
  availabilityFor,
  reportAvailability,
  sessionsForPerson,
  type AvailabilityStatus,
  type Id,
  type LocalDatabase,
  type Person,
  type Session,
} from '@/shared/data';
import { AthleteShell, dayFormat, formatSessionTime } from './AthleteShell';

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  in: 'Dabei',
  late: 'Später',
  out: 'Absage',
};

const OUT_REASONS = ['Krank', 'Verletzt', 'Schule', 'Familientermin', 'Anderer Grund'];
const LATE_MINUTES = [10, 15, 20, 30, 45];

function SessionRow({ database, athlete, session }: { database: LocalDatabase; athlete: Person; session: Session }) {
  const existing = availabilityFor(database, session.id, athlete.id);
  const status: AvailabilityStatus = existing?.status ?? 'in';
  const [asking, setAsking] = useState<'late' | 'out' | null>(null);

  const facility = session.facilityId
    ? database.facilities.find((item) => item.id === session.facilityId)?.name ?? null
    : null;

  function choose(next: AvailabilityStatus) {
    if (next === 'in') {
      reportAvailability({ sessionId: session.id, personId: athlete.id, status: 'in' });
      setAsking(null);
      return;
    }
    // Late and out need one more piece of information to be useful to a coach.
    setAsking(next);
  }

  function confirmLate(minutes: number) {
    reportAvailability({ sessionId: session.id, personId: athlete.id, status: 'late', lateMinutes: minutes });
    setAsking(null);
  }

  function confirmOut(reason: string) {
    reportAvailability({ sessionId: session.id, personId: athlete.id, status: 'out', reason });
    setAsking(null);
  }

  const tone =
    status === 'out'
      ? 'border-red-500/50 bg-red-950/20'
      : status === 'late'
        ? 'border-amber-400/50 bg-amber-950/20'
        : 'border-slate-800 bg-slate-950/60';

  return (
    <li className={`rounded-3xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-black text-white">{session.title}</p>
        <p className="text-xs text-slate-400">{dayFormat.format(new Date(session.startsAt))}</p>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {formatSessionTime(session.startsAt, session.endsAt)}
        {facility ? ` · ${facility}` : ''}
      </p>

      {existing && !existing.seeded ? (
        <p className="mt-2 text-xs text-slate-300">
          Gemeldet: {STATUS_LABEL[existing.status]}
          {existing.status === 'late' && existing.lateMinutes ? ` (${existing.lateMinutes} Min)` : ''}
          {existing.reason ? ` · ${existing.reason}` : ''}
        </p>
      ) : null}

      {asking === null ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(['in', 'late', 'out'] as AvailabilityStatus[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => choose(option)}
              // Large hit area: this gets used one-handed in a hall doorway.
              className={`rounded-2xl border px-3 py-3 text-xs font-black ${
                status === option
                  ? 'border-violet-300 bg-violet-300 text-slate-950'
                  : 'border-slate-700 bg-slate-950 text-slate-200'
              }`}
            >
              {STATUS_LABEL[option]}
            </button>
          ))}
        </div>
      ) : null}

      {asking === 'late' ? (
        <div className="mt-3">
          <p className="mb-2 text-xs font-bold text-slate-300">Wie viel später?</p>
          <div className="flex flex-wrap gap-2">
            {LATE_MINUTES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => confirmLate(minutes)}
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-xs font-black text-slate-200"
              >
                {minutes} Min
              </button>
            ))}
            <button type="button" onClick={() => setAsking(null)} className="rounded-2xl px-3 py-3 text-xs text-slate-500 underline">
              Abbrechen
            </button>
          </div>
        </div>
      ) : null}

      {asking === 'out' ? (
        <div className="mt-3">
          <p className="mb-2 text-xs font-bold text-slate-300">Warum nicht?</p>
          <div className="flex flex-wrap gap-2">
            {OUT_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => confirmOut(reason)}
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-xs font-black text-slate-200"
              >
                {reason}
              </button>
            ))}
            <button type="button" onClick={() => setAsking(null)} className="rounded-2xl px-3 py-3 text-xs text-slate-500 underline">
              Abbrechen
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function AthleteAvailability() {
  return (
    <AthleteShell mode="availability" title="Verfügbarkeit">
      {({ database, athlete }) => {
        const now = Date.now();
        const upcoming = sessionsForPerson(database, athlete.id).filter(
          (session) => new Date(session.startsAt).getTime() >= now,
        );

        if (upcoming.length === 0) {
          return (
            <section className="os-panel p-6 text-white">
              <p>Es stehen keine Einheiten an.</p>
              <p className="mt-2 text-sm text-slate-400">Sobald dein Trainer etwas plant, kannst du hier melden.</p>
            </section>
          );
        }

        const reported = upcoming.filter((session) => {
          const entry = availabilityFor(database, session.id, athlete.id);
          return entry !== null && !entry.seeded;
        }).length;

        return (
          <>
            <section className="os-panel-soft p-5">
              <p className="text-sm text-slate-300">
                {reported} von {upcoming.length} kommenden Einheiten gemeldet.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Ohne Meldung gehen alle davon aus, dass du dabei bist.
              </p>
            </section>
            <ul className="space-y-3">
              {upcoming.map((session) => (
                <SessionRow key={session.id as Id} database={database} athlete={athlete} session={session} />
              ))}
            </ul>
          </>
        );
      }}
    </AthleteShell>
  );
}
