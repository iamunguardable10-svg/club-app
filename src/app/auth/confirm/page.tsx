'use client';

/**
 * Where the links in the account mails lead (confirm account, new e-mail,
 * new password, sign-in link). The link stays on our own address instead of
 * the auth server's, which mail filters trust more (iCloud put the
 * confirmation in spam, 2026-11-20). The one-time code is traded for a
 * sign-in, then the person continues where the mail was asked for (`next`,
 * only an address of this app). Signed up in the home-screen app (`app=1`):
 * the link opened in the browser, so the page says to go back to the app,
 * which signs in by itself (AuthForm); the browser can still go on.
 */

import { useEffect, useState } from 'react';

import { confirmEmailLink, EMAIL_LINK_TYPES, type EmailLinkType } from '@/shared/data';
import { setLocale, useT } from '@/shared/i18n';
import { isLocale } from '@/shared/i18n/locales';

/** `next` as a path of this app; anything else goes to the start page. */
function safeNext(value: string | null): string {
  if (!value) return '/start';
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}` : '/start';
  } catch {
    return '/start';
  }
}

export default function ConfirmEmailLinkPage() {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const [backToApp, setBackToApp] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = safeNext(params.get('next'));
    const language = new URL(next, window.location.origin).searchParams.get('lang');
    if (isLocale(language)) setLocale(language);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    // The code must not stay in the address or the history.
    window.history.replaceState(null, '', '/auth/confirm');
    if (!tokenHash || !EMAIL_LINK_TYPES.includes(type as EmailLinkType)) {
      setFailed(true);
      return;
    }
    const target = new URL(next, window.location.origin);
    const fromApp = target.searchParams.get('app') === '1';
    target.searchParams.delete('app');
    const continueAt = `${target.pathname}${target.search}`;
    confirmEmailLink(tokenHash, type as EmailLinkType)
      .then((ok) => (!ok ? setFailed(true) : fromApp ? setBackToApp(continueAt) : window.location.replace(continueAt)))
      .catch(() => setFailed(true));
  }, []);

  return (
    <main className="os-page">
      <div className="os-container max-w-md space-y-5">
        <header className="os-hero">
          <p className="os-kicker">{t('start.kicker')}</p>
          <h1 className="os-title mt-2">{t(failed ? 'auth.confirm.failedTitle' : backToApp ? 'auth.confirm.doneTitle' : 'auth.confirm.title')}</h1>
        </header>
        {backToApp ? (
          <section className="os-panel grid gap-3 p-5 text-sm text-slate-300">
            <p className="text-base font-semibold text-emerald-200">{t('auth.confirm.backToApp')}</p>
            <a href={backToApp} className="justify-self-start text-sm font-medium text-slate-400 underline">{t('auth.confirm.continueHere')}</a>
          </section>
        ) : failed ? (
          <section className="os-panel grid gap-3 p-5 text-sm text-slate-300">
            <p>{t('auth.confirm.failed')}</p>
            <a href="/login" className="os-success justify-center">{t('auth.newPassword.goToSignIn')}</a>
          </section>
        ) : (
          <p className="text-sm text-slate-400">{t('common.oneMoment')}</p>
        )}
      </div>
    </main>
  );
}
