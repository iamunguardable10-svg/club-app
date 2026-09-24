'use client';

/**
 * Entry page.
 *
 * Two ways in, side by side:
 * - With the club (pilot server): sign in, or create an account and join.
 * - Without an account (local test mode): pick a role and start in a test
 *   club that lives in this browser — no sign-up, no intermediate step.
 *
 * Which one a device uses is remembered (`getBackendChoice`); the other one
 * is always one tap away here and in the identity menu.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  athletesForTeam,
  displayName,
  getActivePerson,
  isRemoteMode,
  isServerAvailable,
  peopleWithRole,
  readDatabase,
  setActiveIdentity,
  signOut,
  teamsForPerson,
  useBackendStatus,
  useLocalDatabase,
  type MembershipRole,
} from '@/shared/data';
import { HOME_FOR_ROLE } from '@/features/identity/IdentitySwitcher';
import { LocalModeLink } from '@/features/access/LocalModeLink';

export default function EntryPage() {
  // Decided after mounting: the choice lives in this browser, so the server
  // render cannot know it.
  const [mode, setMode] = useState<'local' | 'server' | null>(null);
  useEffect(() => setMode(isRemoteMode() ? 'server' : 'local'), []);
  if (mode === null) return null;
  return mode === 'server' ? <ServerEntry /> : <LocalEntry />;
}

function ClubCard() {
  return (
    <section className="os-panel grid gap-3 p-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Mit deinem Verein</p>
      <p className="text-sm text-slate-300">Mit Konto: deine echten Einheiten, dein Team, auf allen Geräten.</p>
      <div className="flex flex-wrap gap-2">
        <Link href="/login" className="os-success justify-center">Anmelden</Link>
        <Link href="/login?mode=signUp&next=%2Fjoin" className="rounded-2xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-200">Konto erstellen</Link>
      </div>
    </section>
  );
}

function ServerEntry() {
  const status = useBackendStatus();
  // Reading starts the connection to the server.
  useLocalDatabase();
  const database = status.phase === 'ready' ? readDatabase() : null;
  const person = database ? getActivePerson(database) : null;
  const identity = database?.activeIdentity ?? null;

  return (
    <main className="os-page">
      <div className="os-container max-w-2xl space-y-5">
        <header className="os-hero p-6">
          <p className="os-kicker">Club OS</p>
          <h1 className="os-title mt-2">{database ? database.club.name : 'Willkommen'}</h1>
        </header>
        {status.phase === 'loading' ? <section className="os-panel p-5 text-sm text-slate-400">Verbindung zum Verein …</section> : null}
        {status.phase === 'signedOut' ? <ClubCard /> : null}
        {status.phase === 'unlinked' ? (
          <section className="os-panel grid gap-3 p-5 text-sm text-slate-300">
            <p>Dein Konto ist noch in keinem Team.</p>
            <Link href="/join" className="os-success justify-center">Mit Code beitreten</Link>
          </section>
        ) : null}
        {status.phase === 'error' ? (
          <section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-5 text-sm text-red-100">
            Die Daten konnten nicht vom Server geladen werden. {status.error}
          </section>
        ) : null}
        {person && identity ? (
          <section className="os-panel grid gap-3 p-5">
            <p className="text-sm text-slate-300">Angemeldet als <span className="font-bold text-white">{displayName(person)}</span></p>
            <Link href={HOME_FOR_ROLE[identity.role]} className="os-success justify-center">Weiter</Link>
          </section>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          {status.phase === 'ready' || status.phase === 'unlinked' ? (
            <button type="button" onClick={async () => { await signOut(); window.location.assign('/'); }} className="text-xs font-bold text-slate-400 underline">
              Abmelden
            </button>
          ) : null}
          <LocalModeLink />
        </div>
      </div>
    </main>
  );
}

function LocalEntry() {
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

        {isServerAvailable() ? (
          <>
            <ClubCard />
            <p className="px-1 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Oder ohne Anmeldung testen, mit einem Testverein nur in diesem Browser</p>
          </>
        ) : null}

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
