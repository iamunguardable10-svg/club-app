'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { getFacilityAccent } from '@/features/facilities/facilityAccent';
import { acwrDisplayLabel, playerLoadSummary, type PlayerLoadInput } from '@/features/load/loadAccess';
import { loadZone } from '@/features/load/loadCalculations';
import { PlayerLoadDetail } from '@/features/players/PlayerLoadDetail';
import { CoachSessionEditSheet } from '@/features/role-workspaces/CoachSessionEditSheet';
import { labelForCoachSessionType, normalizeCoachSessionType } from '@/features/sessions/sessionTypeLabels';
import { CoachSessionDetailOverlay } from '@/features/role-workspaces/CoachSessionSurfaces';
import type { CoachFacility, CoachGroup, CoachSession, CoachTeam } from '@/features/role-workspaces/CoachTypes';
import { formatSessionTime, plural } from '@/shared/format';

export type TeamWorkspaceRole = 'admin' | 'department_lead' | 'coach' | 'viewer';
export type TeamWorkspaceSection = 'dashboard' | 'players' | 'groups' | 'settings';

export type TeamWorkspaceSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  facilityId?: string | null;
  facilityName?: string | null;
  groupIds?: string[];
  sessionType?: string | null;
};

export type TeamWorkspaceStaff = {
  headCoaches: string[];
  assistantCoaches: string[];
  extraRoles?: { label: string; people: string[] }[];
};

export type TeamWorkspaceFacilityOption = { id: string; name: string };
export type TeamWorkspacePlayer = PlayerLoadInput & {
  id: string;
  name: string;
  groups?: string[];
  /** Missing means shared; `false` for roles without `viewAttendance`. */
  attendanceShared?: boolean;
  attendanceRate?: number | null;
  missedSessions?: number | null;
  attendanceEvents?: {
    sessionId: string;
    title: string;
    startsAt: string;
    status: 'out' | 'late';
    reason?: string | null;
    lateMinutes?: number | null;
    /** Did not take part, said afterwards. */
    missed?: boolean;
  }[];
};
export type TeamWorkspaceStaffRole = {
  id: string;
  label: string;
  status: 'missing' | 'accepted';
  value?: string | null;
};

export type TeamWorkspaceData = {
  id: string;
  name: string;
  departmentName: string;
  defaultFacilityId?: string | null;
  defaultFacilityName?: string | null;
  availableFacilities?: TeamWorkspaceFacilityOption[];
  playerCount: number;
  players?: TeamWorkspacePlayer[];
  role: TeamWorkspaceRole;
  staff: TeamWorkspaceStaff;
  sessions: TeamWorkspaceSession[];
  groups: { id: string; name: string; description: string; playerCount: number; playerIds?: string[] }[];
  /** Missing means shared; `false` for roles without `viewAttendance`. */
  attendanceShared?: boolean;
  /** The coach calendar filtered to this team. */
  calendarHref: string;
  /** `false` when the team does not track training load (no traffic lights, no RPE). */
  loadTracked?: boolean;
};

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function sectionLabel(section: TeamWorkspaceSection) {
  if (section === 'dashboard') return 'Overview';
  if (section === 'players') return 'Players';
  if (section === 'groups') return 'Groups';
  return 'Staff & settings';
}

