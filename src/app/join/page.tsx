'use client';

/**
 * Joining the club on the pilot server (piece 8b).
 *
 * - `/join?invite=<token>`: a personal invitation link, for staff (from the
 *   Head Coach) and for club roles (department lead, from the club admin).
 *   Shows who it is for, then (after signing in or creating an account)
 *   links the account to that person.
 * - `/join?code=<code>` or `/join`: a player's way in. The code (or the
 *   link, or the QR code that carries it) shows club and team before any
 *   account exists, then account, name, done.
 *
 * The form for the account appears in place, and the mail confirmation (if
 * the project asks for one) leads back to the same step.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { AuthForm } from '@/features/access/AuthForm';
import { AccountLine, ErrorLine, OnboardingShell as Shell, continueAs } from '@/features/onboarding/OnboardingShell';
import { useAccount, type Account } from '@/features/onboarding/useAccount';
import { joinCodeFrom } from '@/features/onboarding/WhoAreYou';
import {
  acceptStaffInvite,
  joinTeamWithCode,
  ownPersonIds,
  previewInvite,
  previewJoinCode,
  readDatabase,
  useBackendStatus,
  useLocalDatabase,
  type InvitePreview,
  type JoinCodePreview,
} from '@/shared/data';

function errorText(caught: unknown) {
  return caught instanceof Error ? caught.message : String(caught);
}

function InviteFlow({ token, account }: { token: string; account: Account }) {
  const status = useBackendStatus();
  // Asking for the data starts the connection to the server store, which
  // accepting goes through.
  useLocalDatabase();
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    previewInvite(token).then(setPreview).catch((caught) => setError(errorText(caught)));
  }, [token]);

  if (preview === undefined && !error) return <Shell title="Invitation"><p className="text-sm text-slate-400">Loading invitation …</p></Shell>;
  if (!preview || !preview.usable) {
    return (
      <Shell title="Invitation">
        <section className="os-panel p-5 text-sm text-slate-300">
          {error ?? 'This invitation is no longer valid. Please ask for a new link.'}
        </section>
      </Shell>
    );
  }

  // Club roles carry their department (or the club) where staff carry their team.
  const clubRole = preview.kind === 'club';
  const place = preview.teamName === preview.clubName ? preview.clubName : `${preview.teamName} · ${preview.clubName}`;

  return (
    <Shell title="Your invitation">
      <section className="os-panel p-5 text-sm text-slate-300">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Invitation for</p>
        <p className="mt-1 text-lg font-black text-white">{preview.firstName} {preview.lastName}</p>
        <p className="mt-1">{preview.roleName ?? 'Staff'} · {place}</p>
        <p className="mt-3 text-xs text-slate-400">
          {clubRole
            ? 'You will manage the teams and invitations here. Player data stays with the coaches.'
            : 'You join the staff of this team with the rights of this role.'}
        </p>
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
                const id = await acceptStaffInvite(token);
                continueAs(clubRole ? 'club' : 'coach', clubRole ? null : id);
              } catch (caught) {
                setError(errorText(caught));
                setBusy(false);
              }
            }}
            className="os-success justify-center disabled:opacity-60"
          >
            {busy ? 'One moment …' : 'Accept invitation'}
          </button>
        </section>
      ) : (
        <AuthForm
          initialMode="signUp"
          returnTo={`/join?invite=${encodeURIComponent(token)}`}
          intro={`Not ${preview.firstName}? Ask for your own link. Otherwise create an account (or sign in), then accept.`}
        />
      )}
    </Shell>
  );
}

/** Step 1 for players without a link: type the code. */
function EnterCode({ initial, message }: { initial: string; message?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="os-panel grid gap-3 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const code = joinCodeFrom(value);
        if (code) window.location.assign(`/join?code=${encodeURIComponent(code)}`);
      }}
    >
      {message ? <ErrorLine message={message} /> : null}
      <p className="text-sm text-slate-400">Your coach gives you the code, a join link or a QR code.</p>
      <label className="grid gap-1 text-sm font-bold text-slate-200">
        Join code
        <input required value={value} onChange={(event) => setValue(event.target.value.toUpperCase())} placeholder="ABCD-EFGH" autoCapitalize="characters" autoComplete="off" spellCheck={false} className="os-field font-mono tracking-[0.2em]" />
      </label>
      <button type="submit" className="os-success justify-center">Continue</button>
    </form>
  );
}

function CodeFlow({ code, account }: { code: string; account: Account }) {
  const status = useBackendStatus();
  // Asking for the data starts the connection to the server store, which
  // joining goes through.
  useLocalDatabase();
  const [preview, setPreview] = useState<JoinCodePreview | null | undefined>(undefined);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) return;
    previewJoinCode(code).then(setPreview).catch((caught) => { setPreview(null); setError(errorText(caught)); });
  }, [code]);

  if (!code) return <Shell title="Join your team"><EnterCode initial="" /></Shell>;
  if (preview === undefined) return <Shell title="Join your team"><p className="text-sm text-slate-400">Checking the code …</p></Shell>;
  if (!preview) return <Shell title="Join your team"><EnterCode initial={code} message={error ?? 'This join code does not exist. Check it with your coach.'} /></Shell>;
  if (!preview.usable) return <Shell title="Join your team"><EnterCode initial="" message="This team is no longer active. Ask your coach for the current code." /></Shell>;

  // Already someone in this club (e.g. a coach who also plays): no name needed.
  const database = status.phase === 'ready' ? readDatabase() : null;
  const me = database ? database.people.find((person) => ownPersonIds(database).includes(person.id)) ?? null : null;

  return (
    <Shell title="Join your team">
      <section className="os-panel p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">{preview.clubName}</p>
        <p className="mt-1 text-2xl font-black text-white">{preview.teamName}</p>
        <p className="mt-1 text-sm text-slate-400">You join this team as a player.</p>
      </section>
      {!account ? (
        <AuthForm
          initialMode="signUp"
          returnTo={`/join?code=${encodeURIComponent(code)}`}
          intro="Create an account (or sign in), then you are in."
        />
      ) : (
        <form
          className="os-panel grid gap-3 p-5"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const teamId = await joinTeamWithCode(code, me ? me.firstName : firstName, me ? me.lastName : lastName);
              continueAs('athlete', teamId);
            } catch (caught) {
              setError(errorText(caught));
              setBusy(false);
            }
          }}
        >
          <AccountLine account={account} />
          {me ? (
            <p className="text-sm text-slate-300">Joining as <span className="font-black text-white">{me.firstName} {me.lastName}</span>.</p>
          ) : (
            <>
              <p className="text-sm text-slate-400">Your name, as your team will see it.</p>
              <label className="grid gap-1 text-sm font-bold text-slate-200">
                First name
                <input required value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" className="os-field" />
              </label>
              <label className="grid gap-1 text-sm font-bold text-slate-200">
                Last name
                <input required value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" className="os-field" />
              </label>
            </>
          )}
          <ErrorLine message={error} />
          <button type="submit" disabled={busy || status.phase === 'loading'} className="os-success justify-center disabled:opacity-60">
            {busy ? 'One moment …' : 'Join team'}
          </button>
        </form>
      )}
    </Shell>
  );
}

function JoinContent() {
  const params = useSearchParams();
  const account = useAccount();

  if (account === undefined) return <Shell title="Club OS"><p className="text-sm text-slate-400">One moment …</p></Shell>;
  const invite = params.get('invite');
  if (invite) return <InviteFlow token={invite} account={account} />;
  return <CodeFlow code={joinCodeFrom(params.get('code') ?? '')} account={account} />;
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinContent />
    </Suspense>
  );
}
