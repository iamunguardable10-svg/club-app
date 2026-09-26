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
import { QuickPlayerRoles } from '@/features/identity/QuickPlayerRoles';
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
import { useT, type MessageKey } from '@/shared/i18n';
import { LanguagePicker } from '@/shared/i18n/LanguagePicker';

type DemoRole = IdentityRole;

const CONTINUE_KEY: Record<IdentityRole, MessageKey> = { coach: 'start.continueAs.coach', athlete: 'start.continueAs.athlete', club: 'start.continueAs.club' };

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
  const t = useT();
  return (
    <main className="os-page">
      <div className="os-container max-w-xl space-y-4 pb-12 pt-8 sm:pt-14">
        <header className="px-1">
          <div className="flex items-center justify-between gap-3">
            <p className="os-kicker">{t('start.kicker')}</p>
            <LanguagePicker compact />
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">{t('start.title')}</h1>
          <p className="os-copy mt-2 max-w-md">{t('start.subtitle')}</p>
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
  const t = useT();
  return (
    <Card tone="primary">
      <div>
        <p className="text-lg font-black text-white">{t('start.signIn.title')}</p>
        <p className="mt-1 text-sm text-slate-400">{t('start.signIn.detail')}</p>
      </div>
      <Link href="/login" className="os-success text-center">{t('start.signIn.button')}</Link>
    </Card>
  );
}

/** The demo club, as the secondary way in (or the only one without a server). */
function DemoCard({ prominent, onStart }: { prominent: boolean; onStart: (role: DemoRole) => void }) {
  const t = useT();
  const button = prominent ? 'os-secondary' : 'os-secondary px-3 py-2 text-xs';
  return (
    <section className={prominent ? 'os-panel grid gap-4 p-5 sm:p-6' : 'os-panel-soft grid gap-3 p-4'}>
      <div>
        <p className={prominent ? 'text-lg font-black text-white' : 'text-sm font-black text-slate-200'}>{t('start.demo.title')}</p>
        <p className="mt-1 text-xs text-slate-400">{t('start.demo.detail')}</p>
      </div>
      <div className={`grid gap-2 ${prominent ? 'sm:grid-cols-3' : 'grid-cols-3'}`}>
        <button type="button" onClick={() => onStart('coach')} className={prominent ? 'os-success' : button}>
          {t('start.demo.asCoach')}
        </button>
        <button type="button" onClick={() => onStart('athlete')} className={prominent ? 'os-primary' : button}>
          {t('start.demo.asPlayer')}
        </button>
        <button type="button" onClick={() => onStart('club')} className={button}>
          {t('start.demo.asClubAdmin')}
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
  const t = useT();
  const router = useRouter();
  const status = useBackendStatus();
  // "Add a role" from the account menu: every way in, also when signed in.
  const addRole = useSearchParams().get('add') === '1';
  // Reading starts the connection to the server.
  useLocalDatabase();
  const database = status.phase === 'ready' ? readDatabase() : null;

  if (status.phase === 'loading') {
    return <Page><Card><p className="text-sm text-slate-400">{t('start.connecting')}</p></Card></Page>;
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
      {t('start.signOut')}
    </button>
  );

  if (status.phase === 'unlinked') {
    return (
      <Page>
        <Card tone="primary">
          <div>
            <p className="text-lg font-black text-white">{t('start.unlinked.title')}</p>
            <p className="mt-1 text-sm text-slate-400">{t('start.unlinked.detail')}</p>
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
          {t('start.loadError', { error: status.error ?? '' })}
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
          <p className="mt-2 text-2xl font-black text-white">{me ? t('start.welcomeBackName', { name: me.firstName }) : t('start.welcomeBack')}</p>
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
                <span className="block text-sm font-black text-white">{choice.role === 'club' && !isClubAdmin(database, choice.personId) ? t('start.continueAs.departmentLead') : t(CONTINUE_KEY[choice.role])}</span>
                <span className="block truncate text-xs text-slate-400">{choice.detail}</span>
              </span>
              <span aria-hidden className="text-lg font-black text-emerald-300">›</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {signOutButton}
          {addRole ? null : <Link href="/?add=1" className="text-xs font-bold text-slate-400 underline">{t('start.addRole')}</Link>}
        </div>
      </Card>
      {addRole ? (
        <>
          <QuickPlayerRoles database={database} />
          <WhoAreYou signedIn />
          <p className="text-xs text-slate-500">{t('start.oneClubNote', { club: database.club.name })}</p>
        </>
      ) : null}
      <DemoCard prominent={false} onStart={startDemoFromServer} />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Local mode: the demo club (and the way to the club server, if there is one)
// ---------------------------------------------------------------------------

function LocalStart() {
  const t = useT();
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
          <p className="font-bold">{t('start.local.readError')}</p>
          <p className="mt-2">{error.message}</p>
        </section>
      </Page>
    );
  }

  if (!ready || !database || requestedDemo) {
    return <Page><Card><p className="text-sm text-slate-400">{t('start.local.preparing')}</p></Card></Page>;
  }

  const coach = peopleWithRole(database, 'coach')[0];
  const athlete = peopleWithRole(database, 'athlete')[0];

  return (
    <Page>
      {serverAvailable ? <><SignInCard /><WhoAreYou /></> : null}
      <DemoCard prominent={!serverAvailable} onStart={start} />
      <p className="px-1 text-xs text-slate-500">
        {t('start.local.summary', { club: database.club.name, count: database.teams.length, players: peopleWithRole(database, 'athlete').length })}
        {coach && athlete ? ` ${t('start.local.startsAs', { coach: displayName(coach), athlete: displayName(athlete) })}` : ''}
      </p>
    </Page>
  );
}
