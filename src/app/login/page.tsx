'use client';

/**
 * Sign-in for the pilot server. `?next=` is where to continue afterwards,
 * `?mode=signUp` opens the "create account" tab.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { AuthForm } from '@/features/access/AuthForm';
import { LocalModeLink } from '@/features/access/LocalModeLink';
import { useT } from '@/shared/i18n';
import { LanguagePicker } from '@/shared/i18n/LanguagePicker';

function safeNext(value: string | null) {
  // Only paths inside the app, never another site. Browsers read "/\\evil.com"
  // like "//evil.com", so backslashes and control characters are refused too.
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return '/start';
  return value;
}

function LoginContent() {
  const t = useT();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  return (
    <main className="os-page">
      <div className="os-container max-w-md space-y-5">
        <header className="os-hero p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="os-kicker">{t('start.kicker')}</p>
            <LanguagePicker compact />
          </div>
          <h1 className="os-title mt-2">{t('auth.login.title')}</h1>
          <p className="os-copy mt-3">{t('auth.login.detail')}</p>
        </header>
        <AuthForm initialMode={params.get('mode') === 'signUp' ? 'signUp' : 'signIn'} returnTo={next} />
        <LocalModeLink />
        <a href="/privacy" className="block text-center text-xs font-bold text-slate-400 underline">{t('auth.privacyLink')}</a>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
