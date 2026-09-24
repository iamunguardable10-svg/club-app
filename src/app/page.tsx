'use client';

/**
 * Start page.
 *
 * One page for every situation a phone can be in:
 * - Not signed in: signing in to the club is the main path; new people are
 *   told where their way in comes from (players: the team's join code,
 *   staff: their invitation link). The demo club sits below, small.
 * - Signed in: welcome back, one card per own role to continue with.
 * - Signed in without a team: join with a code.
 * - A build without the club server: the demo club is all there is.
 *
 * The demo club never touches the server. Picking it from server mode
 * switches this device to the local mode and starts the chosen role there
 * (`?demo=coach|athlete`), so it is one tap either way.
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import {
  coachRolesForTeam,
  displayName,
  isRemoteMode,
  isServerAvailable,
  ownPersonIds,
  peopleWithRole,
  readDatabase,
  setActiveIdentity,
  setBackendChoice,
  signOut,
  useBackendStatus,
  useLocalDatabase,
  type LocalDatabase,
  type MembershipRole,
} from '@/shared/data';
import { HOME_FOR_ROLE } from '@/features/identity/IdentitySwitcher';

type DemoRole = 'coach' | 'athlete';

export default function StartPage() {
  return (
    <Suspense fallback={null}>
      <StartContent />
    </Suspense>
  );
}

function StartContent() {
  // Decided after mounting: the choice lives in this browser, so the server
  // render cannot know it.
  const [mode, setMode] = useState<'local' | 'server' | null>(null);
  useEffect(() => setMode(isRemoteMode() ? 'server' : 'local'), []);
  if (mode === null) return null;
  return mode === 'server' ? <ServerStart /> : <LocalStart />;
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main className="os-page">
      <div className="os-container max-w-xl space-y-4 pb-12 pt-8 sm:pt-14">
        <header className="px-1">
          <p className="os-kicker">Club OS</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Your team, in one place.</h1>
          <p className="os-copy mt-2 max-w-md">Sessions, availability and training load for coaches and players.</p>
        </header>
        {children}
      </div>
    </main>
  );
}

function Card({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'primary' }) {
  return (
    <section className={`os-panel grid gap-4 p-5 sm:p-6 ${tone === 'primary' ? 'border-emerald-300/30' : ''}`}>
      {children}
    </section>
  );
}

function SignInCard() {
  return (
    <Card tone="primary">
      <div>
        <p className="text-lg font-black text-white">Sign in to your club</p>
        <p className="mt-1 text-sm text-slate-400">Your real sessions and your team, on all your devices.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Link href="/login" className="os-success text-center">Sign in</Link>
        <Link href="/login?mode=signUp&next=%2Fjoin" className="os-secondary text-center">Create account</Link>
      </div>
      <ul className="grid gap-1.5 text-xs text-slate-400">
        <li><span className="font-bold text-slate-300">Players:</span> create an account and enter the join code from your coach.</li>
        <li><span className="font-bold text-slate-300">Coaches and staff:</span> open the invitation link you were sent.</li>
      </ul>
    </Card>
  );
}

/** The demo club, as the secondary way in (or the only one without a server). */
function DemoCard({ prominent, onStart }: { prominent: boolean; onStart: (role: DemoRole) => void }) {
  return (
    <section className={prominent ? 'os-panel grid gap-4 p-5 sm:p-6' : 'os-panel-soft grid gap-3 p-4'}>
      <div>
        <p className={prominent ? 'text-lg font-black text-white' : 'text-sm font-black text-slate-200'}>Try the demo club</p>
        <p className="mt-1 text-xs text-slate-400">No account needed. A made-up club with test data that lives only in this browser.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onStart('coach')} className={prominent ? 'os-success' : 'os-secondary px-3 py-2 text-xs'}>
          As a coach
        </button>
        <button type="button" onClick={() => onStart('athlete')} className={prominent ? 'os-primary' : 'os-secondary px-3 py-2 text-xs'}>
          As a player
        </button>
      </div>
    </section>
  );
}

/** Leaves server mode for the demo club and starts the chosen role there. */
function startDemoFromServer(role: DemoRole) {
  setBackendChoice('local');
  window.location.assign(`/?demo=${role}`);
}

// ---------------------------------------------------------------------------
// Signed in to the club (or trying to be)
// ---------------------------------------------------------------------------

function roleLabel(database: LocalDatabase, personId: string, role: MembershipRole) {
  const memberships = database.memberships.filter((m) => m.personId === personId && m.role === role);
  return memberships
    .map((membership) => {
      const team = database.teams.find((candidate) => candidate.id === membership.teamId);
      if (!team) return null;
      if (role === 'athlete') return team.name;
      const roleName = coachRolesForTeam(database, team.id).find((candidate) => candidate.id === membership.coachRoleId)?.name;
      return roleName ? `${team.name} · ${roleName}` : team.name;
    })
    .filter(Boolean)
    .join(', ');
}

