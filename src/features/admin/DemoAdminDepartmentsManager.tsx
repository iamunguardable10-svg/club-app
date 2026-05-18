'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/shared/admin/AdminShell';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import {
  getDemoClubSetup,
  getDemoTeams,
  saveDemoClubSetup,
  saveDemoTeams,
  type DemoClubSetup,
  type DemoTeam,
} from '@/shared/dev/demoStorage';

type DemoAssignment = { department: string; facility: string };

type DemoInvite = {
  id: string;
  token: string;
  role: 'department_lead' | 'head_coach' | 'assistant_coach';
  department: string;
  team: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt: string | null;
  acceptedName?: string | null;
};

type PendingDelete = { department: string } | null;

const DEMO_FACILITY_ASSIGNMENTS_KEY = 'club-app.demo.facility-assignments';
const DEMO_INVITES_KEY = 'club-app.demo.invites';

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getAssignments() {
  return readJson<DemoAssignment[]>(DEMO_FACILITY_ASSIGNMENTS_KEY, []);
}

function saveAssignments(assignments: DemoAssignment[]) {
  writeJson(DEMO_FACILITY_ASSIGNMENTS_KEY, assignments);
}

function getDemoInvites() {
  return readJson<DemoInvite[]>(DEMO_INVITES_KEY, []);
}

function saveDemoInvites(invites: DemoInvite[]) {
  writeJson(DEMO_INVITES_KEY, invites);
}

function createToken() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().replace(/-/g, '');
  return `${Date.now()}-${Math.random()}`.replace(/[^a-z0-9]/gi, '');
}

function encodeDepartment(department: string) {
  return encodeURIComponent(department);
}

function previewItems(items: string[], emptyAction: React.ReactNode) {
  if (items.length === 0) return emptyAction;
  const visible = items.slice(0, 4);
  const hidden = items.length - visible.length;
  return (
    <p className="mt-1 text-sm font-black leading-6 text-slate-100">
      {visible.join(' · ')}{hidden > 0 ? ` +${hidden} more` : ''}
    </p>
  );
}

function formatDepartmentMessages(teamCount: number, coachGapCount: number, defaultFacilityGapCount: number) {
  if (teamCount === 0) return 'No teams yet';
  const messages: string[] = [];
  if (coachGapCount > 0) messages.push(`${coachGapCount} coach gap${coachGapCount === 1 ? '' : 's'}`);
  if (defaultFacilityGapCount > 0) messages.push(`${defaultFacilityGapCount} facility gap${defaultFacilityGapCount === 1 ? '' : 's'}`);
  return messages.length > 0 ? messages.join(' · ') : 'Ready';
}

function FacilityPreview({ department, items }: { department: string; items: string[] }) {
  if (items.length === 0) {
    return (
      <Link
        href={`/demo/admin/departments/${encodeDepartment(department)}?mode=edit&focus=facilities`}
        onClick={(event) => event.stopPropagation()}
        className="mt-2 inline-flex rounded-lg border border-sky-500/60 px-2.5 py-1.5 text-xs font-black text-sky-200 transition hover:bg-sky-950/40"
      >
        Assign halls
      </Link>
    );
  }

  const visible = items.slice(0, 3);
  const hidden = items.length - visible.length;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {visible.map((item) => (
        <Link
          key={item}
          href={`/demo/admin/facilities/${encodeURIComponent(item)}/calendar?from=departments&departmentName=${encodeURIComponent(department)}`}
          onClick={(event) => event.stopPropagation()}
          className="rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1 text-xs font-bold text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-950/60"
        >
          {item}
        </Link>
      ))}
      {hidden > 0 ? <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-bold text-slate-300">+{hidden} more</span> : null}
    </div>
  );
}

