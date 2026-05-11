'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getDemoClubSetup, saveDemoClubSetup, type DemoClubSetup } from '@/shared/dev/demoStorage';

type DemoAssignment = {
  department: string;
  facility: string;
};

const DEMO_FACILITY_ASSIGNMENTS_KEY = 'club-app.demo.facility-assignments';

function getAssignments(): DemoAssignment[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(DEMO_FACILITY_ASSIGNMENTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DemoAssignment[];
  } catch {
    return [];
  }
}

function saveAssignments(assignments: DemoAssignment[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_FACILITY_ASSIGNMENTS_KEY, JSON.stringify(assignments));
}

function encodeFacilityName(facility: string) {
  return encodeURIComponent(facility);
}

export function DemoAdminFacilitiesManager() {
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [assignments, setAssignments] = useState<DemoAssignment[]>([]);
  const [newFacility, setNewFacility] = useState('');
  const [newFacilityDepartments, setNewFacilityDepartments] = useState<string[]>([]);
  const [selectedFacility, setSelectedFacility] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);

  useEffect(() => {
    const currentSetup = getDemoClubSetup();
    const currentAssignments = getAssignments();
    setSetup(currentSetup);
    setAssignments(currentAssignments);
    setSelectedFacility(currentSetup?.facilities[0] ?? '');
  }, []);

  const assignmentsByDepartment = useMemo(() => {
    const map = new Map<string, DemoAssignment[]>();

    for (const assignment of assignments) {
      const current = map.get(assignment.department) ?? [];
      current.push(assignment);
      map.set(assignment.department, current);
    }

    return map;
  }, [assignments]);

  const assignedDepartmentsForSelectedFacility = useMemo(() => {
    return new Set(
      assignments
        .filter((assignment) => assignment.facility === selectedFacility)
        .map((assignment) => assignment.department),
    );
  }, [assignments, selectedFacility]);

  function persistSetup(nextSetup: DemoClubSetup) {
    saveDemoClubSetup(nextSetup);
    setSetup(nextSetup);
  }

  function toggleNewFacilityDepartment(department: string) {
    setNewFacilityDepartments((current) =>
      current.includes(department)
        ? current.filter((currentDepartment) => currentDepartment !== department)
        : [...current, department],
    );
  }

  function handleAddFacility(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setup || !newFacility.trim()) return;

    const facilityName = newFacility.trim();

    if (setup.facilities.includes(facilityName)) {
      setNewFacility('');
      setNewFacilityDepartments([]);
      return;
    }

    const nextSetup = {
      ...setup,
      facilities: [...setup.facilities, facilityName],
    };

    const existingKeys = new Set(assignments.map((assignment) => `${assignment.department}::${assignment.facility}`));
    const additions = newFacilityDepartments
      .filter((department) => !existingKeys.has(`${department}::${facilityName}`))
      .map((department) => ({ department, facility: facilityName }));

    const nextAssignments = [...assignments, ...additions];

    persistSetup(nextSetup);
    setAssignments(nextAssignments);
    saveAssignments(nextAssignments);
    setSelectedFacility(facilityName);
    setNewFacility('');
    setNewFacilityDepartments([]);
  }

  function toggleDepartment(department: string) {
    setSelectedDepartments((current) =>
      current.includes(department)
        ? current.filter((currentDepartment) => currentDepartment !== department)
        : [...current, department],
    );
  }

  function handleAssign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFacility || selectedDepartments.length === 0) return;

    const existingKeys = new Set(assignments.map((assignment) => `${assignment.department}::${assignment.facility}`));
    const additions = selectedDepartments
      .filter((department) => !existingKeys.has(`${department}::${selectedFacility}`))
      .map((department) => ({ department, facility: selectedFacility }));

    if (additions.length === 0) {
      setSelectedDepartments([]);
      return;
    }

    const nextAssignments = [...assignments, ...additions];
    setAssignments(nextAssignments);
    saveAssignments(nextAssignments);
    setSelectedDepartments([]);
  }

  function handleRemove(department: string, facility: string) {
    const nextAssignments = assignments.filter(
      (assignment) => !(assignment.department === department && assignment.facility === facility),
    );
    setAssignments(nextAssignments);
    saveAssignments(nextAssignments);
  }

  if (!setup) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#92400E_0,#070A12_45%)] px-4 py-10 text-white sm:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo facilities</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">No local demo setup found</h1>
          <p className="mt-3 text-sm leading-6 text-amber-100/80">
            Create a local demo club first. It will only be stored in your browser and not in Supabase.
          </p>
          <Link
            href="/demo/create-club"
            className="mt-5 inline-block rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200"
          >
            Create local demo setup
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#92400E_0,#070A12_45%)] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
          <Link href="/demo/admin/setup" className="inline-flex items-center text-sm font-black text-amber-200 hover:text-amber-100">
            ← Back to local setup
          </Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo facilities</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Facilities for {setup.clubName}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">
            Browser-only facility assignment. Assign one facility to one or multiple departments without writing to Supabase.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Global facilities</p>
          <p className="mt-3 text-4xl font-black">{setup.facilities.length}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {setup.facilities.map((facility) => (
              <Link
                key={facility}
                href={`/demo/admin/facilities/${encodeFacilityName(facility)}/calendar`}
                className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 transition hover:border-emerald-400 hover:bg-emerald-950/20 active:border-emerald-300"
              >
                <p className="font-black text-white">{facility}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5">
            <form onSubmit={handleAddFacility} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Create</p>
              <h2 className="mt-2 text-xl font-black">Add demo facility</h2>
              <div className="mt-4 space-y-4">
                <input
                  value={newFacility}
                  onChange={(event) => setNewFacility(event.target.value)}
                  placeholder="New Hall"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                />

                <div>
                  <p className="text-sm font-bold text-slate-200">Assign to departments optional</p>
                  <div className="mt-2 space-y-2">
                    {setup.departments.map((department) => (
                      <label key={department} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm">
                        <span className="font-bold text-slate-100">{department}</span>
                        <input
                          type="checkbox"
                          checked={newFacilityDepartments.includes(department)}
                          onChange={() => toggleNewFacilityDepartment(department)}
                          className="h-4 w-4"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300"
                >
                  Add local facility
                </button>
              </div>
            </form>

            <form onSubmit={handleAssign} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Assign</p>
              <h2 className="mt-2 text-xl font-black">Assign existing facility</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Select an existing facility, then choose every department that may use it.
              </p>
              <div className="mt-4 space-y-4">
                <select
                  value={selectedFacility}
                  onChange={(event) => setSelectedFacility(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-violet-400"
                >
                  {setup.facilities.map((facility) => (
                    <option key={facility} value={facility}>
                      {facility}
                    </option>
                  ))}
                </select>

                <div className="space-y-2">
                  {setup.departments.map((department) => {
                    const alreadyAssigned = assignedDepartmentsForSelectedFacility.has(department);
                    const checked = selectedDepartments.includes(department) || alreadyAssigned;

                    return (
                      <label key={department} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm">
                        <span>
                          <span className="font-bold text-slate-100">{department}</span>
                          {alreadyAssigned ? <span className="ml-2 text-xs font-bold text-emerald-300">already assigned</span> : null}
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={alreadyAssigned}
                          onChange={() => toggleDepartment(department)}
                          className="h-4 w-4"
                        />
                      </label>
                    );
                  })}
                </div>

                <button
                  type="submit"
                  disabled={selectedDepartments.length === 0}
                  className="w-full rounded-xl bg-violet-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Assign selected departments
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Department access</p>
            <h2 className="mt-2 text-xl font-black">Local facility assignments</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              This previews the future filtering layer for coaches.
            </p>

            <div className="mt-5 space-y-4">
              {setup.departments.map((department) => {
                const departmentAssignments = assignmentsByDepartment.get(department) ?? [];

                return (
                  <section key={department} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                    <h3 className="font-black">{department}</h3>
                    <div className="mt-3 space-y-2">
                      {departmentAssignments.length > 0 ? (
                        departmentAssignments.map((assignment) => (
                          <div key={`${assignment.department}-${assignment.facility}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                            <Link
                              href={`/demo/admin/facilities/${encodeFacilityName(assignment.facility)}/calendar`}
                              className="text-sm font-bold text-slate-200 hover:text-emerald-300"
                            >
                              {assignment.facility}
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleRemove(assignment.department, assignment.facility)}
                              className="text-xs font-bold text-red-300 hover:text-red-200"
                            >
                              Remove
                            </button>
                          </div>
                        ))
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
