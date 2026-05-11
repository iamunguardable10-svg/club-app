'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/shared/admin/AdminShell';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type ClubMembership = { club_id: string };

type Club = { id: string; name: string };

type Department = {
  id: string;
  name: string;
  sport: string | null;
  created_at: string;
};

type Facility = { id: string; name: string };
type DepartmentFacility = { department_id: string; facility_id: string };
type Team = { id: string; department_id: string };

type Invite = {
  id: string;
  department_id: string | null;
  role: 'department_lead' | 'head_coach' | 'assistant_coach';
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
};

type LoadState = 'loading' | 'ready' | 'no_admin_membership' | 'error';

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
}

function UsageChips({ items, emptyText }: { items: Facility[]; emptyText: string }) {
  if (items.length === 0) {
    return <p className="mt-2 text-xs text-slate-500">{emptyText}</p>;
  }

  const visibleItems = items.slice(0, 2);
  const hiddenCount = items.length - visibleItems.length;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {visibleItems.map((item) => (
        <Link
          key={item.id}
          href={`/admin/facilities/${item.id}/calendar?from=departments`}
          onClick={(event) => event.stopPropagation()}
          className="rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1 text-xs font-bold text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-950/60"
        >
          {item.name}
        </Link>
      ))}
      {hiddenCount > 0 ? (
        <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-bold text-slate-300">
          +{hiddenCount} more
        </span>
      ) : null}
    </div>
  );
}

