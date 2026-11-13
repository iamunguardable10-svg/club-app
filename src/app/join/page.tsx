'use client';

/**
 * Joining the club on the pilot server (piece 8b).
 *
 * - `/join?invite=<token>`: a personal invitation link, for staff (from the
 *   Head Coach) and for club roles (department lead, from the club admin).
 *   Shows who it is for, then (after signing in or creating an account)
 *   links the account to that person.
 * - `/join?code=<code>`: a player's way in with the team's link (or QR
 *   code): the team, "Join", the account, then name, birth year, consent
 *   and the card.
 * - `/join`: a player without a link: the code (or the pasted link) first.
 *
 * The form for the account appears in place, and the mail confirmation (if
 * the project asks for one) leads back to the same step.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { AuthForm } from '@/features/access/AuthForm';
import { AccountLine, ErrorLine, OnboardingShell as Shell, continueAs } from '@/features/onboarding/OnboardingShell';
import { useAccount, type Account } from '@/features/onboarding/useAccount';
import { ProfileStep, type Profile } from '@/features/onboarding/ProfileStep';
import { joinCodeFrom } from '@/features/onboarding/WhoAreYou';
import {
  acceptStaffInvite,
  clearOnboardingDraft,
  readOnboardingDraft,
  storeOnboardingDraft,
  storePendingPlayerDetails,
  type AccessConsent,
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
  const draftKey = `invite:${token}`;
  const [draft, setDraft] = useState(() => readOnboardingDraft(draftKey));
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // Kept as caught and put into words when shown: it can arrive before the language is applied.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const labels = [t('onboarding.step.invitation'), t('onboarding.step.account'), t('onboarding.step.done')];

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
  const current = account ? 2 : draft ? 1 : 0;

  async function accept(consent: AccessConsent) {
    setBusy(true);
    setError(null);
    try {
      const id = await acceptStaffInvite(token, consent);
      clearOnboardingDraft();
      continueAs(clubRole ? 'club' : 'coach', clubRole ? null : id);
    } catch (caught) {
      setError(errorText(t, caught));
      setBusy(false);
    }
  }

  return (
    <Shell title={t('onboarding.join.yourInvitation')} steps={{ labels, current }}>
      <section className="os-panel p-5 text-sm text-slate-300">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t('onboarding.join.invitationFor')}</p>
        <p className="mt-1 text-lg font-black text-white">{preview.firstName} {preview.lastName}</p>
        <p className="mt-1">{preview.roleName ?? t('onboarding.join.staff')} · {place}</p>
        {current === 0 ? <p className="mt-3 text-xs text-slate-400">{clubRole ? t('onboarding.join.clubRoleNote') : t('onboarding.join.staffNote')}</p> : null}
      </section>
      {account ? (
        draft ? (
          <section className="os-panel grid gap-3 p-5">
            <AccountLine account={account} />
            <ErrorLine message={error} />
            <button type="button" disabled={busy || status.phase === 'loading'} onClick={() => accept(draft.consent)} className="os-success justify-center disabled:opacity-60">
              {busy ? t('common.oneMoment') : t('onboarding.join.accept')}
            </button>
          </section>
        ) : (
          <>
            <AccountLine account={account} />
            <ErrorLine message={error} />
            <ProfileStep staff askName={false} knownName={`${preview.firstName} ${preview.lastName}`} initial={null} submitLabel={t('onboarding.join.accept')} onDone={(profile) => accept(profile.consent)} />
          </>
        )
      ) : draft ? (
        <>
          <AuthForm
            staff consent={draft.consent}
            returnTo={`/join?invite=${encodeURIComponent(token)}`}
            intro={t('onboarding.join.inviteIntro', { name: preview.firstName })}
          />
          <button type="button" onClick={() => setDraft(null)} className="justify-self-start px-1 text-xs font-bold text-slate-400 underline">{t('onboarding.back')}</button>
        </>
      ) : (
        <ProfileStep
          staff askName={false} knownName={`${preview.firstName} ${preview.lastName}`} initial={null} submitLabel={t('common.continue')}
          onDone={(profile) => {
            const next = { for: draftKey, firstName: preview.firstName, lastName: preview.lastName, consent: profile.consent };
            storeOnboardingDraft(next);
            setDraft(next);
          }}
        />
      )}
    </Shell>
  );
}

/** A player without a link: the team's code (or the pasted link) first, like every other way in. */
function EnterCode({ initial, message }: { initial: string; message?: string }) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="wizard-step os-panel grid grid-cols-[minmax(0,1fr)] gap-4 p-6"
      onSubmit={(event) => {
        event.preventDefault();
        const code = joinCodeFrom(value);
        if (code.length < 6) { setError(t('onboarding.who.errorJoinCode')); return; }
        window.location.assign(`/join?code=${encodeURIComponent(code)}`);
      }}
    >
      <h2 className="text-2xl font-black leading-tight text-white">{t('onboarding.join.codeTitle')}</h2>
      <input
        required autoFocus value={value}
        onChange={(event) => { setValue(event.target.value); setError(null); }}
        placeholder={t('onboarding.join.codePlaceholder')} aria-label={t('onboarding.join.codeOrLink')}
        autoCapitalize="characters" autoComplete="off" spellCheck={false}
        className="os-field font-mono text-lg tracking-[0.12em]"
      />
      <ErrorLine message={error ?? message ?? null} />
      <button type="submit" className="os-success justify-center text-base">{t('common.continue')}</button>
    </form>
  );
}

