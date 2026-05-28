'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TeamWorkspace } from '@/features/teams/TeamWorkspace';
import type { TeamWorkspaceSection } from '@/features/teams/TeamWorkspaceView';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type CoachMode = 'today' | 'team' | 'sessions' | 'attendance' | 'load';
type CoachTeam = { id: string; name: string; departmentId: string; departmentName: string; role: string };

function sectionForMode(mode: CoachMode): TeamWorkspaceSection {
  if (mode === 'sessions') return 'calendar';
  if (mode === 'load' || mode === 'attendance') return 'players';
  return 'dashboard';
}

function titleForMode(mode: CoachMode) {
  if (mode === 'sessions') return 'Sessions';
  if (mode === 'attendance') return 'Attendance';
  if (mode === 'load') return 'Player load';
  if (mode === 'team') return 'Team';
  return 'Today';
}

function descriptionForMode(mode: CoachMode) {
  if (mode === 'sessions') return 'Plan and adjust sessions for your assigned teams.';
  if (mode === 'attendance') return 'Attendance will attach to each team session; V1 starts from the team player list.';
  if (mode === 'load') return 'Open a player from the team context to review load, missing feedback and attendance insights.';
  if (mode === 'team') return 'Roster, staff, groups and team settings for your assigned teams.';
  return 'Daily team cockpit: next session, setup gaps and player attention.';
}

export function CoachWorkspaceRouter({ mode }: { mode: CoachMode }) {
  const router = useRouter();
  const [teams, setTeams] = useState<CoachTeam[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadCoachTeams() {
      const supabase = createBrowserSupabaseClient();
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (!mounted) return;
      if (userError || !userResult.user) {
        router.replace(`/auth/login?next=/coach/${mode}`);
        return;
      }

      const { data: memberships, error: membershipError } = await supabase
        .from('team_memberships')
        .select('team_id, role')
        .eq('user_id', userResult.user.id)
        .eq('status', 'active')
        .in('role', ['head_coach', 'assistant_coach']);

      if (!mounted) return;
      if (membershipError) {
        setError(membershipError.message);
        setState('error');
        return;
      }

      const membershipRows = (memberships ?? []) as { team_id: string; role: string }[];
      const teamIds = Array.from(new Set(membershipRows.map((row) => row.team_id).filter(Boolean)));
      if (teamIds.length === 0) {
        setTeams([]);
        setState('ready');
        return;
      }

      const { data: teamRows, error: teamsError } = await supabase
        .from('teams')
        .select('id, name, department_id, departments(name)')
        .in('id', teamIds)
        .order('name');

      if (!mounted) return;
      if (teamsError) {
        setError(teamsError.message);
        setState('error');
        return;
      }

      const roleByTeamId = new Map(membershipRows.map((row) => [row.team_id, row.role]));
      setTeams(((teamRows ?? []) as Array<{ id: string; name: string; department_id: string; departments?: { name?: string } | { name?: string }[] | null }>).map((team) => ({
        id: team.id,
        name: team.name,
        departmentId: team.department_id,
        departmentName: Array.isArray(team.departments) ? team.departments[0]?.name ?? 'Department' : team.departments?.name ?? 'Department',
        role: roleByTeamId.get(team.id) ?? 'coach',
      })));
      setState('ready');
    }

    loadCoachTeams();
    return () => {
      mounted = false;
    };
  }, [mode, router]);

  const singleTeam = teams.length === 1 ? teams[0] : null;
  const initialSection = useMemo(() => sectionForMode(mode), [mode]);

  if (state === 'loading') {
    return <main className="os-page"><div className="os-container"><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-white">Loading coach workspace...</section></div></main>;
  }

  if (state === 'error') {
    return <main className="os-page"><div className="os-container"><section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-6 text-red-100">{error}</section></div></main>;
  }

  if (singleTeam && (mode === 'team' || mode === 'sessions')) {
    return <TeamWorkspace teamId={singleTeam.id} backHref="/coach/today" backLabel="Back to coach" initialSection={initialSection} />;
  }

  return (
    <main className="os-page">
      <div className="os-container space-y-5">
        <section className="rounded-[2rem] border border-slate-800 bg-slate-950/72 p-6 text-white shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300">Coach OS</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">{titleForMode(mode)}</h1>
          <p className="mt-2 max-w-2xl text-sm font-bold text-slate-400">{descriptionForMode(mode)}</p>
          <nav className="mt-5 flex flex-wrap gap-2">
            {(['today', 'team', 'sessions', 'attendance', 'load'] as CoachMode[]).map((item) => (
              <Link key={item} href={`/coach/${item}`} className={`rounded-full border px-4 py-2 text-xs font-black ${mode === item ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-200'}`}>
                {titleForMode(item)}
              </Link>
            ))}
          </nav>
        </section>

        {teams.length === 0 ? (
          <section className="rounded-3xl border border-amber-500/35 bg-amber-950/20 p-5 text-amber-100">
            <h2 className="text-xl font-black">No assigned teams yet</h2>
            <p className="mt-2 text-sm font-bold text-amber-100/80">A club admin or department lead must assign you as coach first.</p>
          </section>
        ) : (
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {teams.map((team) => (
              <Link
                key={team.id}
                href={`/admin/teams/${team.id}?from=coach`}
                className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white transition hover:border-emerald-300/50 hover:bg-slate-900/70"
              >
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{team.departmentName}</p>
                <h2 className="mt-2 text-2xl font-black">{team.name}</h2>
                <p className="mt-2 text-sm font-bold text-slate-400">{team.role.replace('_', ' ')}</p>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs font-black">
                  <span className="rounded-2xl border border-slate-800 bg-slate-950 px-2 py-2">Team</span>
                  <span className="rounded-2xl border border-slate-800 bg-slate-950 px-2 py-2">Calendar</span>
                  <span className="rounded-2xl border border-slate-800 bg-slate-950 px-2 py-2">Players</span>
                </div>
              </Link>
            ))}
          </section>
        )}

        {mode === 'load' || mode === 'attendance' ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Next slice</p>
            <h2 className="mt-2 text-2xl font-black">Player detail opens from the roster</h2>
            <p className="mt-2 text-sm font-bold text-slate-400">The next implementation connects each player card to load, attendance, missing feedback and readiness insights.</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
