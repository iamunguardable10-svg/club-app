'use client';

/**
 * Start page.
 *
 * One page for every situation a phone can be in:
 * - Not signed in: sign in, or for new people "Who are you?", which shows
 *   each their one way in (players: join code or link, staff and department
 *   leads: their personal invitation link, founders: a founding code). The
 *   demo club sits below, small.
 * - Signed in: welcome back, one card per own role to continue with
 *   (coach, player, club admin or department lead).
 * - Signed in without a club: the same "Who are you?", without signing in.
 * - A build without the club server: the demo club is all there is.
 *
 * The demo club never touches the server. Picking it from server mode
 * switches this device to the local mode and starts the chosen role there
 * (`?demo=coach|athlete`), so it is one tap either way.
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { WhoAreYou } from '@/features/onboarding/WhoAreYou';
import {
  clubRoleLabel,
  coachRolesForTeam,
  displayName,
  hasIdentityRole,
  isClubAdmin,
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
  type IdentityRole,
  type LocalDatabase,
} from '@/shared/data';
import { HOME_FOR_ROLE } from '@/features/identity/IdentitySwitcher';

type DemoRole = IdentityRole;

const CONTINUE_LABEL: Record<IdentityRole, string> = { coach: 'coach', athlete: 'player', club: 'club admin' };

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
        <p className="mt-1 text-sm text-slate-400">Your sessions and your team, on all your devices.</p>
      </div>
      <Link href="/login" className="os-success text-center">Sign in</Link>
    </Card>
  );
}

/** The demo club, as the secondary way in (or the only one without a server). */
function DemoCard({ prominent, onStart }: { prominent: boolean; onStart: (role: DemoRole) => void }) {
  const button = prominent ? 'os-secondary' : 'os-secondary px-3 py-2 text-xs';
  return (
    <section className={prominent ? 'os-panel grid gap-4 p-5 sm:p-6' : 'os-panel-soft grid gap-3 p-4'}>
      <div>
        <p className={prominent ? 'text-lg font-black text-white' : 'text-sm font-black text-slate-200'}>Try the demo club</p>
        <p className="mt-1 text-xs text-slate-400">No account needed. A made-up club with test data that lives only in this browser.</p>
      </div>
      <div className={`grid gap-2 ${prominent ? 'sm:grid-cols-3' : 'grid-cols-3'}`}>
        <button type="button" onClick={() => onStart('coach')} className={prominent ? 'os-success' : button}>
          As a coach
        </button>
        <button type="button" onClick={() => onStart('athlete')} className={prominent ? 'os-primary' : button}>
          As a player
        </button>
        <button type="button" onClick={() => onStart('club')} className={button}>
          As club admin
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

function roleLabel(database: LocalDatabase, personId: string, role: IdentityRole) {
  if (role === 'club') return clubRoleLabel(database, personId);
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
        <WhoAreYou />
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
            <p className="mt-1 text-sm text-slate-400">Your account is not part of a club yet. Choose below how you join.</p>
          </div>
          {signOutButton}
        </Card>
        <WhoAreYou signedIn />
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
  const choices = (['coach', 'athlete', 'club'] as const).flatMap((role) =>
    own
      .filter((personId) => hasIdentityRole(database, personId, role))
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
                <span className="block text-sm font-black text-white">Continue as {choice.role === 'club' && !isClubAdmin(database, choice.personId) ? 'department lead' : CONTINUE_LABEL[choice.role]}</span>
                <span className="block truncate text-xs text-slate-400">{choice.detail}</span>
              </span>
              <span aria-hidden className="text-lg font-black text-emerald-300">›</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {signOutButton}
          <Link href="/join" className="text-xs font-bold text-slate-400 underline">Join another team with a code</Link>
        </div>
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
    // The club admin rather than a department lead: they see the whole club.
    const person = role === 'club'
      ? database.people.find((candidate) => isClubAdmin(database, candidate.id))
      : peopleWithRole(database, role)[0];
    if (!person) return;
    setActiveIdentity({ role, personId: person.id });
    router.push(HOME_FOR_ROLE[role]);
  }

  // Arriving from server mode with a role already picked: start it.
  useEffect(() => {
    if (database && (requestedDemo === 'coach' || requestedDemo === 'athlete' || requestedDemo === 'club')) start(requestedDemo);
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
      {serverAvailable ? <><SignInCard /><WhoAreYou /></> : null}
      <DemoCard prominent={!serverAvailable} onStart={start} />
      <p className="px-1 text-xs text-slate-500">
        Demo: {database.club.name}, {database.teams.length} teams, {peopleWithRole(database, 'athlete').length} players.
        {coach && athlete ? ` Starts as ${displayName(coach)} or ${displayName(athlete)}; switch any time from the menu at the top.` : ''}
      </p>
    </Page>
  );
}
