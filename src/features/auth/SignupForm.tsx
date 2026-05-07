'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createBrowserSupabaseClient();

    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (signupError) {
      setError(signupError.message);
      setIsLoading(false);
      return;
    }

    if (data.session) {
      router.replace('/app');
      return;
    }

    setMessage('Account created. Check your email if confirmation is required, then sign in.');
    setIsLoading(false);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10 text-white">
      <div className="rounded-3xl border border-slate-800 bg-slate-950/75 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">Club App</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Create account</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Create your account first. Club, coach and athlete roles are assigned later through memberships, invites or team codes.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-slate-200">Full name</span>
            <input
              type="text"
              required
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-violet-400"
              placeholder="Ben Hebling"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-slate-200">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-violet-400"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-slate-200">Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-violet-400"
              placeholder="At least 6 characters"
            />
          </label>

          {error ? (
            <div className="rounded-xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>
          ) : null}

          {message ? (
            <div className="rounded-xl border border-emerald-900/70 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">{message}</div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-violet-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-sm text-slate-400">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-bold text-violet-300 hover:text-violet-200">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
