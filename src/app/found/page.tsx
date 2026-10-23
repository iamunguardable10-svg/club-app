'use client';

/**
 * Founding a club (piece 8b, wizard in goal piece 3), with a one-time
 * founding code from the Club OS team: code → you → account → club (first
 * department and team, tapped from suggestions) → more teams, departments
 * and halls → links to share (team code for players, invitations for
 * coaches) → club area.
 *
 * The code is checked before an account exists, so a typo does not end in a
 * fresh account that cannot do anything. Name and consent come before the
 * account and survive the confirmation mail. The founder becomes club admin
 * and, if they coach the first team themselves, also its Head Coach.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { AuthForm } from '@/features/access/AuthForm';
import { ConsentFields, EMPTY_CONSENT, consentComplete } from '@/features/legal/ConsentFields';
import { FoundSetup } from '@/features/onboarding/FoundSetup';
import { AccountLine, ErrorLine, OnboardingShell as Shell, continueAs } from '@/features/onboarding/OnboardingShell';
import { ProfileStep, type Profile } from '@/features/onboarding/ProfileStep';
import { Choice, SPORTS, TEAM_SUGGESTIONS } from '@/features/onboarding/foundSuggestions';
import { useAccount, type Account } from '@/features/onboarding/useAccount';
import { clearOnboardingDraft, foundClub, isFoundingCodeUsable, readOnboardingDraft, storeOnboardingDraft, useBackendStatus, useLocalDatabase } from '@/shared/data';
import { errorText, useT, type MessageKey } from '@/shared/i18n';

function normalize(code: string) {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function EnterCode({ initial, message }: { initial: string; message?: string }) {
  const t = useT();
  const [value, setValue] = useState(initial);
  return (
    <form
      className="os-panel grid gap-3 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const code = normalize(value);
        if (code) window.location.assign(`/found?code=${encodeURIComponent(code)}`);
      }}
    >
      {message ? <ErrorLine message={message} /> : null}
      <p className="text-sm text-slate-400">{t('onboarding.who.founderText')}</p>
      <label className="grid gap-1 text-sm font-bold text-slate-200">
        {t('onboarding.who.foundingCode')}
        <input required value={value} onChange={(event) => setValue(event.target.value.toUpperCase())} placeholder="ABCDE-FGHJK" autoCapitalize="characters" autoComplete="off" spellCheck={false} className="os-field font-mono tracking-[0.2em]" />
      </label>
      <button type="submit" className="os-success justify-center">{t('common.continue')}</button>
    </form>
  );
}

function Field({ label, value, onChange, placeholder, autoComplete }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; autoComplete?: string }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-bold text-slate-200">
      {label}
      <input required value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete ?? 'off'} className="os-field min-w-0" />
    </label>
  );
}

/** The step labels, shared by every screen of the way. */
function useFoundSteps() {
  const t = useT();
  return [t('onboarding.step.code'), t('onboarding.step.you'), t('onboarding.step.account'), t('onboarding.step.club'), t('onboarding.step.share')];
}

