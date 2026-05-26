'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/shared/admin/AdminShell';
import {
  getDemoClubSetup,
  getDemoTeams,
  getDemoSessions,
  saveDemoClubSetup,
  saveDemoSessions,
  saveDemoTeams,
  type DemoClubSetup,
  type DemoTeam,
  type DemoSession,
} from '@/shared/dev/demoStorage';
import { DemoSessionComposer } from '@/features/sessions/DemoSessionComposer';
import type { SessionComposerPayload } from '@/features/sessions/SessionComposer';

type DemoAssignment = { department: string; facility: string };
type DemoFacilityRequest = {
  id: string;
  facility: string;
  address?: string | null;
  department: string;
  createdAt: string;
  status: 'open' | 'resolved' | 'rejected';
};
type FacilityDraftStep = 'idle' | 'name' | 'usage' | 'shared_confirm' | 'reported';
type DemoInvite = {
  id: string;
  token: string;
  role: 'head_coach' | 'assistant_coach';
  department: string;
  team: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt: string | null;
};

const DEMO_FACILITY_ASSIGNMENTS_KEY = 'club-app.demo.facility-assignments';
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

function normalizeText(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/\s+/g, ' ');
}

function normalizeStreet(address: string) {
  const firstLine = address.split(',')[0] ?? address;
  return normalizeText(firstLine).replace(/\b\d+[a-z]?\b/g, '').replace(/[.,;:/\\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getAssignments(): DemoAssignment[] {
  return readJson<DemoAssignment[]>(DEMO_FACILITY_ASSIGNMENTS_KEY, []);
}

function saveAssignments(assignments: DemoAssignment[]) {
  writeJson(DEMO_FACILITY_ASSIGNMENTS_KEY, assignments);
}

function getFacilityRequests(): DemoFacilityRequest[] {
  return readJson<DemoFacilityRequest[]>(DEMO_FACILITY_REQUESTS_KEY, []);
}

function saveFacilityRequests(requests: DemoFacilityRequest[]) {
  writeJson(DEMO_FACILITY_REQUESTS_KEY, requests);
}

function createTeamId(department: string, team: string) {
  return `${department}-${team}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function encodeFacilityName(facility: string) {
  return encodeURIComponent(facility);
}

function createInviteToken() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function DemoAdminDepartmentWorkspace({ departmentName }: { departmentName: string }) {
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [teams, setTeams] = useState<DemoTeam[]>([]);
  const [assignments, setAssignments] = useState<DemoAssignment[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedExistingFacilities, setSelectedExistingFacilities] = useState<string[]>([]);
  const [facilityDraftName, setFacilityDraftName] = useState('');
  const [facilityDraftAddress, setFacilityDraftAddress] = useState('');
  const [facilityDraftStep, setFacilityDraftStep] = useState<FacilityDraftStep>('idle');
  const [facilityDraftError, setFacilityDraftError] = useState<string | null>(null);
  const [facilityDraftWarning, setFacilityDraftWarning] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [invites, setInvites] = useState<DemoInvite[]>([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [sessions, setSessions] = useState<DemoSession[]>([]);
  const [composerTeamId, setComposerTeamId] = useState<string | null>(null);

  function loadLocalData() {
    const currentSetup = getDemoClubSetup();
    setSetup(currentSetup);
    setTeams(getDemoTeams(currentSetup));
    setAssignments(getAssignments());
    setInvites(readJson<DemoInvite[]>(DEMO_INVITES_KEY, []));
    setSessions(getDemoSessions());
  }

  useEffect(() => {
    loadLocalData();
  }, []);

  const facilityDetails = useMemo(() => setup?.facilityDetails ?? [], [setup]);
  const facilityByName = useMemo(() => new Map(facilityDetails.map((facility) => [facility.name, facility])), [facilityDetails]);
  const departmentTeams = useMemo(() => teams.filter((team) => team.department === departmentName), [departmentName, teams]);
  const departmentFacilities = useMemo(
    () => assignments.filter((assignment) => assignment.department === departmentName).map((assignment) => assignment.facility).sort((a, b) => a.localeCompare(b)),
    [assignments, departmentName],
  );
  const availableSharedFacilities = useMemo(
    () => facilityDetails.filter((facility) => facility.scope !== 'department_only' && !departmentFacilities.includes(facility.name)),
    [departmentFacilities, facilityDetails],
  );
  const nextSessionByTeam = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, DemoSession>();
    for (const session of sessions) {
      if (session.department !== departmentName || new Date(session.startsAt).getTime() < now) continue;
      const team = departmentTeams.find((item) => item.name === session.team);
      if (!team) continue;
      const current = map.get(team.id);
      if (!current || new Date(session.startsAt) < new Date(current.startsAt)) {
        map.set(team.id, session);
      }
    }
    return map;
  }, [departmentName, departmentTeams, sessions]);

  function persistSetup(nextSetup: DemoClubSetup) {
    saveDemoClubSetup(nextSetup);
    setSetup(getDemoClubSetup());
  }

  function persistTeams(nextTeams: DemoTeam[]) {
    setTeams(nextTeams);
    saveDemoTeams(nextTeams);
  }

  function persistInvites(nextInvites: DemoInvite[]) {
    setInvites(nextInvites);
    writeJson(DEMO_INVITES_KEY, nextInvites);
  }

  async function handleCreateSession(payload: SessionComposerPayload) {
    const team = departmentTeams.find((item) => item.id === payload.ownerTeamId);
    if (!team) throw new Error('Team not found.');
    const nextSession: DemoSession = {
      id: crypto.randomUUID(),
      department: departmentName,
      team: team.name,
      title: payload.title,
      sessionType: payload.sessionType,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      facility: payload.facilityId,
      createdAt: new Date().toISOString(),
    };
    const nextSessions = [nextSession, ...sessions];
    setSessions(nextSessions);
    saveDemoSessions(nextSessions);
  }

  async function handleInvite(role: DemoInvite['role'], team: DemoTeam) {
    const existing = invites.find((invite) => invite.status === 'pending' && invite.role === role && invite.department === departmentName && invite.team === team.name);
    const invite = existing ?? {
      id: crypto.randomUUID(),
      token: createInviteToken(),
      role,
      department: departmentName,
      team: team.name,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };
    if (!existing) persistInvites([invite, ...invites]);
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${invite.token}`);
    setCopiedToken(invite.token);
    window.setTimeout(() => setCopiedToken(null), 1500);
  }

  function persistAssignments(nextAssignments: DemoAssignment[]) {
    setAssignments(nextAssignments);
    saveAssignments(nextAssignments);
  }

  function findMatchingStreet(address: string) {
    const normalizedStreet = normalizeStreet(address);
    if (!normalizedStreet) return null;
    return facilityDetails.find((facility) => facility.address && normalizeStreet(facility.address) === normalizedStreet) ?? null;
  }

  function persistDepartmentAssignments(facilitiesToAssign: string[]) {
    const requestedFacilities = Array.from(new Set([...selectedExistingFacilities, ...facilitiesToAssign]));
    const existingKeys = new Set(assignments.map((assignment) => `${assignment.department}::${assignment.facility}`));
    const additions = requestedFacilities.filter((facility) => !existingKeys.has(`${departmentName}::${facility}`)).map((facility) => ({ department: departmentName, facility }));

    if (additions.length > 0) persistAssignments([...assignments, ...additions]);
    setSelectedExistingFacilities([]);
  }

  function resetFacilityDraft() {
    setFacilityDraftName('');
    setFacilityDraftAddress('');
    setFacilityDraftError(null);
    setFacilityDraftWarning(null);
    setFacilityDraftStep('idle');
  }

  function continueFacilityDraft() {
    const facilityName = facilityDraftName.trim();
    const address = facilityDraftAddress.trim();

    if (!facilityName) {
      setFacilityDraftError('Enter a hall name.');
      return;
    }

    if (!address) {
      setFacilityDraftError('Enter the hall address.');
      return;
    }

    const matchingStreet = findMatchingStreet(address);
    setFacilityDraftWarning(matchingStreet ? `Possible same location: ${matchingStreet.name} already uses ${matchingStreet.address}. Check carefully before creating another hall.` : null);
    setFacilityDraftError(null);
    setFacilityDraftStep('usage');
  }

  function toggleExistingFacility(facility: string) {
    setSelectedExistingFacilities((current) => (current.includes(facility) ? current.filter((item) => item !== facility) : [...current, facility]));
  }

  function handleCreateDepartmentOnlyFacility() {
    if (!setup || !facilityDraftName.trim() || !facilityDraftAddress.trim()) return;
    const facilityName = facilityDraftName.trim();
    const address = facilityDraftAddress.trim();

    if (facilityByName.has(facilityName)) {
      setFacilityDraftError('A hall with this name already exists in the demo. Rename it or assign the existing hall.');
      setFacilityDraftStep('name');
      return;
    }

    persistSetup({
      ...setup,
      facilities: [...setup.facilities, facilityName],
      facilityDetails: [
        ...(setup.facilityDetails ?? []),
        { name: facilityName, address, scope: 'department_only', ownerDepartment: departmentName },
      ],
    });
    persistDepartmentAssignments([facilityName]);
    resetFacilityDraft();
  }

  function handleReportSharedFacility() {
    if (!facilityDraftName.trim() || !facilityDraftAddress.trim()) return;
    const request: DemoFacilityRequest = {
      id: crypto.randomUUID(),
      facility: facilityDraftName.trim(),
      address: facilityDraftAddress.trim(),
      department: departmentName,
      createdAt: new Date().toISOString(),
      status: 'open',
    };
    saveFacilityRequests([request, ...getFacilityRequests()]);
    setFacilityDraftStep('reported');
  }

  function handleCreateTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTeamName.trim()) return;
    const teamName = newTeamName.trim();
    if (departmentTeams.some((team) => team.name.toLowerCase() === teamName.toLowerCase())) {
      setNewTeamName('');
      return;
    }
    persistTeams([...teams, { id: createTeamId(departmentName, teamName), department: departmentName, name: teamName, defaultFacility: null, createdAt: new Date().toISOString() }]);
    setNewTeamName('');
  }

  function handleSetDefaultFacility(teamId: string, facility: string) {
    persistTeams(teams.map((team) => (team.id === teamId ? { ...team, defaultFacility: facility || null } : team)));
  }

  if (!setup) {
    return (
      <AdminShell mode="demo">
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local department</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">No local demo club yet</h1>
          <Link href="/demo/create-club" className="mt-5 inline-block rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950">Create local demo setup</Link>
        </section>
      </AdminShell>
    );
  }

  const showFacilitySetup = isEditMode || departmentFacilities.length === 0;

  return (
    <AdminShell mode="demo">
      <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
        <Link href="/demo/admin/departments" className="inline-flex items-center text-sm font-black text-amber-200 hover:text-amber-100">← Back to local departments</Link>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local department workspace</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{departmentName}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">Browser-only team overview for {setup.clubName}.</p>
          </div>
          <button type="button" onClick={() => setIsEditMode((current) => !current)} className={isEditMode ? 'w-fit rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200' : 'w-fit rounded-xl border border-amber-500/70 px-4 py-3 text-sm font-black text-amber-200 transition hover:bg-amber-950/40'}>
            {isEditMode ? 'Done editing' : 'Edit department'}
          </button>
        </div>
      </section>

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
            {departmentFacilities.map((facilityName) => {
              const facility = facilityByName.get(facilityName);
              return (
                <Link key={facilityName} href={`/demo/admin/facilities/${encodeFacilityName(facilityName)}/calendar?from=departments&departmentName=${encodeURIComponent(departmentName)}`} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 transition hover:border-emerald-400 hover:bg-emerald-950/20 active:border-emerald-300">
                  <p className="font-black text-white">{facilityName}</p>
                  <p className="mt-1 text-xs text-slate-500">{facility?.scope === 'department_only' ? 'Department-only hall' : 'Shared club facility'} · {facility?.address || 'No address'}</p>
                </Link>
              );
            })}
          </div>
        ) : null}

        {showFacilitySetup ? (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">Add hall to department</p>
                <h3 className="mt-2 text-lg font-black">Assign existing shared club facilities</h3>
              </div>
              <button type="button" onClick={() => persistDepartmentAssignments([])} disabled={selectedExistingFacilities.length === 0} className="w-fit rounded-xl bg-sky-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60">Assign selected</button>
            </div>

            {availableSharedFacilities.length > 0 ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {availableSharedFacilities.map((facility) => (
                  <label key={facility.name} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm transition hover:border-sky-400">
                    <span>
                      <span className="block font-black text-slate-100">{facility.name}</span>
                      <span className="mt-1 block text-xs font-bold text-slate-500">{facility.address}</span>
                    </span>
                    <input type="checkbox" checked={selectedExistingFacilities.includes(facility.name)} onChange={() => toggleExistingFacility(facility.name)} className="h-4 w-4" />
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm font-bold text-slate-400">No shared club facilities are available to assign right now.</p>
            )}

            <div className="mt-4 border-t border-slate-800 pt-4">
              {facilityDraftStep === 'idle' ? <button type="button" onClick={() => setFacilityDraftStep('name')} className="rounded-xl border border-emerald-500/70 px-4 py-3 text-sm font-black text-emerald-200 hover:bg-emerald-950/40">Hall not listed? Create new hall</button> : null}

              {facilityDraftStep === 'name' ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Create new hall</p>
                  {facilityDraftError ? <p className="mt-3 rounded-xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm font-bold text-red-100">{facilityDraftError}</p> : null}
                  {facilityDraftWarning ? <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm font-bold text-amber-100">{facilityDraftWarning}</p> : null}
                  <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto]">
                    <input value={facilityDraftName} onChange={(event) => { setFacilityDraftName(event.target.value); setFacilityDraftError(null); }} placeholder="Hall name" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-400" />
                    <input value={facilityDraftAddress} onChange={(event) => { setFacilityDraftAddress(event.target.value); setFacilityDraftError(null); setFacilityDraftWarning(null); }} placeholder="Street, city" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-400" />
                    <button type="button" onClick={continueFacilityDraft} disabled={!facilityDraftName.trim() || !facilityDraftAddress.trim()} className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60">Continue</button>
                    <button type="button" onClick={resetFacilityDraft} className="text-xs font-black text-slate-400 hover:text-slate-200">Cancel</button>
                  </div>
                </div>
              ) : null}

              {facilityDraftStep === 'usage' ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-4">
                  {facilityDraftWarning ? <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm font-bold text-amber-100">{facilityDraftWarning}</p> : null}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Hall name</p><p className="mt-1 font-black text-white">{facilityDraftName.trim()}</p></div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Address</p><p className="mt-1 font-black text-white">{facilityDraftAddress.trim()}</p></div>
                  </div>
                  <p className="mt-4 text-sm font-bold text-slate-200">Who uses this hall?</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <button type="button" onClick={handleCreateDepartmentOnlyFacility} className="rounded-xl border border-emerald-500/60 px-4 py-3 text-left text-sm font-black text-emerald-200 hover:bg-emerald-950/40">Only {departmentName}<span className="mt-1 block text-xs font-bold leading-5 text-slate-400">Save as department-only.</span></button>
                    <button type="button" onClick={() => setFacilityDraftStep('shared_confirm')} className="rounded-xl border border-amber-500/60 px-4 py-3 text-left text-sm font-black text-amber-200 hover:bg-amber-950/40">Also other departments<span className="mt-1 block text-xs font-bold leading-5 text-slate-400">Report it to admins as shared/global.</span></button>
                  </div>
                  <button type="button" onClick={() => setFacilityDraftStep('name')} className="mt-3 text-xs font-black text-slate-400 hover:text-slate-200">Change details</button>
                </div>
              ) : null}

              {facilityDraftStep === 'shared_confirm' ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">Check shared facility details</p>
                  <p className="mt-1 text-xl font-black text-white">{facilityDraftName.trim()}</p>
                  <p className="mt-1 text-sm font-bold text-amber-100">{facilityDraftAddress.trim()}</p>
                  <button type="button" onClick={handleReportSharedFacility} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200">Report shared facility to admin</button>
                  <button type="button" onClick={() => setFacilityDraftStep('usage')} className="mt-3 text-xs font-black text-slate-400 hover:text-slate-200">Back to usage choice</button>
                </div>
              ) : null}

              {facilityDraftStep === 'reported' ? (
                <div className="rounded-2xl border border-sky-500/30 bg-sky-950/20 p-4">
                  <p className="font-black text-sky-100">Reported to admin</p>
                  <button type="button" onClick={resetFacilityDraft} className="mt-3 text-xs font-black text-sky-200 hover:text-sky-100">Close</button>
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
            <input required value={newTeamName} onChange={(event) => setNewTeamName(event.target.value)} placeholder="U18 Boys" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400" />
            <button type="submit" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300">Create team</button>
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
              const defaultFacility = team.defaultFacility ? facilityByName.get(team.defaultFacility) : null;
              const needsDefaultFacility = !team.defaultFacility;
              const pendingHeadCoachInvite = invites.find((invite) => invite.status === 'pending' && invite.role === 'head_coach' && invite.team === team.name);
              const nextSession = nextSessionByTeam.get(team.id);
              return (
                <article key={team.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-slate-700">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl font-black text-white">
                        <Link href={`/demo/admin/teams/${encodeURIComponent(team.id)}?from=department&departmentName=${encodeURIComponent(departmentName)}`} className="transition hover:text-sky-200">
                          {team.name}
                        </Link>
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-slate-300">
                        {pendingHeadCoachInvite ? (
                          <button
                            type="button"
                            onClick={() => handleInvite('head_coach', team)}
                            className="text-slate-200 underline decoration-slate-500 underline-offset-4 transition hover:text-white"
                          >
                            {copiedToken === pendingHeadCoachInvite.token ? 'Invite copied' : 'Invite pending'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleInvite('head_coach', team)}
                            className="text-slate-200 underline decoration-slate-500 underline-offset-4 transition hover:text-white"
                          >
                            Invite head coach
                          </button>
                        )}
                        <span className="hidden md:inline text-slate-600">·</span>
                        <span>
                          {isEditMode && departmentFacilities.length > 0 ? (
                            <select value={team.defaultFacility ?? ''} onChange={(event) => handleSetDefaultFacility(team.id, event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-black text-slate-200 outline-none focus:border-emerald-400">
                              <option value="">No default facility</option>
                              {departmentFacilities.map((facility) => <option key={facility} value={facility}>{facility}</option>)}
                            </select>
                          ) : isEditMode ? (
                            'No department halls yet'
                          ) : defaultFacility ? (
                            <Link
                              href={`/demo/admin/facilities/${encodeFacilityName(defaultFacility.name)}/calendar?from=team&departmentName=${encodeURIComponent(departmentName)}&teamName=${encodeURIComponent(team.name)}`}
                              data-facility-accent-target="self"
                              data-facility-accent-mode="chip"
                              className="inline-flex max-w-full items-center rounded-lg border border-slate-700/80 bg-slate-950/55 px-2 py-0.5 text-xs font-black text-slate-200 transition hover:border-slate-500 hover:text-white"
                            >
                              {defaultFacility.name}
                            </Link>
                          ) : needsDefaultFacility && departmentFacilities.length > 0 ? (
                            <select value="" onChange={(event) => handleSetDefaultFacility(team.id, event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-black text-slate-200 outline-none transition focus:border-slate-400">
                              <option value="">Set default facility</option>
                              {departmentFacilities.map((facility) => <option key={facility} value={facility}>{facility}</option>)}
                            </select>
                          ) : (
                            'No default facility'
                          )}
                        </span>
                        <span className="hidden sm:inline text-slate-600">·</span>
                        <span className="hidden sm:inline">0 players</span>
                        <span className="hidden lg:inline text-slate-600">·</span>
                        <span className="hidden lg:inline">
                          {nextSession ? `Next ${new Date(nextSession.startsAt).toLocaleDateString(undefined, { weekday: 'short' })} ${new Date(nextSession.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : 'No session yet'}
                        </span>
                      </div>
                      {!isEditMode ? (
                        <button type="button" onClick={() => setComposerTeamId(team.id)} className="mt-3 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-black text-slate-200 transition hover:bg-slate-800">
                          Create session
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">No teams yet.</p>
          )}
        </div>
      </section>
      <DemoSessionComposer
        open={composerTeamId !== null}
        teams={departmentTeams.map((team) => ({
          id: team.id,
          name: team.name,
          departmentId: departmentName,
          defaultFacilityId: team.defaultFacility,
        }))}
        facilities={departmentFacilities.map((facility) => ({ id: facility, name: facility }))}
        initialTeamId={composerTeamId}
        lockedTeamId={composerTeamId}
        onClose={() => setComposerTeamId(null)}
        onSubmit={handleCreateSession}
      />
    </AdminShell>
  );
}
