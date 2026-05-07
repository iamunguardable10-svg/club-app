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

  const departmentsWithTeams = useMemo(() => {
    return departments.map((department) => ({
      ...department,
      teams: teams.filter((team) => team.department_id === department.id),
    }));
  }, [departments, teams]);

  if (state === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 text-white">
        <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/80 p-6 text-center">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Admin</p>
          <h1 className="mt-3 text-2xl font-black">Loading club setup...</h1>
        </section>
      </main>
    );
  }

  if (state === 'no_admin_membership') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 text-white">
        <section className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Admin setup</p>
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
          <p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">Admin setup error</p>
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
          <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">Club Admin Workspace</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{club?.name ?? 'Club setup'}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {club?.city || club?.country ? [club.city, club.country].filter(Boolean).join(', ') : 'Club structure overview'}
              </p>
            </div>
            <Link href="/demo" className="rounded-2xl border border-slate-700 px-4 py-3 text-center text-sm font-bold text-slate-200 transition hover:border-sky-400">
              Product review nav
            </Link>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-sm font-bold text-slate-400">Departments</p>
            <p className="mt-2 text-4xl font-black">{departments.length}</p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-sm font-bold text-slate-400">Teams inside departments</p>
            <p className="mt-2 text-4xl font-black">{teams.length}</p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-sm font-bold text-slate-400">Global facilities</p>
            <p className="mt-2 text-4xl font-black">{facilities.length}</p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-sm font-bold text-slate-400">Setup status</p>
            <p className="mt-2 text-xl font-black text-emerald-300">Started</p>
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Recommended next steps</p>
          <h2 className="mt-2 text-2xl font-black">Continue setup in the right order</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Link href="/admin/facilities" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-emerald-400">
              <h3 className="font-black">Assign facilities to departments</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">Global halls should be scoped to departments before coaches create sessions.</p>
            </Link>
            <Link href="/admin/coaches" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-sky-400">
              <h3 className="font-black">Invite department leaders</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">Department leaders can manage their department teams and coaches later.</p>
            </Link>
            <Link href="/admin/departments" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-violet-400">
              <h3 className="font-black">Review departments</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">Teams are always managed inside their department, not globally.</p>
            </Link>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">Departments → Teams</p>
                <h2 className="mt-2 text-2xl font-black">Club structure</h2>
              </div>
              <Link href="/admin/departments" className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 hover:border-violet-400">
                Manage departments
              </Link>
            </div>

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
                    <p className="mt-3 text-sm text-slate-400">No teams yet. This can be done by the club admin or later by the department leader.</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Facilities</p>
                <h2 className="mt-2 text-2xl font-black">Global halls</h2>
              </div>
              <Link href="/admin/facilities" className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 hover:border-emerald-400">
                Manage
              </Link>
            </div>

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
        </section>
      </div>
    </main>
  );
}