/** The club, its first department and first team, then founding on the server. */
function FoundForm({ code, account, profile }: { code: string; account: { email: string }; profile: Profile | null }) {
  const t = useT();
  const status = useBackendStatus();
  // Asking for the data starts the connection to the server store, which
  // founding goes through.
  useLocalDatabase();
  const [clubName, setClubName] = useState('');
  const [city, setCity] = useState('');
  const [firstName, setFirstName] = useState(profile?.firstName ?? '');
  const [lastName, setLastName] = useState(profile?.lastName ?? '');
  const [sport, setSport] = useState<MessageKey | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [coachTeam, setCoachTeam] = useState(true);
  // Given with the name before the account; asked here only when that step was on another device.
  const [consent, setConsent] = useState(profile?.consent ?? EMPTY_CONSENT);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already in a club: one club per account for now. (While founding, the
  // reload after the server call also reaches `ready`; that must not show this.)
  if (status.phase === 'ready' && !busy) {
    return (
      <section className="os-panel grid gap-3 p-5 text-sm text-slate-300">
        <AccountLine account={account} />
        <p>{t('onboarding.found.alreadyInClub')}</p>
        <a href="/start" className="os-secondary justify-center text-center">{t('onboarding.found.backToClub')}</a>
      </section>
    );
  }

  const department = sport ? t(sport) : departmentName.trim();
  return (
    <form
      className="grid grid-cols-[minmax(0,1fr)] gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await foundClub({ code, clubName, city, firstName, lastName, departmentName: department, teamName: teamName.trim(), coachTeam, consent });
          clearOnboardingDraft();
          continueAs('club', null, '/found?setup=1');
        } catch (caught) {
          setError(errorText(t, caught));
          setBusy(false);
        }
      }}
    >
      <section className="os-panel grid grid-cols-[minmax(0,1fr)] gap-3 p-5">
        <AccountLine account={account} />
        <Field label={t('onboarding.found.clubName')} value={clubName} onChange={setClubName} placeholder={t('onboarding.found.clubNamePlaceholder')} />
        <label className="grid min-w-0 gap-1 text-sm font-bold text-slate-200">
          <span>{t('onboarding.found.city')} <span className="text-xs font-normal text-slate-500">{t('common.optional')}</span></span>
          <input value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" className="os-field min-w-0" />
        </label>
        {profile ? null : (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.firstName')} value={firstName} onChange={setFirstName} autoComplete="given-name" />
            <Field label={t('common.lastName')} value={lastName} onChange={setLastName} autoComplete="family-name" />
          </div>
        )}
      </section>
      <section className="os-panel grid grid-cols-[minmax(0,1fr)] gap-3 p-5">
        <div>
          <p className="text-sm font-black text-white">{t('onboarding.found.firstDepartment')}</p>
          <p className="text-xs text-slate-400">{t('onboarding.found.sportHelp')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SPORTS.map((key) => <Choice key={key} label={t(key)} selected={sport === key} onSelect={() => { setSport(sport === key ? null : key); setDepartmentName(''); }} />)}
        </div>
        <input value={departmentName} onChange={(event) => { setDepartmentName(event.target.value); setSport(null); }} placeholder={t('onboarding.found.otherSport')} aria-label={t('onboarding.found.otherSport')} className="os-field min-w-0" />
      </section>
      <section className="os-panel grid grid-cols-[minmax(0,1fr)] gap-3 p-5">
        <div>
          <p className="text-sm font-black text-white">{t('onboarding.found.firstTeam')}</p>
          <p className="text-xs text-slate-400">{t('onboarding.found.whereToStartDetail')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TEAM_SUGGESTIONS.map((entry) => {
            const name = entry.label ? t(entry.label) : entry.name;
            return <Choice key={name} label={name} selected={teamName === name} onSelect={() => setTeamName(teamName === name ? '' : name)} />;
          })}
        </div>
        <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder={t('onboarding.found.otherTeam')} aria-label={t('onboarding.found.otherTeam')} className="os-field min-w-0" />
        <label className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
          <input type="checkbox" checked={coachTeam} onChange={(event) => setCoachTeam(event.target.checked)} className="mt-1 h-4 w-4" />
          <span>
            <span className="block font-black">{t('onboarding.found.coachTeam')}</span>
            <span className="block text-xs text-slate-400">{t('onboarding.found.coachTeamDetail')}</span>
          </span>
        </label>
      </section>
      {profile ? null : <ConsentFields value={consent} onChange={setConsent} staff />}
      <ErrorLine message={error} />
      <button type="submit" disabled={busy || status.phase === 'loading' || !consentComplete(consent, true) || !clubName.trim() || !department || !teamName.trim() || !firstName.trim() || !lastName.trim()} className="os-success justify-center disabled:opacity-60">
        {busy ? t('common.oneMoment') : t('onboarding.found.submit')}
      </button>
    </form>
  );
}

function FoundFlow({ code, account }: { code: string; account: Account }) {
  const t = useT();
  const labels = useFoundSteps();
  const draftKey = `found:${code}`;
  const [draft, setDraft] = useState(() => (code ? readOnboardingDraft(draftKey) : null));
  const [usable, setUsable] = useState<boolean | undefined>(undefined);
  // Kept as caught and put into words when shown: it can arrive before the language is applied.
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!code) return;
    isFoundingCodeUsable(code).then(setUsable).catch((caught) => { setUsable(false); setError(caught); });
  }, [code]);

  const title = t('onboarding.found.title');
  const first = { labels, current: 0 };
  if (!code) return <Shell title={title} steps={first}><EnterCode initial="" /></Shell>;
  if (usable === undefined) return <Shell title={title} steps={first}><p className="text-sm text-slate-400">{t('common.checkingCode')}</p></Shell>;
  if (!usable) {
    return <Shell title={title} steps={first}><EnterCode initial={code} message={error ? errorText(t, error) : t('onboarding.found.invalid')} /></Shell>;
  }
  const current = account ? 3 : draft ? 2 : 1;
  return (
    <Shell title={title} steps={{ labels, current }}>
      <section className="os-panel p-5 text-sm text-slate-300">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">{t('onboarding.found.accepted')}</p>
        <p className="mt-1 font-mono text-lg font-black tracking-[0.2em] text-white">{code}</p>
      </section>
      {account ? (
        <FoundForm code={code} account={account} profile={draft} />
      ) : draft ? (
        <>
          <AuthForm legalLinks={false} initialMode="signUp" staff consent={draft.consent} returnTo={`/found?code=${encodeURIComponent(code)}`} intro={t('onboarding.found.accountIntro')} />
          <button type="button" onClick={() => setDraft(null)} className="justify-self-start px-1 text-xs font-bold text-slate-400 underline">{t('onboarding.back')}</button>
        </>
      ) : (
        <ProfileStep
          staff askName initial={null} submitLabel={t('common.continue')}
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

function FoundContent() {
  const t = useT();
  const labels = useFoundSteps();
  const params = useSearchParams();
  const account = useAccount();
  if (account === undefined) return <Shell title={t('start.kicker')}><p className="text-sm text-slate-400">{t('common.oneMoment')}</p></Shell>;
  // Right after founding: teams, departments and halls, then the links to share.
  if (params.get('setup') === '1' && account) return <FoundSetup labels={labels} />;
  return <FoundFlow code={normalize(params.get('code') ?? '')} account={account} />;
}

export default function FoundPage() {
  return (
    <Suspense fallback={null}>
      <FoundContent />
    </Suspense>
  );
}
