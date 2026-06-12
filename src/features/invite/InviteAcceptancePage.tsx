'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type InvitePreview = {
  status: string;
  role: string;
  club_name: string;
  department_name: string | null;
  team_name: string | null;
  coach_role_label: string | null;
  expires_at: string | null;
};

type AcceptInviteResult = {
  ok?: boolean;
  invite_type?: string;
  role?: string;
  club_id?: string;
  department_id?: string | null;
  team_id?: string | null;
  membership_id?: string;
};

function isAcceptInviteResult(value: unknown): value is AcceptInviteResult {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { role?: unknown; invite_type?: unknown };
  const hasValidRole = candidate.role === undefined || typeof candidate.role === 'string';
  const hasValidInviteType = candidate.invite_type === undefined || typeof candidate.invite_type === 'string';
  return hasValidRole && hasValidInviteType;
}

function labelRole(preview: InvitePreview) {
  if (preview.coach_role_label) return preview.coach_role_label;
  if (preview.role === 'department_lead') return 'Department Lead';
  if (preview.role === 'head_coach') return 'Head Coach';
  if (preview.role === 'assistant_coach') return 'Assistant Coach';
  return preview.role;
}

export function InviteAcceptancePage({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createBrowserSupabaseClient();
      const [{ data, error: previewError }, { data: authData }] = await Promise.all([
        supabase.rpc('get_invite_preview', { p_token: token }).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      if (!active) return;
      if (previewError) setError(previewError.message);
      setPreview((data as InvitePreview | null) ?? null);
      setIsLoggedIn(Boolean(authData.user));
      setIsLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [token]);

  async function acceptInvite() {
    setIsAccepting(true);
    setError(null);
    const supabase = createBrowserSupabaseClient();
    // RPC contract: accept_invite returns jsonb with invite_type/role; see migrations 0003 and 0012.
    const { data, error: acceptError } = await supabase.rpc('accept_invite', { p_token: token });
    if (acceptError) {
      setError(acceptError.message);
      setIsAccepting(false);
      return;
    }
    const result = isAcceptInviteResult(data) ? data : null;
    if (result?.invite_type === 'department_lead_invite' || result?.role === 'department_lead') {
      router.replace('/department/overview');
      return;
    }
    if (result?.invite_type === 'coach_invite' || result?.role === 'head_coach' || result?.role === 'assistant_coach') {
      router.replace('/coach/today');
      return;
    }
    if (result?.role === 'athlete') {
      router.replace('/athlete/home');
      return;
    }
    router.replace('/app');
  }

  const nextPath = `/invite/${token}`;
  const loginHref = `/auth/login?next=${encodeURIComponent(nextPath)}`;
  const signupHref = `/auth/signup?next=${encodeURIComponent(nextPath)}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 py-10 text-white">
      <section className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Personal invite</p>
        {isLoading ? <h1 className="mt-3 text-3xl font-black">Loading invite...</h1> : preview ? (
          <>
            <h1 className="mt-3 text-3xl font-black">{labelRole(preview)}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              {preview.club_name}
              {preview.department_name ? ` · ${preview.department_name}` : ''}
              {preview.team_name ? ` · ${preview.team_name}` : ''}
            </p>
            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
              Status: <span className="font-black text-white">{preview.status}</span>
              {preview.expires_at ? ` · expires ${new Date(preview.expires_at).toLocaleDateString()}` : ''}
            </div>
            {preview.status === 'pending' ? (
              isLoggedIn ? (
                <button type="button" onClick={acceptInvite} disabled={isAccepting} className="mt-5 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-emerald-300 disabled:opacity-60">
                  {isAccepting ? 'Accepting invite...' : 'Accept invite'}
                </button>
              ) : (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Link href={loginHref} className="rounded-xl bg-sky-400 px-4 py-3 text-center text-sm font-black text-slate-950 hover:bg-sky-300">Login to accept</Link>
                  <Link href={signupHref} className="rounded-xl border border-violet-500/70 px-4 py-3 text-center text-sm font-black text-violet-200 hover:bg-violet-950/40">Create account</Link>
                </div>
              )
            ) : null}
          </>
        ) : (
          <h1 className="mt-3 text-3xl font-black">Invite not found</h1>
        )}
        {error ? <p className="mt-4 rounded-xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</p> : null}
      </section>
    </main>
  );
}
