'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type ClubMembership = {
  club_id: string;
};

type Club = {
  id: string;
  name: string;
};

type Department = {
  id: string;
  name: string;
};

type Facility = {
  id: string;
  name: string;
};

type Team = {
  id: string;
  name: string;
  department_id: string;
};

type Session = {
  id: string;
  title: string;
  session_type: string;
  starts_at: string;
  ends_at: string | null;
  location_text: string | null;
  facility_id: string | null;
  department_id: string;
  team_id: string;
};

type ViewMode = 'facility' | 'department' | 'team';
type LoadState = 'loading' | 'ready' | 'no_admin_membership' | 'error';

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getSessionTypeLabel(type: string) {
  if (type === 's_and_c') return 'S&C';
  return type.replaceAll('_', ' ');
}

export function AdminCalendarDashboard() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('facility');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [facilityFilter, setFacilityFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');

  useEffect(() => {
    let isMounted = true;

    async function loadCalendarData() {
      const supabase = createBrowserSupabaseClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (userError && !isMissingAuthSessionError(userError.message)) {
        setState('error');
        setError(userError.message);
        return;
      }

      if (!user) {
        router.replace('/auth/login?next=/admin/calendar');
        return;
      }

      const { data: memberships, error: membershipError } = await supabase
        .from('club_memberships')
        .select('club_id')
        .eq('user_id', user.id)
        .eq('role', 'club_admin')
        .eq('status', 'active')
        .limit(1);

      if (!isMounted) return;

      if (membershipError) {
        setState('error');
        setError(membershipError.message);
        return;
      }

      const adminMembership = (memberships ?? [])[0] as ClubMembership | undefined;

      if (!adminMembership) {
        setState('no_admin_membership');
        return;
      }

      const clubId = adminMembership.club_id;

      const now = new Date();
      const rangeStart = new Date(now);
      rangeStart.setDate(now.getDate() - 7);
      const rangeEnd = new Date(now);
      rangeEnd.setDate(now.getDate() + 30);

      const [clubResult, departmentsResult, facilitiesResult, teamsResult, sessionsResult] = await Promise.all([
        supabase.from('clubs').select('id, name').eq('id', clubId).single(),
        supabase.from('departments').select('id, name').eq('club_id', clubId).order('name'),
        supabase.from('facilities').select('id, name').eq('club_id', clubId).order('name'),
        supabase.from('teams').select('id, name, department_id').eq('club_id', clubId).order('name'),
        supabase
          .from('sessions')
          .select('id, title, session_type, starts_at, ends_at, location_text, facility_id, department_id, team_id')
          .eq('club_id', clubId)
          .gte('starts_at', rangeStart.toISOString())
          .lte('starts_at', rangeEnd.toISOString())
          .order('starts_at'),
      ]);

      if (!isMounted) return;

      const firstError = clubResult.error ?? departmentsResult.error ?? facilitiesResult.error ?? teamsResult.error ?? sessionsResult.error;

      if (firstError) {
        setState('error');
        setError(firstError.message);
        return;
      }

      setClub(clubResult.data as Club);
      setDepartments((departmentsResult.data ?? []) as Department[]);
      setFacilities((facilitiesResult.data ?? []) as Facility[]);
      setTeams((teamsResult.data ?? []) as Team[]);
      setSessions((sessionsResult.data ?? []) as Session[]);
      setState('ready');
    }

    loadCalendarData();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const departmentById = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);
  const facilityById = useMemo(() => new Map(facilities.map((facility) => [facility.id, facility])), [facilities]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      if (departmentFilter !== 'all' && session.department_id !== departmentFilter) return false;
      if (facilityFilter !== 'all' && session.facility_id !== facilityFilter) return false;
      if (teamFilter !== 'all' && session.team_id !== teamFilter) return false;
      return true;
    });
  }, [departmentFilter, facilityFilter, sessions, teamFilter]);

  const groupingItems = useMemo(() => {
    if (viewMode === 'facility') {
      return facilities.map((facility) => ({
        id: facility.id,
        title: facility.name,
        subtitle: 'Facility usage',
        sessions: filteredSessions.filter((session) => session.facility_id === facility.id),
      }));
    }

    if (viewMode === 'department') {
      return departments.map((department) => ({
        id: department.id,
        title: department.name,
        subtitle: 'Department activity',
        sessions: filteredSessions.filter((session) => session.department_id === department.id),
      }));
    }

    return teams.map((team) => ({
      id: team.id,
      title: team.name,
      subtitle: departmentById.get(team.department_id)?.name ?? 'Team activity',
      sessions: filteredSessions.filter((session) => session.team_id === team.id),
    }));
  }, [departmentById, departments, facilities, filteredSessions, teams, viewMode]);

  if (state === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 text-white">
        <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/80 p-6 text-center">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Admin calendar</p>
          <h1 className="mt-3 text-2xl font-black">Loading calendar...</h1>
        </section>
      </main>
    );
  }

  if (state === 'no_admin_membership') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 text-white">
        <section className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Admin calendar</p>
          <h1 className="mt-3 text-3xl font-black">No admin club found</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">You need an active club_admin membership to see the club calendar.</p>
        </section>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 text-white">
        <section className="w-full max-w-xl rounded-3xl border border-red-900/70 bg-red-950/30 p-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">Admin calendar error</p>
          <h1 className="mt-3 text-3xl font-black">Could not load calendar</h1>
          <p className="mt-3 text-sm leading-6 text-red-100">{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">Club Calendar</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{club?.name ?? 'Club'} operations calendar</h1>
            </div>
            <Link href="/admin/setup" className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 hover:border-sky-400">
              Back to operations
            </Link>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-sm font-bold text-slate-400">Sessions in range</p>
            <p className="mt-2 text-4xl font-black">{sessions.length}</p>
            <p className="mt-2 text-xs font-bold text-slate-500">last 7 days + next 30 days</p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-sm font-bold text-slate-400">Facilities</p>
            <p className="mt-2 text-4xl font-black">{facilities.length}</p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-sm font-bold text-slate-400">Departments</p>
            <p className="mt-2 text-4xl font-black">{departments.length}</p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-sm font-bold text-slate-400">Teams</p>
            <p className="mt-2 text-4xl font-black">{teams.length}</p>
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1fr]">
            <label className="block">
              <span className="text-sm font-bold text-slate-300">View</span>
              <select value={viewMode} onChange={(event) => setViewMode(event.target.value as ViewMode)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400">
                <option value="facility">Facility calendar</option>
                <option value="department">Department calendar</option>
                <option value="team">Team calendar</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-300">Facility</span>
              <select value={facilityFilter} onChange={(event) => setFacilityFilter(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400">
                <option value="all">All facilities</option>
                {facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>{facility.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-300">Department</span>
              <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400">
                <option value="all">All departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-300">Team</span>
              <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400">
                <option value="all">All teams</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="mt-5 grid gap-4">
          {groupingItems.map((item) => (
            <div key={item.id} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-black">{item.title}</h2>
                  <p className="mt-1 text-sm text-slate-400">{item.subtitle}</p>
                </div>
                <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-bold text-slate-300">{item.sessions.length} sessions</span>
              </div>

              {item.sessions.length > 0 ? (
                <div className="mt-4 grid gap-3">
                  {item.sessions.map((session) => {
                    const team = teamById.get(session.team_id);
                    const department = departmentById.get(session.department_id);
                    const facility = session.facility_id ? facilityById.get(session.facility_id) : null;

                    return (
                      <div key={session.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="font-black">{session.title}</p>
                            <p className="mt-1 text-sm text-slate-400">{formatDateTime(session.starts_at)} · {getSessionTypeLabel(session.session_type)}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs font-bold">
                            <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-200">{department?.name ?? 'Department'}</span>
                            <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-200">{team?.name ?? 'Team'}</span>
                            <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-200">{facility?.name ?? session.location_text ?? 'No facility'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm font-bold text-slate-400">No sessions yet.</p>
              )}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
