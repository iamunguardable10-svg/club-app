'use client';

/**
 * Joining the club on the pilot server (piece 8b).
 *
 * - `/join?invite=<token>`: a personal invitation link, for staff (from the
 *   Head Coach) and for club roles (department lead, from the club admin).
 *   Shows who it is for, then (after signing in or creating an account)
 *   links the account to that person.
 * - `/join?code=<code>`: a player's way in with the team's link (or QR
 *   code): club and team first, then the card, account, done.
 * - `/join`: a player without a code yet: the card, the account, and then
 *   the code (or the link opened later, which finds the card waiting).
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
          <AuthForm legalLinks={false}
            initialMode="signUp" staff consent={draft.consent}
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

const CARD_FIRST = 'join:';

/**
 * A player without a code or link yet (Ben, 2026-10-25): first the card
 * (name, photo, position … and consent), then the account, and only then
 * the team's code, or its link opened later. Everything waits on the
 * device until then (`repository.ts`).
 */
function CardFirstFlow({ account }: { account: Account }) {
  const t = useT();
  const status = useBackendStatus();
  useLocalDatabase();
  const [draft, setDraft] = useState(() => readOnboardingDraft(CARD_FIRST));
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<{ code: string; data: JoinCodePreview } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const labels = [t('onboarding.step.you'), t('onboarding.step.account'), t('onboarding.step.join')];
  const database = status.phase === 'ready' ? readDatabase() : null;
  const me = database ? database.people.find((person) => ownPersonIds(database).includes(person.id)) ?? null : null;
  const current = account && draft ? 2 : draft ? 1 : 0;
  const title = t('onboarding.join.title');

  if (!draft) {
    return (
      <Shell title={title} steps={{ labels, current }}>
        {account ? <AccountLine account={account} /> : null}
        <p className="px-1 text-sm text-slate-400">{t('onboarding.join.cardFirst')}</p>
        <ProfileStep
          askName={!me} knownName={me ? `${me.firstName} ${me.lastName}` : undefined} knownBirthYear={me?.birthYear}
          player={{ teamName: null, sport: null, fixedNumbers: true, pickSport: true }} initial={null} submitLabel={t('common.continue')}
          onDone={(profile) => {
            const next = { for: CARD_FIRST, ...profile, ...(me ? { firstName: me.firstName, lastName: me.lastName } : {}) };
            storeOnboardingDraft(next);
            setDraft(next);
          }}
        />
      </Shell>
    );
  }

  if (!account) {
    return (
      <Shell title={title} steps={{ labels, current }}>
        <AuthForm legalLinks={false} initialMode="signUp" consent={draft.consent} returnTo="/join" intro={t('onboarding.join.cardFirstAccount')} />
        <button type="button" onClick={() => setDraft(null)} className="justify-self-start px-1 text-xs font-bold text-slate-400 underline">{t('onboarding.back')}</button>
      </Shell>
    );
  }

  async function check(event: React.FormEvent) {
    event.preventDefault();
    const code = joinCodeFrom(value);
    if (code.length < 6) return setError(t('onboarding.who.errorJoinCode'));
    setBusy(true);
    setError(null);
    try {
      const found = await previewJoinCode(code);
      if (!found) setError(t('onboarding.join.codeUnknown'));
      else if (!found.usable) setError(t('onboarding.join.teamInactive'));
      else setPreview({ code, data: found });
    } catch (caught) {
      setError(errorText(t, caught));
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const teamId = await joinTeamWithCode(preview.code, me ? me.firstName : draft!.firstName, me ? me.lastName : draft!.lastName, draft!.consent);
      if (draft!.details) storePendingPlayerDetails({ teamId, ...draft!.details });
      clearOnboardingDraft();
      continueAs('athlete', teamId);
    } catch (caught) {
      setError(errorText(t, caught));
      setBusy(false);
    }
  }

  return (
    <Shell title={title} steps={{ labels, current }}>
      <AccountLine account={account} />
      {preview ? (
        <section className="os-panel grid gap-3 p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">{preview.data.clubName}</p>
          <p className="-mt-2 text-2xl font-black text-white">{preview.data.teamName}</p>
          <ErrorLine message={error} />
          <button type="button" disabled={busy || status.phase === 'loading'} onClick={() => void join()} className="os-success justify-center disabled:opacity-60">
            {busy ? t('common.oneMoment') : t('onboarding.join.submit')}
          </button>
          <button type="button" onClick={() => { setPreview(null); setError(null); }} className="justify-self-start text-xs font-bold text-slate-400 underline">{t('onboarding.join.otherCode')}</button>
        </section>
      ) : (
        <form onSubmit={check} className="os-panel grid gap-3 p-5">
          <div>
            <p className="text-lg font-black text-white">{t('onboarding.join.nowTeam')}</p>
            <p className="mt-1 text-sm text-slate-400">{t('onboarding.join.nowTeamDetail')}</p>
          </div>
          <label className="grid gap-1 text-sm font-bold text-slate-200">
            {t('onboarding.join.codeOrLink')}
            <input value={value} onChange={(event) => { setValue(event.target.value); setError(null); }} placeholder="ABCD-EFGH" autoCapitalize="characters" autoComplete="off" spellCheck={false} className="os-field font-mono tracking-[0.15em]" />
          </label>
          <ErrorLine message={error} />
          <button type="submit" disabled={busy} className="os-success justify-center disabled:opacity-60">{busy ? t('common.checkingCode') : t('common.continue')}</button>
          <p className="text-xs text-slate-500">{t('onboarding.join.laterHint')}</p>
        </form>
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
  const draftKey = `join:${code}`;
  // The card may have been made before the code (`CardFirstFlow`): it counts here too.
  const [draft, setDraft] = useState(() => (code ? readOnboardingDraft(draftKey) ?? readOnboardingDraft(CARD_FIRST) : null));
  const [preview, setPreview] = useState<JoinCodePreview | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const labels = [t('onboarding.step.code'), t('onboarding.step.you'), t('onboarding.step.account'), t('onboarding.step.join')];

  useEffect(() => {
    if (!code) return;
    previewJoinCode(code).then(setPreview).catch((caught) => { setPreview(null); setLoadError(caught); });
  }, [code]);

  const title = t('onboarding.join.title');
  const first = { labels, current: 0 };
  if (preview === undefined) return <Shell title={title} steps={first}><p className="text-sm text-slate-400">{t('common.checkingCode')}</p></Shell>;
  if (!preview) return <Shell title={title} steps={first}><EnterCode initial={code} message={loadError ? errorText(t, loadError) : t('onboarding.join.codeUnknown')} /></Shell>;
  if (!preview.usable) return <Shell title={title} steps={first}><EnterCode initial="" message={t('onboarding.join.teamInactive')} /></Shell>;

  // Already someone in this club (e.g. a coach who also plays): no name needed.
  const database = status.phase === 'ready' ? readDatabase() : null;
  const me = database ? database.people.find((person) => ownPersonIds(database).includes(person.id)) ?? null : null;
  const current = account ? 3 : draft ? 2 : 1;
  const player = { teamName: preview.teamName, sport: preview.sport ?? null, fixedNumbers: preview.fixedNumbers ?? true, clubName: preview.clubName, departmentName: preview.departmentName ?? null, logoUrl: preview.logoUrl ?? null };

  async function join(profile: Profile) {
    setBusy(true);
    setError(null);
    try {
      const teamId = await joinTeamWithCode(code, me ? me.firstName : profile.firstName, me ? me.lastName : profile.lastName, profile.consent);
      if (profile.details) storePendingPlayerDetails({ teamId, ...profile.details });
      clearOnboardingDraft();
      continueAs('athlete', teamId);
    } catch (caught) {
      setError(errorText(t, caught));
      setBusy(false);
    }
  }

  return (
    <Shell title={title} steps={{ labels, current }}>
      <section className="os-panel p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">{preview.clubName}</p>
        <p className="mt-1 text-2xl font-black text-white">{preview.teamName}</p>
        <p className="mt-1 text-sm text-slate-400">{draft && !me ? t('onboarding.join.asName', { name: `${draft.firstName} ${draft.lastName}` }) : t('onboarding.join.asPlayer')}</p>
      </section>
      {account ? (
        draft || me ? (
          <section className="os-panel grid gap-3 p-5">
            <AccountLine account={account} />
            {me ? <p className="text-sm text-slate-300">{t('onboarding.join.joiningAs', { name: `${me.firstName} ${me.lastName}` })}</p> : null}
            {me && !draft ? (
              <ProfileStep askName={false} knownName={`${me.firstName} ${me.lastName}`} player={player} initial={null} knownBirthYear={me.birthYear} submitLabel={t('onboarding.join.submit')} onDone={join} />
            ) : (
              <>
                <ErrorLine message={error} />
                <button type="button" disabled={busy || status.phase === 'loading'} onClick={() => draft && join(draft)} className="os-success justify-center disabled:opacity-60">
                  {busy ? t('common.oneMoment') : t('onboarding.join.submit')}
                </button>
              </>
            )}
            {me && !draft ? <ErrorLine message={error} /> : null}
          </section>
        ) : (
          <>
            <AccountLine account={account} />
            <ErrorLine message={error} />
            <ProfileStep askName player={player} initial={null} submitLabel={t('onboarding.join.submit')} onDone={join} />
          </>
        )
      ) : draft ? (
        <>
          <AuthForm legalLinks={false} initialMode="signUp" consent={draft.consent} returnTo={`/join?code=${encodeURIComponent(code)}`} intro={t('onboarding.join.codeIntro')} />
          <button type="button" onClick={() => setDraft(null)} className="justify-self-start px-1 text-xs font-bold text-slate-400 underline">{t('onboarding.back')}</button>
        </>
      ) : (
        <ProfileStep
          askName player={player} initial={null} submitLabel={t('common.continue')}
          onDone={(profile) => {
            const next = { for: draftKey, ...profile };
            storeOnboardingDraft(next);
            setDraft(next);
          }}
        />
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
  return code ? <CodeFlow code={code} account={account} /> : <CardFirstFlow account={account} />;
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinContent />
    </Suspense>
  );
}
