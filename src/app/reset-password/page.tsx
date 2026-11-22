'use client';

/**
 * Where the password-reset mail leads. supabase-js reads the recovery link
 * and signs the person in for this one purpose; here they choose a new
 * password and continue into the app.
 */

import { useEffect, useState } from 'react';

import { MIN_PASSWORD, PasswordField } from '@/features/access/AuthForm';
import { currentAccount, setBackendChoice, updatePassword } from '@/shared/data';
import { errorText, setLocale, useT } from '@/shared/i18n';
import { isLocale } from '@/shared/i18n/locales';

/** Where the person was before asking for a new password (`next`, only a path of this app). */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next) return '/start';
  try {
    const url = new URL(next, window.location.origin);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}` : '/start';
  } catch {
    return '/start';
  }
}

export default function ResetPasswordPage() {
  const t = useT();
  const [account, setAccount] = useState<{ email: string } | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const language = new URLSearchParams(window.location.search).get('lang');
    if (isLocale(language)) setLocale(language);
    // The recovery link is handled while the client starts; give it a moment.
    const timer = window.setTimeout(() => {
      currentAccount().then(setAccount).catch(() => setAccount(null));
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      setBackendChoice('server');
      window.location.assign(nextPath());
    } catch (caught) {
      setError(errorText(t, caught));
      setBusy(false);
    }
  }

  return (
    <main className="os-page">
      <div className="os-container max-w-md space-y-5">
        <header className="os-hero">
          <p className="os-kicker">{t('start.kicker')}</p>
          <h1 className="os-title mt-2">{t('auth.newPassword.title')}</h1>
        </header>
        {account === undefined ? <p className="text-sm text-slate-400">{t('common.oneMoment')}</p> : null}
        {account === null ? (
          <section className="os-panel grid gap-3 p-5 text-sm text-slate-300">
            <p>{t('auth.newPassword.invalidLink')}</p>
            <a href="/login" className="os-success justify-center">{t('auth.newPassword.goToSignIn')}</a>
          </section>
        ) : null}
        {account ? (
          <form onSubmit={submit} className="os-panel grid gap-4 p-5">
            <p className="text-sm text-slate-400">{t('auth.newPassword.for', { email: account.email })}</p>
            {/* One field with "show", like creating the account (less is more, 2026-11-22). */}
            <PasswordField label={t('auth.newPassword.label')} hideLabel placeholder={t('auth.passwordRule', { count: MIN_PASSWORD })} value={password} onChange={setPassword} show={show} onToggle={() => setShow((value) => !value)} autoComplete="new-password" autoFocus />
            {error ? <p role="alert" className="rounded-xl border border-red-500/45 bg-red-950/35 px-3 py-2 text-sm font-medium text-red-100">{error}</p> : null}
            <button type="submit" disabled={busy || password.length < MIN_PASSWORD} className="os-success justify-center disabled:opacity-60">
              {busy ? t('common.oneMoment') : t('auth.newPassword.save')}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
