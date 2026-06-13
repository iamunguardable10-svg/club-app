'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type TeamJoinPreview = {
  status: string;
  expires_at: string | null;
  club_name: string;
  department_name: string;
  team_name: string;
  sport: string | null;
  season: string | null;
};

type JoinResult = {
  ok?: boolean;
  role?: string;
  club_id?: string;
  department_id?: string;
  team_id?: string;
  membership_id?: string;
};

function isJoinResult(value: unknown): value is JoinResult {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { role?: unknown };
  return candidate.role === undefined || typeof candidate.role === 'string';
}

function statusLabel(status: string) {
  if (status === 'active') return 'Active';
  if (status === 'inactive') return 'Inactive';
  if (status === 'expired') return 'Expired';
  if (status === 'max_uses_reached') return 'Full';
  return status;
}

function statusHint(status: string) {
  if (status === 'active') return 'Join this team as an athlete.';
  if (status === 'inactive') return 'This join code has been disabled.';
  if (status === 'expired') return 'This join code has expired.';
  if (status === 'max_uses_reached') return 'This join code has reached its limit.';
  return 'This code cannot be used right now.';
}

function friendlyError(message: string) {
  if (message.includes('not_authenticated')) return 'Please log in before joining this team.';
  if (message.includes('join_code_not_found')) return 'This join code was not found.';
  if (message.includes('join_code_inactive')) return 'This join code has been disabled.';
  if (message.includes('join_code_expired')) return 'This join code has expired.';
  if (message.includes('join_code_max_uses_reached')) return 'This join code has reached its limit.';
  if (message.includes('already_member')) return 'You are already on this team.';
  return message;
}

function formatExpiry(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function TeamJoinCodePage({ code }: { code: string }) {
  const router = useRouter();
  const normalizedCode = useMemo(() => code.trim().toUpperCase(), [code]);
  const [preview, setPreview] = useState<TeamJoinPreview | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      setError(null);
      const supabase = createBrowserSupabaseClient();
      const [{ data, error: previewError }, { data: authData }] = await Promise.all([
        // RPC contract: returns table(...) in supabase/migrations/0003_invite_and_join_code_functions.sql.
        supabase.rpc('get_team_by_join_code', { p_code: normalizedCode }).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      if (!active) return;
      if (previewError) setError(friendlyError(previewError.message));
      setPreview((data as TeamJoinPreview | null) ?? null);
      setIsLoggedIn(Boolean(authData.user));
      setIsLoading(false);
    }

    if (normalizedCode) void load();
    return () => {
      active = false;
    };
  }, [normalizedCode]);

  async function joinTeam() {
    if (!isLoggedIn) return;
    setIsJoining(true);
    setError(null);
    const supabase = createBrowserSupabaseClient();
    // RPC contract: returns jsonb with role='athlete' in supabase/migrations/0003_invite_and_join_code_functions.sql.
    const { data, error: joinError } = await supabase.rpc('join_team_by_code', { p_code: normalizedCode });
    if (joinError) {
      setError(friendlyError(joinError.message));
      setIsJoining(false);
      return;
    }
    const result = isJoinResult(data) ? data : null;
    router.replace(result?.role === 'athlete' ? '/athlete/home' : '/app');
  }

  const nextPath = `/join/${encodeURIComponent(normalizedCode)}`;
  const loginHref = `/auth/login?next=${encodeURIComponent(nextPath)}`;
  const signupHref = `/auth/signup?next=${encodeURIComponent(nextPath)}`;
  const isActive = preview?.status === 'active';
  const expiry = formatExpiry(preview?.expires_at ?? null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 py-10 text-white">
      <section className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Team join</p>
          <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs font-black text-slate-200">{normalizedCode}</span>
        </div>

        {isLoading ? (
          <h1 className="mt-3 text-3xl font-black">Loading team...</h1>
        ) : preview ? (
          <>
            <h1 className="mt-3 text-3xl font-black">{preview.team_name}</h1>
            <p className="mt-3 text-sm font-bold leading-6 text-slate-400">
              {preview.club_name} · {preview.department_name}
              {preview.sport ? ` · ${preview.sport}` : ''}
              {preview.season ? ` · ${preview.season}` : ''}
            </p>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-black text-white">{statusLabel(preview.status)}</span>
                {expiry ? <span className="text-xs font-bold text-slate-500">Expires {expiry}</span> : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">{statusHint(preview.status)}</p>
            </div>

            {isActive ? (
              isLoggedIn ? (
                <button type="button" onClick={joinTeam} disabled={isJoining} className="mt-5 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60">
                  {isJoining ? 'Joining team...' : 'Join team'}
                </button>
              ) : (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Link href={loginHref} className="rounded-xl bg-emerald-400 px-4 py-3 text-center text-sm font-black text-slate-950 transition hover:bg-emerald-300">Login to join</Link>
                  <Link href={signupHref} className="rounded-xl border border-sky-500/70 px-4 py-3 text-center text-sm font-black text-sky-100 transition hover:bg-sky-950/40">Create account</Link>
                </div>
              )
            ) : null}
          </>
        ) : (
          <>
            <h1 className="mt-3 text-3xl font-black">{error ? 'Join code unavailable' : 'Code not found'}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">Check the link or ask your coach for a new one.</p>
          </>
        )}

        {error ? <p className="mt-4 rounded-xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</p> : null}
      </section>
    </main>
  );
}