function ServerStart() {
  const router = useRouter();
  const status = useBackendStatus();
  // Reading starts the connection to the server.
  useLocalDatabase();
  const database = status.phase === 'ready' ? readDatabase() : null;

  if (status.phase === 'loading') {
    return <Page><Card><p className="text-sm text-slate-400">Connecting to your club …</p></Card></Page>;
  }

  if (status.phase === 'signedOut') {
    return (
      <Page>
        <SignInCard />
        <DemoCard prominent={false} onStart={startDemoFromServer} />
      </Page>
    );
  }

  const signOutButton = (
    <button type="button" onClick={async () => { await signOut(); window.location.assign('/'); }} className="justify-self-start text-xs font-bold text-slate-400 underline">
      Sign out
    </button>
  );

  if (status.phase === 'unlinked') {
    return (
      <Page>
        <Card tone="primary">
          <div>
            <p className="text-lg font-black text-white">You are signed in</p>
            <p className="mt-1 text-sm text-slate-400">Your account is not part of a team yet. Players join with the code from their coach; staff open their invitation link.</p>
          </div>
          <Link href="/join" className="os-success text-center">Join with a code</Link>
          {signOutButton}
        </Card>
        <DemoCard prominent={false} onStart={startDemoFromServer} />
      </Page>
    );
  }

  if (status.phase === 'error' || !database) {
    return (
      <Page>
        <section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-5 text-sm text-red-100">
          Could not load the data from the server. {status.error}
        </section>
        <DemoCard prominent={false} onStart={startDemoFromServer} />
      </Page>
    );
  }

  const own = ownPersonIds(database);
  const me = database.people.find((person) => own.includes(person.id)) ?? null;
  const choices = (['coach', 'athlete'] as const).flatMap((role) =>
    own
      .filter((personId) => database.memberships.some((m) => m.personId === personId && m.role === role))
      .map((personId) => ({ role, personId, detail: roleLabel(database, personId, role) })),
  );

  return (
    <Page>
      <Card tone="primary">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">{database.club.name}</p>
          <p className="mt-2 text-2xl font-black text-white">Welcome back{me ? `, ${me.firstName}` : ''}</p>
        </div>
        <div className="grid gap-2">
          {choices.map((choice) => (
            <button
              key={`${choice.role}-${choice.personId}`}
              type="button"
              onClick={() => {
                setActiveIdentity({ role: choice.role, personId: choice.personId });
                router.push(HOME_FOR_ROLE[choice.role]);
              }}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-left transition hover:border-emerald-300/60"
            >
              <span className="min-w-0">
                <span className="block text-sm font-black text-white">Continue as {choice.role === 'coach' ? 'coach' : 'player'}</span>
                <span className="block truncate text-xs text-slate-400">{choice.detail}</span>
              </span>
              <span aria-hidden className="text-lg font-black text-emerald-300">›</span>
            </button>
          ))}
        </div>
        {signOutButton}
      </Card>
      <DemoCard prominent={false} onStart={startDemoFromServer} />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Local mode: the demo club (and the way to the club server, if there is one)
// ---------------------------------------------------------------------------

function LocalStart() {
  const { database, error, ready } = useLocalDatabase();
  const router = useRouter();
  const params = useSearchParams();
  const requestedDemo = params.get('demo');
  const serverAvailable = isServerAvailable();

  function start(role: DemoRole) {
    if (!database) return;
    const person = peopleWithRole(database, role)[0];
    if (!person) return;
    setActiveIdentity({ role, personId: person.id });
    router.push(HOME_FOR_ROLE[role]);
  }

  // Arriving from server mode with a role already picked: start it.
  useEffect(() => {
    if (database && (requestedDemo === 'coach' || requestedDemo === 'athlete')) start(requestedDemo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database, requestedDemo]);

  if (error) {
    return (
      <Page>
        <section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-5 text-sm text-red-100">
          <p className="font-bold">The demo data in this browser could not be read.</p>
          <p className="mt-2">{error.message}</p>
        </section>
      </Page>
    );
  }

  if (!ready || !database || requestedDemo) {
    return <Page><Card><p className="text-sm text-slate-400">Preparing the demo club …</p></Card></Page>;
  }

  const coach = peopleWithRole(database, 'coach')[0];
  const athlete = peopleWithRole(database, 'athlete')[0];

  return (
    <Page>
      {serverAvailable ? <SignInCard /> : null}
      <DemoCard prominent={!serverAvailable} onStart={start} />
      <p className="px-1 text-xs text-slate-500">
        Demo: {database.club.name}, {database.teams.length} teams, {peopleWithRole(database, 'athlete').length} players.
        {coach && athlete ? ` Starts as ${displayName(coach)} or ${displayName(athlete)}; switch any time from the menu at the top.` : ''}
      </p>
    </Page>
  );
}
