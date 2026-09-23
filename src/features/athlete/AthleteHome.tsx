'use client';

/**
 * The athlete's starting screen: what is on today, and what comes next.
 *
 * Previously /athlete/home, /athlete/calendar and /athlete/load all rendered
 * the same 3216-line component, so all three showed the same thing. Each route
 * now has its own job.
 */

import Link from 'next/link';

import {
  availabilityFor,
  loadSummaryForPerson,
  sessionsForPerson,
  teamsForPerson,
  type LocalDatabase,
  type Person,
  type Session,
} from '@/shared/data';
import { AthleteShell, dayFormat, formatSessionTime, isSameDay } from './AthleteShell';

function SessionCard({ database, athlete, session }: { database: LocalDatabase; athlete: Person; session: Session }) {
  const report = availabilityFor(database, session.id, athlete.id);
  const facility = session.facilityId
    ? database.facilities.find((item) => item.id === session.facilityId)?.name ?? null
    : null;

  return (
    <li className="rounded-3xl border border-slate-800 bg-slate-950/60 p-4">
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
          {report.status === 'out' ? 'Abgemeldet' : `Später${report.lateMinutes ? ` (${report.lateMinutes} Min)` : ''}`}
          {report.reason ? ` · ${report.reason}` : ''}
        </p>
      ) : null}
    </li>
  );
}

export function AthleteHome() {
  return (
    <AthleteShell mode="home" title="Heute">
      {({ database, athlete }) => {
        const today = new Date();
        const now = Date.now();
        const all = sessionsForPerson(database, athlete.id);
        const todaySessions = all.filter((session) => isSameDay(session.startsAt, today));
        const upcoming = all
          .filter((session) => new Date(session.startsAt).getTime() >= now && !isSameDay(session.startsAt, today))
          .slice(0, 5);

        const team = teamsForPerson(database, athlete.id)[0] ?? null;
        const load = loadSummaryForPerson(database, athlete.id);
        const unreported = all.filter(
          (session) =>
            new Date(session.startsAt).getTime() >= now && availabilityFor(database, session.id, athlete.id) === null,
        ).length;

        return (
          <>
            <section className="os-panel-soft p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Dein Team</p>
              <p className="mt-1 text-sm text-slate-300">{team ? team.name : 'Kein Team'}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                <span>
                  7-Tage-Last: <strong className="text-slate-200">{load.sevenDayLoad}</strong>
                </span>
                {load.chronicFull && load.acwr !== null ? (
                  <span>
                    ACWR: <strong className="text-slate-200">{load.acwr.toFixed(2)}</strong> · {load.zone.label}
                  </span>
                ) : (
                  <span>ACWR: noch zu wenige Daten</span>
                )}
              </div>
            </section>

            {unreported > 0 ? (
              <Link
                href="/athlete/availability"
                className="block rounded-3xl border border-violet-400/40 bg-violet-950/20 p-4 text-sm text-violet-100"
              >
                {unreported} kommende {unreported === 1 ? 'Einheit ist' : 'Einheiten sind'} noch nicht gemeldet.
                <span className="ml-1 underline">Jetzt melden</span>
              </Link>
            ) : null}

            <section className="space-y-3">
              <h2 className="os-label">Heute</h2>
              {todaySessions.length === 0 ? (
                <p className="os-panel p-5 text-sm text-slate-400">Heute steht nichts an.</p>
              ) : (
                <ul className="space-y-3">
                  {todaySessions.map((session) => (
                    <SessionCard key={session.id} database={database} athlete={athlete} session={session} />
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="os-label">Als Nächstes</h2>
              {upcoming.length === 0 ? (
                <p className="os-panel p-5 text-sm text-slate-400">Keine weiteren Einheiten geplant.</p>
              ) : (
                <ul className="space-y-3">
                  {upcoming.map((session) => (
                    <SessionCard key={session.id} database={database} athlete={athlete} session={session} />
                  ))}
                </ul>
              )}
            </section>
          </>
        );
      }}
    </AthleteShell>
  );
}