/** The team the link leads to: logo, club, department, team. */
function TeamCard({ preview }: { preview: JoinCodePreview }) {

  return (
    <section className="os-panel flex items-center gap-4 p-5">
      {preview.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- the team's own logo from storage
        <img src={preview.logoUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl border border-slate-700 bg-slate-950 object-contain p-1" />
      ) : (
        <span aria-hidden className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-emerald-300/10 text-2xl font-black text-emerald-200">{preview.teamName.slice(0, 1).toUpperCase()}</span>
      )}
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">{preview.clubName}</p>
        <p className="mt-1 text-2xl font-black leading-tight text-white">{preview.teamName}</p>
        {preview.departmentName ? <p className="mt-0.5 text-sm font-bold text-slate-400">{preview.departmentName}</p> : null}
      </div>
    </section>
  );
}

/**
 * A player's way in with the team's link or code (Ben, 2026-11-12: "more
 * professional"): the team first, "Join"; then sign in or create the
 * account; only then name, birth year and consent, and the card after it.
 */
function CodeFlow({ code, account }: { code: string; account: Account }) {
  const t = useT();
  const status = useBackendStatus();
  const params = useSearchParams();
  // Asking for the data starts the connection to the server store, which
  // joining goes through.
  useLocalDatabase();
  const [preview, setPreview] = useState<JoinCodePreview | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<unknown>(null);
  // "Join" pressed; the confirmation mail comes back with `go=1`.
  const [joining, setJoining] = useState(() => params.get('go') === '1');
  const [error, setError] = useState<string | null>(null);
  const labels = [t('onboarding.step.team'), t('onboarding.step.account'), t('onboarding.step.you')];

  useEffect(() => {
    previewJoinCode(code).then(setPreview).catch((caught) => { setPreview(null); setLoadError(caught); });
  }, [code]);

  const title = t('onboarding.join.title');
  if (preview === undefined) return <Shell title={title}><p className="text-sm text-slate-400">{t('common.checkingCode')}</p></Shell>;
  if (!preview) return <Shell title={title}><EnterCode initial={code} message={loadError ? errorText(t, loadError) : t('onboarding.join.codeUnknown')} /></Shell>;
  if (!preview.usable) return <Shell title={title}><EnterCode initial="" message={t('onboarding.join.teamInactive')} /></Shell>;

  // Already someone in this club (e.g. a coach who also plays): no name needed.
  const database = status.phase === 'ready' ? readDatabase() : null;
  const me = database ? database.people.find((person) => ownPersonIds(database).includes(person.id)) ?? null : null;
  const current = !joining ? 0 : account ? 2 : 1;
  // The wizard leaves the number out where the sport has none (`sportHasNumbers`).
  const player = { teamName: preview.teamName, sport: preview.sport ?? null, fixedNumbers: preview.fixedNumbers ?? true, clubName: preview.clubName, departmentName: preview.departmentName ?? null, logoUrl: preview.logoUrl ?? null };

  async function join(profile: Profile) {
    setError(null);
    try {
      const teamId = await joinTeamWithCode(code, me ? me.firstName : profile.firstName, me ? me.lastName : profile.lastName, profile.consent);
      if (profile.details) storePendingPlayerDetails({ teamId, ...profile.details });
      continueAs('athlete', teamId);
    } catch (caught) {
      setError(errorText(t, caught));
    }
  }

  // From "You" on, the team's name is the page's title; its card would only repeat it.
  return (
    <Shell title={current === 2 ? preview.teamName : title} steps={{ labels, current }}>
      {current < 2 ? <TeamCard preview={preview} /> : null}
      {!joining ? (
        <button type="button" onClick={() => setJoining(true)} className="os-success w-full justify-center text-base">{t('onboarding.join.joinTeam')}</button>
      ) : !account ? (
        <>
          <AuthForm returnTo={`/join?code=${encodeURIComponent(code)}&go=1`} />
          <button type="button" onClick={() => setJoining(false)} className="justify-self-start px-1 text-xs font-bold text-slate-400 underline">{t('onboarding.back')}</button>
        </>
      ) : (
        <>
          <ErrorLine message={error} />
          <ProfileStep
            askName={!me} knownName={me ? `${me.firstName} ${me.lastName}` : undefined} knownBirthYear={me?.birthYear} knownBirthMonth={me?.birthMonth}
            player={player} termsAccepted initial={null} submitLabel={t('onboarding.join.submit')} onDone={join}
          />
        </>
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
  const code = joinCodeFrom(params.get('code') ?? '');
  return code ? <CodeFlow code={code} account={account} /> : <Shell title={t('onboarding.join.title')}><EnterCode initial="" /></Shell>;
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinContent />
    </Suspense>
  );
}