export function DemoAdminDepartmentsManager() {
  const router = useRouter();
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [teams, setTeams] = useState<DemoTeam[]>([]);
  const [assignments, setAssignments] = useState<DemoAssignment[]>([]);
  const [invites, setInvites] = useState<DemoInvite[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  function loadLocalData() {
    const currentSetup = getDemoClubSetup();
    setSetup(currentSetup);
    setTeams(getDemoTeams(currentSetup));
    setAssignments(getAssignments());
    setInvites(getDemoInvites());
  }

  useEffect(() => {
    loadLocalData();
  }, []);

  const teamsByDepartment = useMemo(() => {
    const map = new Map<string, DemoTeam[]>();
    for (const team of teams) {
      const current = map.get(team.department) ?? [];
      current.push(team);
      map.set(team.department, current);
    }
    return map;
  }, [teams]);

  const facilitiesByDepartment = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const assignment of assignments) {
      const current = map.get(assignment.department) ?? [];
      if (!current.includes(assignment.facility)) current.push(assignment.facility);
      map.set(assignment.department, current);
    }
    return map;
  }, [assignments]);

  const leadInviteByDepartment = useMemo(() => {
    const map = new Map<string, DemoInvite>();
    for (const invite of invites) {
      if (invite.role !== 'department_lead' || !['pending', 'accepted'].includes(invite.status)) continue;
      if (!map.has(invite.department)) map.set(invite.department, invite);
    }
    return map;
  }, [invites]);

  function persistSetup(nextSetup: DemoClubSetup) {
    saveDemoClubSetup(nextSetup);
    setSetup(nextSetup);
  }

  function persistAssignments(nextAssignments: DemoAssignment[]) {
    saveAssignments(nextAssignments);
    setAssignments(nextAssignments);
  }

  function persistInvites(nextInvites: DemoInvite[]) {
    saveDemoInvites(nextInvites);
    setInvites(nextInvites);
  }

  function handleCreateDepartment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setup || !newDepartmentName.trim()) return;

    const departmentName = newDepartmentName.trim();
    if (setup.departments.some((department) => department.toLowerCase() === departmentName.toLowerCase())) {
      setNewDepartmentName('');
      return;
    }

    persistSetup({ ...setup, departments: [...setup.departments, departmentName] });
    setNewDepartmentName('');
  }

  async function copyInvite(token: string) {
    const url = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    window.setTimeout(() => setCopiedToken(null), 1500);
  }

  async function handleInviteLead(department: string) {
    const existing = leadInviteByDepartment.get(department);
    if (existing?.status === 'pending') {
      await copyInvite(existing.token);
      return;
    }

    const invite: DemoInvite = {
      id: crypto.randomUUID(),
      token: createToken(),
      role: 'department_lead',
      department,
      team: null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };
    persistInvites([invite, ...invites]);
    await copyInvite(invite.token);
  }

  function handleDeleteDepartment() {
    if (!setup || !pendingDelete) return;
    const department = pendingDelete.department;
    persistSetup({ ...setup, departments: setup.departments.filter((item) => item !== department) });
    const nextTeams = teams.filter((team) => team.department !== department);
    saveDemoTeams(nextTeams);
    setTeams(nextTeams);
    persistAssignments(assignments.filter((assignment) => assignment.department !== department));
    persistInvites(invites.filter((invite) => invite.department !== department));
    setPendingDelete(null);
  }

  if (!setup) {
    return (
      <AdminShell mode="demo">
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo departments</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">No local demo club yet</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">Create a local demo club before managing departments.</p>
          <Link href="/demo/create-club" className="mt-5 inline-block rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200">Create local demo setup</Link>
        </section>
      </AdminShell>
    );
  }

  return (
    <AdminShell mode="demo">
      <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo departments</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Departments for {setup.clubName}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">Tap a department card to open its workspace. Use quick actions for lead invites and setup gaps.</p>
          </div>
          <button type="button" onClick={() => setIsEditMode((current) => !current)} className={isEditMode ? 'w-fit rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200' : 'w-fit rounded-xl border border-amber-500/70 px-4 py-3 text-sm font-black text-amber-200 transition hover:bg-amber-950/40'}>
            {isEditMode ? 'Done editing' : 'Edit departments'}
          </button>
        </div>
      </section>

      {isEditMode ? (
        <form onSubmit={handleCreateDepartment} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Create</p>
          <h2 className="mt-2 text-xl font-black">Add demo department</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input required value={newDepartmentName} onChange={(event) => setNewDepartmentName(event.target.value)} placeholder="Basketball" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400" />
            <button type="submit" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300">Add local department</button>
          </div>
        </form>
      ) : null}

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Departments</p>
        <div className="mt-4 grid gap-3">
          {setup.departments.map((department) => {
            const encodedDepartment = encodeDepartment(department);
            const departmentTeams = teamsByDepartment.get(department) ?? [];
            const teamNames = departmentTeams.map((team) => team.name);
            const facilityNames = facilitiesByDepartment.get(department) ?? [];
            const leadInvite = leadInviteByDepartment.get(department);
            const leadLabel = leadInvite?.status === 'accepted' ? (leadInvite.acceptedName || 'Department lead accepted') : leadInvite?.status === 'pending' ? 'Invite pending' : null;
            const coachGapCount = departmentTeams.length;
            const defaultFacilityGapCount = departmentTeams.filter((team) => !team.defaultFacility).length;

            return (
              <article key={department} role="link" tabIndex={0} onClick={() => router.push(`/demo/admin/departments/${encodedDepartment}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') router.push(`/demo/admin/departments/${encodedDepartment}`); }} className="cursor-pointer rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-violet-400/70 hover:bg-slate-900">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-xl font-black text-white">{department}</h2>
                    <p className="mt-1 text-xs text-slate-500">Local demo department</p>
                  </div>
                  {isEditMode ? (
                    <button type="button" onClick={(event) => { event.stopPropagation(); setPendingDelete({ department }); }} className="w-fit rounded-xl border border-red-500/60 px-3 py-2 text-xs font-black text-red-200 hover:bg-red-950/40">
                      Delete
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Teams</p>
                    {previewItems(teamNames, <Link href={`/demo/admin/departments/${encodedDepartment}?mode=edit&focus=teams`} onClick={(event) => event.stopPropagation()} className="mt-2 inline-flex rounded-lg border border-sky-500/60 px-2.5 py-1.5 text-xs font-black text-sky-200 hover:bg-sky-950/40">Create first team</Link>)}
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Facilities</p>
                    <FacilityPreview department={department} items={facilityNames} />
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Department Lead</p>
                    {leadInvite?.status === 'pending' ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-slate-200">Invite pending</span>
                        <button type="button" onClick={(event) => { event.stopPropagation(); handleInviteLead(department); }} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-black text-slate-200 transition hover:bg-slate-800">
                          {copiedToken === leadInvite.token ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    ) : leadLabel ? <p className="mt-1 text-sm font-black text-slate-100">{leadLabel}</p> : <button type="button" onClick={(event) => { event.stopPropagation(); handleInviteLead(department); }} className="mt-2 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-black text-slate-200 transition hover:bg-slate-800">Invite</button>}
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Meldungen</p>
                    <p className="mt-1 text-sm font-black text-slate-100">{formatDepartmentMessages(departmentTeams.length, coachGapCount, defaultFacilityGapCount)}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <AppConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.department ?? 'department'}?`}
        description="This removes the demo department, its local teams, facility assignments and pending invites. This cannot be undone."
        confirmLabel="Delete department"
        cancelLabel="Keep department"
        tone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDeleteDepartment}
      />
    </AdminShell>
  );
}
