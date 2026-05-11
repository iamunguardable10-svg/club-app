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

type DepartmentFacility = {
  department_id: string;
  facility_id: string;
};

type LoadState = 'loading' | 'ready' | 'no_admin_membership' | 'error';

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
}

function UsageSummary({ departments }: { departments: string[] }) {
  if (departments.length === 0) {
    return <p className="mt-2 text-xs text-slate-500">Not assigned to a department yet.</p>;
  }

  const visibleDepartments = departments.slice(0, 2);
  const hiddenCount = departments.length - visibleDepartments.length;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {visibleDepartments.map((department) => (
        <span key={department} className="rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1 text-xs font-bold text-emerald-200">
          {department}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-bold text-slate-300">
          +{hiddenCount} more
        </span>
      ) : null}
    </div>
  );
}

export function AdminSetupDashboard() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityAssignments, setFacilityAssignments] = useState<DepartmentFacility[]>([]);

  const setupScore = useMemo(() => {
    let score = 0;
    if (club) score += 1;
    if (departments.length > 0) score += 1;
    if (facilities.length > 0) score += 1;
    return score;
  }, [club, departments.length, facilities.length]);

  const departmentsById = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);

  const departmentNamesByFacility = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const assignment of facilityAssignments) {
      const department = departmentsById.get(assignment.department_id);
      if (!department) continue;

      const current = map.get(assignment.facility_id) ?? [];
      if (!current.includes(department.name)) current.push(department.name);
      map.set(assignment.facility_id, current);
    }

    return map;
  }, [departmentsById, facilityAssignments]);

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
        router.replace('/auth/login');
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

      const [clubResult, departmentsResult, facilitiesResult, assignmentsResult] = await Promise.all([
        supabase.from('clubs').select('id, name, city, country').eq('id', clubId).single(),
        supabase.from('departments').select('id, name, sport').eq('club_id', clubId).order('name'),
        supabase.from('facilities').select('id, name, address').eq('club_id', clubId).order('name'),
        supabase.from('department_facilities').select('department_id, facility_id').eq('club_id', clubId),
      ]);

      if (!isMounted) return;

      const firstError = clubResult.error ?? departmentsResult.error ?? facilitiesResult.error ?? assignmentsResult.error;

      if (firstError) {
        setState('error');
        setError(firstError.message);
        return;
      }

      setClub(clubResult.data as Club);
      setDepartments((departmentsResult.data ?? []) as Department[]);
      setFacilities((facilitiesResult.data ?? []) as Facility[]);
      setFacilityAssignments((assignmentsResult.data ?? []) as DepartmentFacility[]);
      setState('ready');
    }

    loadAdminData();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (state === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 text-white">
        <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/80 p-6 text-center">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Admin setup</p>
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
            <Link href="/onboarding/create-club" className="rounded-2xl bg-emerald-400 px-4 py-3 text-center text-sm font-black text-slate-950">
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
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">Admin setup</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{club?.name ?? 'Club setup'}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {club?.city || club?.country
                  ? [club.city, club.country].filter(Boolean).join(', ')
                  : 'Guided setup for club structure, departments and facilities'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Setup progress</p>
              <p className="mt-1 text-2xl font-black text-white">{setupScore}/3</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Departments</p>
            <p className="mt-3 text-4xl font-black">{departments.length}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Structure layer between club and teams. Teams are managed in department pages.</p>
          </div>

          <Link href="/admin/facilities" className="rounded-3xl border border-emerald-700/60 bg-slate-950/70 p-5 transition hover:border-emerald-300 hover:bg-emerald-950/20">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Facilities</p>
              <span className="text-sm font-black text-emerald-300">Manage →</span>
            </div>
            <p className="mt-3 text-4xl font-black">{facilities.length}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Global club facilities. Open facility management and department assignment.</p>
          </Link>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Next focus</p>
            <p className="mt-3 text-xl font-black">Guide the club setup</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Invite leads, assign facilities, then let departments organize teams.</p>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Structure</p>
                <h2 className="mt-2 text-xl font-black">Departments</h2>
              </div>
              <Link href="/admin/departments" className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:border-violet-400">
                Manage
              </Link>
            </div>

            <div className="mt-4 space-y-2">
              {departments.length > 0 ? (
                departments.map((department) => (
                  <div key={department.id} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                    <p className="font-bold text-white">{department.name}</p>
                    <p className="mt-1 text-xs text-slate-500">Team setup belongs in this department's team area.</p>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">No departments yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Infrastructure</p>
                <h2 className="mt-2 text-xl font-black">Global facilities</h2>
              </div>
              <Link href="/admin/facilities" className="rounded-xl border border-emerald-500/70 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-950/40">
                Manage →
              </Link>
            </div>

            <div className="mt-4 space-y-2">
              {facilities.length > 0 ? (
                facilities.map((facility) => (
                  <Link
                    key={facility.id}
                    href={`/admin/facilities/${facility.id}/calendar`}
                    className="block rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 transition hover:border-emerald-400 hover:bg-emerald-950/20 active:border-emerald-300"
                  >
                    <p className="font-bold text-white">{facility.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{facility.address || 'No address set yet'}</p>
                    <UsageSummary departments={departmentNamesByFacility.get(facility.id) ?? []} />
                    <p className="mt-3 text-xs font-bold text-emerald-300/80">Tap to open calendar</p>
                  </Link>
                ))
              ) : (
                <p className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">No facilities yet.</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Recommended next steps</p>
          <h2 className="mt-2 text-xl font-black">Continue setup</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Link href="/admin/coaches" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-sky-400">
              <p className="font-black">Invite department leads</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Delegate operations before teams become too much admin work.</p>
            </Link>
            <Link href="/admin/facilities" className="rounded-2xl border border-emerald-700/60 bg-slate-900/60 p-4 transition hover:border-emerald-300">
              <p className="font-black">Assign facilities</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Scope global facilities to departments for cleaner coach workflows.</p>
            </Link>
            <Link href="/department/teams" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-violet-400">
              <p className="font-black">Create department teams</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Teams belong inside departments and should be managed there.</p>
            </Link>
            <Link href="/admin/coaches" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-amber-400">
              <p className="font-black">Invite coaches</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Assign head and assistant coaches after the team structure is ready.</p>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
