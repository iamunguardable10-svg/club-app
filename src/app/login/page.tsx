'use client';

/**
 * Sign-in for the pilot server. `?next=` is where to continue afterwards,
 * `?mode=signUp` opens the "create account" tab.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { AuthForm } from '@/features/access/AuthForm';
import { LocalModeLink } from '@/features/access/LocalModeLink';

function safeNext(value: string | null) {
  // Only paths inside the app, never another site.
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function LoginContent() {
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  return (
    <main className="os-page">
      <div className="os-container max-w-md space-y-5">
        <header className="os-hero p-6">
          <p className="os-kicker">Club OS</p>
          <h1 className="os-title mt-2">Sign in to your club</h1>
          <p className="os-copy mt-3">New here? Create an account, then join with your team&apos;s code or your invitation link.</p>
        </header>
        <AuthForm initialMode={params.get('mode') === 'signUp' ? 'signUp' : 'signIn'} returnTo={next} />
        <LocalModeLink />
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
