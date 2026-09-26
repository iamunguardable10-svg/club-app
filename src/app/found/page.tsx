'use client';

/**
 * Founding a club (piece 8b), with a one-time founding code from the Club OS
 * team: code → account → club, first department, first team → club area.
 *
 * The code is checked before an account exists, so a typo does not end in a
 * fresh account that cannot do anything. The founder becomes club admin and,
 * if they coach the first team themselves, also its Head Coach.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { AuthForm } from '@/features/access/AuthForm';
import { AccountLine, ErrorLine, OnboardingShell as Shell, continueAs } from '@/features/onboarding/OnboardingShell';
import { useAccount, type Account } from '@/features/onboarding/useAccount';
import { foundClub, isFoundingCodeUsable, useBackendStatus, useLocalDatabase } from '@/shared/data';
import { errorText, useT } from '@/shared/i18n';

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

function FoundForm({ code, account }: { code: string; account: { email: string } }) {
  const t = useT();
  const status = useBackendStatus();
  // Asking for the data starts the connection to the server store, which
  // founding goes through.
  useLocalDatabase();
  const [clubName, setClubName] = useState('');
  const [city, setCity] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [coachTeam, setCoachTeam] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already in a club: one club per account for now. (While founding, the
  // reload after the server call also reaches `ready`; that must not show this.)
  if (status.phase === 'ready' && !busy) {
    return (
      <section className="os-panel grid gap-3 p-5 text-sm text-slate-300">
        <AccountLine account={account} />
        <p>{t('onboarding.found.alreadyInClub')}</p>
        <a href="/" className="os-secondary justify-center text-center">{t('onboarding.found.backToClub')}</a>
      </section>
    );
  }

  return (
    <form
      className="grid grid-cols-[minmax(0,1fr)] gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await foundClub({ code, clubName, city, firstName, lastName, departmentName, teamName, coachTeam });
          continueAs('club');
        } catch (caught) {
          setError(errorText(t, caught));
          setBusy(false);
        }
      }}
    >
      <section className="os-panel grid grid-cols-[minmax(0,1fr)] gap-3 p-5">
        <AccountLine account={account} />
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t('onboarding.found.yourClub')}</p>
        <Field label={t('onboarding.found.clubName')} value={clubName} onChange={setClubName} placeholder={t('onboarding.found.clubNamePlaceholder')} />
        <label className="grid min-w-0 gap-1 text-sm font-bold text-slate-200">
          <span>{t('onboarding.found.city')} <span className="text-xs font-normal text-slate-500">{t('common.optional')}</span></span>
          <input value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" className="os-field min-w-0" />
        </label>
      </section>
      <section className="os-panel grid grid-cols-[minmax(0,1fr)] gap-3 p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t('onboarding.found.you')}</p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <Field label={t('common.firstName')} value={firstName} onChange={setFirstName} autoComplete="given-name" />
          <Field label={t('common.lastName')} value={lastName} onChange={setLastName} autoComplete="family-name" />
        </div>
      </section>
      <section className="os-panel grid grid-cols-[minmax(0,1fr)] gap-3 p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t('onboarding.found.whereToStart')}</p>
        <p className="text-sm text-slate-400">{t('onboarding.found.whereToStartDetail')}</p>
        <Field label={t('onboarding.found.firstDepartment')} value={departmentName} onChange={setDepartmentName} placeholder={t('onboarding.found.departmentPlaceholder')} />
        <Field label={t('onboarding.found.firstTeam')} value={teamName} onChange={setTeamName} placeholder="U16" />
        <label className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
          <input type="checkbox" checked={coachTeam} onChange={(event) => setCoachTeam(event.target.checked)} className="mt-1 h-4 w-4" />
          <span>
            <span className="block font-black">{t('onboarding.found.coachTeam')}</span>
            <span className="block text-xs text-slate-400">{t('onboarding.found.coachTeamDetail')}</span>
          </span>
        </label>
      </section>
      <ErrorLine message={error} />
      <button type="submit" disabled={busy || status.phase === 'loading'} className="os-success justify-center disabled:opacity-60">
        {busy ? t('common.oneMoment') : t('onboarding.found.submit')}
      </button>
    </form>
  );
}

function FoundFlow({ code, account }: { code: string; account: Account }) {
  const t = useT();
  const [usable, setUsable] = useState<boolean | undefined>(undefined);
  // Kept as caught and put into words when shown: it can arrive before the language is applied.
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!code) return;
    isFoundingCodeUsable(code).then(setUsable).catch((caught) => { setUsable(false); setError(caught); });
  }, [code]);

  const title = t('onboarding.found.title');
  if (!code) return <Shell title={title}><EnterCode initial="" /></Shell>;
  if (usable === undefined) return <Shell title={title}><p className="text-sm text-slate-400">{t('common.checkingCode')}</p></Shell>;
  if (!usable) {
    return <Shell title={title}><EnterCode initial={code} message={error ? errorText(t, error) : t('onboarding.found.invalid')} /></Shell>;
  }
  return (
    <Shell title={title}>
      <section className="os-panel p-5 text-sm text-slate-300">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">{t('onboarding.found.accepted')}</p>
        <p className="mt-1 font-mono text-lg font-black tracking-[0.2em] text-white">{code}</p>
      </section>
      {account ? (
        <FoundForm code={code} account={account} />
      ) : (
        <AuthForm initialMode="signUp" returnTo={`/found?code=${encodeURIComponent(code)}`} intro={t('onboarding.found.accountIntro')} />
      )}
    </Shell>
  );
}

function FoundContent() {
  const t = useT();
  const params = useSearchParams();
  const account = useAccount();
  if (account === undefined) return <Shell title={t('start.kicker')}><p className="text-sm text-slate-400">{t('common.oneMoment')}</p></Shell>;
  return <FoundFlow code={normalize(params.get('code') ?? '')} account={account} />;
}

export default function FoundPage() {
  return (
    <Suspense fallback={null}>
      <FoundContent />
    </Suspense>
  );
}
