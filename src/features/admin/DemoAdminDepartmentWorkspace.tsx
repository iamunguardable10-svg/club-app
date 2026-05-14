'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/shared/admin/AdminShell';
import { getDemoClubSetup, getDemoTeams, saveDemoClubSetup, saveDemoTeams, type DemoClubSetup, type DemoTeam } from '@/shared/dev/demoStorage';

type DemoAssignment = {
  department: string;
  facility: string;
};

type DemoFacilityMeta = {
  facility: string;
  scope: 'club_shared' | 'department_only';
  ownerDepartment: string | null;
};

type DemoFacilityRequest = {
  id: string;
  facility: string;
  department: string;
  createdAt: string;
  status: 'open' | 'resolved';
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

type FacilityDraftStep = 'name' | 'usage' | 'shared_confirm' | 'reported';

const DEMO_FACILITY_ASSIGNMENTS_KEY = 'club-app.demo.facility-assignments';
const DEMO_FACILITY_META_KEY = 'club-app.demo.facility-meta';
const DEMO_FACILITY_REQUESTS_KEY = 'club-app.demo.facility-requests';
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

function getAssignments(): DemoAssignment[] {
  return readJson<DemoAssignment[]>(DEMO_FACILITY_ASSIGNMENTS_KEY, []);
}

function saveAssignments(assignments: DemoAssignment[]) {
  writeJson(DEMO_FACILITY_ASSIGNMENTS_KEY, assignments);
}

function getFacilityMeta(setup: DemoClubSetup | null): DemoFacilityMeta[] {
  const stored = readJson<DemoFacilityMeta[]>(DEMO_FACILITY_META_KEY, []);
  const known = new Set(stored.map((meta) => meta.facility));
  const inferred = (setup?.facilities ?? [])
    .filter((facility) => !known.has(facility))
    .map((facility) => ({ facility, scope: 'club_shared' as const, ownerDepartment: null }));

  return [...stored, ...inferred];
}

function saveFacilityMeta(meta: DemoFacilityMeta[]) {
  writeJson(DEMO_FACILITY_META_KEY, meta);
}

function getDemoInvites(): DemoInvite[] {
  return readJson<DemoInvite[]>(DEMO_INVITES_KEY, []);
}

function saveDemoInvites(invites: DemoInvite[]) {
  writeJson(DEMO_INVITES_KEY, invites);
}

function getFacilityRequests(): DemoFacilityRequest[] {
  return readJson<DemoFacilityRequest[]>(DEMO_FACILITY_REQUESTS_KEY, []);
}

function saveFacilityRequests(requests: DemoFacilityRequest[]) {
  writeJson(DEMO_FACILITY_REQUESTS_KEY, requests);
}

function createToken() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function createTeamId(department: string, team: string) {
  return `${department}-${team}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function encodeFacilityName(facility: string) {
  return encodeURIComponent(facility);
}

export function DemoAdminDepartmentWorkspace({ departmentName }: { departmentName: string }) {
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [teams, setTeams] = useState<DemoTeam[]>([]);
  const [assignments, setAssignments] = useState<DemoAssignment[]>([]);
  const [facilityMeta, setFacilityMeta] = useState<DemoFacilityMeta[]>([]);
  const [invites, setInvites] = useState<DemoInvite[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedExistingFacility, setSelectedExistingFacility] = useState('');
  const [facilityDraftName, setFacilityDraftName] = useState('');
  const [facilityDraftStep, setFacilityDraftStep] = useState<FacilityDraftStep>('name');
  const [isEditMode, setIsEditMode] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    const currentSetup = getDemoClubSetup();
    setSetup(currentSetup);
    setTeams(getDemoTeams(currentSetup));
    setAssignments(getAssignments());
    setFacilityMeta(getFacilityMeta(currentSetup));
    setInvites(getDemoInvites());
  }, []);

  const departmentTeams = useMemo(() => teams.filter((team) => team.department === departmentName), [departmentName, teams]);

  const departmentFacilities = useMemo(
    () => assignments.filter((assignment) => assignment.department === departmentName).map((assignment) => assignment.facility),
    [assignments, departmentName],
  );

  const metaByFacility = useMemo(() => new Map(facilityMeta.map((meta) => [meta.facility, meta])), [facilityMeta]);

  const availableSharedFacilities = useMemo(() => {
    return (setup?.facilities ?? []).filter((facility) => {
      const meta = metaByFacility.get(facility);
      return (meta?.scope ?? 'club_shared') === 'club_shared' && !departmentFacilities.includes(facility);
    });
  }, [departmentFacilities, metaByFacility, setup?.facilities]);

  const pendingHeadInviteByTeam = useMemo(() => {
    const map = new Map<string, DemoInvite>();

    for (const invite of invites) {
      if (invite.status === 'pending' && invite.role === 'head_coach' && invite.team) {
        map.set(invite.team, invite);
      }
    }

    return map;
  }, [invites]);

  const missingHeadCoachCount = departmentTeams.filter((team) => !pendingHeadInviteByTeam.has(team.name)).length;
  const missingDefaultFacilityCount = departmentTeams.filter((team) => !team.defaultFacility).length;

  const attentionItems = useMemo(() => {
    const items: { title: string; description: string }[] = [];

    if (departmentTeams.length > 0 && departmentFacilities.length === 0) {
      items.push({
        title: 'No local department halls assigned',
        description: 'Add a hall directly here. The demo asks whether the hall is department-only or should be reported as shared before saving anything.',
      });
    }

    if (missingHeadCoachCount > 0) {
      items.push({
        title: `${missingHeadCoachCount} ${missingHeadCoachCount === 1 ? 'team needs' : 'teams need'} a head coach`,
        description: 'Use the inline quick action on the affected team or Edit Mode for broader management.',
      });
    }

    if (missingDefaultFacilityCount > 0) {
      items.push({
        title: `${missingDefaultFacilityCount} ${missingDefaultFacilityCount === 1 ? 'team needs' : 'teams need'} a default facility`,
        description: 'Use the inline quick action on the affected team or Edit Mode for broader management.',
      });
    }

    return items;
  }, [departmentFacilities.length, departmentTeams.length, missingDefaultFacilityCount, missingHeadCoachCount]);

  function persistTeams(nextTeams: DemoTeam[]) {
    setTeams(nextTeams);
    saveDemoTeams(nextTeams);
  }

  function persistSetup(nextSetup: DemoClubSetup) {
    setSetup(nextSetup);
    saveDemoClubSetup(nextSetup);
  }

  function persistAssignments(nextAssignments: DemoAssignment[]) {
    setAssignments(nextAssignments);
    saveAssignments(nextAssignments);
  }

  function persistFacilityMeta(nextMeta: DemoFacilityMeta[]) {
    setFacilityMeta(nextMeta);
    saveFacilityMeta(nextMeta);
  }

  function resetFacilityDraft() {
    setFacilityDraftName('');
    setFacilityDraftStep('name');
  }

  function getInviteUrl(token: string) {
    if (typeof window === 'undefined') return `/invite/${token}`;
    return `${window.location.origin}/invite/${token}`;
  }

  async function handleCopy(token: string) {
    await navigator.clipboard.writeText(getInviteUrl(token));
    setCopiedToken(token);
    window.setTimeout(() => setCopiedToken(null), 1500);
  }

  function handleFacilityDraftNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!facilityDraftName.trim()) return;
    setFacilityDraftStep('usage');
  }

  function handleAssignExistingFacility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedExistingFacility) return;

    const exists = assignments.some((assignment) => assignment.department === departmentName && assignment.facility === selectedExistingFacility);
    if (!exists) {
      persistAssignments([...assignments, { department: departmentName, facility: selectedExistingFacility }]);
    }

    setSelectedExistingFacility('');
  }

  function handleCreateDepartmentOnlyFacility() {
    if (!setup || !facilityDraftName.trim()) return;
    const facilityName = facilityDraftName.trim();

    if (setup.facilities.includes(facilityName)) {
      resetFacilityDraft();
      return;
    }

    persistSetup({ ...setup, facilities: [...setup.facilities, facilityName] });
    persistFacilityMeta([
      ...facilityMeta,
      {
        facility: facilityName,
        scope: 'department_only',
        ownerDepartment: departmentName,
      },
    ]);
    persistAssignments([...assignments, { department: departmentName, facility: facilityName }]);
    resetFacilityDraft();
  }

  function handleReportSharedFacility() {
    if (!facilityDraftName.trim()) return;

    const requests = getFacilityRequests();
    const request: DemoFacilityRequest = {
      id: crypto.randomUUID(),
      facility: facilityDraftName.trim(),
      department: departmentName,
      createdAt: new Date().toISOString(),
      status: 'open',
    };

    saveFacilityRequests([request, ...requests]);
    setFacilityDraftStep('reported');
  }

  function handleCreateTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTeamName.trim()) return;

    const teamName = newTeamName.trim();
    const duplicateTeam = departmentTeams.some((team) => team.name.toLowerCase() === teamName.toLowerCase());

    if (duplicateTeam) {
      setNewTeamName('');
      return;
    }

    persistTeams([
      ...teams,
      {
        id: createTeamId(departmentName, teamName),
        department: departmentName,
        name: teamName,
        defaultFacility: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    setNewTeamName('');
  }

  function handleSetDefaultFacility(teamId: string, facility: string) {
    persistTeams(teams.map((team) => (team.id === teamId ? { ...team, defaultFacility: facility || null } : team)));
  }

  async function handleInviteHeadCoach(teamName: string) {
    const invite: DemoInvite = {
      id: crypto.randomUUID(),
      token: createToken(),
      role: 'head_coach',
      department: departmentName,
      team: teamName,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const nextInvites = [invite, ...invites];
    setInvites(nextInvites);
    saveDemoInvites(nextInvites);
    await handleCopy(invite.token);
  }

  if (!setup) {
    return (
      <AdminShell mode="demo">
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local department</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">No local demo club yet</h1>
          <Link href="/demo/create-club" className="mt-5 inline-block rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950">
            Create local demo setup
          </Link>
        </section>
      </AdminShell>
    );
  }

  const showFacilitySetup = isEditMode || departmentFacilities.length === 0;

  return (
    <AdminShell mode="demo">
      <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
        <Link href="/demo/admin/departments" className="inline-flex items-center text-sm font-black text-amber-200 hover:text-amber-100">
          ← Back to local departments
        </Link>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local department workspace</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{departmentName}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">
              Browser-only team overview for {setup.clubName}. Missing essentials can be fixed inline; Edit Mode exposes broader setup controls.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsEditMode((current) => !current)}
            className={
              isEditMode
                ? 'w-fit rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200'
                : 'w-fit rounded-xl border border-amber-500/70 px-4 py-3 text-sm font-black text-amber-200 transition hover:bg-amber-950/40'
            }
          >
            {isEditMode ? 'Done editing' : 'Edit department'}
          </button>
        </div>
      </section>

      {attentionItems.length > 0 ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Needs attention</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {attentionItems.map((item) => (
              <div key={item.title} className="rounded-2xl border border-amber-500/20 bg-amber-950/10 p-4">
                <p className="font-black text-amber-100">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Facilities</p>
            <h2 className="mt-2 text-xl font-black">Department halls</h2>
          </div>
          <span className="text-sm font-bold text-slate-400">{departmentFacilities.length} assigned</span>
        </div>

        {departmentFacilities.length > 0 ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {departmentFacilities.map((facility) => {
              const meta = metaByFacility.get(facility);
              return (
                <Link
                  key={facility}
                  href={`/demo/admin/facilities/${encodeFacilityName(facility)}/calendar?from=departments`}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 transition hover:border-emerald-400 hover:bg-emerald-950/20 active:border-emerald-300"
                >
                  <p className="font-black text-white">{facility}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {meta?.scope === 'department_only' ? 'Department-only hall' : 'Shared club facility'} · Open calendar
                  </p>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-950/10 p-4 text-sm font-bold text-amber-100">
            No local halls are assigned yet. Add one here without leaving the department flow.
          </p>
        )}

        {showFacilitySetup ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <form onSubmit={handleAssignExistingFacility} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">Assign existing shared facility</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Use this only if the hall already exists as a shared club facility.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <select
                  value={selectedExistingFacility}
                  onChange={(event) => setSelectedExistingFacility(event.target.value)}
                  disabled={availableSharedFacilities.length === 0}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-bold outline-none focus:border-sky-400 disabled:opacity-60"
                >
                  <option value="">{availableSharedFacilities.length > 0 ? 'Select shared club facility' : 'No shared facilities available'}</option>
                  {availableSharedFacilities.map((facility) => (
                    <option key={facility} value={facility}>
                      {facility}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!selectedExistingFacility}
                  className="rounded-xl bg-sky-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Assign
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Add a new hall</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                The hall is not saved yet. First enter a name, then confirm whether only this department uses it or whether it should be reported as shared.
              </p>

              {facilityDraftStep === 'name' ? (
                <form onSubmit={handleFacilityDraftNameSubmit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    value={facilityDraftName}
                    onChange={(event) => setFacilityDraftName(event.target.value)}
                    placeholder="Main Hall"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                  />
                  <button
                    type="submit"
                    disabled={!facilityDraftName.trim()}
                    className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Continue
                  </button>
                </form>
              ) : null}

              {facilityDraftStep === 'usage' ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Hall name</p>
                    <p className="mt-1 font-black text-white">{facilityDraftName.trim()}</p>
                  </div>
                  <p className="text-sm font-bold text-slate-200">Who uses this hall?</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleCreateDepartmentOnlyFacility}
                      className="rounded-xl border border-emerald-500/60 px-4 py-3 text-left text-sm font-black text-emerald-200 hover:bg-emerald-950/40"
                    >
                      Only {departmentName}
                      <span className="mt-1 block text-xs font-bold leading-5 text-slate-400">
                        Save as department-only. Check this is not used by another department.
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFacilityDraftStep('shared_confirm')}
                      className="rounded-xl border border-amber-500/60 px-4 py-3 text-left text-sm font-black text-amber-200 hover:bg-amber-950/40"
                    >
                      Also other departments
                      <span className="mt-1 block text-xs font-bold leading-5 text-slate-400">
                        Review the name before reporting it to admins.
                      </span>
                    </button>
                  </div>
                  <button type="button" onClick={() => setFacilityDraftStep('name')} className="text-xs font-black text-slate-400 hover:text-slate-200">
                    Change name
                  </button>
                </div>
              ) : null}

              {facilityDraftStep === 'shared_confirm' ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">Check shared facility name</p>
                    <p className="mt-1 text-xl font-black text-white">{facilityDraftName.trim()}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      This hall may affect multiple departments. Verify the exact club-wide name before reporting it to admins.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleReportSharedFacility}
                    className="w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200"
                  >
                    Report shared facility to admin
                  </button>
                  <button type="button" onClick={() => setFacilityDraftStep('usage')} className="text-xs font-black text-slate-400 hover:text-slate-200">
                    Back to usage choice
                  </button>
                </div>
              ) : null}

              {facilityDraftStep === 'reported' ? (
                <div className="mt-4 rounded-xl border border-sky-500/30 bg-sky-950/20 p-4">
                  <p className="font-black text-sky-100">Reported to admin</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    The admin can review the facility name and decide whether to create or assign it as a shared club facility.
                  </p>
                  <button type="button" onClick={resetFacilityDraft} className="mt-3 text-xs font-black text-sky-200 hover:text-sky-100">
                    Add another hall
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {isEditMode || departmentTeams.length === 0 ? (
        <form onSubmit={handleCreateTeam} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">{departmentTeams.length === 0 ? 'First team' : 'Edit mode'}</p>
          <h2 className="mt-2 text-xl font-black">{departmentTeams.length === 0 ? 'Create the first local team' : 'Add local team'}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              required
              value={newTeamName}
              onChange={(event) => setNewTeamName(event.target.value)}
              placeholder="U18 Boys"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
            />
            <button type="submit" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300">
              Create team
            </button>
          </div>
        </form>
      ) : null}

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Teams</p>
            <h2 className="mt-2 text-xl font-black">Department teams</h2>
          </div>
          <span className="text-sm font-bold text-slate-400">{departmentTeams.length} teams</span>
        </div>

        <div className="mt-5 space-y-3">
          {departmentTeams.length > 0 ? (
            departmentTeams.map((team) => {
              const pendingHeadInvite = pendingHeadInviteByTeam.get(team.name);
              const headCoachLabel = pendingHeadInvite ? 'Head coach invited' : 'No head coach';
              const needsFacilityAction = !team.defaultFacility;

              return (
                <article key={team.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-slate-700">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl font-black text-white">{team.name}</h3>
                      <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-sm font-bold text-slate-300">
                        <span>{headCoachLabel}</span>
                        <span className="hidden sm:inline text-slate-600">·</span>
                        <span className="hidden sm:inline">0 players</span>
                        <span className="hidden md:inline text-slate-600">·</span>
                        <span className="hidden md:inline">{team.defaultFacility ?? 'No default facility'}</span>
                        <span className="hidden lg:inline text-slate-600">·</span>
                        <span className="hidden lg:inline">No session yet</span>
                      </p>

                      {!isEditMode ? (
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          {pendingHeadInvite ? (
                            <button
                              type="button"
                              onClick={() => handleCopy(pendingHeadInvite.token)}
                              className="w-fit rounded-lg border border-amber-500/60 px-2.5 py-1.5 text-xs font-black text-amber-200 hover:bg-amber-950/40"
                            >
                              {copiedToken === pendingHeadInvite.token ? 'Copied invite' : 'Copy head coach invite'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleInviteHeadCoach(team.name)}
                              className="w-fit rounded-lg border border-amber-500/70 px-2.5 py-1.5 text-xs font-black text-amber-200 hover:bg-amber-950/40"
                            >
                              Invite head coach
                            </button>
                          )}

                          {needsFacilityAction && departmentFacilities.length > 0 ? (
                            <select
                              value=""
                              onChange={(event) => handleSetDefaultFacility(team.id, event.target.value)}
                              className="w-full rounded-lg border border-emerald-500/50 bg-slate-950 px-2.5 py-1.5 text-xs font-black text-emerald-200 outline-none focus:border-emerald-300 sm:w-fit"
                            >
                              <option value="">Set default facility</option>
                              {departmentFacilities.map((facility) => (
                                <option key={facility} value={facility}>
                                  {facility}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {isEditMode ? (
                      <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 lg:w-[360px]">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Head coach</p>
                          {pendingHeadInvite ? (
                            <button
                              type="button"
                              onClick={() => handleCopy(pendingHeadInvite.token)}
                              className="mt-2 rounded-lg border border-amber-500/60 px-2.5 py-1.5 text-xs font-black text-amber-200 hover:bg-amber-950/40"
                            >
                              {copiedToken === pendingHeadInvite.token ? 'Copied invite' : 'Copy pending invite'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleInviteHeadCoach(team.name)}
                              className="mt-2 rounded-lg border border-amber-500/70 px-2.5 py-1.5 text-xs font-black text-amber-200 hover:bg-amber-950/40"
                            >
                              Invite head coach
                            </button>
                          )}
                          <p className="mt-2 text-xs leading-5 text-slate-500">Assistants: none assigned</p>
                        </div>

                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Default facility</p>
                          {departmentFacilities.length > 0 ? (
                            <select
                              value={team.defaultFacility ?? ''}
                              onChange={(event) => handleSetDefaultFacility(team.id, event.target.value)}
                              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold outline-none focus:border-emerald-400"
                            >
                              <option value="">No default facility</option>
                              {departmentFacilities.map((facility) => (
                                <option key={facility} value={facility}>
                                  {facility}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <p className="mt-2 text-xs leading-5 text-slate-500">Add a hall above before setting a default facility.</p>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">No local teams in this department yet.</p>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
