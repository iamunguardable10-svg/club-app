'use client';

/**
 * Where the password-reset mail leads. supabase-js reads the recovery link
 * and signs the person in for this one purpose; here they choose a new
 * password and continue into the app.
 */

import { useEffect, useState } from 'react';

import { currentAccount, setBackendChoice, updatePassword } from '@/shared/data';
import { errorText, useT } from '@/shared/i18n';

export default function ResetPasswordPage() {
  const t = useT();
  const [account, setAccount] = useState<{ email: string } | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
      window.location.assign('/');
    } catch (caught) {
      setError(errorText(t, caught));
      setBusy(false);
    }
  }

  return (
    <main className="os-page">
      <div className="os-container max-w-md space-y-5">
        <header className="os-hero p-6">
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
            <label className="grid gap-1.5 text-sm font-bold text-slate-200">
              {t('auth.newPassword.label')}
              <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="os-field" />
              <span className="text-xs font-medium text-slate-500">{t('auth.passwordHint')}</span>
            </label>
            {error ? <p role="alert" className="rounded-xl border border-red-500/45 bg-red-950/35 px-3 py-2 text-sm font-bold text-red-100">{error}</p> : null}
            <button type="submit" disabled={busy} className="os-success justify-center disabled:opacity-60">
              {busy ? t('common.oneMoment') : t('auth.newPassword.save')}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
