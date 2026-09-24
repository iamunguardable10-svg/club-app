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
      <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Your club</p>
      <p className="text-sm text-slate-300">With an account: your real sessions and your team, on all your devices.</p>
      <div className="flex flex-wrap gap-2">
        <Link href="/login" className="os-success justify-center">Sign in</Link>
        <Link href="/login?mode=signUp&next=%2Fjoin" className="rounded-2xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-200">Create account</Link>
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
          <h1 className="os-title mt-2">{database ? database.club.name : 'Welcome'}</h1>
        </header>
        {status.phase === 'loading' ? <section className="os-panel p-5 text-sm text-slate-400">Connecting to your club …</section> : null}
        {status.phase === 'signedOut' ? <ClubCard /> : null}
        {status.phase === 'unlinked' ? (
          <section className="os-panel grid gap-3 p-5 text-sm text-slate-300">
            <p>Your account is not part of a team yet.</p>
            <Link href="/join" className="os-success justify-center">Join with a code</Link>
          </section>
        ) : null}
        {status.phase === 'error' ? (
          <section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-5 text-sm text-red-100">
            Could not load the data from the server. {status.error}
          </section>
        ) : null}
        {person && identity ? (
          <section className="os-panel grid gap-3 p-5">
            <p className="text-sm text-slate-300">Signed in as <span className="font-bold text-white">{displayName(person)}</span></p>
            <Link href={HOME_FOR_ROLE[identity.role]} className="os-success justify-center">Continue</Link>
          </section>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          {status.phase === 'ready' || status.phase === 'unlinked' ? (
            <button type="button" onClick={async () => { await signOut(); window.location.assign('/'); }} className="text-xs font-bold text-slate-400 underline">
              Sign out
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
          <section className="os-panel p-6 text-white">Preparing the demo club …</section>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="os-page">
        <div className="os-container">
          <section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-6 text-red-100">
            <p className="font-bold">The test data in this browser could not be read.</p>
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
          <p className="os-kicker">Club OS · Demo</p>
          <h1 className="os-title mt-2">How do you want to start?</h1>
          <p className="os-copy mt-3">
            No account, no sign-in. The demo club lives only in this browser, and the coach and
            player views share the same test data.
          </p>
        </header>

        {isServerAvailable() ? (
          <>
            <ClubCard />
            <p className="px-1 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Or try the demo club without an account, stored only in this browser</p>
          </>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => start('coach')}
            className="os-panel flex flex-col gap-2 p-6 text-left transition hover:border-emerald-300"
          >
            <span className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Coach</span>
            <span className="text-xl font-black text-white">Plan sessions</span>
            <span className="text-sm text-slate-400">
              Calendar, teams, attendance, halls and your players' load.
            </span>
            {firstCoach ? (
              <span className="mt-2 text-xs text-slate-500">Starts as {displayName(firstCoach)}</span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => start('athlete')}
            className="os-panel flex flex-col gap-2 p-6 text-left transition hover:border-violet-300"
          >
            <span className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Player</span>
            <span className="text-xl font-black text-white">Log training</span>
            <span className="text-sm text-slate-400">
              Your sessions, availability, absences and your own load.
            </span>
            {firstAthlete ? (
              <span className="mt-2 text-xs text-slate-500">Starts as {displayName(firstAthlete)}</span>
            ) : null}
          </button>
        </div>

        {club ? (
          <section className="os-panel-soft p-5 text-sm text-slate-400">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Demo club</p>
            <p className="mt-2 text-slate-300">
              {club.name}, {club.city} · {database?.teams.length} Teams · {athletes.length} players
              {athleteTeam ? ` · ${athleteTeam.name} with ${teamSize} on the roster` : ''}
            </p>
            <p className="mt-2">
              You can switch role or person at any time from the menu at the top.
            </p>
          </section>
        ) : null}

      </div>
    </main>
  );
}
