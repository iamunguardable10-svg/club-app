'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

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

      if (userError) {
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
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 text-white">
      <section className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Create Club Setup</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Start club setup</h1>

        {status === 'checking' ? (
          <p className="mt-4 text-sm leading-6 text-slate-400">Checking whether you are already signed in...</p>
        ) : null}

        {status === 'redirecting' ? (
          <p className="mt-4 text-sm leading-6 text-slate-400">You are signed in. Redirecting to the club setup flow...</p>
        ) : null}

        {status === 'needs_auth' ? (
          <div className="mt-5 space-y-4">
            <p className="text-sm leading-6 text-slate-400">
              To create a club, you need an account first. After login or signup, you will come back to the club setup automatically.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/auth/signup?next=/onboarding/create-club"
                className="rounded-2xl bg-emerald-400 px-4 py-3 text-center text-sm font-black text-slate-950 transition hover:bg-emerald-300"
              >
                Create account
              </Link>
              <Link
                href="/auth/login?next=/onboarding/create-club"
                className="rounded-2xl border border-slate-700 px-4 py-3 text-center text-sm font-black text-slate-200 transition hover:border-sky-400"
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
