'use client';

/**
 * The athlete's own calendar: past and upcoming sessions of their team, with
 * what they reported and what they logged.
 */

import {
  availabilityFor,
  loadEntriesForPerson,
  sessionsForPerson,
  type LocalDatabase,
  type Person,
} from '@/shared/data';
import { AthleteShell, dayFormat, formatSessionTime } from './AthleteShell';

export function AthleteCalendar() {
  return (
    <AthleteShell mode="calendar" title="Kalender">
      {({ database, athlete }: { database: LocalDatabase; athlete: Person }) => {
        const now = Date.now();
        const all = sessionsForPerson(database, athlete.id);
        const loadBySessionId = new Map(
          loadEntriesForPerson(database, athlete.id)
            .filter((entry) => entry.sessionId)
            .map((entry) => [entry.sessionId as string, entry]),
        );

        const upcoming = all.filter((session) => new Date(session.startsAt).getTime() >= now);
        const past = all
          .filter((session) => new Date(session.startsAt).getTime() < now)
          .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
          .slice(0, 20);

        const row = (session: (typeof all)[number], showLoad: boolean) => {
          const report = availabilityFor(database, session.id, athlete.id);
          const entry = loadBySessionId.get(session.id);
          const facility = session.facilityId
            ? database.facilities.find((item) => item.id === session.facilityId)?.name ?? null
            : null;
          return (
            <li key={session.id} className="rounded-3xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-black text-white">{session.title}</p>
                <p className="text-xs text-slate-400">{dayFormat.format(new Date(session.startsAt))}</p>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {formatSessionTime(session.startsAt, session.endsAt)}
                {facility ? ` · ${facility}` : ''}
              </p>
              {report ? (
                <p className={`mt-2 text-xs font-bold ${report.status === 'out' ? 'text-red-300' : 'text-amber-300'}`}>
                  {report.status === 'out' ? 'Abgemeldet' : 'Später'}
                  {report.reason ? ` · ${report.reason}` : ''}
                </p>
              ) : null}
              {showLoad ? (
                <p className="mt-2 text-xs text-slate-400">
                  {entry
                    ? `RPE ${entry.rpe} · ${entry.durationMinutes} Min · Last ${entry.load}`
                    : report?.status === 'out'
                      ? 'Nicht teilgenommen'
                      : 'Noch nicht eingetragen'}
                </p>
              ) : null}
            </li>
          );
        };

        return (
          <>
            <section className="space-y-3">
              <h2 className="os-label">Kommend</h2>
              {upcoming.length === 0 ? (
                <p className="os-panel p-5 text-sm text-slate-400">Nichts geplant.</p>
              ) : (
                <ul className="space-y-3">{upcoming.map((session) => row(session, false))}</ul>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="os-label">Vergangen</h2>
              {past.length === 0 ? (
                <p className="os-panel p-5 text-sm text-slate-400">Noch nichts gewesen.</p>
              ) : (
                <ul className="space-y-3">{past.map((session) => row(session, true))}</ul>
              )}
            </section>
          </>
        );
      }}
    </AthleteShell>
  );
}
