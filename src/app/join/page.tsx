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
import { errorText, useT } from '@/shared/i18n';

function InviteFlow({ token, account }: { token: string; account: Account }) {
  const t = useT();
  const status = useBackendStatus();
  // Asking for the data starts the connection to the server store, which
  // accepting goes through.
  useLocalDatabase();
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // Kept as caught and put into words when shown: it can arrive before the language is applied.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    previewInvite(token).then(setPreview).catch(setLoadError);
  }, [token]);

  if (preview === undefined && !loadError) return <Shell title={t('onboarding.join.inviteTitle')}><p className="text-sm text-slate-400">{t('onboarding.join.loadingInvite')}</p></Shell>;
  if (!preview || !preview.usable) {
    return (
      <Shell title={t('onboarding.join.inviteTitle')}>
        <section className="os-panel p-5 text-sm text-slate-300">
          {loadError ? errorText(t, loadError) : t('onboarding.join.inviteInvalid')}
        </section>
      </Shell>
    );
  }

  // Club roles carry their department (or the club) where staff carry their team.
  const clubRole = preview.kind === 'club';
  const place = preview.teamName === preview.clubName ? preview.clubName : `${preview.teamName} · ${preview.clubName}`;

  return (
    <Shell title={t('onboarding.join.yourInvitation')}>
      <section className="os-panel p-5 text-sm text-slate-300">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t('onboarding.join.invitationFor')}</p>
        <p className="mt-1 text-lg font-black text-white">{preview.firstName} {preview.lastName}</p>
        <p className="mt-1">{preview.roleName ?? t('onboarding.join.staff')} · {place}</p>
        <p className="mt-3 text-xs text-slate-400">
          {clubRole
            ? t('onboarding.join.clubRoleNote')
            : t('onboarding.join.staffNote')}
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
                setError(errorText(t, caught));
                setBusy(false);
              }
            }}
            className="os-success justify-center disabled:opacity-60"
          >
            {busy ? t('common.oneMoment') : t('onboarding.join.accept')}
          </button>
        </section>
      ) : (
        <AuthForm
          initialMode="signUp"
          returnTo={`/join?invite=${encodeURIComponent(token)}`}
          intro={t('onboarding.join.inviteIntro', { name: preview.firstName })}
        />
      )}
    </Shell>
  );
}

/** Step 1 for players without a link: type the code. */
function EnterCode({ initial, message }: { initial: string; message?: string }) {
  const t = useT();
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
      <p className="text-sm text-slate-400">{t('onboarding.join.codeHelp')}</p>
      <label className="grid gap-1 text-sm font-bold text-slate-200">
        {t('onboarding.who.joinCode')}
        <input required value={value} onChange={(event) => setValue(event.target.value.toUpperCase())} placeholder="ABCD-EFGH" autoCapitalize="characters" autoComplete="off" spellCheck={false} className="os-field font-mono tracking-[0.2em]" />
      </label>
      <button type="submit" className="os-success justify-center">{t('common.continue')}</button>
    </form>
  );
}

function CodeFlow({ code, account }: { code: string; account: Account }) {
  const t = useT();
  const status = useBackendStatus();
  // Asking for the data starts the connection to the server store, which
  // joining goes through.
  useLocalDatabase();
  const [preview, setPreview] = useState<JoinCodePreview | null | undefined>(undefined);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) return;
    previewJoinCode(code).then(setPreview).catch((caught) => { setPreview(null); setLoadError(caught); });
  }, [code]);

  const title = t('onboarding.join.title');
  if (!code) return <Shell title={title}><EnterCode initial="" /></Shell>;
  if (preview === undefined) return <Shell title={title}><p className="text-sm text-slate-400">{t('common.checkingCode')}</p></Shell>;
  if (!preview) return <Shell title={title}><EnterCode initial={code} message={loadError ? errorText(t, loadError) : t('onboarding.join.codeUnknown')} /></Shell>;
  if (!preview.usable) return <Shell title={title}><EnterCode initial="" message={t('onboarding.join.teamInactive')} /></Shell>;

  // Already someone in this club (e.g. a coach who also plays): no name needed.
  const database = status.phase === 'ready' ? readDatabase() : null;
  const me = database ? database.people.find((person) => ownPersonIds(database).includes(person.id)) ?? null : null;

  return (
    <Shell title={title}>
      <section className="os-panel p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">{preview.clubName}</p>
        <p className="mt-1 text-2xl font-black text-white">{preview.teamName}</p>
        <p className="mt-1 text-sm text-slate-400">{t('onboarding.join.asPlayer')}</p>
      </section>
      {!account ? (
        <AuthForm
          initialMode="signUp"
          returnTo={`/join?code=${encodeURIComponent(code)}`}
          intro={t('onboarding.join.codeIntro')}
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
              setError(errorText(t, caught));
              setBusy(false);
            }
          }}
        >
          <AccountLine account={account} />
          {me ? (
            <p className="text-sm text-slate-300">{t('onboarding.join.joiningAs', { name: `${me.firstName} ${me.lastName}` })}</p>
          ) : (
            <>
              <p className="text-sm text-slate-400">{t('onboarding.join.nameHelp')}</p>
              <label className="grid gap-1 text-sm font-bold text-slate-200">
                {t('common.firstName')}
                <input required value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" className="os-field" />
              </label>
              <label className="grid gap-1 text-sm font-bold text-slate-200">
                {t('common.lastName')}
                <input required value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" className="os-field" />
              </label>
            </>
          )}
          <ErrorLine message={error} />
          <button type="submit" disabled={busy || status.phase === 'loading'} className="os-success justify-center disabled:opacity-60">
            {busy ? t('common.oneMoment') : t('onboarding.join.submit')}
          </button>
        </form>
      )}
    </Shell>
  );
}

function JoinContent() {
  const t = useT();
  const params = useSearchParams();
  const account = useAccount();

  if (account === undefined) return <Shell title={t('start.kicker')}><p className="text-sm text-slate-400">{t('common.oneMoment')}</p></Shell>;
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
