'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/shared/admin/AdminShell';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type Team = { id: string; name: string; department_id: string; default_facility_id: string | null };
type Department = { id: string; name: string };
type Facility = { id: string; name: string };
type Membership = { team_id: string; role: 'head_coach' | 'assistant_coach' | 'athlete'; status: 'active' | 'inactive' | 'invited' };

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
}

export function AdminTeamsManager() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadTeams() {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;
      if (userError && !isMissingAuthSessionError(userError.message)) {
        setError(userError.message);
        setState('error');
        return;
      }
      if (!user) {
        router.replace('/auth/login?next=/admin/teams');
        return;
      }

      const membershipsResult = await supabase.from('club_memberships').select('club_id').eq('user_id', user.id).eq('status', 'active').limit(1);
      if (membershipsResult.error || !membershipsResult.data?.[0]) {
        setError(membershipsResult.error?.message ?? 'No active club membership found.');
        setState('error');
        return;
      }

      const clubId = membershipsResult.data[0].club_id as string;
      const [teamsResult, departmentsResult, facilitiesResult, teamMembershipsResult] = await Promise.all([
        supabase.from('teams').select('id, name, department_id, default_facility_id').eq('club_id', clubId).order('name'),
        supabase.from('departments').select('id, name').eq('club_id', clubId).order('name'),
        supabase.from('facilities').select('id, name').eq('club_id', clubId).order('name'),
        supabase.from('team_memberships').select('team_id, role, status').eq('club_id', clubId),
      ]);

      const firstError = teamsResult.error ?? departmentsResult.error ?? facilitiesResult.error ?? teamMembershipsResult.error;
      if (firstError) {
        setError(firstError.message);
        setState('error');
        return;
      }

      if (!isMounted) return;
      setTeams((teamsResult.data ?? []) as Team[]);
      setDepartments((departmentsResult.data ?? []) as Department[]);
      setFacilities((facilitiesResult.data ?? []) as Facility[]);
      setMemberships((teamMembershipsResult.data ?? []) as Membership[]);
      setState('ready');
    }

    loadTeams();
    return () => {
      isMounted = false;
    };
  }, [router]);

  const departmentById = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);
  const facilityById = useMemo(() => new Map(facilities.map((facility) => [facility.id, facility])), [facilities]);
  const membershipsByTeam = useMemo(() => {
    const map = new Map<string, Membership[]>();
    for (const membership of memberships) {
      const list = map.get(membership.team_id) ?? [];
      list.push(membership);
      map.set(membership.team_id, list);
    }
    return map;
  }, [memberships]);

  if (state === 'loading') return <AdminShell><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">Loading teams...</section></AdminShell>;
  if (state === 'error') return <AdminShell><section className="rounded-3xl border border-red-500/40 bg-red-950/20 p-6 text-red-100">{error}</section></AdminShell>;

  return (
    <AdminShell>
      <section className="rounded-3xl border border-slate-800 bg-slate-950/75 p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Teams</p>
        <h1 className="mt-3 text-3xl font-black sm:text-5xl">Team workspaces</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-400">Each team gets its own operational surface: dashboard, calendar, players and groups.</p>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <div className="grid gap-3">
          {teams.length > 0 ? teams.map((team) => {
            const teamMemberships = membershipsByTeam.get(team.id) ?? [];
            const active = teamMemberships.filter((membership) => membership.status === 'active');
            const headCount = active.filter((membership) => membership.role === 'head_coach').length;
            const assistantCount = active.filter((membership) => membership.role === 'assistant_coach').length;
            const playerCount = active.filter((membership) => membership.role === 'athlete').length;
            return (
              <Link key={team.id} href={`/admin/teams/${team.id}`} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 transition hover:border-sky-400/60 hover:bg-slate-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-black">{team.name}</h2>
                    <p className="mt-1 text-sm text-slate-400">{departmentById.get(team.department_id)?.name ?? 'Department'} · {team.default_facility_id ? facilityById.get(team.default_facility_id)?.name ?? 'Facility' : 'No default facility'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-black">
                    <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">{headCount} head</span>
                    <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">{assistantCount} assistants</span>
                    <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">{playerCount} players</span>
                  </div>
                </div>
              </Link>
            );
          }) : <p className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">No teams yet. Create teams from a Department View first.</p>}
        </div>
      </section>
    </AdminShell>
  );
}
