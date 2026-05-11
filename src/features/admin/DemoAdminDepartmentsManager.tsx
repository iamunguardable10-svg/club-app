'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/shared/admin/AdminShell';
import { getDemoClubSetup, saveDemoClubSetup, type DemoClubSetup } from '@/shared/dev/demoStorage';

type DemoAssignment = {
  department: string;
  facility: string;
};

type DemoInvite = {
  id: string;
  token: string;
  role: 'department_lead' | 'head_coach' | 'assistant_coach';
  department: string;
  team: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt: string | null;
};

const DEMO_FACILITY_ASSIGNMENTS_KEY = 'club-app.demo.facility-assignments';
const DEMO_INVITES_KEY = 'club-app.demo.invites';

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

function getDemoInvites(): DemoInvite[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(DEMO_INVITES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DemoInvite[];
  } catch {
    return [];
  }
}

function UsageChips({ items, emptyText }: { items: string[]; emptyText: string }) {
  if (items.length === 0) {
    return <p className="mt-2 text-xs text-slate-500">{emptyText}</p>;
  }

  const visibleItems = items.slice(0, 2);
  const hiddenCount = items.length - visibleItems.length;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {visibleItems.map((item) => (
        <span key={item} className="rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1 text-xs font-bold text-emerald-200">
          {item}
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

function encodeDepartment(department: string) {
  return encodeURIComponent(department);
}

export function DemoAdminDepartmentsManager() {
  const router = useRouter();
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [assignments, setAssignments] = useState<DemoAssignment[]>([]);
  const [invites, setInvites] = useState<DemoInvite[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');

  useEffect(() => {
    setSetup(getDemoClubSetup());
    setAssignments(getAssignments());
    setInvites(getDemoInvites());
  }, []);

  const facilitiesByDepartment = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const assignment of assignments) {
      const current = map.get(assignment.department) ?? [];
      if (!current.includes(assignment.facility)) current.push(assignment.facility);
      map.set(assignment.department, current);
    }
    return map;
  }, [assignments]);

  const pendingInvitesByDepartment = useMemo(() => {
    const map = new Map<string, DemoInvite[]>();
    for (const invite of invites) {
      if (invite.status !== 'pending') continue;
      const current = map.get(invite.department) ?? [];
      current.push(invite);
      map.set(invite.department, current);
    }
    return map;
  }, [invites]);

  function handleCreateDepartment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setup || !newDepartmentName.trim()) return;

    const departmentName = newDepartmentName.trim();
    if (setup.departments.includes(departmentName)) {
      setNewDepartmentName('');
      return;
    }

    const nextSetup = {
      ...setup,
      departments: [...setup.departments, departmentName],
    };

    saveDemoClubSetup(nextSetup);
    setSetup(nextSetup);
    setNewDepartmentName('');
  }

  if (!setup) {
    return (
      <AdminShell mode="demo">
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo departments</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">No local demo club yet</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">Create a local demo club before managing departments.</p>
          <Link href="/demo/create-club" className="mt-5 inline-block rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200">
            Create local demo setup
          </Link>
        </section>
      </AdminShell>
    );
  }

  return (
    <AdminShell mode="demo">
      <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo departments</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Departments for {setup.clubName}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">
          Browser-only department management preview. Tap a department card to open its dedicated workspace.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
        <form onSubmit={handleCreateDepartment} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Create</p>
          <h2 className="mt-2 text-xl font-black">Add demo department</h2>
          <div className="mt-4 space-y-4">
            <input
              required
              value={newDepartmentName}
              onChange={(event) => setNewDepartmentName(event.target.value)}
              placeholder="Basketball"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
            />
            <button type="submit" className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300">
              Add local department
            </button>
          </div>
        </form>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Departments</p>
          <div className="mt-4 grid gap-3">
            {setup.departments.map((department) => {
              const facilityNames = facilitiesByDepartment.get(department) ?? [];
              const pendingInvites = pendingInvitesByDepartment.get(department) ?? [];
              const hasLeadInvite = pendingInvites.some((invite) => invite.role === 'department_lead');
              const encodedDepartment = encodeDepartment(department);

              return (
                <article
                  key={department}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/demo/admin/departments/${encodedDepartment}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') router.push(`/demo/admin/departments/${encodedDepartment}`);
                  }}
                  className="cursor-pointer rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-violet-400/70 hover:bg-slate-900"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2 className="text-xl font-black text-white">{department}</h2>
                      <p className="mt-1 text-xs text-slate-500">Local demo department</p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        router.push(`/demo/admin/people?department=${encodedDepartment}`);
                      }}
                      className="w-fit rounded-xl border border-amber-500/60 px-3 py-2 text-xs font-black text-amber-200 hover:bg-amber-950/40"
                    >
                      Invite people
                    </button>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Teams</p>
                      <p className="mt-1 text-sm font-black text-slate-100">Preview later</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Facilities</p>
                      <p className="mt-1 text-sm font-black text-slate-100">{facilityNames.length === 0 ? 'Needs assignment' : 'Assigned'}</p>
                      <UsageChips items={facilityNames} emptyText="No facilities assigned yet." />
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Lead invite</p>
                      <p className="mt-1 text-sm font-black text-slate-100">{hasLeadInvite ? 'Pending' : 'Not invited yet'}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </AdminShell>
  );
}
