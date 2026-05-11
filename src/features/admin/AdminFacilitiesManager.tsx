'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type ClubMembership = { club_id: string };

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
  address: string | null;
};

type DepartmentFacility = {
  id: string;
  club_id: string;
  department_id: string;
  facility_id: string;
};

type LoadState = 'loading' | 'ready' | 'no_admin_membership' | 'error';

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
}

export function AdminFacilitiesManager() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [assignments, setAssignments] = useState<DepartmentFacility[]>([]);
  const [newFacilityName, setNewFacilityName] = useState('');
  const [newFacilityAddress, setNewFacilityAddress] = useState('');
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const clubId = club?.id ?? '';

  const facilityById = useMemo(() => new Map(facilities.map((facility) => [facility.id, facility])), [facilities]);

  const assignmentsByDepartment = useMemo(() => {
    const map = new Map<string, DepartmentFacility[]>();

    for (const assignment of assignments) {
      const current = map.get(assignment.department_id) ?? [];
      current.push(assignment);
      map.set(assignment.department_id, current);
    }

    return map;
  }, [assignments]);

  const assignedDepartmentIdsForSelectedFacility = useMemo(() => {
    return new Set(
      assignments
        .filter((assignment) => assignment.facility_id === selectedFacilityId)
        .map((assignment) => assignment.department_id),
    );
  }, [assignments, selectedFacilityId]);

  async function loadAdminData() {
    setState('loading');
    setError(null);

    const supabase = createBrowserSupabaseClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

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

    const resolvedClubId = adminMembership.club_id;

    const [clubResult, departmentsResult, facilitiesResult, assignmentsResult] = await Promise.all([
      supabase.from('clubs').select('id, name').eq('id', resolvedClubId).single(),
      supabase.from('departments').select('id, name').eq('club_id', resolvedClubId).order('name'),
      supabase.from('facilities').select('id, name, address').eq('club_id', resolvedClubId).order('name'),
      supabase.from('department_facilities').select('id, club_id, department_id, facility_id').eq('club_id', resolvedClubId),
    ]);

    const firstError = clubResult.error ?? departmentsResult.error ?? facilitiesResult.error ?? assignmentsResult.error;

    if (firstError) {
      setState('error');
      setError(firstError.message);
      return;
    }

    const loadedFacilities = (facilitiesResult.data ?? []) as Facility[];

    setClub(clubResult.data as Club);
    setDepartments((departmentsResult.data ?? []) as Department[]);
    setFacilities(loadedFacilities);
    setAssignments((assignmentsResult.data ?? []) as DepartmentFacility[]);
    setSelectedFacilityId((current) => current || loadedFacilities[0]?.id || '');
    setState('ready');
  }

  useEffect(() => {
    loadAdminData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateFacility(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!clubId || !newFacilityName.trim()) return;

    setIsSaving(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();

    const { error: insertError } = await supabase.from('facilities').insert({
      club_id: clubId,
      name: newFacilityName.trim(),
      address: newFacilityAddress.trim() || null,
    });

    if (insertError) {
      setError(insertError.message);
      setState('error');
      setIsSaving(false);
      return;
    }

    setNewFacilityName('');
    setNewFacilityAddress('');
    setIsSaving(false);
    await loadAdminData();
  }

  function toggleDepartment(departmentId: string) {
    setSelectedDepartmentIds((current) =>
      current.includes(departmentId)
        ? current.filter((currentDepartmentId) => currentDepartmentId !== departmentId)
        : [...current, departmentId],
    );
  }

  async function handleAssignFacility(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!clubId || !selectedFacilityId || selectedDepartmentIds.length === 0) return;

    setIsSaving(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const existingDepartmentIds = new Set(
      assignments
        .filter((assignment) => assignment.facility_id === selectedFacilityId)
        .map((assignment) => assignment.department_id),
    );

    const rowsToInsert = selectedDepartmentIds
      .filter((departmentId) => !existingDepartmentIds.has(departmentId))
      .map((departmentId) => ({
        club_id: clubId,
        department_id: departmentId,
        facility_id: selectedFacilityId,
        created_by: user?.id ?? null,
      }));

    if (rowsToInsert.length === 0) {
      setSelectedDepartmentIds([]);
      setIsSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from('department_facilities').insert(rowsToInsert);

    if (insertError) {
      setError(insertError.message);
      setState('error');
      setIsSaving(false);
      return;
    }

    setSelectedDepartmentIds([]);
    setIsSaving(false);
    await loadAdminData();
  }

  async function handleRemoveAssignment(assignmentId: string) {
    setIsSaving(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const { error: deleteError } = await supabase.from('department_facilities').delete().eq('id', assignmentId);

    if (deleteError) {
      setError(deleteError.message);
      setState('error');
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    await loadAdminData();
  }

  if (state === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#064E3B_0,#070A12_45%)] px-4 text-white">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 text-center">
          <p className="text-sm font-bold text-slate-300">Loading facilities...</p>
        </section>
      </main>
    );
  }

  if (state === 'no_admin_membership') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#064E3B_0,#070A12_45%)] px-4 text-white">
        <section className="max-w-xl rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Facilities</p>
          <h1 className="mt-3 text-3xl font-black">No admin club found</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">Create a club first before managing facilities.</p>
          <Link href="/onboarding/create-club" className="mt-5 inline-block rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">
            Create club setup
          </Link>
        </section>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#064E3B_0,#070A12_45%)] px-4 text-white">
        <section className="max-w-xl rounded-3xl border border-red-900/70 bg-red-950/30 p-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">Facility error</p>
          <h1 className="mt-3 text-3xl font-black">Could not load facilities</h1>
          <p className="mt-3 text-sm leading-6 text-red-100">{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#064E3B_0,#070A12_45%)] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-sm">
          <Link href="/admin/setup" className="inline-flex items-center text-sm font-black text-emerald-300 hover:text-emerald-200">
            ← Back to setup
          </Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Admin facilities</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Facilities for {club?.name}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Create global facilities and assign each facility to one or multiple departments. Coaches later use this filter instead of seeing every hall in the club.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Global facilities</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-4xl font-black">{facilities.length}</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Created at club level. Assignment happens per facility below.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5">
            <form onSubmit={handleCreateFacility} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Create</p>
              <h2 className="mt-2 text-xl font-black">Add global facility</h2>
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-sm font-bold text-slate-200">Name</span>
                  <input
                    required
                    value={newFacilityName}
                    onChange={(event) => setNewFacilityName(event.target.value)}
                    placeholder="Main Hall"
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-slate-200">Address optional</span>
                  <input
                    value={newFacilityAddress}
                    onChange={(event) => setNewFacilityAddress(event.target.value)}
                    placeholder="Street, city"
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Add facility
                </button>
              </div>
            </form>

            <form onSubmit={handleAssignFacility} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Assign</p>
              <h2 className="mt-2 text-xl font-black">Assign one facility to multiple departments</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Select a facility, then choose every department that may use it.
              </p>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-sm font-bold text-slate-200">Facility</span>
                  <select
                    value={selectedFacilityId}
                    onChange={(event) => setSelectedFacilityId(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-violet-400"
                  >
                    {facilities.map((facility) => (
                      <option key={facility.id} value={facility.id}>
                        {facility.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <p className="text-sm font-bold text-slate-200">Departments</p>
                  <div className="mt-2 space-y-2">
                    {departments.map((department) => {
                      const alreadyAssigned = assignedDepartmentIdsForSelectedFacility.has(department.id);
                      const checked = selectedDepartmentIds.includes(department.id) || alreadyAssigned;

                      return (
                        <label key={department.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm">
                          <span>
                            <span className="font-bold text-slate-100">{department.name}</span>
                            {alreadyAssigned ? <span className="ml-2 text-xs font-bold text-emerald-300">already assigned</span> : null}
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={alreadyAssigned}
                            onChange={() => toggleDepartment(department.id)}
                            className="h-4 w-4"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSaving || departments.length === 0 || facilities.length === 0 || selectedDepartmentIds.length === 0}
                  className="w-full rounded-xl bg-violet-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Assign selected departments
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Department access</p>
            <h2 className="mt-2 text-xl font-black">Facility assignments</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              This is the filter layer that prevents coaches from seeing every facility in the club.
            </p>

            <div className="mt-5 space-y-4">
              {departments.map((department) => {
                const departmentAssignments = assignmentsByDepartment.get(department.id) ?? [];

                return (
                  <section key={department.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                    <h3 className="font-black">{department.name}</h3>
                    <div className="mt-3 space-y-2">
                      {departmentAssignments.length > 0 ? (
                        departmentAssignments.map((assignment) => {
                          const facility = facilityById.get(assignment.facility_id);
                          return (
                            <div key={assignment.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                              <span className="text-sm font-bold text-slate-200">{facility?.name ?? 'Unknown facility'}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveAssignment(assignment.id)}
                                disabled={isSaving}
                                className="text-xs font-bold text-red-300 hover:text-red-200 disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-slate-500">No facilities assigned yet.</p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
