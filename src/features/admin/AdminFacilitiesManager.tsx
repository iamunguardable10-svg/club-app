'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';
import { findBestFacilityLocationMatch, getFacilityMatchWarning } from '@/shared/lib/facilities/matching';

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
  scope: 'club_shared' | 'department_only';
  owner_department_id: string | null;
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
  const [newFacilityDepartmentIds, setNewFacilityDepartmentIds] = useState<string[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);
  const [expandedDepartments, setExpandedDepartments] = useState<string[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [backContext, setBackContext] = useState<string | null>(null);

  const clubId = club?.id ?? '';

  const backTarget = useMemo(() => {
    if (backContext === 'departments') {
      return { href: '/admin/departments', label: '← Back to departments' };
    }

    return { href: '/admin/overview', label: '← Back to overview' };
  }, [backContext]);

  const departmentById = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);
  const facilityById = useMemo(() => new Map(facilities.map((facility) => [facility.id, facility])), [facilities]);

  const globalFacilities = useMemo(() => facilities.filter((facility) => facility.scope !== 'department_only'), [facilities]);

  const departmentOnlyFacilitiesByDepartment = useMemo(() => {
    const map = new Map<string, Facility[]>();

    for (const facility of facilities) {
      if (facility.scope !== 'department_only' || !facility.owner_department_id) continue;
      const current = map.get(facility.owner_department_id) ?? [];
      current.push(facility);
      map.set(facility.owner_department_id, current);
    }

    return map;
  }, [facilities]);

  const assignmentsByDepartment = useMemo(() => {
    const map = new Map<string, DepartmentFacility[]>();

    for (const assignment of assignments) {
      const facility = facilityById.get(assignment.facility_id);
      if (facility?.scope === 'department_only') continue;

      const current = map.get(assignment.department_id) ?? [];
      current.push(assignment);
      map.set(assignment.department_id, current);
    }

    return map;
  }, [assignments, facilityById]);

  const assignedDepartmentIdsForSelectedFacility = useMemo(() => {
    return new Set(
      assignments
        .filter((assignment) => assignment.facility_id === selectedFacilityId)
        .map((assignment) => assignment.department_id),
    );
  }, [assignments, selectedFacilityId]);

  const createMatch = useMemo(() => {
    if (!newFacilityName.trim() || !newFacilityAddress.trim()) return null;

    return findBestFacilityLocationMatch({
      name: newFacilityName,
      address: newFacilityAddress,
      candidates: facilities.map((facility) => ({
        id: facility.id,
        name: facility.name,
        address: facility.address,
        scope: facility.scope,
        ownerDepartmentId: facility.owner_department_id,
      })),
    });
  }, [facilities, newFacilityAddress, newFacilityName]);

  const createWarning = createMatch ? getFacilityMatchWarning(createMatch) : null;

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
      supabase.from('facilities').select('id, name, address, scope, owner_department_id').eq('club_id', resolvedClubId).order('name'),
      supabase.from('department_facilities').select('id, club_id, department_id, facility_id').eq('club_id', resolvedClubId),
    ]);

    const firstError = clubResult.error ?? departmentsResult.error ?? facilitiesResult.error ?? assignmentsResult.error;

    if (firstError) {
      setState('error');
      setError(firstError.message);
      return;
    }

    const loadedFacilities = ((facilitiesResult.data ?? []) as Facility[]).map((facility) => ({
      ...facility,
      scope: facility.scope ?? 'club_shared',
      owner_department_id: facility.owner_department_id ?? null,
      address: facility.address ?? null,
    }));
    const loadedDepartments = (departmentsResult.data ?? []) as Department[];

    setClub(clubResult.data as Club);
    setDepartments(loadedDepartments);
    setFacilities(loadedFacilities);
    setAssignments((assignmentsResult.data ?? []) as DepartmentFacility[]);
    setSelectedFacilityId((current) => current || loadedFacilities.find((facility) => facility.scope !== 'department_only')?.id || '');
    setExpandedDepartments((current) => (current.length > 0 ? current : loadedDepartments.map((department) => department.id)));
    setState('ready');
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBackContext(new URLSearchParams(window.location.search).get('from'));
    }
    loadAdminData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleExpandedDepartment(departmentId: string) {
    setExpandedDepartments((current) =>
      current.includes(departmentId) ? current.filter((currentDepartmentId) => currentDepartmentId !== departmentId) : [...current, departmentId],
    );
  }

  function toggleNewFacilityDepartment(departmentId: string) {
    setNewFacilityDepartmentIds((current) =>
      current.includes(departmentId)
        ? current.filter((currentDepartmentId) => currentDepartmentId !== departmentId)
        : [...current, departmentId],
    );
  }

  function toggleDepartment(departmentId: string) {
    setSelectedDepartmentIds((current) =>
      current.includes(departmentId)
        ? current.filter((currentDepartmentId) => currentDepartmentId !== departmentId)
        : [...current, departmentId],
    );
  }

  async function insertAssignments(facilityId: string, departmentIds: string[]) {
    if (!clubId || departmentIds.length === 0) return;

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const existingDepartmentIds = new Set(
      assignments
        .filter((assignment) => assignment.facility_id === facilityId)
        .map((assignment) => assignment.department_id),
    );

    const rowsToInsert = departmentIds
      .filter((departmentId) => !existingDepartmentIds.has(departmentId))
      .map((departmentId) => ({
        club_id: clubId,
        department_id: departmentId,
        facility_id: facilityId,
        created_by: user?.id ?? null,
      }));

    if (rowsToInsert.length === 0) return;

    const { error: insertError } = await supabase.from('department_facilities').insert(rowsToInsert);
    if (insertError) throw insertError;
  }

  async function handleCreateFacility(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!clubId || !newFacilityName.trim() || !newFacilityAddress.trim()) {
      setError('Add a facility name and address.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();

    try {
      const { data: insertedFacility, error: insertError } = await supabase
        .from('facilities')
        .insert({
          club_id: clubId,
          name: newFacilityName.trim(),
          address: newFacilityAddress.trim(),
          scope: 'club_shared',
          owner_department_id: null,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      const facilityId = insertedFacility?.id as string | undefined;
      if (!facilityId) throw new Error('Facility was created without an id.');

      await insertAssignments(facilityId, newFacilityDepartmentIds);

      setNewFacilityName('');
      setNewFacilityAddress('');
      setNewFacilityDepartmentIds([]);
      setSelectedFacilityId(facilityId);
      await loadAdminData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create facility.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMakeFacilityGlobal(facilityId: string, additionalDepartmentIds: string[] = []) {
    const facility = facilityById.get(facilityId);
    if (!facility) return;

    setIsSaving(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();

    try {
      const { error: updateError } = await supabase
        .from('facilities')
        .update({ scope: 'club_shared', owner_department_id: null })
        .eq('id', facilityId);

      if (updateError) throw updateError;

      const departmentIdsToAssign = Array.from(new Set([facility.owner_department_id, ...additionalDepartmentIds].filter(Boolean) as string[]));
      await insertAssignments(facilityId, departmentIdsToAssign);

      setNewFacilityName('');
      setNewFacilityAddress('');
      setNewFacilityDepartmentIds([]);
      setSelectedFacilityId(facilityId);
      await loadAdminData();
    } catch (promoteError) {
      setError(promoteError instanceof Error ? promoteError.message : 'Could not make facility global.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAssignFacility(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!clubId || !selectedFacilityId || selectedDepartmentIds.length === 0) return;

    setIsSaving(true);
    setError(null);

    try {
      await insertAssignments(selectedFacilityId, selectedDepartmentIds);
      setSelectedDepartmentIds([]);
      await loadAdminData();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : 'Could not assign selected departments.');
    } finally {
      setIsSaving(false);
    }
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
          <Link href={backTarget.href} className="inline-flex items-center text-sm font-black text-emerald-300 hover:text-emerald-200">
            {backTarget.label}
          </Link>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Admin facilities</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Facilities for {club?.name}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Manage shared club facilities and department-only locations separately. Edit Mode is reserved for creation, assignment and conversion actions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsEditMode((current) => !current)}
              className={
                isEditMode
                  ? 'w-fit rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300'
                  : 'w-fit rounded-xl border border-emerald-500/70 px-4 py-3 text-sm font-black text-emerald-200 transition hover:bg-emerald-950/40'
              }
            >
              {isEditMode ? 'Done editing' : 'Edit facilities'}
            </button>
          </div>
        </section>

        {error ? <section className="rounded-2xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</section> : null}

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Global facilities</p>
              <h2 className="mt-2 text-xl font-black">Shared club facilities</h2>
            </div>
            <span className="text-sm font-bold text-slate-400">{globalFacilities.length} global</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {globalFacilities.map((facility) => (
              <Link
                key={facility.id}
                href={`/admin/facilities/${facility.id}/calendar?from=facilities`}
                className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 transition hover:border-emerald-400 hover:bg-emerald-950/20 active:border-emerald-300"
              >
                <p className="font-black text-white">{facility.name}</p>
                <p className="mt-1 text-xs text-slate-500">{facility.address || 'No address set yet'}</p>
              </Link>
            ))}
            {globalFacilities.length === 0 ? <p className="text-sm text-slate-500">No global facilities yet.</p> : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Department facilities</p>
          <h2 className="mt-2 text-xl font-black">Department access and local locations</h2>
          <div className="mt-5 space-y-3">
            {departments.map((department) => {
              const isExpanded = expandedDepartments.includes(department.id);
              const departmentAssignments = assignmentsByDepartment.get(department.id) ?? [];
              const departmentOnlyFacilities = departmentOnlyFacilitiesByDepartment.get(department.id) ?? [];

              return (
                <section key={department.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <button type="button" onClick={() => toggleExpandedDepartment(department.id)} className="flex w-full items-center justify-between gap-3 text-left">
                    <span>
                      <span className="block font-black">{department.name}</span>
                      <span className="mt-1 block text-xs font-bold text-slate-500">
                        {departmentAssignments.length} shared assigned · {departmentOnlyFacilities.length} department-only
                      </span>
                    </span>
                    <span className="text-sm font-black text-sky-300">{isExpanded ? 'Hide' : 'Show'}</span>
                  </button>

                  {isExpanded ? (
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Shared access</p>
                        <div className="mt-3 space-y-2">
                          {departmentAssignments.length > 0 ? (
                            departmentAssignments.map((assignment) => {
                              const facility = facilityById.get(assignment.facility_id);
                              return (
                                <div key={assignment.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                                  <Link
                                    href={`/admin/facilities/${assignment.facility_id}/calendar?from=facilities`}
                                    className="text-sm font-bold text-slate-200 hover:text-emerald-300"
                                  >
                                    {facility?.name ?? 'Unknown facility'}
                                    {facility?.address ? <span className="block text-xs text-slate-500">{facility.address}</span> : null}
                                  </Link>
                                  {isEditMode ? (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveAssignment(assignment.id)}
                                      disabled={isSaving}
                                      className="text-xs font-bold text-red-300 hover:text-red-200 disabled:opacity-50"
                                    >
                                      Remove
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-sm text-slate-500">No shared facilities assigned.</p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-300">Department-only</p>
                        <div className="mt-3 space-y-2">
                          {departmentOnlyFacilities.length > 0 ? (
                            departmentOnlyFacilities.map((facility) => (
                              <div key={facility.id} className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                                <p className="text-sm font-black text-slate-100">{facility.name}</p>
                                <p className="mt-1 text-xs text-slate-500">{facility.address || 'No address'}</p>
                                {isEditMode ? (
                                  <button
                                    type="button"
                                    onClick={() => handleMakeFacilityGlobal(facility.id)}
                                    disabled={isSaving}
                                    className="mt-2 rounded-lg border border-violet-500/60 px-2.5 py-1.5 text-xs font-black text-violet-200 hover:bg-violet-950/40 disabled:opacity-50"
                                  >
                                    Make global
                                  </button>
                                ) : null}
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-slate-500">No department-only facilities.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </section>

        {isEditMode ? (
          <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <form onSubmit={handleCreateFacility} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Create</p>
              <h2 className="mt-2 text-xl font-black">Add global facility</h2>
              {createWarning ? (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
                  <p className="text-sm font-bold leading-6 text-amber-100">{createWarning}</p>
                  {createMatch?.candidate.scope === 'department_only' ? (
                    <button
                      type="button"
                      onClick={() => handleMakeFacilityGlobal(createMatch.candidate.id, newFacilityDepartmentIds)}
                      disabled={isSaving}
                      className="mt-3 rounded-lg bg-amber-300 px-3 py-2 text-xs font-black text-slate-950 hover:bg-amber-200 disabled:opacity-50"
                    >
                      Make existing hall global
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-sm font-bold text-slate-200">Name</span>
                  <input
                    required
                    value={newFacilityName}
                    onChange={(event) => {
                      setNewFacilityName(event.target.value);
                      setError(null);
                    }}
                    placeholder="Main Hall"
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-slate-200">Address</span>
                  <input
                    required
                    value={newFacilityAddress}
                    onChange={(event) => {
                      setNewFacilityAddress(event.target.value);
                      setError(null);
                    }}
                    placeholder="Street, city"
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                  />
                </label>
                <div>
                  <p className="text-sm font-bold text-slate-200">Assign to departments optional</p>
                  <div className="mt-2 space-y-2">
                    {departments.map((department) => (
                      <label key={department.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm">
                        <span className="font-bold text-slate-100">{department.name}</span>
                        <input
                          type="checkbox"
                          checked={newFacilityDepartmentIds.includes(department.id)}
                          onChange={() => toggleNewFacilityDepartment(department.id)}
                          className="h-4 w-4"
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Add separate global facility
                </button>
              </div>
            </form>

            <form onSubmit={handleAssignFacility} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Assign</p>
              <h2 className="mt-2 text-xl font-black">Assign existing global facility</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">Select a global facility, then choose every department that may use it.</p>
              <div className="mt-4 space-y-4">
                <select
                  value={selectedFacilityId}
                  onChange={(event) => setSelectedFacilityId(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-violet-400"
                >
                  {globalFacilities.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.name} — {facility.address || 'No address'}
                    </option>
                  ))}
                </select>

                <div className="space-y-2">
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

                <button
                  type="submit"
                  disabled={isSaving || departments.length === 0 || globalFacilities.length === 0 || selectedDepartmentIds.length === 0}
                  className="w-full rounded-xl bg-violet-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Assign selected departments
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}
