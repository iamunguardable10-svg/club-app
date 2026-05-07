'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

function getSafeNextPath(next: string | null) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return '/app';
  }

  return next;
}

export function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => getSafeNextPath(searchParams.get('next')), [searchParams]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function finishAuth() {
      const supabase = createBrowserSupabaseClient();

      const { error: sessionError } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      router.replace(nextPath);
    }

    finishAuth();

    return () => {
      isMounted = false;
    };
  }, [nextPath, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 text-white">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/80 p-6 text-center shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Auth callback</p>
        <h1 className="mt-3 text-2xl font-black tracking-tight">Finishing sign in</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Confirming your session and redirecting you back to your setup flow.</p>
        {error ? (
          <div className="mt-5 rounded-xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-left text-sm text-red-200">
            <p>{error}</p>
            <Link href="/auth/login" className="mt-3 inline-block font-bold text-red-100 underline">
              Go to login
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
