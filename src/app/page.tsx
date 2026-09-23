'use client';

/**
 * Entry page: pick a role and start.
 *
 * Replaces the marketing landing page, which linked to /admin/setup and
 * /department/overview — areas that leave the active app in run 5 — and
 * advertised "No login required", which is now simply true.
 *
 * Deliberately plain. There is no sign-up, no onboarding and no intermediate
 * step: the whole point of the local test mode is that opening the app puts
 * you straight into a working club.
 */

import { useRouter } from 'next/navigation';

import {
  athletesForTeam,
  displayName,
  peopleWithRole,
  setActiveIdentity,
  teamsForPerson,
  useLocalDatabase,
  type MembershipRole,
} from '@/shared/data';
import { HOME_FOR_ROLE } from '@/features/identity/IdentitySwitcher';

export default function EntryPage() {
  const { database, error, ready } = useLocalDatabase();
  const router = useRouter();

  function start(role: MembershipRole) {
    if (!database) return;
    const people = peopleWithRole(database, role);
    const person = people[0];
    if (!person) return;
    setActiveIdentity({ role, personId: person.id });
    router.push(HOME_FOR_ROLE[role]);
  }

  if (!ready) {
    return (
      <main className="os-page">
        <div className="os-container">
          <section className="os-panel p-6 text-white">Testdaten werden vorbereitet ...</section>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="os-page">
        <div className="os-container">
          <section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-6 text-red-100">
            <p className="font-bold">Die lokalen Daten konnten nicht gelesen werden.</p>
            <p className="mt-2 text-sm">{error.message}</p>
          </section>
        </div>
      </main>
    );
  }

  const club = database?.club;
  const coaches = database ? peopleWithRole(database, 'coach') : [];
  const athletes = database ? peopleWithRole(database, 'athlete') : [];
  const firstCoach = coaches[0];
  const firstAthlete = athletes[0];
  const athleteTeam = database && firstAthlete ? teamsForPerson(database, firstAthlete.id)[0] : null;
  const teamSize = database && athleteTeam ? athletesForTeam(database, athleteTeam.id).length : 0;

  return (
    <main className="os-page">
      <div className="os-container max-w-2xl space-y-5">
        <header className="os-hero p-6">
          <p className="os-kicker">Club OS · Testmodus</p>
          <h1 className="os-title mt-2">Wie möchtest du die App testen?</h1>
          <p className="os-copy mt-3">
            Kein Konto, keine Anmeldung, keine Datenbank. Alles läuft lokal in diesem Browser,
            und beide Perspektiven arbeiten auf denselben Daten.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => start('coach')}
            className="os-panel flex flex-col gap-2 p-6 text-left transition hover:border-emerald-300"
          >
            <span className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Trainer</span>
            <span className="text-xl font-black text-white">Einheiten planen</span>
            <span className="text-sm text-slate-400">
              Kalender, Teams, Anwesenheit, Hallen und die Belastung deiner Spieler.
            </span>
            {firstCoach ? (
              <span className="mt-2 text-xs text-slate-500">Startet als {displayName(firstCoach)}</span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => start('athlete')}
            className="os-panel flex flex-col gap-2 p-6 text-left transition hover:border-violet-300"
          >
            <span className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Spieler</span>
            <span className="text-xl font-black text-white">Training melden</span>
            <span className="text-sm text-slate-400">
              Deine Einheiten, Verfügbarkeit, Absagen und deine eigene Belastung.
            </span>
            {firstAthlete ? (
              <span className="mt-2 text-xs text-slate-500">Startet als {displayName(firstAthlete)}</span>
            ) : null}
          </button>
        </div>

        {club ? (
          <section className="os-panel-soft p-5 text-sm text-slate-400">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Testverein</p>
            <p className="mt-2 text-slate-300">
              {club.name}, {club.city} · {database?.teams.length} Teams · {athletes.length} Spielerinnen und Spieler
              {athleteTeam ? ` · ${athleteTeam.name} mit ${teamSize} im Kader` : ''}
            </p>
            <p className="mt-2">
              Die Rolle lässt sich später jederzeit oben wechseln, auch die Person innerhalb einer Rolle.
            </p>
          </section>
        ) : null}

      </div>
    </main>
  );
}
