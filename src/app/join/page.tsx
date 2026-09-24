'use client';

/**
 * Joining the club on the pilot server.
 *
 * - `/join?invite=<token>`: a staff member's personal invitation link. Shows
 *   what it is for, then (after signing in or creating an account) links the
 *   account to that staff member.
 * - `/join` or `/join?code=<code>`: an athlete enters the team's join code and
 *   their name.
 *
 * Both need an account first; the form for that appears in place, and the
 * mail confirmation (if the project asks for one) leads back here.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { AuthForm } from '@/features/access/AuthForm';
import { LocalModeLink } from '@/features/access/LocalModeLink';
import {
  acceptStaffInvite,
  currentAccount,
  getBackendChoice,
  joinTeamWithCode,
  ownPersonIds,
  previewInvite,
  readDatabase,
  setActiveIdentity,
  setBackendChoice,
  signOut,
  useBackendStatus,
  useLocalDatabase,
  type InvitePreview,
} from '@/shared/data';

type Account = { email: string } | null | undefined;

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="os-page">
      <div className="os-container max-w-md space-y-5">
        <header className="os-hero p-6">
          <p className="os-kicker">Club OS</p>
          <h1 className="os-title mt-2">{title}</h1>
        </header>
        {children}
        <LocalModeLink />
      </div>
    </main>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-xl border border-red-500/45 bg-red-950/35 px-3 py-2 text-sm font-bold text-red-100">{message}</p> : null;
}

function AccountLine({ account }: { account: { email: string } }) {
  return (
    <p className="text-xs text-slate-400">
      Angemeldet als {account.email} ·{' '}
      <button type="button" className="underline" onClick={async () => { await signOut(); window.location.reload(); }}>anderes Konto</button>
    </p>
  );
}

/** After joining: act as the new role and go to its start page. */
function continueAs(role: 'coach' | 'athlete', teamId: string) {
  const database = readDatabase();
  const own = database ? ownPersonIds(database) : [];
  const membership = database?.memberships.find((m) => m.teamId === teamId && m.role === role && own.includes(m.personId));
  if (membership) setActiveIdentity({ role, personId: membership.personId });
  window.location.assign(role === 'coach' ? '/coach/today' : '/athlete/home');
}

function InviteFlow({ token, account }: { token: string; account: Account }) {
  const status = useBackendStatus();
  // Asking for the data starts the connection to the server store, which
  // joining and accepting go through.
  useLocalDatabase();
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    previewInvite(token).then(setPreview).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, [token]);

  if (preview === undefined && !error) return <Shell title="Einladung"><p className="text-sm text-slate-400">Einladung wird geladen …</p></Shell>;
  if (!preview || !preview.usable) {
    return (
      <Shell title="Einladung">
        <section className="os-panel p-5 text-sm text-slate-300">
          {error ?? 'Diese Einladung gilt nicht mehr. Bitte lass dir einen neuen Link schicken.'}
        </section>
      </Shell>
    );
  }

  return (
    <Shell title="Einladung ins Trainerteam">
      <section className="os-panel p-5 text-sm text-slate-300">
        <p className="text-lg font-black text-white">{preview.firstName} {preview.lastName}</p>
        <p className="mt-1">{preview.roleName ?? 'Trainerteam'} · {preview.teamName} · {preview.clubName}</p>
      </section>
      {account ? (
        <section className="os-panel grid gap-3 p-5">
          <AccountLine account={account} />
          <ErrorLine message={error} />
          <button
            type="button"
            disabled={busy || status.phase === 'loading'}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const teamId = await acceptStaffInvite(token);
                continueAs('coach', teamId);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : String(caught));
                setBusy(false);
              }
            }}
            className="os-success justify-center disabled:opacity-60"
          >
            {busy ? 'Einen Moment …' : 'Einladung annehmen'}
          </button>
        </section>
      ) : (
        <AuthForm
          initialMode="signUp"
          returnTo={`/join?invite=${encodeURIComponent(token)}`}
          intro="Erstelle ein Konto (oder melde dich an). Danach nimmst du die Einladung an."
        />
      )}
    </Shell>
  );
}

function CodeFlow({ initialCode, account }: { initialCode: string; account: Account }) {
  const status = useBackendStatus();
  // Asking for the data starts the connection to the server store, which
  // joining and accepting go through.
  useLocalDatabase();
  const [code, setCode] = useState(initialCode);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!account) {
    return (
      <Shell title="Team beitreten">
        <AuthForm
          initialMode="signUp"
          returnTo={`/join${initialCode ? `?code=${encodeURIComponent(initialCode)}` : ''}`}
          intro="Erstelle ein Konto (oder melde dich an). Danach trittst du mit dem Code deines Teams bei."
        />
      </Shell>
    );
  }

  return (
    <Shell title="Team beitreten">
      <form
        className="os-panel grid gap-3 p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const teamId = await joinTeamWithCode(code, firstName, lastName);
            continueAs('athlete', teamId);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
            setBusy(false);
          }
        }}
      >
        <AccountLine account={account} />
        <p className="text-sm text-slate-400">Den Code bekommst du von deinem Trainer.</p>
        <label className="grid gap-1 text-sm font-bold text-slate-200">
          Beitrittscode
          <input required value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" className="os-field font-mono tracking-[0.2em]" />
        </label>
        <label className="grid gap-1 text-sm font-bold text-slate-200">
          Vorname
          <input required value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" className="os-field" />
        </label>
        <label className="grid gap-1 text-sm font-bold text-slate-200">
          Nachname
          <input required value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" className="os-field" />
        </label>
        <ErrorLine message={error} />
        <button type="submit" disabled={busy || status.phase === 'loading'} className="os-success justify-center disabled:opacity-60">
          {busy ? 'Einen Moment …' : 'Beitreten'}
        </button>
      </form>
    </Shell>
  );
}

function JoinContent() {
  const params = useSearchParams();
  const [account, setAccount] = useState<Account>(undefined);

  useEffect(() => {
    currentAccount()
      .then((found) => {
        // Signed in but this device is in the local test mode: joining only
        // exists on the server, so switch and load the page fresh.
        if (found && getBackendChoice() !== 'server') {
          setBackendChoice('server');
          window.location.reload();
          return;
        }
        setAccount(found);
      })
      .catch(() => setAccount(null));
  }, []);

  if (account === undefined) return <Shell title="Club OS"><p className="text-sm text-slate-400">Einen Moment …</p></Shell>;
  const invite = params.get('invite');
  if (invite) return <InviteFlow token={invite} account={account} />;
  return <CodeFlow initialCode={(params.get('code') ?? '').toUpperCase()} account={account} />;
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinContent />
    </Suspense>
  );
}