function EmptyCard({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <p className="text-sm font-black text-slate-100">{title}</p>
      {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
    </div>
  );
}

function acwrToneClass(tone: ReturnType<typeof loadZone>['tone']) {
  if (tone === 'high') return 'border-rose-400/45 bg-rose-400/10 text-rose-100';
  if (tone === 'low') return 'border-sky-400/45 bg-sky-400/10 text-sky-100';
  if (tone === 'ready') return 'border-emerald-400/45 bg-emerald-400/10 text-emerald-100';
  return 'border-slate-700 bg-slate-950/55 text-slate-300';
}

function loadRiskLine(player: TeamWorkspacePlayer) {
  const summary = playerLoadSummary(player);
  if (summary.zone.tone !== 'high' && summary.zone.tone !== 'low') return null;
  return {
    id: player.id,
    name: player.name,
    status: summary.zone.tone,
    detail: summary.acwr !== null ? `${summary.acwr.toFixed(2)} ACWR` : null,
  };
}

function coachSessionFromTeamWorkspace(session: TeamWorkspaceSession, data: TeamWorkspaceData, players: TeamWorkspacePlayer[]): CoachSession {
  return {
    id: session.id,
    title: session.title,
    sessionType: session.sessionType ?? 'training',
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    teamId: data.id,
    teamName: data.name,
    departmentName: data.departmentName,
    facilityId: session.facilityId ?? data.defaultFacilityId ?? null,
    facilityName: session.facilityName ?? data.defaultFacilityName ?? null,
    groupIds: session.groupIds ?? [],
    attendanceShared: data.attendanceShared,
    availability: players.flatMap((player) =>
      (player.attendanceEvents ?? [])
        .filter((event) => event.sessionId === session.id)
        .map((event) => ({
          id: `${session.id}-${player.id}-${event.status}`,
          userId: player.id,
          playerName: player.name,
          status: event.status,
          reason: event.reason ?? null,
          lateMinutes: event.lateMinutes ?? null,
        })),
    ),
    players: players.map((player) => {
      const summary = playerLoadSummary(player);
      return {
        id: player.id,
        name: player.name,
        loadEntries: summary.entries,
        loadAccess: summary.access,
        loadSummary: player.loadSummary ?? null,
        acwr: summary.acwr,
        risk: summary.zone.tone === 'high' || summary.zone.tone === 'low' || summary.zone.tone === 'ready' ? summary.zone.tone : 'baseline',
      };
    }),
  };
}

function TeamDashboardSessionCard({
  session,
  attendanceShared = true,
  onOpen,
}: {
  session: CoachSession;
  attendanceShared?: boolean;
  onOpen: () => void;
}) {
  const out = session.availability.filter((entry) => entry.status === 'out');
  const late = session.availability.filter((entry) => entry.status === 'late');

  return (
    <button type="button" onClick={onOpen} className="mt-4 block w-full rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-left text-white transition hover:border-emerald-300/45 hover:bg-slate-900/70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl font-black">{session.title}</h3>
          <p className="mt-1 text-sm font-bold text-slate-400">{formatSessionTime(session.startsAt, session.endsAt)}{session.facilityName ? ` · ${session.facilityName}` : ''}</p>
        </div>
        <span aria-hidden className="text-lg font-black text-slate-500">›</span>
      </div>
      {attendanceShared ? <div className="mt-4 grid grid-cols-2 gap-2">
        <div className={`rounded-xl border p-3 ${out.length > 0 ? 'border-rose-400/35 bg-rose-400/10' : 'border-slate-800 bg-slate-950/60'}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black text-slate-400">Out</p>
            <span className="text-lg font-black text-white">{out.length}</span>
          </div>
          {out.slice(0, 3).map((item) => <p key={item.id} className="mt-1.5 text-xs font-bold text-slate-300">{item.playerName}{item.reason ? ` · ${item.reason}` : ''}</p>)}
        </div>
        <div className={`rounded-xl border p-3 ${late.length > 0 ? 'border-amber-400/35 bg-amber-400/10' : 'border-slate-800 bg-slate-950/60'}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black text-slate-400">Late</p>
            <span className="text-lg font-black text-white">{late.length}</span>
          </div>
          {late.slice(0, 3).map((item) => <p key={item.id} className="mt-1.5 text-xs font-bold text-slate-300">{item.playerName}{item.lateMinutes ? ` · ${item.lateMinutes} min` : ''}{item.reason ? ` · ${item.reason}` : ''}</p>)}
        </div>
      </div> : null}
    </button>
  );
}

/**
 * Read-only staff overview. Inviting, copying invite links, revoking and
 * adding or removing coach-role slots all needed accounts and went with them;
 * their buttons had become controls that did nothing.
 */
function StaffRoleGrid({ roles }: { roles: TeamWorkspaceStaffRole[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {roles.map((role) => (
        <div key={role.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{role.label}</p>
          <p className="mt-2 text-sm text-slate-200">{role.status === 'accepted' ? role.value ?? 'Assigned' : <span className="text-slate-500">Not assigned</span>}</p>
        </div>
      ))}
    </div>
  );
}

export function TeamWorkspaceView({
  data,
  initialSection = 'dashboard',
  coachSessions = [],
  onDefaultFacilityChange,
  onSessionTimeChange,
  onSessionFacilityChange,
  onSessionGroupsChange,
  onSessionTypeChange,
  onSessionDelete,
  onAddGroup,
  onRemoveGroup,
  onTogglePlayerGroup,
  onRemovePlayer,
  staffPanel,
}: {
  data: TeamWorkspaceData;
  initialSection?: TeamWorkspaceSection;
  /**
   * The same sessions as the coach pages build them, with who reported out or
   * late (as far as the coach's role may see). Detail views use these so the
   * team page and Today never disagree.
   */
  coachSessions?: CoachSession[];
  onDefaultFacilityChange?: (facilityId: string) => void | Promise<void>;
  onSessionTimeChange?: (sessionId: string, startsAt: string, endsAt: string) => void | Promise<void>;
  onSessionFacilityChange?: (sessionId: string, facilityId: string) => void | Promise<void>;
  onSessionGroupsChange?: (sessionId: string, groupIds: string[]) => void | Promise<void>;
  onSessionTypeChange?: (sessionId: string, sessionType: string) => void | Promise<void>;
  onSessionDelete?: (sessionId: string) => void | Promise<void>;
  onAddGroup?: (name: string) => void | Promise<void>;
  onRemoveGroup?: (groupId: string) => void | Promise<void>;
  onTogglePlayerGroup?: (groupId: string, playerId: string) => void | Promise<void>;
  /** Only for roles that may manage the staff. */
  onRemovePlayer?: (playerId: string) => void | Promise<void>;
  /** Replaces the read-only staff overview in settings, e.g. with role management. */
  staffPanel?: ReactNode;
}) {
  const [activeSection, setActiveSection] = useState<TeamWorkspaceSection>(initialSection);
  const [isSavingDefault, setIsSavingDefault] = useState(false);
  const [activePlayer, setActivePlayer] = useState<TeamWorkspacePlayer | null>(null);
  const [dashboardSession, setDashboardSession] = useState<TeamWorkspaceSession | null>(null);
  const [dashboardEditingSession, setDashboardEditingSession] = useState<TeamWorkspaceSession | null>(null);
  const [dashboardDeleteTargetId, setDashboardDeleteTargetId] = useState<string | null>(null);
  const [isSavingDashboardSessionFacility, setIsSavingDashboardSessionFacility] = useState(false);
  const [isSavingDashboardEdit, setIsSavingDashboardEdit] = useState(false);
  const [isDeletingDashboardSession, setIsDeletingDashboardSession] = useState(false);
  const [playerSort, setPlayerSort] = useState<'risk' | 'az'>('risk');
  const [removePlayerTarget, setRemovePlayerTarget] = useState<TeamWorkspacePlayer | null>(null);
  const [isRemovingPlayer, setIsRemovingPlayer] = useState(false);
  // Same accent as the hall list, seeded by the hall id.
  const selectedFacilityAccent = data.defaultFacilityId ? getFacilityAccent(data.defaultFacilityId) : null;
  const players = data.players ?? [];
  const sortedPlayers = useMemo(() => [...players].sort((a, b) => {
    if (playerSort === 'az' || data.loadTracked === false) return a.name.localeCompare(b.name);
    const aSummary = playerLoadSummary(a);
    const bSummary = playerLoadSummary(b);
    if (aSummary.riskRank !== bSummary.riskRank) return aSummary.riskRank - bSummary.riskRank;
    return (bSummary.acwr ?? 0) - (aSummary.acwr ?? 0);
  }), [playerSort, players, data.loadTracked]);
  const coachEditorTeams = useMemo<CoachTeam[]>(() => [{
    id: data.id,
    clubId: 'team-workspace',
    name: data.name,
    departmentId: data.departmentName,
    departmentName: data.departmentName,
    defaultFacilityId: data.defaultFacilityId ?? null,
    role: data.role,
  }], [data.defaultFacilityId, data.departmentName, data.id, data.name, data.role]);
  const coachEditorFacilities = useMemo<CoachFacility[]>(
    () => (data.availableFacilities ?? []).map((facility) => ({ id: facility.id, name: facility.name, departmentIds: [data.departmentName] })),
    [data.availableFacilities, data.departmentName],
  );
  const coachEditorGroups = useMemo<CoachGroup[]>(
    () => data.groups.map((group) => ({ id: group.id, teamId: data.id, name: group.name, playerCount: group.playerCount })),
    [data.groups, data.id],
  );
  // Memberships carry "coach" without seniority, so head and assistant cannot
  // be told apart. Two rows would show "Assistant Coach: missing" for every
  // team, next to an invite button that could not do anything.
  const allCoaches = [...data.staff.headCoaches, ...data.staff.assistantCoaches];
  const staffRoles = [
    { id: 'coaches', label: 'Coaches', status: allCoaches.length > 0 ? 'accepted' : 'missing', value: allCoaches.join(', ') || null },
  ] satisfies TeamWorkspaceStaffRole[];
  const [newGroupName, setNewGroupName] = useState('');
  const [isGroupEditMode, setIsGroupEditMode] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const activeGroup = useMemo(() => data.groups.find((group) => group.id === activeGroupId) ?? null, [activeGroupId, data.groups]);
  const activeGroupPlayers = useMemo(() => {
    if (!activeGroup) return [];
    return players.filter((player) => activeGroup.playerIds?.includes(player.id) || player.groups?.includes(activeGroup.id) || player.groups?.includes(activeGroup.name));
  }, [activeGroup, players]);
  const activeGroupLoadFlags = useMemo(
    () => activeGroupPlayers.map(loadRiskLine).filter(Boolean) as { id: string; name: string; status: 'high' | 'low'; detail: string | null }[],
    [activeGroupPlayers],
  );
  const nextSession = useMemo(() => {
    const now = Date.now();
    return [...data.sessions].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()).find((session) => new Date(session.startsAt).getTime() >= now) ?? data.sessions[0];
  }, [data.sessions]);

  const setupActions = [
    data.staff.headCoaches.length === 0
      ? { id: 'head-coach', label: 'No coach assigned', action: 'none' as const }
      : null,
    !data.defaultFacilityName
      ? { id: 'default-facility', label: 'Set a default hall', action: 'settings' as const }
      : null,
    data.playerCount === 0
      ? { id: 'players', label: 'No players yet: share the join code', action: 'players' as const }
      : null,
  ].filter(Boolean) as { id: string; label: string; action: 'settings' | 'players' | 'none' }[];

  const sections: TeamWorkspaceSection[] = ['dashboard', 'players', 'groups', 'settings'];
  const coachSessionById = useMemo(() => new Map(coachSessions.map((session) => [session.id, session])), [coachSessions]);
  const coachSessionFor = (session: TeamWorkspaceSession) =>
    coachSessionById.get(session.id) ?? coachSessionFromTeamWorkspace(session, data, playersForSession(session));
  const groupNameById = useMemo(() => new Map(data.groups.map((group) => [group.id, group.name])), [data.groups]);
  const upcomingSessions = useMemo(() => {
    const now = Date.now();
    return data.sessions.filter((session) => new Date(session.startsAt).getTime() >= now && session.id !== nextSession?.id).slice(0, 4);
  }, [data.sessions, nextSession?.id]);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (!activePlayer || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activePlayer]);

  async function handleDefaultFacilityChange(facilityId: string) {
    if (!onDefaultFacilityChange) return;
    setIsSavingDefault(true);
    try {
      await onDefaultFacilityChange(facilityId);
    } finally {
      setIsSavingDefault(false);
    }
  }

  function playersForSession(session: TeamWorkspaceSession | null) {
    if (!session?.groupIds?.length) return players;
    const ids = new Set<string>();
    for (const groupId of session.groupIds) {
      const group = data.groups.find((item) => item.id === groupId);
      for (const playerId of group?.playerIds ?? []) ids.add(playerId);
    }
    return players.filter((player) => ids.has(player.id));
  }

  async function handleDashboardSessionFacilityChange(facilityId: string) {
    if (!dashboardSession || !onSessionFacilityChange) return;
    const facility = data.availableFacilities?.find((item) => item.id === facilityId);
    setIsSavingDashboardSessionFacility(true);
    try {
      await onSessionFacilityChange(dashboardSession.id, facilityId);
      setDashboardSession((current) => current?.id === dashboardSession.id ? { ...current, facilityId, facilityName: facility?.name ?? current.facilityName ?? null } : current);
    } finally {
      setIsSavingDashboardSessionFacility(false);
    }
  }

  async function handleDashboardSessionEditSave(value: { startsAt: string; endsAt: string; teamId: string; facilityId: string; groupIds: string[]; sessionType: string }) {
    if (!dashboardEditingSession) return;
    const previousSession = dashboardSession;
    const facility = data.availableFacilities?.find((item) => item.id === value.facilityId);
    const nextSession: TeamWorkspaceSession = {
      ...dashboardEditingSession,
      title: labelForCoachSessionType(value.sessionType),
      startsAt: value.startsAt,
      endsAt: value.endsAt,
      facilityId: value.facilityId,
      facilityName: facility?.name ?? dashboardEditingSession.facilityName ?? data.defaultFacilityName ?? null,
      groupIds: value.groupIds,
      sessionType: value.sessionType,
    };
    setIsSavingDashboardEdit(true);
    setDashboardSession((current) => current?.id === dashboardEditingSession.id ? nextSession : current);
    try {
      if (onSessionTimeChange) await onSessionTimeChange(dashboardEditingSession.id, value.startsAt, value.endsAt);
      if (onSessionFacilityChange && value.facilityId !== (dashboardEditingSession.facilityId ?? data.defaultFacilityId ?? '')) await onSessionFacilityChange(dashboardEditingSession.id, value.facilityId);
      if (onSessionGroupsChange && JSON.stringify(dashboardEditingSession.groupIds ?? []) !== JSON.stringify(value.groupIds)) await onSessionGroupsChange(dashboardEditingSession.id, value.groupIds);
      if (onSessionTypeChange && normalizeCoachSessionType(dashboardEditingSession.sessionType) !== normalizeCoachSessionType(value.sessionType)) await onSessionTypeChange(dashboardEditingSession.id, value.sessionType);
      setDashboardEditingSession(null);
    } catch (error) {
      setDashboardSession(previousSession);
      throw error;
    } finally {
      setIsSavingDashboardEdit(false);
    }
  }

  async function confirmDashboardDeleteSession() {
    if (!dashboardDeleteTargetId || !onSessionDelete) return;
    setIsDeletingDashboardSession(true);
    try {
      await onSessionDelete(dashboardDeleteTargetId);
      setDashboardSession((current) => current?.id === dashboardDeleteTargetId ? null : current);
      setDashboardEditingSession(null);
      setDashboardDeleteTargetId(null);
    } finally {
      setIsDeletingDashboardSession(false);
    }
  }

  async function handleAddGroup() {
    const name = newGroupName.trim();
    if (!name || !onAddGroup) return;
    await onAddGroup(name);
    setNewGroupName('');
  }

  return (
    <div className="space-y-4">
      {/* Sections of this team. Scrolls sideways on narrow phones instead of wrapping. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div role="tablist" aria-label="Team sections" className="flex w-max gap-1 rounded-2xl border border-slate-800 bg-slate-950/70 p-1">
          {sections.map((section) => (
            <button
              key={section}
              type="button"
              role="tab"
              aria-selected={activeSection === section}
              onClick={() => setActiveSection(section)}
              className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-black transition ${activeSection === section ? 'bg-sky-300 text-slate-950' : 'text-slate-300 hover:bg-slate-900 hover:text-white'}`}
            >
              {sectionLabel(section)}
              {section === 'players' ? <span className={`ml-1.5 text-xs ${activeSection === section ? 'text-slate-800' : 'text-slate-500'}`}>{data.playerCount}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {activeSection === 'dashboard' ? (
        <div className={`grid grid-cols-[minmax(0,1fr)] gap-4 ${setupActions.length > 0 ? 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]' : ''}`}>
          <div className="min-w-0 space-y-4">
            <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-black">Next session</h2>
                <Link href={data.calendarHref} className="text-xs font-black text-sky-300 hover:text-sky-200">Team calendar ›</Link>
              </div>
              {nextSession ? (
                <TeamDashboardSessionCard session={coachSessionFor(nextSession)} attendanceShared={data.attendanceShared !== false} onOpen={() => setDashboardSession(nextSession)} />
              ) : (
                <div className="mt-4"><EmptyCard title="No upcoming session" description="Plan the next one in the team calendar." /></div>
              )}
            </section>

            {upcomingSessions.length > 0 ? (
              <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5">
                <h2 className="text-lg font-black">After that</h2>
                <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">
                  {upcomingSessions.map((session) => (
                    <li key={session.id}>
                      <button type="button" onClick={() => setDashboardSession(session)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 px-3 py-2.5 text-left transition hover:border-sky-300/50">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-white">{session.title}</span>
                          <span className="block truncate text-xs font-bold text-slate-400">{formatSessionTime(session.startsAt, session.endsAt)}{session.facilityName ? ` · ${session.facilityName}` : ''}</span>
                        </span>
                        <span aria-hidden className="text-slate-500">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {setupActions.length > 0 ? (
            <section className="rounded-3xl border border-amber-500/30 bg-amber-950/10 p-4 sm:p-5">
              <h2 className="text-lg font-black text-amber-100">Still to set up</h2>
              <div className="mt-3 grid gap-2">
                {setupActions.map((item) => {
                  const className = 'rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-left text-sm font-bold text-amber-100 transition hover:border-amber-300/60';
                  if (item.action === 'settings') return <button key={item.id} type="button" onClick={() => setActiveSection('settings')} className={className}>{item.label}</button>;
                  if (item.action === 'players') return <button key={item.id} type="button" onClick={() => setActiveSection('settings')} className={className}>{item.label}</button>;
                  return <div key={item.id} className={className}>{item.label}</div>;
                })}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {activeSection === 'players' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black">{plural(data.playerCount, 'player')}</h2>
            {players.length > 1 && data.loadTracked !== false ? (
              <div className="flex rounded-full border border-slate-800 bg-slate-950/80 p-1">
                <button type="button" onClick={() => setPlayerSort('risk')} className={`rounded-full px-3 py-1.5 text-xs font-black ${playerSort === 'risk' ? 'bg-emerald-300 text-slate-950' : 'text-slate-400'}`}>Needs attention</button>
                <button type="button" onClick={() => setPlayerSort('az')} className={`rounded-full px-3 py-1.5 text-xs font-black ${playerSort === 'az' ? 'bg-emerald-300 text-slate-950' : 'text-slate-400'}`}>A–Z</button>
              </div>
            ) : null}
          </div>
          {players.length === 0 ? (
            <div className="mt-4"><EmptyCard title="No players yet" description="Players join with the team's join code (Staff & settings)." /></div>
          ) : (
            <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {sortedPlayers.map((player) => {
                const summary = playerLoadSummary(player);
                const attendanceFlags = player.attendanceEvents?.filter((event) => event.status === 'out' || event.status === 'late').length ?? 0;
                const groupNames = (player.groups ?? []).map((id) => groupNameById.get(id) ?? id);
                return (
                  <button key={player.id} type="button" onClick={() => setActivePlayer(player)} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-left transition hover:border-emerald-300/55 hover:bg-slate-900">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-black text-white">{player.name}</p>
                      {data.loadTracked !== false && summary.access !== 'none' && summary.acwr !== null ? <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-black ${acwrToneClass(summary.zone.tone)}`}>ACWR {summary.acwr.toFixed(2)}</span> : null}
                    </div>
                    {groupNames.length > 0 ? <p className="mt-1 truncate text-xs font-bold text-slate-500">{groupNames.join(' · ')}</p> : null}
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs font-bold text-slate-400">
                      <span>{data.loadTracked === false ? '' : acwrDisplayLabel(summary)}</span>
                      {player.attendanceShared !== false ? <span>{attendanceFlags > 0 ? `${attendanceFlags}× out or late` : 'Always there'}</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {activeSection === 'groups' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-black">Groups</h2>
              <p className="mt-0.5 text-sm text-slate-400">Plan sessions for part of the team, e.g. rehab or starters.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(onAddGroup || onRemoveGroup || onTogglePlayerGroup) ? (
                <button
                  type="button"
                  onClick={() => setIsGroupEditMode((current) => !current)}
                  className={`rounded-xl border px-4 py-2 text-xs font-black transition ${isGroupEditMode ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-200 hover:bg-slate-900'}`}
                >
                  {isGroupEditMode ? 'Done' : 'Edit groups'}
                </button>
              ) : null}
            </div>
          </div>
          {isGroupEditMode && onAddGroup ? (
            <div className="mt-4 flex w-full max-w-md gap-2">
              <input
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="e.g. Starting Five"
                className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm font-bold text-slate-100 outline-none focus:border-sky-300"
              />
              <button type="button" onClick={handleAddGroup} className="rounded-xl border border-sky-500/50 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/35">
                Add
              </button>
            </div>
          ) : null}
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.groups.map((group) => {
              const groupPlayers = players.filter((player) => group.playerIds?.includes(player.id) || player.groups?.includes(group.id) || player.groups?.includes(group.name));
              const loadFlags = groupPlayers.map(loadRiskLine).filter(Boolean) as { id: string; name: string; status: 'high' | 'low'; detail: string | null }[];
              return (
              <article
                key={group.id}
                onClick={!isGroupEditMode ? () => setActiveGroupId(group.id) : undefined}
                className={`rounded-2xl border border-slate-800 bg-slate-900/50 p-4 transition ${!isGroupEditMode ? 'cursor-pointer hover:border-emerald-300/50 hover:bg-slate-900' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{group.name}</p>
                    <p className="mt-1 text-xs font-black text-slate-500">{plural(group.playerCount, 'player')} · {plural(loadFlags.length, 'load flag', 'load flags', 'no load flags')}</p>
                  </div>
                  {isGroupEditMode && onRemoveGroup ? (
                    <button type="button" onClick={() => onRemoveGroup(group.id)} className="rounded-lg border border-red-500/40 px-2 py-1 text-[10px] font-black text-red-100 hover:bg-red-950/30">
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 space-y-2 text-xs font-bold">
                  {loadFlags.slice(0, 3).map((flag) => (
                    <p key={flag.id} className={flag.status === 'high' ? 'text-rose-200' : 'text-sky-200'}>{flag.status === 'high' ? 'High load' : 'Low load'} · {flag.name}{flag.detail ? ` · ${flag.detail}` : ''}</p>
                  ))}
                  {!loadFlags.length ? <p className="text-slate-400">{isGroupEditMode ? 'Select team members for this group.' : 'Tap for details.'}</p> : null}
                </div>
                {groupPlayers.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {groupPlayers.slice(0, 6).map((player) => (
                      <span key={player.id} className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-bold text-slate-300">{player.name}</span>
                    ))}
                    {groupPlayers.length > 6 ? <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-bold text-slate-500">+{groupPlayers.length - 6}</span> : null}
                  </div>
                ) : null}
                {isGroupEditMode && players.length > 0 && onTogglePlayerGroup ? (
                  <div className="mt-4 border-t border-slate-800 pt-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Members</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {players.map((player) => {
                        const selected = Boolean(group.playerIds?.includes(player.id) || player.groups?.includes(group.id) || player.groups?.includes(group.name));
                        return (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => onTogglePlayerGroup(group.id, player.id)}
                            className={`rounded-full border px-2 py-1 text-[11px] font-bold transition ${selected ? 'border-emerald-400/60 bg-emerald-950/30 text-emerald-100' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
                          >
                            {player.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </article>
              );
            })}
            {data.groups.length === 0 ? <EmptyCard title="No groups yet" /> : null}
          </div>
        </section>
      ) : null}

      {activeGroup ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center">
          <section className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Group insight</p>
                <h3 className="mt-2 text-2xl font-black text-white">{activeGroup.name}</h3>
              </div>
              <button type="button" onClick={() => setActiveGroupId(null)} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-black text-slate-200 hover:bg-slate-900">Close</button>
            </div>
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Load flags</p>
                <div className="mt-3 space-y-2">
                  {activeGroupLoadFlags.length === 0 ? <p className="text-sm font-bold text-slate-500">No current load flags.</p> : null}
                  {activeGroupLoadFlags.map((flag) => (
                    <p key={flag.id} className={`text-sm font-bold ${flag.status === 'high' ? 'text-rose-200' : 'text-sky-200'}`}>{flag.name} · {flag.status === 'high' ? 'High' : 'Low'}{flag.detail ? ` · ${flag.detail}` : ''}</p>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
              <p className="text-sm font-black text-slate-100">Players</p>
              {activeGroupPlayers.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {activeGroupPlayers.map((player) => (
                    <span key={player.id} className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-bold text-slate-300">{player.name}</span>
                  ))}
                </div>
              ) : <p className="mt-2 text-sm font-bold text-slate-500">No players in this group yet.</p>}
            </div>
          </section>
        </div>
      ) : null}

      {activeSection === 'settings' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <h2 className="text-lg font-black">Staff & settings</h2>
          <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3">
            <div
              className="max-w-sm rounded-2xl border border-slate-800 bg-slate-950/70 p-3"
              style={selectedFacilityAccent ? { borderColor: selectedFacilityAccent.hex, backgroundColor: selectedFacilityAccent.softHex } : undefined}
            >
              <p className="text-sm font-black text-slate-100">Default hall</p>
              {data.availableFacilities && data.availableFacilities.length > 0 ? (
                <select
                  value={data.defaultFacilityId ?? ''}
                  onChange={(event) => handleDefaultFacilityChange(event.target.value)}
                  disabled={!onDefaultFacilityChange || isSavingDefault}
                  className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs font-black text-slate-100 outline-none focus:border-sky-300 disabled:opacity-60"
                  style={selectedFacilityAccent ? { borderColor: selectedFacilityAccent.hex, color: selectedFacilityAccent.textHex } : undefined}
                >
                  <option value="">No default hall</option>
                  {data.availableFacilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
                </select>
              ) : (
                <p className="mt-1 text-sm text-slate-400">Assign a hall to this department before setting a team default.</p>
              )}
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-sm font-black text-slate-100">Staff roles</p>
              <div className="mt-4">
                {staffPanel ?? <StaffRoleGrid roles={staffRoles} />}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {dashboardSession ? (() => {
        const dashboardCoachSession = coachSessionFor(dashboardSession);
        return (
          <CoachSessionDetailOverlay
            session={dashboardCoachSession}
            calendarHref={null}
            groups={coachEditorGroups.map((group) => ({ id: group.id, name: group.name, playerCount: group.playerCount }))}
            selectedGroupIds={dashboardSession.groupIds ?? []}
            facilityOptions={data.availableFacilities ?? []}
            canEditFacility={data.role !== 'viewer' && Boolean(onSessionFacilityChange)}
            isSavingFacility={isSavingDashboardSessionFacility}
            onFacilityChange={handleDashboardSessionFacilityChange}
            onEdit={data.role !== 'viewer' && (onSessionTimeChange || onSessionFacilityChange || onSessionGroupsChange || onSessionTypeChange) ? () => setDashboardEditingSession(dashboardSession) : undefined}
            onDelete={data.role !== 'viewer' && onSessionDelete ? () => setDashboardDeleteTargetId(dashboardSession.id) : undefined}
            extraActions={<Link href={data.calendarHref} className="rounded-xl border border-sky-500/55 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/40">Open calendar</Link>}
            onClose={() => setDashboardSession(null)}
          />
        );
      })() : null}

      {dashboardEditingSession ? (
        <CoachSessionEditSheet
          key={`dashboard-session-${dashboardEditingSession.id}-${dashboardEditingSession.startsAt}`}
          title={dashboardEditingSession.title}
          teams={coachEditorTeams}
          facilities={coachEditorFacilities}
          groups={coachEditorGroups}
          initial={{
            startsAt: dashboardEditingSession.startsAt,
            endsAt: dashboardEditingSession.endsAt ?? addMinutes(new Date(dashboardEditingSession.startsAt), 90).toISOString(),
            teamId: data.id,
            facilityId: dashboardEditingSession.facilityId ?? data.defaultFacilityId ?? data.availableFacilities?.[0]?.id ?? null,
            groupIds: dashboardEditingSession.groupIds ?? [],
            sessionType: normalizeCoachSessionType(dashboardEditingSession.sessionType),
          }}
          allowTeamChange={false}
          isSaving={isSavingDashboardEdit}
          onSave={handleDashboardSessionEditSave}
          onDelete={onSessionDelete ? () => setDashboardDeleteTargetId(dashboardEditingSession.id) : undefined}
          onClose={() => setDashboardEditingSession(null)}
        />
      ) : null}

      <AppConfirmDialog
        isOpen={Boolean(dashboardDeleteTargetId)}
        title="Delete session?"
        description="This removes the session from the team calendar and the affected athlete calendars."
        confirmLabel="Delete session"
        cancelLabel="Keep session"
        tone="danger"
        isConfirming={isDeletingDashboardSession}
        onConfirm={() => { void confirmDashboardDeleteSession(); }}
        onCancel={() => setDashboardDeleteTargetId(null)}
      />

      {activePlayer ? (
        <PlayerLoadDetail
          player={activePlayer}
          teamName={data.name}
          loadTracked={data.loadTracked !== false}
          onClose={() => setActivePlayer(null)}
          footer={onRemovePlayer ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold text-slate-500">Joined the wrong team, or left the club?</p>
              <button type="button" onClick={() => setRemovePlayerTarget(activePlayer)} className="rounded-xl border border-red-500/50 px-3 py-2 text-xs font-black text-red-100 hover:bg-red-950/35">
                Remove from team
              </button>
            </div>
          ) : undefined}
        />
      ) : null}

      <AppConfirmDialog
        isOpen={Boolean(removePlayerTarget)}
        title={removePlayerTarget ? `Remove ${removePlayerTarget.name} from ${data.name}?` : 'Remove player?'}
        description="They leave the team and its groups and no longer see its sessions. Their past reports and load stay. They can rejoin with the join code until you replace it (Staff & settings)."
        confirmLabel="Remove from team"
        cancelLabel="Keep"
        tone="danger"
        isConfirming={isRemovingPlayer}
        onConfirm={async () => {
          if (!removePlayerTarget || !onRemovePlayer) return;
          setIsRemovingPlayer(true);
          try {
            await onRemovePlayer(removePlayerTarget.id);
            setRemovePlayerTarget(null);
            setActivePlayer(null);
          } finally {
            setIsRemovingPlayer(false);
          }
        }}
        onCancel={() => setRemovePlayerTarget(null)}
      />
    </div>
  );
}
