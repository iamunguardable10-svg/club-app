'use client';

/**
 * Signing in or creating an account on the club server, e-mail first
 * (`AuthForm`). `?next=` is where to continue afterwards.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { AuthForm } from '@/features/access/AuthForm';
import { LocalModeLink } from '@/features/access/LocalModeLink';
import { LegalLinks } from '@/features/legal/LegalLinks';
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
        {/* Less is more: just the name and the language, then straight to the e-mail. */}
        <header className="flex items-center justify-between gap-3 px-1 pt-2">
          <p className="os-kicker">{t('start.kicker')}</p>
          <LanguagePicker compact />
        </header>
        <h1 className="sr-only">{t('auth.login.title')}</h1>
        <AuthForm returnTo={next} />
        <div className="grid justify-items-center gap-3 pt-2">
          <LocalModeLink />
          <LegalLinks quiet />
        </div>
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
