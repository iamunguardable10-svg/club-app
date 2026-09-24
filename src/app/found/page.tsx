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

function normalize(code: string) {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function EnterCode({ initial, message }: { initial: string; message?: string }) {
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
      <p className="text-sm text-slate-400">
        You set up your club and become its admin; then you invite department leads and coaches. During the pilot this
        needs a founding code from the Club OS team.
      </p>
      <label className="grid gap-1 text-sm font-bold text-slate-200">
        Founding code
        <input required value={value} onChange={(event) => setValue(event.target.value.toUpperCase())} placeholder="ABCDE-FGHJK" autoCapitalize="characters" autoComplete="off" spellCheck={false} className="os-field font-mono tracking-[0.2em]" />
      </label>
      <button type="submit" className="os-success justify-center">Continue</button>
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
        <p>This account already belongs to a club. To found another club, use another account.</p>
        <a href="/" className="os-secondary justify-center text-center">Back to my club</a>
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
          setError(caught instanceof Error ? caught.message : String(caught));
          setBusy(false);
        }
      }}
    >
      <section className="os-panel grid grid-cols-[minmax(0,1fr)] gap-3 p-5">
        <AccountLine account={account} />
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Your club</p>
        <Field label="Club name" value={clubName} onChange={setClubName} placeholder="SV Example" />
        <label className="grid min-w-0 gap-1 text-sm font-bold text-slate-200">
          <span>City <span className="text-xs font-normal text-slate-500">optional</span></span>
          <input value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" className="os-field min-w-0" />
        </label>
      </section>
      <section className="os-panel grid grid-cols-[minmax(0,1fr)] gap-3 p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">You</p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <Field label="First name" value={firstName} onChange={setFirstName} autoComplete="given-name" />
          <Field label="Last name" value={lastName} onChange={setLastName} autoComplete="family-name" />
        </div>
      </section>
      <section className="os-panel grid grid-cols-[minmax(0,1fr)] gap-3 p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Where to start</p>
        <p className="text-sm text-slate-400">One department and one team to begin with; you add more later.</p>
        <Field label="First department" value={departmentName} onChange={setDepartmentName} placeholder="Basketball" />
        <Field label="First team" value={teamName} onChange={setTeamName} placeholder="U16" />
        <label className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
          <input type="checkbox" checked={coachTeam} onChange={(event) => setCoachTeam(event.target.checked)} className="mt-1 h-4 w-4" />
          <span>
            <span className="block font-black">I coach this team myself</span>
            <span className="block text-xs text-slate-400">You become its Head Coach as well. Otherwise you invite the Head Coach afterwards.</span>
          </span>
        </label>
      </section>
      <ErrorLine message={error} />
      <button type="submit" disabled={busy || status.phase === 'loading'} className="os-success justify-center disabled:opacity-60">
        {busy ? 'One moment …' : 'Found club'}
      </button>
    </form>
  );
}

function FoundFlow({ code, account }: { code: string; account: Account }) {
  const [usable, setUsable] = useState<boolean | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    isFoundingCodeUsable(code).then(setUsable).catch((caught) => { setUsable(false); setError(caught instanceof Error ? caught.message : String(caught)); });
  }, [code]);

  if (!code) return <Shell title="Found your club"><EnterCode initial="" /></Shell>;
  if (usable === undefined) return <Shell title="Found your club"><p className="text-sm text-slate-400">Checking the code …</p></Shell>;
  if (!usable) {
    return <Shell title="Found your club"><EnterCode initial={code} message={error ?? 'This founding code is not valid or has already been used.'} /></Shell>;
  }
  return (
    <Shell title="Found your club">
      <section className="os-panel p-5 text-sm text-slate-300">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Founding code accepted</p>
        <p className="mt-1 font-mono text-lg font-black tracking-[0.2em] text-white">{code}</p>
      </section>
      {account ? (
        <FoundForm code={code} account={account} />
      ) : (
        <AuthForm initialMode="signUp" returnTo={`/found?code=${encodeURIComponent(code)}`} intro="Create your account (or sign in); then you set up the club." />
      )}
    </Shell>
  );
}

function FoundContent() {
  const params = useSearchParams();
  const account = useAccount();
  if (account === undefined) return <Shell title="Club OS"><p className="text-sm text-slate-400">One moment …</p></Shell>;
  return <FoundFlow code={normalize(params.get('code') ?? '')} account={account} />;
}

export default function FoundPage() {
  return (
    <Suspense fallback={null}>
      <FoundContent />
    </Suspense>
  );
}
