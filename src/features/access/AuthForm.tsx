'use client';

/**
 * E-mail and password, for signing in or creating an account on the pilot
 * server. Used on /login and on /join (before accepting an invitation or
 * joining with a code).
 *
 * Choosing to sign in also switches this device to the server; the page that
 * follows loads fresh, so nothing of the local test data is carried over.
 */

import { useState } from 'react';

import { setBackendChoice, signInWithPassword, signUpWithPassword } from '@/shared/data';

const fieldClass = 'os-field';

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
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

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
      const { confirmationNeeded } = await signUpWithPassword(email, password, returnTo);
      // The confirmation link comes back to this device in server mode.
      setBackendChoice('server');
      if (confirmationNeeded) {
        setConfirmationSentTo(email.trim());
      } else {
        window.location.assign(returnTo);
        return;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
    setBusy(false);
  }

  if (confirmationSentTo) {
    return (
      <section className="os-panel p-5 text-sm text-slate-200">
        <p className="text-lg font-black text-white">Fast geschafft</p>
        <p className="mt-2">
          Wir haben eine Mail an <span className="font-bold">{confirmationSentTo}</span> geschickt. Öffne den Link darin,
          dann geht es hier weiter.
        </p>
        <button type="button" onClick={() => { setConfirmationSentTo(null); setMode('signIn'); }} className="mt-4 text-xs font-bold text-slate-400 underline">
          Schon bestätigt? Anmelden
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="os-panel grid gap-3 p-5">
      <div className="flex rounded-full border border-slate-800 bg-slate-950/80 p-1 text-xs font-black">
        <button type="button" onClick={() => setMode('signIn')} className={`flex-1 rounded-full px-3 py-2 ${mode === 'signIn' ? 'bg-emerald-300 text-slate-950' : 'text-slate-400'}`}>Anmelden</button>
        <button type="button" onClick={() => setMode('signUp')} className={`flex-1 rounded-full px-3 py-2 ${mode === 'signUp' ? 'bg-emerald-300 text-slate-950' : 'text-slate-400'}`}>Konto erstellen</button>
      </div>
      {intro ? <p className="text-sm text-slate-400">{intro}</p> : null}
      <label className="grid gap-1 text-sm font-bold text-slate-200">
        E-Mail
        <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={fieldClass} />
      </label>
      <label className="grid gap-1 text-sm font-bold text-slate-200">
        Passwort
        <input
          type="password"
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          required
          minLength={mode === 'signUp' ? 8 : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
        />
      </label>
      {mode === 'signUp' ? <p className="text-xs text-slate-500">Mindestens 8 Zeichen.</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-red-500/45 bg-red-950/35 px-3 py-2 text-sm font-bold text-red-100">{error}</p> : null}
      <button type="submit" disabled={busy} className="os-success justify-center disabled:opacity-60">
        {busy ? 'Einen Moment …' : mode === 'signIn' ? 'Anmelden' : 'Konto erstellen'}
      </button>
    </form>
  );
}