export function AdminDepartmentsManager() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [assignments, setAssignments] = useState<DepartmentFacility[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newDepartmentSport, setNewDepartmentSport] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const clubId = club?.id ?? '';

  const facilityById = useMemo(() => new Map(facilities.map((facility) => [facility.id, facility])), [facilities]);

  const facilitiesByDepartment = useMemo(() => {
    const map = new Map<string, Facility[]>();

    for (const assignment of assignments) {
      const facility = facilityById.get(assignment.facility_id);
      if (!facility) continue;
      const current = map.get(assignment.department_id) ?? [];
      if (!current.some((currentFacility) => currentFacility.id === facility.id)) current.push(facility);
      map.set(assignment.department_id, current);
    }

    return map;
  }, [assignments, facilityById]);

  const teamCountByDepartment = useMemo(() => {
    const map = new Map<string, number>();
    for (const team of teams) {
      map.set(team.department_id, (map.get(team.department_id) ?? 0) + 1);
    }
    return map;
  }, [teams]);

  const pendingInvitesByDepartment = useMemo(() => {
    const map = new Map<string, Invite[]>();
    for (const invite of invites) {
      if (!invite.department_id || invite.status !== 'pending') continue;
      const current = map.get(invite.department_id) ?? [];
      current.push(invite);
      map.set(invite.department_id, current);
    }
    return map;
  }, [invites]);

  async function loadDepartmentsData() {
    setState('loading');
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError && !isMissingAuthSessionError(userError.message)) {
      setError(userError.message);
      setState('error');
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

    if (membershipError) {
      setError(membershipError.message);
      setState('error');
      return;
    }

    const adminMembership = (memberships ?? [])[0] as ClubMembership | undefined;

    if (!adminMembership) {
      setState('no_admin_membership');
      return;
    }

    const resolvedClubId = adminMembership.club_id;

    const [clubResult, departmentsResult, facilitiesResult, assignmentsResult, teamsResult, invitesResult] = await Promise.all([
      supabase.from('clubs').select('id, name').eq('id', resolvedClubId).single(),
      supabase.from('departments').select('id, name, sport, created_at').eq('club_id', resolvedClubId).order('name'),
      supabase.from('facilities').select('id, name').eq('club_id', resolvedClubId).order('name'),
      supabase.from('department_facilities').select('department_id, facility_id').eq('club_id', resolvedClubId),
      supabase.from('teams').select('id, department_id').eq('club_id', resolvedClubId),
      supabase
        .from('invites')
        .select('id, department_id, role, status')
        .eq('club_id', resolvedClubId)
        .in('role', ['department_lead', 'head_coach', 'assistant_coach']),
    ]);

    const firstError = clubResult.error ?? departmentsResult.error ?? facilitiesResult.error ?? assignmentsResult.error ?? teamsResult.error ?? invitesResult.error;

    if (firstError) {
      setError(firstError.message);
      setState('error');
      return;
    }

    setClub(clubResult.data as Club);
    setDepartments((departmentsResult.data ?? []) as Department[]);
    setFacilities((facilitiesResult.data ?? []) as Facility[]);
    setAssignments((assignmentsResult.data ?? []) as DepartmentFacility[]);
    setTeams((teamsResult.data ?? []) as Team[]);
    setInvites((invitesResult.data ?? []) as Invite[]);
    setState('ready');
  }

  useEffect(() => {
    loadDepartmentsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateDepartment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!clubId || !newDepartmentName.trim()) return;

    setIsSaving(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const { error: insertError } = await supabase.from('departments').insert({
      club_id: clubId,
      name: newDepartmentName.trim(),
      sport: newDepartmentSport.trim() || null,
    });

    if (insertError) {
      setError(insertError.message);
      setIsSaving(false);
      return;
    }

    setNewDepartmentName('');
    setNewDepartmentSport('');
    setIsSaving(false);
    await loadDepartmentsData();
  }

  if (state === 'loading') {
    return (
      <AdminShell>
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 text-center">
          <p className="text-sm font-bold text-slate-300">Loading departments...</p>
        </section>
      </AdminShell>
    );
  }

  if (state === 'no_admin_membership') {
    return (
      <AdminShell>
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Departments</p>
          <h1 className="mt-3 text-3xl font-black">No admin club found</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">Create a club first before managing departments.</p>
          <Link href="/onboarding/create-club" className="mt-5 inline-block rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">
            Create club setup
          </Link>
        </section>
      </AdminShell>
    );
  }

  if (state === 'error') {
    return (
      <AdminShell>
        <section className="rounded-3xl border border-red-900/70 bg-red-950/30 p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">Department error</p>
          <h1 className="mt-3 text-3xl font-black">Could not load departments</h1>
          <p className="mt-3 text-sm leading-6 text-red-100">{error}</p>
        </section>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-300">Admin departments</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Departments for {club?.name}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Departments are the operating layer between the club and teams. Tap a department card to open its dedicated workspace.
        </p>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
        <form onSubmit={handleCreateDepartment} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Create</p>
          <h2 className="mt-2 text-xl font-black">Add department</h2>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-200">Department name</span>
              <input
                required
                value={newDepartmentName}
                onChange={(event) => setNewDepartmentName(event.target.value)}
                placeholder="Basketball"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-200">Sport optional</span>
              <input
                value={newDepartmentSport}
                onChange={(event) => setNewDepartmentSport(event.target.value)}
                placeholder="Basketball, Football, Performance..."
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
              />
            </label>
            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add department
            </button>
          </div>
        </form>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Departments</p>
          <div className="mt-4 grid gap-3">
            {departments.length > 0 ? (
              departments.map((department) => {
                const departmentFacilities = facilitiesByDepartment.get(department.id) ?? [];
                const teamCount = teamCountByDepartment.get(department.id) ?? 0;
                const pendingInvites = pendingInvitesByDepartment.get(department.id) ?? [];
                const hasLeadInvite = pendingInvites.some((invite) => invite.role === 'department_lead');

                return (
                  <article
                    key={department.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/admin/departments/${department.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') router.push(`/admin/departments/${department.id}`);
                    }}
                    className="cursor-pointer rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-violet-400/70 hover:bg-slate-900"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h2 className="text-xl font-black text-white">{department.name}</h2>
                        <p className="mt-1 text-xs text-slate-500">{department.sport || 'No sport label set'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/admin/people?department=${department.id}`);
                        }}
                        className="w-fit rounded-xl border border-amber-500/60 px-3 py-2 text-xs font-black text-amber-200 hover:bg-amber-950/40"
                      >
                        Invite people
                      </button>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Teams</p>
                        <p className="mt-1 text-sm font-black text-slate-100">{teamCount === 0 ? 'Not created yet' : `${teamCount} linked`}</p>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Facilities</p>
                        <p className="mt-1 text-sm font-black text-slate-100">{departmentFacilities.length === 0 ? 'Needs assignment' : 'Assigned'}</p>
                        <UsageChips items={departmentFacilities} emptyText="No facilities assigned yet." />
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Lead invite</p>
                        <p className="mt-1 text-sm font-black text-slate-100">{hasLeadInvite ? 'Pending' : 'Not invited yet'}</p>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">No departments yet.</p>
            )}
          </div>
        </section>
      </section>
    </AdminShell>
  );
}
