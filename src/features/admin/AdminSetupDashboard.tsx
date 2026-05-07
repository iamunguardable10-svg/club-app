'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type ClubMembership = { club_id: string };

type Club = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
};

type Department = {
  id: string;
  name: string;
  sport: string | null;
};

type Facility = {
  id: string;
  name: string;
  address: string | null;
};

type Team = {
  id: string;
  name: string;
  sport: string | null;
  season: string | null;
  department_id: string;
};

type LoadState = 'loading' | 'ready' | 'no_admin_membership' | 'error';

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
}

export function AdminSetupDashboard() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadAdminData() {
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
        router.replace('/auth/login?next=/admin/setup');
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

      const [clubResult, departmentsResult, facilitiesResult, teamsResult] = await Promise.all([
        supabase.from('clubs').select('id, name, city, country').eq('id', clubId).single(),
        supabase.from('departments').select('id, name, sport').eq('club_id', clubId).order('name'),
        supabase.from('facilities').select('id, name, address').eq('club_id', clubId).order('name'),
        supabase.from('teams').select('id, name, sport, season, department_id').eq('club_id', clubId).order('name'),
      ]);

      if (!isMounted) return;

      const firstError = clubResult.error ?? departmentsResult.error ?? facilitiesResult.error ?? teamsResult.error;

      if (firstError) {
        setState('error');
        setError(firstError.message);
        return;
      }

      setClub(clubResult.data as Club);
      setDepartments((departmentsResult.data ?? []) as Department[]);
      setFacilities((facilitiesResult.data ?? []) as Facility[]);
      setTeams((teamsResult.data ?? []) as Team[]);
      setState('ready');
    }

    loadAdminData();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const departmentsWithTeams = useMemo(
    () =>
      departments.map((department) => ({
        ...department,
        teams: teams.filter((team) => team.department_id === department.id),
      })),
    [departments, teams],
  );

  const largestDepartment = useMemo(() => {
    return departmentsWithTeams.reduce<(Department & { teams: Team[] }) | null>((largest, department) => {
      if (!largest || department.teams.length > largest.teams.length) return department;
      return largest;
    }, null);
  }, [departmentsWithTeams]);

  if (state === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 text-white">
        <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/80 p-6 text-center">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Admin</p>
          <h1 className="mt-3 text-2xl font-black">Loading club operations...</h1>
        </section>
      </main>
    );
  }

  if (state === 'no_admin_membership') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 text-white">
        <section className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Admin operations</p>
          <h1 className="mt-3 text-3xl font-black">No admin club found</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Your account exists, but it is not connected to a club admin membership yet.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Link href="/onboarding/create-club/start" className="rounded-2xl bg-emerald-400 px-4 py-3 text-center text-sm font-black text-slate-950">
              Create Club Setup
            </Link>
            <Link href="/app" className="rounded-2xl border border-slate-700 px-4 py-3 text-center text-sm font-black text-slate-200">
              Workspace router
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 text-white">
        <section className="w-full max-w-xl rounded-3xl border border-red-900/70 bg-red-950/30 p-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">Admin operations error</p>
          <h1 className="mt-3 text-3xl font-black">Could not load admin data</h1>
          <p className="mt-3 text-sm leading-6 text-red-100">{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">Club Operations</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{club?.name ?? 'Club operations'}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {club?.city || club?.country
                  ? [club.city, club.country].filter(Boolean).join(', ')
                  : 'Operational overview across departments, teams and facilities'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/calendar" className="rounded-xl border border-sky-400/70 px-3 py-2 text-sm font-bold text-sky-200 hover:bg-sky-950/40">
                Calendar
              </Link>
              <Link href="/admin/departments" className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 hover:border-violet-400">
                Departments
              </Link>
              <Link href="/admin/facilities" className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 hover:border-emerald-400">
                Facilities
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-sm font-bold text-slate-400">Departments</p>
            <p className="mt-2 text-4xl font-black">{departments.length}</p>
            <p className="mt-2 text-xs font-bold text-slate-500">operational units</p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-sm font-bold text-slate-400">Teams</p>
            <p className="mt-2 text-4xl font-black">{teams.length}</p>
            <p className="mt-2 text-xs font-bold text-slate-500">inside departments</p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-sm font-bold text-slate-400">Facilities</p>
            <p className="mt-2 text-4xl font-black">{facilities.length}</p>
            <p className="mt-2 text-xs font-bold text-slate-500">global club locations</p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-sm font-bold text-slate-400">Largest department</p>
            <p className="mt-2 truncate text-xl font-black">{largestDepartment?.name ?? '—'}</p>
            <p className="mt-2 text-xs font-bold text-slate-500">{largestDepartment ? `${largestDepartment.teams.length} teams` : 'no teams yet'}</p>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">Structure map</p>
            <h2 className="mt-2 text-2xl font-black">Departments and teams</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Teams are grouped under their department. This is the base layer for permissions, calendars and operational oversight.
            </p>

            <div className="mt-5 space-y-3">
              {departmentsWithTeams.map((department) => (
                <div key={department.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-black">{department.name}</h3>
                    <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-bold text-slate-300">
                      {department.teams.length} teams
                    </span>
                  </div>
                  {department.teams.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {department.teams.map((team) => (
                        <span key={team.id} className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-200">
                          {team.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">No teams yet. This department is structurally created but not operationally filled.</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Facility overview</p>
              <h2 className="mt-2 text-2xl font-black">Global halls and locations</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                These are club-level facilities. Department assignment and capacity views are the next operational layer.
              </p>

              <div className="mt-5 space-y-2">
                {facilities.length > 0 ? (
                  facilities.map((facility) => (
                    <div key={facility.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                      <p className="font-black">{facility.name}</p>
                      {facility.address ? <p className="mt-1 text-sm text-slate-400">{facility.address}</p> : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-slate-400">No facilities yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Capacity snapshot</p>
              <h2 className="mt-2 text-2xl font-black">Hall capacity</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Detailed capacity, half-court and third-court usage will become a dedicated operational view. For now, this tracks the club's bookable spaces.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-sm font-bold text-slate-400">Bookable spaces</p>
                  <p className="mt-2 text-3xl font-black">{facilities.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-sm font-bold text-slate-400">Calendar view</p>
                  <Link href="/admin/calendar" className="mt-2 inline-block text-sm font-black text-sky-300 hover:text-sky-200">
                    Open
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
