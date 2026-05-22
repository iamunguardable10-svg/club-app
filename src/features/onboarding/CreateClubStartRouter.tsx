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
            <p className="os-kicker text-emerald-300">Create Club Setup</p>
            <h1 className="os-title">Start with the club spine.</h1>
            <p className="mt-4 text-sm leading-6 text-slate-400">One clean structure first: club, departments, halls and teams. Everything else becomes easier after that.</p>
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
          <p className="mt-6 text-sm leading-6 text-slate-400">Checking whether you are already signed in...</p>
        ) : null}

        {status === 'redirecting' ? (
          <p className="mt-6 text-sm leading-6 text-slate-400">You are signed in. Redirecting to the club setup flow...</p>
        ) : null}

        {status === 'needs_auth' ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm leading-6 text-slate-400">
              To create a club, you need an account first. After login or signup, you will come back to the club setup automatically.
            </p>
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
