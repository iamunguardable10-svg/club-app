'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getDemoClubSetup,
  getDemoTeams,
  saveDemoClubSetup,
  saveDemoTeams,
  type DemoClubSetup,
  type DemoFacilityDetails,
} from '@/shared/dev/demoStorage';
import { findBestFacilityLocationMatch, getFacilityMatchWarning } from '@/shared/lib/facilities/matching';

type DemoAssignment = { department: string; facility: string };
type DepartmentOnlyDraft = { name: string; address: string };

const DEMO_FACILITY_ASSIGNMENTS_KEY = 'club-app.demo.facility-assignments';
const FACILITIES_CHANGED_EVENT = 'club-app.demo.facilities-changed';

function readAssignments(): DemoAssignment[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(DEMO_FACILITY_ASSIGNMENTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DemoAssignment[];
  } catch {
    return [];
  }
}

function writeAssignments(assignments: DemoAssignment[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_FACILITY_ASSIGNMENTS_KEY, JSON.stringify(assignments));
}

function confirmAction(message: string) {
  if (typeof window === 'undefined') return false;
  return window.confirm(message);
}

function encodeFacilityName(facility: string) {
  return encodeURIComponent(facility);
}

export function DemoAdminFacilitiesManager() {
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [assignments, setAssignments] = useState<DemoAssignment[]>([]);
  const [newFacilityName, setNewFacilityName] = useState('');
  const [newFacilityAddress, setNewFacilityAddress] = useState('');
  const [newFacilityDepartments, setNewFacilityDepartments] = useState<string[]>([]);
  const [selectedFacility, setSelectedFacility] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [departmentSharedSelect, setDepartmentSharedSelect] = useState<Record<string, string>>({});
  const [departmentSharedQueue, setDepartmentSharedQueue] = useState<Record<string, string[]>>({});
  const [departmentOnlyDrafts, setDepartmentOnlyDrafts] = useState<Record<string, DepartmentOnlyDraft>>({});
  const [expandedDepartments, setExpandedDepartments] = useState<string[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backContext, setBackContext] = useState<string | null>(null);

  function loadLocalData() {
    const currentSetup = getDemoClubSetup();
    const currentAssignments = readAssignments();
    const firstGlobal = currentSetup?.facilityDetails?.find((facility) => facility.scope !== 'department_only')?.name ?? '';

    setSetup(currentSetup);
    setAssignments(currentAssignments);
    setSelectedFacility((current) => (current && currentSetup?.facilityDetails?.some((facility) => facility.name === current) ? current : firstGlobal));
    setExpandedDepartments((current) => (current.length > 0 ? current : currentSetup?.departments ?? []));
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBackContext(new URLSearchParams(window.location.search).get('from'));
      window.addEventListener(FACILITIES_CHANGED_EVENT, loadLocalData);
    }
    loadLocalData();

    return () => {
      if (typeof window !== 'undefined') window.removeEventListener(FACILITIES_CHANGED_EVENT, loadLocalData);
    };
  }, []);

  const backTarget = useMemo(() => {
    if (backContext === 'departments') return { href: '/demo/admin/departments', label: '← Back to local departments' };
    return { href: '/demo/admin/overview', label: '← Back to local overview' };
  }, [backContext]);

  const facilityDetails = useMemo(() => setup?.facilityDetails ?? [], [setup]);
  const facilityByName = useMemo(() => new Map(facilityDetails.map((facility) => [facility.name, facility])), [facilityDetails]);
  const globalFacilities = useMemo(() => facilityDetails.filter((facility) => facility.scope !== 'department_only'), [facilityDetails]);

  const departmentOnlyFacilitiesByDepartment = useMemo(() => {
    const map = new Map<string, DemoFacilityDetails[]>();
    for (const facility of facilityDetails) {
      if (facility.scope !== 'department_only' || !facility.ownerDepartment) continue;
      const current = map.get(facility.ownerDepartment) ?? [];
      current.push(facility);
      map.set(facility.ownerDepartment, current);
    }
    return map;
  }, [facilityDetails]);

  const sharedAssignmentsByDepartment = useMemo(() => {
    const map = new Map<string, DemoAssignment[]>();
    for (const assignment of assignments) {
      const facility = facilityByName.get(assignment.facility);
      if (facility?.scope === 'department_only') continue;
      const current = map.get(assignment.department) ?? [];
      current.push(assignment);
      map.set(assignment.department, current);
    }
    return map;
  }, [assignments, facilityByName]);

  const assignedDepartmentsForSelectedFacility = useMemo(() => {
    return new Set(assignments.filter((assignment) => assignment.facility === selectedFacility).map((assignment) => assignment.department));
  }, [assignments, selectedFacility]);

  const createMatch = useMemo(() => {
    if (!newFacilityName.trim() || !newFacilityAddress.trim()) return null;
    return findBestFacilityLocationMatch({
      name: newFacilityName,
      address: newFacilityAddress,
      candidates: facilityDetails.map((facility) => ({
        id: facility.name,
        name: facility.name,
        address: facility.address,
        scope: facility.scope,
        ownerDepartmentId: facility.ownerDepartment ?? null,
      })),
    });
  }, [facilityDetails, newFacilityAddress, newFacilityName]);

  const createWarning = createMatch ? getFacilityMatchWarning(createMatch) : null;

  function persistSetup(nextSetup: DemoClubSetup) {
    saveDemoClubSetup(nextSetup);
    setSetup(getDemoClubSetup());
  }

  function persistAssignments(nextAssignments: DemoAssignment[]) {
    setAssignments(nextAssignments);
    writeAssignments(nextAssignments);
  }

  function createAssignmentsForFacility(facility: string, departments: string[], sourceAssignments = assignments) {
    const existingKeys = new Set(sourceAssignments.map((assignment) => `${assignment.department}::${assignment.facility}`));
    return departments.filter((department) => !existingKeys.has(`${department}::${facility}`)).map((department) => ({ department, facility }));
  }

  function toggleExpandedDepartment(department: string) {
    setExpandedDepartments((current) => (current.includes(department) ? current.filter((item) => item !== department) : [...current, department]));
  }

  function toggleNewFacilityDepartment(department: string) {
    setNewFacilityDepartments((current) => (current.includes(department) ? current.filter((item) => item !== department) : [...current, department]));
  }

  function toggleDepartment(department: string) {
    setSelectedDepartments((current) => (current.includes(department) ? current.filter((item) => item !== department) : [...current, department]));
  }

  function getAvailableSharedFacilities(department: string) {
    const assigned = new Set((sharedAssignmentsByDepartment.get(department) ?? []).map((assignment) => assignment.facility));
    const queued = new Set(departmentSharedQueue[department] ?? []);
    return globalFacilities.filter((facility) => !assigned.has(facility.name) && !queued.has(facility.name));
  }

  function addDepartmentSharedSelection(department: string) {
    const selected = departmentSharedSelect[department];
    if (!selected) return;
    setDepartmentSharedQueue((current) => ({
      ...current,
      [department]: Array.from(new Set([...(current[department] ?? []), selected])),
    }));
    setDepartmentSharedSelect((current) => ({ ...current, [department]: '' }));
  }

  function removeDepartmentQueuedShared(department: string, facility: string) {
    setDepartmentSharedQueue((current) => ({
      ...current,
      [department]: (current[department] ?? []).filter((item) => item !== facility),
    }));
  }

  function assignDepartmentQueuedShared(department: string) {
    const queued = departmentSharedQueue[department] ?? [];
    if (queued.length === 0) return;
    const additions = queued.flatMap((facility) => createAssignmentsForFacility(facility, [department]));
    persistAssignments([...assignments, ...additions]);
    setDepartmentSharedQueue((current) => ({ ...current, [department]: [] }));
  }

  function updateDepartmentOnlyDraft(department: string, patch: Partial<DepartmentOnlyDraft>) {
    setDepartmentOnlyDrafts((current) => ({
      ...current,
      [department]: {
        ...(current[department] ?? { name: '', address: '' }),
        ...patch,
      },
    }));
  }

  function createDepartmentOnlyFacility(department: string) {
    if (!setup) return;
    const draft = departmentOnlyDrafts[department] ?? { name: '', address: '' };
    const facilityName = draft.name.trim();
    const address = draft.address.trim();

    if (!facilityName || !address) {
      setError('Add a department-only facility name and address.');
      return;
    }

    if (facilityByName.has(facilityName)) {
      setError('A local demo facility with this name already exists. Use another name or make the existing hall global.');
      return;
    }

    persistSetup({
      ...setup,
      facilities: [...setup.facilities, facilityName],
      facilityDetails: [
        ...(setup.facilityDetails ?? []),
        {
          name: facilityName,
          address,
          scope: 'department_only',
          ownerDepartment: department,
        },
      ],
    });
    persistAssignments([...assignments, ...createAssignmentsForFacility(facilityName, [department])]);
    setDepartmentOnlyDrafts((current) => ({ ...current, [department]: { name: '', address: '' } }));
    setError(null);
  }

  function handleAddFacility(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!setup || !newFacilityName.trim() || !newFacilityAddress.trim()) {
      setError('Add a facility name and address.');
      return;
    }

    const facilityName = newFacilityName.trim();
    const address = newFacilityAddress.trim();

    if (facilityByName.has(facilityName)) {
      setError('A local demo facility with this name already exists. Use the existing facility or rename this one.');
      return;
    }

    persistSetup({
      ...setup,
      facilities: [...setup.facilities, facilityName],
      facilityDetails: [
        ...(setup.facilityDetails ?? []),
        { name: facilityName, address, scope: 'club_shared', ownerDepartment: null },
      ],
    });
    persistAssignments([...assignments, ...createAssignmentsForFacility(facilityName, newFacilityDepartments)]);
    setSelectedFacility(facilityName);
    setNewFacilityName('');
    setNewFacilityAddress('');
    setNewFacilityDepartments([]);
  }

  function handleMakeFacilityGlobal(facilityName: string, extraDepartments: string[] = []) {
    if (!setup) return;
    const existingFacility = facilityByName.get(facilityName);
    if (!existingFacility) return;
    const departmentsToAssign = Array.from(new Set([existingFacility.ownerDepartment, ...extraDepartments].filter(Boolean) as string[]));
    const nextDetails = (setup.facilityDetails ?? []).map((facility) =>
      facility.name === facilityName ? { ...facility, scope: 'club_shared' as const, ownerDepartment: null } : facility,
    );

    persistSetup({
      ...setup,
      facilities: setup.facilities.includes(facilityName) ? setup.facilities : [...setup.facilities, facilityName],
      facilityDetails: nextDetails,
    });
    persistAssignments([...assignments, ...createAssignmentsForFacility(facilityName, departmentsToAssign)]);
    setSelectedFacility(facilityName);
  }

  function handleAssign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFacility || selectedDepartments.length === 0) return;
    persistAssignments([...assignments, ...createAssignmentsForFacility(selectedFacility, selectedDepartments)]);
    setSelectedDepartments([]);
  }

  function handleRemoveAssignment(department: string, facility: string) {
    if (!confirmAction(`Remove ${facility} from ${department}?`)) return;
    persistAssignments(assignments.filter((assignment) => !(assignment.department === department && assignment.facility === facility)));
  }

  function handleDeleteFacility(facilityName: string) {
    if (!setup) return;
    const facility = facilityByName.get(facilityName);
    if (!facility) return;
    const assignedDepartmentCount = assignments.filter((assignment) => assignment.facility === facilityName).length;
    const confirmMessage = facility.scope === 'department_only'
      ? `Delete department-only facility ${facilityName}? This cannot be undone.`
      : `Delete global facility ${facilityName}? This also removes ${assignedDepartmentCount} department assignment${assignedDepartmentCount === 1 ? '' : 's'}.`;
    if (!confirmAction(confirmMessage)) return;

    const nextSetup: DemoClubSetup = {
      ...setup,
      facilities: setup.facilities.filter((name) => name !== facilityName),
      facilityDetails: (setup.facilityDetails ?? []).filter((details) => details.name !== facilityName),
    };
    persistSetup(nextSetup);
    persistAssignments(assignments.filter((assignment) => assignment.facility !== facilityName));
    const teams = getDemoTeams(setup);
    saveDemoTeams(teams.map((team) => (team.defaultFacility === facilityName ? { ...team, defaultFacility: null } : team)));
    if (selectedFacility === facilityName) setSelectedFacility(nextSetup.facilityDetails?.find((details) => details.scope !== 'department_only')?.name ?? '');
  }

  if (!setup) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#92400E_0,#070A12_45%)] px-4 py-10 text-white sm:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo facilities</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">No local demo setup found</h1>
          <p className="mt-3 text-sm leading-6 text-amber-100/80">Create a local demo club first. It will only be stored in your browser and not in Supabase.</p>
          <Link href="/demo/create-club" className="mt-5 inline-block rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200">Create local demo setup</Link>
        </div>
      </main>
    );
  }

  const editTools = isEditMode ? (
    <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <form onSubmit={handleAddFacility} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Create</p>
        <h2 className="mt-2 text-xl font-black">Add global facility</h2>
        {createWarning ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
            <p className="text-sm font-bold leading-6 text-amber-100">{createWarning}</p>
            {createMatch?.candidate.scope === 'department_only' ? <button type="button" onClick={() => handleMakeFacilityGlobal(createMatch.candidate.id, newFacilityDepartments)} className="mt-3 rounded-lg bg-amber-300 px-3 py-2 text-xs font-black text-slate-950 hover:bg-amber-200">Make existing hall global</button> : null}
          </div>
        ) : null}
        <div className="mt-4 space-y-4">
          <label className="block"><span className="text-sm font-bold text-slate-200">Name</span><input required value={newFacilityName} onChange={(event) => { setNewFacilityName(event.target.value); setError(null); }} placeholder="Main Hall" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400" /></label>
          <label className="block"><span className="text-sm font-bold text-slate-200">Address</span><input required value={newFacilityAddress} onChange={(event) => { setNewFacilityAddress(event.target.value); setError(null); }} placeholder="Street, city" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400" /></label>
          <div>
            <p className="text-sm font-bold text-slate-200">Assign to departments optional</p>
            <div className="mt-2 space-y-2">{setup.departments.map((department) => <label key={department} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm"><span className="font-bold text-slate-100">{department}</span><input type="checkbox" checked={newFacilityDepartments.includes(department)} onChange={() => toggleNewFacilityDepartment(department)} className="h-4 w-4" /></label>)}</div>
          </div>
          <button type="submit" className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300">Add separate global facility</button>
        </div>
      </form>

      <form onSubmit={handleAssign} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Assign</p>
        <h2 className="mt-2 text-xl font-black">Assign existing global facility</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">Select a global facility, then choose every department that may use it.</p>
        <div className="mt-4 space-y-4">
          <select value={selectedFacility} onChange={(event) => setSelectedFacility(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-violet-400">
            {globalFacilities.map((facility) => <option key={facility.name} value={facility.name}>{facility.name} — {facility.address}</option>)}
          </select>
          <div className="space-y-2">
            {setup.departments.map((department) => {
              const alreadyAssigned = assignedDepartmentsForSelectedFacility.has(department);
              const checked = selectedDepartments.includes(department) || alreadyAssigned;
              return <label key={department} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm"><span><span className="font-bold text-slate-100">{department}</span>{alreadyAssigned ? <span className="ml-2 text-xs font-bold text-emerald-300">already assigned</span> : null}</span><input type="checkbox" checked={checked} disabled={alreadyAssigned} onChange={() => toggleDepartment(department)} className="h-4 w-4" /></label>;
            })}
          </div>
          <button type="submit" disabled={selectedDepartments.length === 0 || !selectedFacility} className="w-full rounded-xl bg-violet-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60">Assign selected departments</button>
        </div>
      </form>
    </section>
  ) : null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#92400E_0,#070A12_45%)] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
          <Link href={backTarget.href} className="inline-flex items-center text-sm font-black text-amber-200 hover:text-amber-100">{backTarget.label}</Link>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo facilities</p><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Facilities for {setup.clubName}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">Browser-only facility manager split into global club facilities and department-only facilities.</p></div>
            <button type="button" onClick={() => setIsEditMode((current) => !current)} className={isEditMode ? 'w-fit rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200' : 'w-fit rounded-xl border border-amber-500/70 px-4 py-3 text-sm font-black text-amber-200 transition hover:bg-amber-950/40'}>{isEditMode ? 'Done editing' : 'Edit facilities'}</button>
          </div>
        </section>

        {error ? <section className="rounded-2xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</section> : null}
        {editTools}

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Global facilities</p><h2 className="mt-2 text-xl font-black">Shared club facilities</h2></div><span className="text-sm font-bold text-slate-400">{globalFacilities.length} global</span></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {globalFacilities.map((facility) => <article key={facility.name} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 transition hover:border-emerald-400 hover:bg-emerald-950/20"><Link href={`/demo/admin/facilities/${encodeFacilityName(facility.name)}/calendar?from=facilities`} className="block"><p className="font-black text-white">{facility.name}</p><p className="mt-1 text-xs text-slate-500">{facility.address}</p></Link>{isEditMode ? <button type="button" onClick={() => handleDeleteFacility(facility.name)} className="mt-3 rounded-lg border border-red-500/60 px-2.5 py-1.5 text-xs font-black text-red-200 hover:bg-red-950/40">Delete facility</button> : null}</article>)}
            {globalFacilities.length === 0 ? <p className="text-sm text-slate-500">No global facilities yet.</p> : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Department facilities</p>
          <h2 className="mt-2 text-xl font-black">Department access and local locations</h2>
          <div className="mt-5 space-y-3">
            {setup.departments.map((department) => {
              const isExpanded = expandedDepartments.includes(department);
              const sharedAssignments = sharedAssignmentsByDepartment.get(department) ?? [];
              const departmentOnlyFacilities = departmentOnlyFacilitiesByDepartment.get(department) ?? [];
              const availableShared = getAvailableSharedFacilities(department);
              const queuedShared = departmentSharedQueue[department] ?? [];
              const draft = departmentOnlyDrafts[department] ?? { name: '', address: '' };

              return (
                <section key={department} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <button type="button" onClick={() => toggleExpandedDepartment(department)} className="flex w-full items-center justify-between gap-3 text-left"><span><span className="block font-black">{department}</span><span className="mt-1 block text-xs font-bold text-slate-500">{sharedAssignments.length} shared assigned · {departmentOnlyFacilities.length} department-only</span></span><span className="text-sm font-black text-sky-300">{isExpanded ? 'Hide' : 'Show'}</span></button>

                  {isExpanded ? (
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Shared access</p>
                        <div className="mt-3 space-y-2">
                          {sharedAssignments.length > 0 ? sharedAssignments.map((assignment) => {
                            const facility = facilityByName.get(assignment.facility);
                            return <div key={`${assignment.department}-${assignment.facility}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"><Link href={`/demo/admin/facilities/${encodeFacilityName(assignment.facility)}/calendar?from=facilities`} className="text-sm font-bold text-slate-200 hover:text-emerald-300">{assignment.facility}{facility?.address ? <span className="block text-xs text-slate-500">{facility.address}</span> : null}</Link>{isEditMode ? <button type="button" onClick={() => handleRemoveAssignment(assignment.department, assignment.facility)} className="text-xs font-bold text-red-300 hover:text-red-200">Remove</button> : null}</div>;
                          }) : <p className="text-sm text-slate-500">No shared facilities assigned.</p>}
                        </div>

                        {isEditMode ? (
                          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3">
                            <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-300">Assign shared hall</p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                              <select value={departmentSharedSelect[department] ?? ''} onChange={(event) => setDepartmentSharedSelect((current) => ({ ...current, [department]: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold outline-none focus:border-emerald-400">
                                <option value="">Select shared club facility</option>
                                {availableShared.map((facility) => <option key={facility.name} value={facility.name}>{facility.name} — {facility.address}</option>)}
                              </select>
                              <button type="button" onClick={() => addDepartmentSharedSelection(department)} disabled={!departmentSharedSelect[department]} className="rounded-xl border border-emerald-500/60 px-3 py-2 text-xs font-black text-emerald-200 hover:bg-emerald-950/40 disabled:cursor-not-allowed disabled:opacity-50">Add</button>
                            </div>
                            {queuedShared.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{queuedShared.map((facility) => <button key={facility} type="button" onClick={() => removeDepartmentQueuedShared(department, facility)} className="rounded-full border border-emerald-500/50 px-3 py-1 text-xs font-black text-emerald-200">{facility} ×</button>)}</div> : null}
                            <button type="button" onClick={() => assignDepartmentQueuedShared(department)} disabled={queuedShared.length === 0} className="mt-3 w-full rounded-xl bg-emerald-400 px-3 py-2 text-xs font-black text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50">Assign selected shared halls</button>
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-300">Department-only</p>
                        <div className="mt-3 space-y-2">
                          {departmentOnlyFacilities.length > 0 ? departmentOnlyFacilities.map((facility) => <div key={facility.name} className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"><p className="text-sm font-black text-slate-100">{facility.name}</p><p className="mt-1 text-xs text-slate-500">{facility.address}</p>{isEditMode ? <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => handleMakeFacilityGlobal(facility.name)} className="rounded-lg border border-violet-500/60 px-2.5 py-1.5 text-xs font-black text-violet-200 hover:bg-violet-950/40">Make global</button><button type="button" onClick={() => handleDeleteFacility(facility.name)} className="rounded-lg border border-red-500/60 px-2.5 py-1.5 text-xs font-black text-red-200 hover:bg-red-950/40">Delete</button></div> : null}</div>) : <p className="text-sm text-slate-500">No department-only facilities.</p>}
                        </div>

                        {isEditMode ? (
                          <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-950/10 p-3">
                            <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-300">Create department-only hall</p>
                            <div className="mt-3 grid gap-2">
                              <input value={draft.name} onChange={(event) => updateDepartmentOnlyDraft(department, { name: event.target.value })} placeholder="Hall name" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400" />
                              <input value={draft.address} onChange={(event) => updateDepartmentOnlyDraft(department, { address: event.target.value })} placeholder="Address" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400" />
                              <button type="button" onClick={() => createDepartmentOnlyFacility(department)} disabled={!draft.name.trim() || !draft.address.trim()} className="rounded-xl bg-violet-400 px-3 py-2 text-xs font-black text-slate-950 hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50">Create department-only hall</button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
