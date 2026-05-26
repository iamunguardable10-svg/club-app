'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
}

export function CreateClubStartRouter() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'needs_auth' | 'redirecting' | 'error'>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      const supabase = createBrowserSupabaseClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (userError && !isMissingAuthSessionError(userError.message)) {
        setStatus('error');
        setError(userError.message);
        return;
      }

      if (!user) {
        setStatus('needs_auth');
        return;
      }

      setStatus('redirecting');
      router.replace('/onboarding/create-club');
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <main className="os-page flex min-h-screen items-center justify-center px-4 py-8 text-white">
      <section className="os-hero w-full max-w-3xl">
        <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <Link href="/onboarding" className="text-sm font-black text-slate-400 transition hover:text-sky-300">
              ← Back to onboarding
            </Link>
            <p className="os-kicker mt-5 text-emerald-300">Club Admin</p>
            <h1 className="os-title">Create the club workspace.</h1>
          </div>
          <div className="grid gap-2">
            {['Club basics', 'Departments', 'Facilities', 'First teams'].map((item, index) => (
              <div key={item} className="os-panel-soft flex items-center gap-3 px-3 py-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-xl bg-sky-300/10 text-xs font-black text-sky-200">{index + 1}</span>
                <span className="text-sm font-black text-slate-200">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {status === 'checking' ? (
          <p className="mt-6 text-sm leading-6 text-slate-400">Checking session...</p>
        ) : null}

        {status === 'redirecting' ? (
          <p className="mt-6 text-sm leading-6 text-slate-400">Opening club setup...</p>
        ) : null}

        {status === 'needs_auth' ? (
          <div className="mt-6 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/auth/signup?next=/onboarding/create-club"
                className="os-success text-center"
              >
                Create account
              </Link>
              <Link
                href="/auth/login?next=/onboarding/create-club"
                className="os-secondary text-center"
              >
                Login
              </Link>
            </div>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="mt-5 rounded-xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error ?? 'Something went wrong while checking your session.'}
          </div>
        ) : null}
      </section>
    </main>
  );
}
