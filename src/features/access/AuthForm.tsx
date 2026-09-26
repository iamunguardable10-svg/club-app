'use client';

/**
 * E-mail and password, for signing in, creating an account or asking for a
 * password reset on the pilot server. Used on /login and on /join (before
 * accepting an invitation or joining with a code).
 *
 * Signing in also switches this device to the server; the page that follows
 * loads fresh, so nothing of the local test data is carried over.
 */

import { useState } from 'react';

import { requestPasswordReset, setBackendChoice, signInWithPassword, signUpWithPassword } from '@/shared/data';

type Mode = 'signIn' | 'signUp' | 'reset';

const SUBMIT_LABEL: Record<Mode, string> = {
  signIn: 'Sign in',
  signUp: 'Create account',
  reset: 'Send reset link',
};

export function AuthForm({
  initialMode = 'signIn',
  returnTo,
  intro,
}: {
  initialMode?: 'signIn' | 'signUp';
  /** Where to go after signing in, and where the confirmation mail leads back to. */
  returnTo: string;
  intro?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mailSent, setMailSent] = useState<{ to: string; kind: 'confirm' | 'reset' } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signIn') {
        await signInWithPassword(email, password);
        setBackendChoice('server');
        window.location.assign(returnTo);
        return;
      }
      if (mode === 'reset') {
        await requestPasswordReset(email);
        setMailSent({ to: email.trim(), kind: 'reset' });
      } else {
        const { confirmationNeeded } = await signUpWithPassword(email, password, returnTo);
        // The confirmation link comes back to this device in server mode.
        setBackendChoice('server');
        if (!confirmationNeeded) {
          window.location.assign(returnTo);
          return;
        }
        setMailSent({ to: email.trim(), kind: 'confirm' });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
    setBusy(false);
  }

  if (mailSent) {
    return (
      <section className="os-panel p-5 text-sm text-slate-200">
        <p className="text-lg font-black text-white">Check your inbox</p>
        <p className="mt-2">
          We sent a mail to <span className="font-bold">{mailSent.to}</span>.{' '}
          {mailSent.kind === 'confirm' ? 'Open the link in it to confirm your account; it brings you back here.' : 'Open the link in it to choose a new password.'}
        </p>
        <button type="button" onClick={() => { setMailSent(null); setMode('signIn'); }} className="mt-4 text-xs font-bold text-slate-400 underline">
          Back to sign in
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="os-panel grid gap-4 p-5">
      {mode !== 'reset' ? (
        <div className="flex rounded-full border border-slate-800 bg-slate-950/80 p-1 text-xs font-black" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'signIn'} onClick={() => setMode('signIn')} className={`flex-1 rounded-full px-3 py-2 ${mode === 'signIn' ? 'bg-emerald-300 text-slate-950' : 'text-slate-400'}`}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'signUp'} onClick={() => setMode('signUp')} className={`flex-1 rounded-full px-3 py-2 ${mode === 'signUp' ? 'bg-emerald-300 text-slate-950' : 'text-slate-400'}`}>Create account</button>
        </div>
      ) : (
        <div>
          <p className="text-lg font-black text-white">Forgot your password?</p>
          <p className="mt-1 text-sm text-slate-400">Enter your email and we send you a link to choose a new one.</p>
        </div>
      )}
      {intro && mode !== 'reset' ? <p className="text-sm text-slate-400">{intro}</p> : null}
      <label className="grid gap-1.5 text-sm font-bold text-slate-200">
        Email
        <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="os-field" />
      </label>
      {mode !== 'reset' ? (
        <label className="grid gap-1.5 text-sm font-bold text-slate-200">
          Password
          <input
            type="password"
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'signUp' ? 8 : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="os-field"
          />
          {mode === 'signUp' ? <span className="text-xs font-medium text-slate-500">At least 8 characters.</span> : null}
        </label>
      ) : null}
      {error ? <p role="alert" className="rounded-xl border border-red-500/45 bg-red-950/35 px-3 py-2 text-sm font-bold text-red-100">{error}</p> : null}
      <button type="submit" disabled={busy} className="os-success justify-center disabled:opacity-60">
        {busy ? 'One moment …' : SUBMIT_LABEL[mode]}
      </button>
      {mode === 'signUp' ? (
        <p className="text-xs text-slate-400">
          Club OS keeps what you enter so your team can use it: no ads, nothing sold. Under 16? Ask a parent first.{' '}
          <a href="/privacy" className="font-bold text-sky-300 underline">How Club OS handles your data</a>
        </p>
      ) : null}
      {mode === 'signIn' ? (
        <button type="button" onClick={() => { setMode('reset'); setError(null); }} className="justify-self-start text-xs font-bold text-slate-400 underline">
          Forgot password?
        </button>
      ) : null}
      {mode === 'reset' ? (
        <button type="button" onClick={() => { setMode('signIn'); setError(null); }} className="justify-self-start text-xs font-bold text-slate-400 underline">
          Back to sign in
        </button>
      ) : null}
    </form>
  );
}
