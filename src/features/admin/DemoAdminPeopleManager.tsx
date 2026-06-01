'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminShell } from '@/shared/admin/AdminShell';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { getDemoClubSetup, getDemoTeams, type DemoClubSetup, type DemoTeam } from '@/shared/dev/demoStorage';

type DemoInviteRole = 'department_lead' | 'head_coach' | 'assistant_coach';

type DemoInvite = {
  id: string;
  token: string;
  role: DemoInviteRole;
  department: string;
  team: string | null;
  coachRoleSlotId?: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt: string | null;
};
type DemoExtraCoachRole = {
  id: string;
  department: string;
  team: string;
  label: string;
};

const DEMO_INVITES_KEY = 'club-app.demo.invites';
const DEMO_EXTRA_COACH_ROLES_KEY = 'club-app.demo.extra-coach-roles';

type DemoPeopleFrame = 'admin' | 'department';

function DemoPeopleFrameShell({ frame, children }: { frame: DemoPeopleFrame; children: ReactNode }) {
  if (frame === 'department') return <>{children}</>;
  return <AdminShell mode="demo">{children}</AdminShell>;
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

function saveDemoInvites(invites: DemoInvite[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_INVITES_KEY, JSON.stringify(invites));
}

function createToken() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function roleLabel(role: DemoInviteRole) {
  if (role === 'department_lead') return 'Department Lead';
  if (role === 'head_coach') return 'Head Coach';
  return 'Assistant Coach';
}

function getDemoExtraCoachRoles(): DemoExtraCoachRole[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(DEMO_EXTRA_COACH_ROLES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DemoExtraCoachRole[];
  } catch {
    return [];
  }
}

function saveDemoExtraCoachRoles(roles: DemoExtraCoachRole[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_EXTRA_COACH_ROLES_KEY, JSON.stringify(roles));
}

export function DemoAdminPeopleManager({ frame = 'admin', departmentName }: { frame?: DemoPeopleFrame; departmentName?: string }) {
  const searchParams = useSearchParams();
  const requestedDepartment = departmentName ?? searchParams.get('department') ?? '';
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [teams, setTeams] = useState<DemoTeam[]>([]);
  const [invites, setInvites] = useState<DemoInvite[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedRole, setSelectedRole] = useState<DemoInviteRole>('department_lead');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('14');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<DemoInvite | null>(null);
  const [expandedDepartments, setExpandedDepartments] = useState<Record<string, boolean>>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [extraCoachRoles, setExtraCoachRoles] = useState<DemoExtraCoachRole[]>([]);
  const [newRoleLabelByTeam, setNewRoleLabelByTeam] = useState<Record<string, string>>({});

  useEffect(() => {
    const currentSetup = getDemoClubSetup();
    const currentTeams = getDemoTeams(currentSetup);
    const currentInvites = getDemoInvites();
    const initialDepartment = currentSetup?.departments.includes(requestedDepartment)
      ? requestedDepartment
      : currentSetup?.departments[0] ?? '';
    const initialTeam = currentTeams.find((team) => team.department === initialDepartment);

    setSetup(currentSetup);
    setTeams(currentTeams);
    setInvites(currentInvites);
    setExtraCoachRoles(getDemoExtraCoachRoles());
    setSelectedDepartment(initialDepartment);
    setSelectedTeam(initialTeam?.name ?? '');
    const visibleDepartments = departmentName ? [departmentName] : currentSetup?.departments ?? [];
    setExpandedDepartments(Object.fromEntries(visibleDepartments.map((department) => [department, true])));
  }, [departmentName, requestedDepartment]);

  const teamsForSelectedDepartment = useMemo(() => {
    return teams.filter((team) => team.department === selectedDepartment);
  }, [selectedDepartment, teams]);
  const pendingInvites = useMemo(() => invites.filter((invite) => invite.status === 'pending'), [invites]);
  const nonPendingInvites = useMemo(() => invites.filter((invite) => invite.status !== 'pending'), [invites]);
  const latestInviteByScope = useMemo(() => {
    const map = new Map<string, DemoInvite>();
    for (const invite of invites) {
      const key = `${invite.role}:${invite.department}:${invite.team ?? ''}:${invite.coachRoleSlotId ?? ''}`;
      if (!map.has(key)) map.set(key, invite);
    }
    return map;
  }, [invites]);

  useEffect(() => {
    if (selectedRole === 'department_lead') {
      setSelectedTeam('');
      return;
    }

    if (!selectedTeam || !teamsForSelectedDepartment.some((team) => team.name === selectedTeam)) {
      setSelectedTeam(teamsForSelectedDepartment[0]?.name ?? '');
    }
  }, [selectedDepartment, selectedRole, selectedTeam, teamsForSelectedDepartment]);

  function getInviteUrl(token: string) {
    if (typeof window === 'undefined') return `/invite/${token}`;
    return `${window.location.origin}/invite/${token}`;
  }

  function persistInvites(nextInvites: DemoInvite[]) {
    setInvites(nextInvites);
    saveDemoInvites(nextInvites);
  }

  function persistExtraCoachRoles(nextRoles: DemoExtraCoachRole[]) {
    setExtraCoachRoles(nextRoles);
    saveDemoExtraCoachRoles(nextRoles);
  }

  function handleCreateInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setup || !selectedDepartment) return;

    const isCoachInvite = selectedRole === 'head_coach' || selectedRole === 'assistant_coach';
    const parsedDays = Number.parseInt(expiresInDays, 10);
    const expiresAt = Number.isFinite(parsedDays) && parsedDays > 0
      ? new Date(Date.now() + parsedDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const invite: DemoInvite = {
      id: crypto.randomUUID(),
      token: createToken(),
      role: selectedRole,
      department: selectedDepartment,
      team: isCoachInvite ? selectedTeam || null : null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt,
    };

    persistInvites([invite, ...invites]);
  }

  async function handleQuickInvite(role: DemoInviteRole, department: string, team?: string | null, coachRoleSlotId?: string | null) {
    const existing = invites.find((invite) => invite.status === 'pending' && invite.role === role && invite.department === department && (invite.team ?? null) === (team ?? null) && (invite.coachRoleSlotId ?? null) === (coachRoleSlotId ?? null));
    if (existing) {
      await handleCopy(existing.token);
      return;
    }

    const invite: DemoInvite = {
      id: crypto.randomUUID(),
      token: createToken(),
      role,
      department,
      team: team ?? null,
      coachRoleSlotId: coachRoleSlotId ?? null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };
    persistInvites([invite, ...invites]);
    await handleCopy(invite.token);
  }

  function handleAddExtraRole(department: string, team: string) {
    const key = `${department}:${team}`;
    const label = newRoleLabelByTeam[key]?.trim();
    if (!label) return;
    persistExtraCoachRoles([...extraCoachRoles, { id: crypto.randomUUID(), department, team, label }]);
    setNewRoleLabelByTeam((current) => ({ ...current, [key]: '' }));
  }

  function handleRemoveExtraRole(roleId: string) {
    persistExtraCoachRoles(extraCoachRoles.filter((role) => role.id !== roleId));
  }

  function handleRevokeInvite(inviteId: string) {
    persistInvites(invites.map((invite) => (invite.id === inviteId ? { ...invite, status: 'revoked' } : invite)));
  }

  async function handleCopy(token: string) {
    await navigator.clipboard.writeText(getInviteUrl(token));
    setCopiedToken(token);
    window.setTimeout(() => setCopiedToken((current) => (current === token ? null : current)), 1400);
  }

  function copyButtonClass(token?: string | null) {
    const copied = Boolean(token && copiedToken === token);
    return `rounded-lg border px-2.5 py-1 text-xs font-black transition ${
      copied
        ? 'scale-[1.03] border-emerald-300 bg-emerald-300 text-slate-950 shadow-[0_0_24px_rgba(110,231,183,0.22)]'
        : 'border-slate-700/90 bg-slate-950/40 text-slate-200 hover:border-sky-400/50 hover:bg-slate-900'
    }`;
  }

  if (!setup) {
    return (
      <DemoPeopleFrameShell frame={frame}>
        <section className="os-hero border-amber-500/25 bg-amber-950/10">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo staff</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">No local demo club yet</h1>
          <Link href="/demo/create-club" className="mt-5 inline-block rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200">
            Create local demo setup
          </Link>
        </section>
      </DemoPeopleFrameShell>
    );
  }

  const visibleDepartments = departmentName ? setup.departments.filter((department) => department === departmentName) : setup.departments;

  return (
    <DemoPeopleFrameShell frame={frame}>
      {frame === 'admin' ? <section className="os-hero border-amber-500/25 bg-amber-950/10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo staff</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Staff</h1>
          </div>
          <button type="button" onClick={() => setIsEditMode((current) => !current)} className={isEditMode ? 'w-fit rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200' : 'w-fit rounded-xl border border-amber-500/70 px-4 py-3 text-sm font-black text-amber-200 transition hover:bg-amber-950/40'}>
            {isEditMode ? 'Done editing' : 'Edit staff'}
          </button>
        </div>
      </section> : null}

      <section className="os-section">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Role coverage</p>
        <h2 className="mt-2 text-xl font-black">{frame === 'department' ? 'Staff' : 'Departments'}</h2>
        <div className="mt-4 grid gap-3">
          {visibleDepartments.map((department) => {
            const leadInvite = latestInviteByScope.get(`department_lead:${department}::`);
            const leadStatus = leadInvite?.status === 'accepted' ? 'accepted' : leadInvite?.status === 'pending' ? 'pending' : 'missing';
            const departmentTeams = teams.filter((team) => team.department === department);
            const isExpanded = expandedDepartments[department] ?? true;

            return (
              <article key={department} className="rounded-3xl border border-slate-800/90 bg-slate-950/45 p-4 ring-1 ring-white/[0.03]">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-black text-white">{department}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                      <span>Department Lead:</span>
                      {frame === 'department' ? <span>You</span> : leadStatus === 'accepted' ? <span>Accepted</span> : leadStatus === 'pending' ? (
                        <>
                          <span>Invite pending</span>
                          {frame === 'admin' ? <button type="button" onClick={() => handleQuickInvite('department_lead', department)} className={copyButtonClass(leadInvite?.token)}>{copiedToken === leadInvite?.token ? 'Copied' : 'Copy'}</button> : null}
                        </>
                      ) : frame === 'admin' ? <button type="button" onClick={() => handleQuickInvite('department_lead', department)} className="rounded-lg border border-slate-700/90 bg-slate-950/40 px-2.5 py-1 text-xs font-black text-slate-200 transition hover:border-sky-400/50 hover:bg-slate-900">Invite</button> : <span>Missing</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setExpandedDepartments((current) => ({ ...current, [department]: !isExpanded }))} className="rounded-lg border border-slate-700/90 bg-slate-950/40 px-2.5 py-1 text-xs font-black text-slate-300 transition hover:border-sky-400/50 hover:bg-slate-900">
                      {isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                </div>

                {isExpanded ? <div className="mt-4 grid gap-3">
                  {departmentTeams.length > 0 ? departmentTeams.map((team) => {
                    const headInvite = latestInviteByScope.get(`head_coach:${department}:${team.name}:`);
                    const assistantInvite = latestInviteByScope.get(`assistant_coach:${department}:${team.name}:`);
                    const headStatus = headInvite?.status === 'accepted' ? 'accepted' : headInvite?.status === 'pending' ? 'pending' : 'missing';
                    const assistantStatus = assistantInvite?.status === 'accepted' ? 'accepted' : assistantInvite?.status === 'pending' ? 'pending' : 'missing';

                    return (
                      <div key={team.id} className="os-panel-soft p-3">
                        <Link href={`/demo/admin/teams/${encodeURIComponent(team.id)}?from=staff`} className="w-fit font-black text-slate-100 transition hover:text-amber-200">{team.name}</Link>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3 ring-1 ring-white/[0.03]">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Head Coach</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-200">
                            {headStatus === 'accepted' ? <span>Accepted</span> : headStatus === 'pending' ? (
                              <>
                                <span>Invite pending</span>
                                <button type="button" onClick={() => handleQuickInvite('head_coach', department, team.name)} className={copyButtonClass(headInvite?.token)}>{copiedToken === headInvite?.token ? 'Copied' : 'Copy'}</button>
                              </>
                            ) : <button type="button" onClick={() => handleQuickInvite('head_coach', department, team.name)} className="rounded-lg border border-slate-700/90 bg-slate-950/40 px-2.5 py-1 text-xs font-black text-slate-200 transition hover:border-sky-400/50 hover:bg-slate-900">Invite</button>}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3 ring-1 ring-white/[0.03]">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Assistant Coach</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-200">
                            {assistantStatus === 'accepted' ? <span>Accepted</span> : assistantStatus === 'pending' ? (
                              <>
                                <span>Invite pending</span>
                                <button type="button" onClick={() => handleQuickInvite('assistant_coach', department, team.name)} className={copyButtonClass(assistantInvite?.token)}>{copiedToken === assistantInvite?.token ? 'Copied' : 'Copy'}</button>
                              </>
                            ) : <button type="button" onClick={() => handleQuickInvite('assistant_coach', department, team.name)} className="rounded-lg border border-slate-700/90 bg-slate-950/40 px-2.5 py-1 text-xs font-black text-slate-200 transition hover:border-sky-400/50 hover:bg-slate-900">Invite</button>}
                          </div>
                        </div>
                        {extraCoachRoles.filter((role) => role.department === department && role.team === team.name).map((role) => {
                          const roleInvite = latestInviteByScope.get(`assistant_coach:${department}:${team.name}:${role.id}`);
                          return (
                            <div key={role.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3 ring-1 ring-white/[0.03]">
                              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{role.label}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-200">
                                {roleInvite?.status === 'pending' ? (
                                  <>
                                    <span>Invite pending</span>
                                    <button type="button" onClick={() => handleQuickInvite('assistant_coach', department, team.name, role.id)} className={copyButtonClass(roleInvite.token)}>{copiedToken === roleInvite.token ? 'Copied' : 'Copy'}</button>
                                  </>
                                ) : <button type="button" onClick={() => handleQuickInvite('assistant_coach', department, team.name, role.id)} className="rounded-lg border border-slate-700/90 bg-slate-950/40 px-2.5 py-1 text-xs font-black text-slate-200 transition hover:border-sky-400/50 hover:bg-slate-900">Invite</button>}
                                {isEditMode ? <button type="button" onClick={() => handleRemoveExtraRole(role.id)} className="rounded-lg border border-red-500/45 bg-red-950/10 px-2.5 py-1 text-xs font-black text-red-200 transition hover:bg-red-950/30">Remove</button> : null}
                              </div>
                            </div>
                          );
                        })}
                        </div>
                        {isEditMode ? (
                          <div className="mt-3 rounded-xl border border-dashed border-slate-700 p-3">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Add coach role</p>
                            <div className="mt-2 flex max-w-md flex-col gap-2 sm:flex-row">
                              <input value={newRoleLabelByTeam[`${department}:${team.name}`] ?? ''} onChange={(event) => setNewRoleLabelByTeam((current) => ({ ...current, [`${department}:${team.name}`]: event.target.value }))} placeholder="e.g. Strength Coach" className="flex-1 rounded-lg border border-slate-700/90 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/10" />
                              <button type="button" onClick={() => handleAddExtraRole(department, team.name)} className="rounded-lg border border-sky-500/50 bg-sky-950/15 px-3 py-2 text-xs font-black text-sky-200 transition hover:bg-sky-950/35">Add role</button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  }) : <Link href={`/demo/admin/departments/${encodeURIComponent(department)}?mode=edit&focus=teams`} className="rounded-xl border border-sky-500/40 bg-sky-950/20 p-3 text-sm font-bold text-sky-200 hover:bg-sky-950/35">No teams yet — create first team</Link>}
                </div> : null}
              </article>
            );
          })}
        </div>
      </section>

      <AppConfirmDialog
        isOpen={Boolean(pendingRevoke)}
        title={`Revoke ${pendingRevoke ? roleLabel(pendingRevoke.role) : 'invite'}?`}
        description="The local demo link will stop working immediately. Accepted demo rows stay in history."
        confirmLabel="Revoke invite"
        cancelLabel="Keep invite"
        tone="danger"
        onCancel={() => setPendingRevoke(null)}
        onConfirm={() => {
          if (!pendingRevoke) return;
          handleRevokeInvite(pendingRevoke.id);
          setPendingRevoke(null);
        }}
      />
    </DemoPeopleFrameShell>
  );
}
