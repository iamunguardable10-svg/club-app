'use client';

/**
 * Frame around every athlete screen: navigation and the identity switcher.
 *
 * Also the single place that handles the three states every athlete screen
 * shares — still loading, unreadable data, nobody selected — so the screens
 * themselves only deal with the case where there is an athlete and a database.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { IdentitySwitcher } from '@/features/identity/IdentitySwitcher';
import { getActivePerson, useLocalDatabase, type LocalDatabase, type Person } from '@/shared/data';

export type AthleteMode = 'home' | 'calendar' | 'availability' | 'load';

const NAV: { mode: AthleteMode; label: string }[] = [
  { mode: 'home', label: 'Heute' },
  { mode: 'calendar', label: 'Kalender' },
  { mode: 'availability', label: 'Verfügbarkeit' },
  { mode: 'load', label: 'Belastung' },
];

export function AthleteShell({
  mode,
  title,
  children,
}: {
  mode: AthleteMode;
  title: string;
  children: (context: { database: LocalDatabase; athlete: Person }) => ReactNode;
}) {
  const { database, error, ready } = useLocalDatabase();

  const frame = (body: ReactNode) => (
    <main className="os-page">
      <div className="os-container space-y-5">
        <header className="os-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="os-kicker">Club OS · Spieler</p>
            <IdentitySwitcher />
          </div>
          <h1 className="os-title mt-3 text-2xl">{title}</h1>
          <nav className="mt-4 flex flex-wrap gap-2">
            {NAV.map((item) => (
              <Link
                key={item.mode}
                href={`/athlete/${item.mode}`}
                className={`rounded-full border px-4 py-2 text-xs font-black ${
                  mode === item.mode
                    ? 'border-violet-300 bg-violet-300 text-slate-950'
                    : 'border-slate-700 bg-slate-950 text-slate-200'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        {body}
      </div>
    </main>
  );

  if (!ready) return frame(<section className="os-panel p-6 text-white">Wird geladen ...</section>);

  if (error) {
    return frame(
      <section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-6 text-red-100">
        <p className="font-bold">Die lokalen Daten konnten nicht gelesen werden.</p>
        <p className="mt-2 text-sm">{error.message}</p>
      </section>,
    );
  }

  if (!database) return frame(null);

  const person = getActivePerson(database);
  const isAthlete = person
    ? database.memberships.some((membership) => membership.personId === person.id && membership.role === 'athlete')
    : false;

  if (!person || !isAthlete) {
    return frame(
      <section className="os-panel p-6 text-white">
        <p>Es ist gerade keine Spielerin und kein Spieler ausgewählt.</p>
        <p className="mt-2 text-sm text-slate-400">Wechsle oben die Rolle oder wähle auf der Startseite.</p>
        <Link href="/" className="mt-4 inline-block underline">Zur Startseite</Link>
      </section>,
    );
  }

  return frame(children({ database, athlete: person }));
}

/** Shared date formatting so the athlete screens read consistently. */
export const dayFormat = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: 'short' });
export const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

export function formatSessionTime(startsAt: string, endsAt: string) {
  return `${timeFormat.format(new Date(startsAt))} – ${timeFormat.format(new Date(endsAt))}`;
}

export function isSameDay(value: string, day: Date) {
  const date = new Date(value);
  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate()
  );
}
