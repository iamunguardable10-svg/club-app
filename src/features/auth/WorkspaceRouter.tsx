'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type RoutingState = 'checking_auth' | 'checking_memberships' | 'redirecting' | 'error';

type ClubMembership = {
  role: 'club_admin' | 'department_lead';
};

type TeamMembership = {
  role: 'head_coach' | 'assistant_coach' | 'athlete';
};

function getWorkspacePath({
  clubMemberships,
  teamMemberships,
}: {
  clubMemberships: ClubMembership[];
  teamMemberships: TeamMembership[];
}) {
  if (clubMemberships.some((membership) => membership.role === 'club_admin')) {
    return '/admin/setup';
  }

  if (clubMemberships.some((membership) => membership.role === 'department_lead')) {
    return '/department/overview';
  }

  if (
    teamMemberships.some(
      (membership) => membership.role === 'head_coach' || membership.role === 'assistant_coach',
    )
  ) {
    return '/coach/today';
  }

  if (teamMemberships.some((membership) => membership.role === 'athlete')) {
    return '/athlete/home';
  }

  return '/onboarding';
}

export function WorkspaceRouter() {
  const router = useRouter();
  const [state, setState] = useState<RoutingState>('checking_auth');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function routeUser() {
      const supabase = createBrowserSupabaseClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (userError) {
        setState('error');
        setError(userError.message);
        return;
      }

      if (!user) {
        router.replace('/auth/login');
        return;
      }

      setState('checking_memberships');

      const [clubMembershipResult, teamMembershipResult] = await Promise.all([
        supabase
          .from('club_memberships')
          .select('role')
          .eq('user_id', user.id)
          .eq('status', 'active'),
        supabase
          .from('team_memberships')
          .select('role')
          .eq('user_id', user.id)
          .eq('status', 'active'),
      ]);

      if (!isMounted) return;

      if (clubMembershipResult.error) {
        setState('error');
        setError(clubMembershipResult.error.message);
        return;
      }

      if (teamMembershipResult.error) {
        setState('error');
        setError(teamMembershipResult.error.message);
        return;
      }

      const workspacePath = getWorkspacePath({
        clubMemberships: (clubMembershipResult.data ?? []) as ClubMembership[],
        teamMemberships: (teamMembershipResult.data ?? []) as TeamMembership[],
      });

      setState('redirecting');
      router.replace(workspacePath);
    }

    routeUser();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 text-white">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/75 p-6 text-center shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Club App</p>
        <h1 className="mt-3 text-2xl font-black tracking-tight">Routing workspace</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          {state === 'checking_auth' ? 'Checking authentication...' : null}
          {state === 'checking_memberships' ? 'Checking your club and team memberships...' : null}
          {state === 'redirecting' ? 'Redirecting to your workspace...' : null}
          {state === 'error' ? 'Something went wrong while resolving your workspace.' : null}
        </p>
        {error ? (
          <div className="mt-4 rounded-xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-left text-sm text-red-200">
            {error}
          </div>
        ) : null}
      </section>
    </main>
  );
}
