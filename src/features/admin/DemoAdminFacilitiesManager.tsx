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

export function DemoAdminFacilitiesManager() {
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [assignments, setAssignments] = useState<DemoAssignment[]>([]);
  const [newFacility, setNewFacility] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedFacility, setSelectedFacility] = useState('');

  useEffect(() => {
    const currentSetup = getDemoClubSetup();
    const currentAssignments = getAssignments();
    setSetup(currentSetup);
    setAssignments(currentAssignments);
    setSelectedDepartment(currentSetup?.departments[0] ?? '');
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

  function persistSetup(nextSetup: DemoClubSetup) {
    saveDemoClubSetup(nextSetup);
    setSetup(nextSetup);
  }

  function handleAddFacility(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setup || !newFacility.trim()) return;

    const facilityName = newFacility.trim();

    if (setup.facilities.includes(facilityName)) {
      setNewFacility('');
      return;
    }

    const nextSetup = {
      ...setup,
      facilities: [...setup.facilities, facilityName],
    };

    persistSetup(nextSetup);
    setSelectedFacility(facilityName);
    setNewFacility('');
  }

  function handleAssign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDepartment || !selectedFacility) return;

    const exists = assignments.some(
      (assignment) => assignment.department === selectedDepartment && assignment.facility === selectedFacility,
    );

    if (exists) return;

    const nextAssignments = [...assignments, { department: selectedDepartment, facility: selectedFacility }];
    setAssignments(nextAssignments);
    saveAssignments(nextAssignments);
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
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo facilities</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">Facilities for {setup.clubName}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">
                Browser-only facility assignment. This does not write to Supabase and does not require login.
              </p>
            </div>
            <Link href="/demo/admin/setup" className="rounded-xl border border-amber-400/70 px-4 py-3 text-sm font-black text-amber-100 hover:bg-amber-950/50">
              Back to local setup
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Global facilities</p>
            <p className="mt-3 text-4xl font-black">{setup.facilities.length}</p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Departments</p>
            <p className="mt-3 text-4xl font-black">{setup.departments.length}</p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Assignments</p>
            <p className="mt-3 text-4xl font-black">{assignments.length}</p>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5">
            <form onSubmit={handleAddFacility} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Create</p>
              <h2 className="mt-2 text-xl font-black">Add demo facility</h2>
              <div className="mt-4 space-y-3">
                <input
                  value={newFacility}
                  onChange={(event) => setNewFacility(event.target.value)}
                  placeholder="New Hall"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                />
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
              <h2 className="mt-2 text-xl font-black">Assign facility to department</h2>
              <div className="mt-4 space-y-3">
                <select
                  value={selectedDepartment}
                  onChange={(event) => setSelectedDepartment(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-violet-400"
                >
                  {setup.departments.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
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
                <button
                  type="submit"
                  className="w-full rounded-xl bg-violet-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-violet-300"
                >
                  Assign locally
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
                            <span className="text-sm font-bold text-slate-200">{assignment.facility}</span>
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
