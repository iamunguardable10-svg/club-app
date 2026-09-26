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
import { currentLocale, errorText, useT, type MessageKey } from '@/shared/i18n';

type Mode = 'signIn' | 'signUp' | 'reset';

const SUBMIT_LABEL: Record<Mode, MessageKey> = {
  signIn: 'auth.submit.signIn',
  signUp: 'auth.submit.signUp',
  reset: 'auth.submit.reset',
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
  const t = useT();
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
        const { confirmationNeeded } = await signUpWithPassword(email, password, returnTo, currentLocale());
        // The confirmation link comes back to this device in server mode.
        setBackendChoice('server');
        if (!confirmationNeeded) {
          window.location.assign(returnTo);
          return;
        }
        setMailSent({ to: email.trim(), kind: 'confirm' });
      }
    } catch (caught) {
      setError(errorText(t, caught));
    }
    setBusy(false);
  }

  if (mailSent) {
    return (
      <section className="os-panel p-5 text-sm text-slate-200">
        <p className="text-lg font-black text-white">{t('auth.mail.title')}</p>
        <p className="mt-2">
          {t('auth.mail.sentTo', { email: mailSent.to })}{' '}
          {mailSent.kind === 'confirm' ? t('auth.mail.confirm') : t('auth.mail.reset')}
        </p>
        <button type="button" onClick={() => { setMailSent(null); setMode('signIn'); }} className="mt-4 text-xs font-bold text-slate-400 underline">
          {t('auth.backToSignIn')}
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="os-panel grid gap-4 p-5">
      {mode !== 'reset' ? (
        <div className="flex rounded-full border border-slate-800 bg-slate-950/80 p-1 text-xs font-black" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'signIn'} onClick={() => setMode('signIn')} className={`flex-1 rounded-full px-3 py-2 ${mode === 'signIn' ? 'bg-emerald-300 text-slate-950' : 'text-slate-400'}`}>{t('auth.tab.signIn')}</button>
          <button type="button" role="tab" aria-selected={mode === 'signUp'} onClick={() => setMode('signUp')} className={`flex-1 rounded-full px-3 py-2 ${mode === 'signUp' ? 'bg-emerald-300 text-slate-950' : 'text-slate-400'}`}>{t('auth.tab.signUp')}</button>
        </div>
      ) : (
        <div>
          <p className="text-lg font-black text-white">{t('auth.reset.title')}</p>
          <p className="mt-1 text-sm text-slate-400">{t('auth.reset.detail')}</p>
        </div>
      )}
      {intro && mode !== 'reset' ? <p className="text-sm text-slate-400">{intro}</p> : null}
      <label className="grid gap-1.5 text-sm font-bold text-slate-200">
        {t('auth.email')}
        <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="os-field" />
      </label>
      {mode !== 'reset' ? (
        <label className="grid gap-1.5 text-sm font-bold text-slate-200">
          {t('auth.password')}
          <input
            type="password"
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'signUp' ? 8 : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="os-field"
          />
          {mode === 'signUp' ? <span className="text-xs font-medium text-slate-500">{t('auth.passwordHint')}</span> : null}
        </label>
      ) : null}
      {error ? <p role="alert" className="rounded-xl border border-red-500/45 bg-red-950/35 px-3 py-2 text-sm font-bold text-red-100">{error}</p> : null}
      <button type="submit" disabled={busy} className="os-success justify-center disabled:opacity-60">
        {busy ? t('common.oneMoment') : t(SUBMIT_LABEL[mode])}
      </button>
      {mode === 'signUp' ? (
        <p className="text-xs text-slate-400">
          {t('auth.signUpNote')}{' '}
          <a href="/privacy" className="font-bold text-sky-300 underline">{t('auth.privacyLink')}</a>
        </p>
      ) : null}
      {mode === 'signIn' ? (
        <button type="button" onClick={() => { setMode('reset'); setError(null); }} className="justify-self-start text-xs font-bold text-slate-400 underline">
          {t('auth.forgotPassword')}
        </button>
      ) : null}
      {mode === 'reset' ? (
        <button type="button" onClick={() => { setMode('signIn'); setError(null); }} className="justify-self-start text-xs font-bold text-slate-400 underline">
          {t('auth.backToSignIn')}
        </button>
      ) : null}
    </form>
  );
}
