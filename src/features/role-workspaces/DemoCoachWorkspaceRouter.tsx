'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DemoTeamWorkspace, buildDemoPlayers } from '@/features/teams/DemoTeamWorkspace';
import type { TeamWorkspaceSection } from '@/features/teams/TeamWorkspaceView';
import { SessionDetailSheet } from '@/features/sessions/SessionDetailSheet';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { CoachDrawer } from '@/features/role-workspaces/CoachDrawer';
import { CoachCalendarSurface, type CoachFacility, type CoachGroup, type CoachSession, type CoachSessionCreateInput, type CoachSessionMutation, type CoachTeam } from '@/features/role-workspaces/CoachWorkspaceRouter';
import { getDemoClubSetup, getDemoSessions, getDemoTeams, saveDemoSessions, type DemoClubSetup, type DemoSession, type DemoTeam } from '@/shared/dev/demoStorage';

export type CoachMode = 'today' | 'team' | 'sessions' | 'attendance' | 'load' | 'history' | 'facilities';
type DemoAvailabilityMark = { status: 'expected' | 'late' | 'out'; reason: string | null; lateMinutes: number | null };

type DemoCoachSession = {
  id: string;
  title: string;
  sessionType: string;
  startsAt: string;
  endsAt: string | null;
  teamId: string;
  teamName: string;
  departmentName: string;
  facilityName: string | null;
  groupIds: string[];
  availability: { id: string; playerId?: string; playerName: string; status: 'late' | 'out'; reason: string | null; lateMinutes: number | null }[];
  players: { id: string; name: string; risk: 'high' | 'low' | 'ready'; acwr: number }[];
};

const DEMO_AVAILABILITY_KEY = 'club-app.demo.athlete-availability';
const DEMO_COACH_TEAM_IDS = new Set(['basketball-u14-boys', 'basketball-u16-boys']);

function sectionForMode(mode: CoachMode): TeamWorkspaceSection {
  if (mode === 'sessions') return 'calendar';
  if (mode === 'load' || mode === 'attendance') return 'players';
  return 'dashboard';
}

function titleForMode(mode: CoachMode) {
  if (mode === 'sessions') return 'Calendar';
  if (mode === 'facilities') return 'Facilities';
  if (mode === 'history') return 'History';
  if (mode === 'attendance') return 'Attendance';
  if (mode === 'load') return 'Player load';
  if (mode === 'team') return 'Teams';
  return 'Today';
}

function labelForDemoSessionType(value: string) {
  if (value === 'game') return 'Game';
  if (value === 'strength') return 'Strength';
  if (value === 'individual') return 'Individual';
  if (value === 'recovery') return 'Recovery';
  return 'Team training';
}

function formatTimeRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 60 * 60_000);
  return `${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(start)} - ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(end)}`;
}

function formatNextSession(session: DemoCoachSession | undefined) {
  if (!session) return 'No planned session yet';
  const date = new Date(session.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
  return `${date} · ${formatTimeRange(session.startsAt, session.endsAt)}`;
}

function DemoCoachTopNav({ mode, singleTeamId }: { mode: CoachMode; singleTeamId?: string | null }) {
  const modes: CoachMode[] = ['today', 'sessions', 'team', 'facilities', 'history'];
  return (
    <nav className="mt-5 flex flex-wrap gap-2">
      {modes.map((item) => {
        const href = item === 'team' && singleTeamId ? `/demo/coach/team?teamId=${encodeURIComponent(singleTeamId)}` : `/demo/coach/${item}`;
        return <Link key={item} href={href} className={`rounded-full border px-4 py-2 text-xs font-black ${mode === item ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-200'}`}>{titleForMode(item)}</Link>;
      })}
    </nav>
  );
}

const DEMO_FACILITY_ASSIGNMENTS_KEY = 'club-app.demo.facility-assignments';
const DEMO_PLAYER_GROUPS_KEY = 'club-app.demo.player-groups';
const DEMO_PLAYERS_KEY = 'club-app.demo.players';
type DemoFacilityAssignment = { department: string; facility: string };
type DemoPlayerGroup = { id: string; teamId: string; name: string };
type DemoPlayer = { id: string; teamId: string; name: string; groups?: string[] };

function getDemoFacilityAssignments(): DemoFacilityAssignment[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(window.localStorage.getItem(DEMO_FACILITY_ASSIGNMENTS_KEY) ?? '[]') as DemoFacilityAssignment[]; } catch { return []; }
}

function getDemoPlayerGroups(): DemoPlayerGroup[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(window.localStorage.getItem(DEMO_PLAYER_GROUPS_KEY) ?? '[]') as DemoPlayerGroup[]; } catch { return []; }
}

function saveDemoPlayerGroups(groups: DemoPlayerGroup[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_PLAYER_GROUPS_KEY, JSON.stringify(groups));
}

function getDemoPlayers(): DemoPlayer[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(window.localStorage.getItem(DEMO_PLAYERS_KEY) ?? '[]') as DemoPlayer[]; } catch { return []; }
}

function saveDemoPlayers(players: DemoPlayer[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_PLAYERS_KEY, JSON.stringify(players));
}

function ensureDemoPlayers(teams: DemoTeam[]) {
  const existing = getDemoPlayers();
  const teamIds = new Set(existing.map((player) => player.teamId));
  const missingTeams = teams.filter((team) => !teamIds.has(team.id));
  if (missingTeams.length === 0) return existing;
  // Demo seed is non-destructive: existing team players are preserved until the demo is reset.
  const merged = [...existing, ...missingTeams.flatMap((team) => buildDemoPlayers(team.id))];
  saveDemoPlayers(merged);
  return merged;
}

function ensureDemoPlayerGroups(teams: DemoTeam[]) {
  const existing = getDemoPlayerGroups();
  const existingKeys = new Set(existing.map((group) => `${group.teamId}:${group.id}`));
  const defaults = teams.flatMap((team) => [
    { id: 'starting-five', teamId: team.id, name: 'Starting Five' },
    { id: 'bench-unit', teamId: team.id, name: 'Bench unit' },
    { id: 'rehab', teamId: team.id, name: 'Rehab' },
  ]);
  const merged = [...existing, ...defaults.filter((group) => !existingKeys.has(`${group.teamId}:${group.id}`))];
  if (merged.length !== existing.length) saveDemoPlayerGroups(merged);
  return merged;
}

function sameLocalDay(value: string, day: Date) {
  const date = new Date(value);
  return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
}

function isoAt(offsetDays: number, hour: number, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function readDemoAvailability() {
  if (typeof window === 'undefined') return new Map<string, DemoAvailabilityMark>();
  try {
    const raw = window.localStorage.getItem(DEMO_AVAILABILITY_KEY);
    if (!raw) return new Map<string, DemoAvailabilityMark>();
    return new Map(Object.entries(JSON.parse(raw) as Record<string, DemoAvailabilityMark>));
  } catch {
    return new Map<string, DemoAvailabilityMark>();
  }
}

function fallbackSessions(teams: DemoTeam[]) {
  const preferred = teams.filter((team) => team.department === 'Basketball').slice(0, 2);
  return preferred.map((team, index) => ({
    id: `demo-coach-session-${team.id}`,
    department: team.department,
    team: team.name,
    title: index === 0 ? 'Team Training' : 'Shooting Session',
    sessionType: 'training',
    startsAt: isoAt(0, index === 0 ? 18 : 19, index === 0 ? 0 : 30),
    endsAt: isoAt(0, index === 0 ? 19 : 21, index === 0 ? 30 : 0),
    facility: team.defaultFacility ?? 'Main Hall',
    groupIds: [],
    createdAt: new Date().toISOString(),
  } satisfies DemoSession));
}

function buildCoachSessions(teams: DemoTeam[], storedSessions: DemoSession[]) {
  const availability = readDemoAvailability();
  const sessions = storedSessions.length > 0 ? storedSessions : fallbackSessions(teams);
  const teamByName = new Map(teams.map((team) => [`${team.department}:${team.name}`, team]));
  return sessions
    .map((session) => {
      const team = teamByName.get(`${session.department}:${session.team}`);
      if (!team) return null;
      const isPrimaryDemoTeam = team.id === 'basketball-u14-boys';
      const mark = availability.get(session.id);
      const fallbackFlags = mark ? [] : isPrimaryDemoTeam ? [
        { id: `${session.id}-late`, playerId: 'noah-keller', playerName: 'Noah Keller', status: 'late' as const, reason: 'Traffic', lateMinutes: 15 },
        { id: `${session.id}-out`, playerId: 'elias-wagner', playerName: 'Elias Wagner', status: 'out' as const, reason: 'School', lateMinutes: null },
      ] : [];
      return {
        id: session.id,
        title: session.title,
        sessionType: session.sessionType ?? 'training',
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        teamId: team.id,
        teamName: team.name,
        departmentName: team.department,
        facilityName: session.facility,
        groupIds: session.groupIds ?? [],
        availability: mark && (mark.status === 'late' || mark.status === 'out') ? [{ id: `${session.id}-demo-athlete`, playerId: 'demo-athlete', playerName: 'Demo Athlete', status: mark.status, reason: mark.reason, lateMinutes: mark.lateMinutes }] : fallbackFlags,
        players: isPrimaryDemoTeam
          ? [
              { id: 'noah-keller', name: 'Noah Keller', risk: 'high', acwr: 1.41 },
              { id: 'elias-wagner', name: 'Elias Wagner', risk: 'ready', acwr: 1.05 },
              { id: 'leo-bauer', name: 'Leo Bauer', risk: 'low', acwr: 0.74 },
            ]
          : [
              { id: 'mika-schulz', name: 'Mika Schulz', risk: 'ready', acwr: 1.11 },
              { id: 'jonas-meyer', name: 'Jonas Meyer', risk: 'high', acwr: 1.34 },
            ],
      } satisfies DemoCoachSession;
    })
    .filter(Boolean) as DemoCoachSession[];
}

function DemoSessionCard({ session, onDetails }: { session: DemoCoachSession; onDetails: () => void }) {
  const out = session.availability.filter((item) => item.status === 'out');
  const late = session.availability.filter((item) => item.status === 'late');
  const loadFlags = session.players.filter((player) => player.risk === 'high' || player.risk === 'low');
  return (
    <button type="button" onClick={onDetails} className="block w-full rounded-3xl border border-slate-800 bg-slate-950/72 p-4 text-left text-white shadow-[0_18px_70px_rgba(0,0,0,0.22)] transition hover:border-emerald-300/45 hover:bg-slate-900/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{session.departmentName} · {session.teamName}</p>
          <h3 className="mt-2 text-xl font-black">{session.title}</h3>
          <p className="mt-1 text-sm font-bold text-slate-400">{formatTimeRange(session.startsAt, session.endsAt)}{session.facilityName ? ` · ${session.facilityName}` : ''}</p>
        </div>
        <span className="text-lg font-black text-slate-500">›</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className={`rounded-2xl border p-3 ${out.length > 0 ? 'border-rose-400/35 bg-rose-400/10' : 'border-slate-800 bg-slate-950/60'}`}><div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Out</p><span className="text-lg font-black">{out.length}</span></div>{out.map((item) => <p key={item.id} className="mt-2 text-xs font-bold text-slate-300">{item.playerName}{item.reason ? ` · ${item.reason}` : ''}</p>)}</div>
        <div className={`rounded-2xl border p-3 ${late.length > 0 ? 'border-amber-400/35 bg-amber-400/10' : 'border-slate-800 bg-slate-950/60'}`}><div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Late</p><span className="text-lg font-black">{late.length}</span></div>{late.map((item) => <p key={item.id} className="mt-2 text-xs font-bold text-slate-300">{item.playerName}{item.lateMinutes ? ` · ${item.lateMinutes}m` : ''}{item.reason ? ` · ${item.reason}` : ''}</p>)}</div>
      </div>
      {loadFlags.length > 0 ? <div className="mt-3 flex flex-wrap gap-1.5">{loadFlags.map((player) => <span key={player.id} className={`rounded-full border px-2 py-1 text-[11px] font-black ${player.risk === 'high' ? 'border-rose-400/40 text-rose-100' : 'border-sky-400/40 text-sky-100'}`}>{player.name} · {player.acwr.toFixed(2)} ACWR</span>)}</div> : null}
    </button>
  );
}

export function DemoCoachWorkspaceRouter({ mode }: { mode: CoachMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTeamId = searchParams.get('teamId');
  const editSessionId = searchParams.get('editSessionId');
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [teams, setTeams] = useState<DemoTeam[]>([]);
  const [sessions, setSessions] = useState<DemoCoachSession[]>([]);
  const [rawSessions, setRawSessions] = useState<DemoSession[]>([]);
  const [facilities, setFacilities] = useState<CoachFacility[]>([]);
  const [groups, setGroups] = useState<CoachGroup[]>([]);
  const [activeSession, setActiveSession] = useState<DemoCoachSession | null>(null);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const clearEditSessionParam = useCallback(() => {
    router.replace('/demo/coach/sessions');
  }, [router]);

  useEffect(() => {
    const currentSetup = getDemoClubSetup();
    const currentTeams = getDemoTeams(currentSetup).filter((team) => DEMO_COACH_TEAM_IDS.has(team.id));
    const currentSessions = getDemoSessions();
    const assignments = getDemoFacilityAssignments();
    const playerGroups = ensureDemoPlayerGroups(currentTeams);
    const demoPlayers = ensureDemoPlayers(currentTeams);
    const facilityNames = currentSetup?.facilities ?? [];
    const effectiveSessions = currentSessions.length > 0 ? currentSessions : fallbackSessions(currentTeams);
    const demoDepartments = Array.from(new Set(currentTeams.map((team) => team.department)));
    const effectiveAssignments = assignments.length > 0
      ? assignments
      : facilityNames.flatMap((facility) => demoDepartments.map((department) => ({ facility, department })));
    setSetup(currentSetup);
    setTeams(currentTeams);
    setRawSessions(effectiveSessions);
    setSessions(buildCoachSessions(currentTeams, effectiveSessions));
    setFacilities(facilityNames.map((name) => ({ id: name, name, departmentIds: effectiveAssignments.filter((item) => item.facility === name).map((item) => item.department) })));
    setGroups(playerGroups.filter((group) => currentTeams.some((team) => team.id === group.teamId)).map((group) => ({
      id: group.id,
      teamId: group.teamId,
      name: group.name,
      playerCount: demoPlayers.filter((player) => player.teamId === group.teamId && player.groups?.includes(group.id)).length,
    })));
  }, []);

  const selectedTeam = selectedTeamId ? teams.find((team) => team.id === selectedTeamId) ?? null : null;
  const singleTeam = teams.length === 1 ? teams[0] : null;
  const initialSection = useMemo(() => sectionForMode(mode), [mode]);
  const today = useMemo(() => new Date(), []);
  const todaySessions = sessions.filter((session) => sameLocalDay(session.startsAt, today));
  const upcomingSessions = sessions.filter((session) => new Date(session.startsAt).getTime() >= Date.now() && !sameLocalDay(session.startsAt, today)).slice(0, 4);
  const nextSessionByTeamId = useMemo(() => {
    const map = new Map<string, DemoCoachSession>();
    const upcoming = [...sessions]
      .filter((session) => new Date(session.startsAt).getTime() >= Date.now())
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    for (const session of upcoming) {
      if (!map.has(session.teamId)) map.set(session.teamId, session);
    }
    return map;
  }, [sessions]);

  const coachTeams = useMemo<CoachTeam[]>(() => teams.map((team) => ({ id: team.id, clubId: 'demo-club', name: team.name, departmentId: team.department, departmentName: team.department, defaultFacilityId: team.defaultFacility, role: 'coach' })), [teams]);
  const coachSessions = useMemo<CoachSession[]>(() => sessions.map((session) => ({
    ...session,
    sessionType: session.sessionType,
    facilityId: session.facilityName,
    groupIds: session.groupIds,
    availability: session.availability.map((item) => ({ ...item, userId: item.playerId ?? item.playerName })),
    players: session.players.map((player) => ({ ...player, loadEntries: [] })),
  })), [sessions]);

  function refreshDemoSessions(nextRaw: DemoSession[]) {
    saveDemoSessions(nextRaw);
    setRawSessions(nextRaw);
    setSessions(buildCoachSessions(teams, nextRaw));
  }

  async function handleDemoCreateSession(input: CoachSessionCreateInput) {
    const team = teams.find((item) => item.id === input.teamId);
    if (!team) return;
    refreshDemoSessions([...rawSessions, { id: `demo-session-${Date.now()}`, department: team.department, team: team.name, title: labelForDemoSessionType(input.sessionType), sessionType: input.sessionType, startsAt: input.startsAt, endsAt: input.endsAt, facility: input.facilityId, groupIds: input.groupIds, createdAt: new Date().toISOString() }]);
  }

  async function handleDemoUpdateSession(input: CoachSessionMutation) {
    refreshDemoSessions(rawSessions.map((session) => session.id === input.sessionId ? { ...session, title: labelForDemoSessionType(input.sessionType), sessionType: input.sessionType, startsAt: input.startsAt, endsAt: input.endsAt, facility: input.facilityId, groupIds: input.groupIds } : session));
  }

  async function handleDemoDeleteSession(sessionId: string) {
    refreshDemoSessions(rawSessions.filter((session) => session.id !== sessionId));
    setActiveSession(null);
    setDeleteSessionId(null);
  }

  const historySessions = useMemo(() => coachSessions.filter((session) => new Date(session.startsAt).getTime() < Date.now()).sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()), [coachSessions]);

  const shouldOpenTeamWorkspace = mode === 'team' || mode === 'attendance' || mode === 'load';
  if (selectedTeam && shouldOpenTeamWorkspace) {
    return <DemoTeamWorkspace teamId={selectedTeam.id} backHref="/demo/coach/today" backLabel="Back to Today" initialSection={initialSection} frame="coach" role="coach" />;
  }
  if (singleTeam && shouldOpenTeamWorkspace) {
    return <DemoTeamWorkspace teamId={singleTeam.id} backHref="/demo/coach/today" backLabel="Back to Today" initialSection={initialSection} frame="coach" role="coach" />;
  }

  return (
    <main className="os-page">
      <CoachDrawer mode={mode === 'attendance' || mode === 'load' ? 'team' : mode} basePath="/demo/coach" teamId={singleTeam?.id ?? selectedTeamId} />
      <div className="os-container space-y-5">
        <section className="sticky top-0 z-30 rounded-2xl border border-slate-800 bg-slate-950/92 p-3 text-white shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur md:static md:p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Demo Coach OS</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h1 className="text-2xl font-black tracking-tight">{titleForMode(mode)}</h1>
          </div>
        </section>

        {!setup ? <section className="rounded-3xl border border-amber-500/35 bg-amber-950/20 p-5 text-amber-100">No demo club yet.</section> : null}

        {mode === 'today' ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Today</p><h2 className="mt-2 text-2xl font-black">Sessions and availability</h2></div>
              {todaySessions.length > 0 ? <span className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300">{todaySessions.length} today</span> : null}
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {todaySessions.length > 0 ? todaySessions.map((session) => <DemoSessionCard key={session.id} session={session} onDetails={() => setActiveSession(session)} />) : <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm font-bold text-slate-500">No sessions today.</div>}
            </div>
          </section>
        ) : null}

        {mode === 'today' && upcomingSessions.length > 0 ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Next</p>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {upcomingSessions.map((session) => <button key={session.id} type="button" onClick={() => setActiveSession(session)} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-left transition hover:border-sky-300/50"><p className="text-sm font-black">{session.teamName}</p><p className="mt-1 text-xs font-bold text-slate-400">{new Date(session.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })} · {formatTimeRange(session.startsAt, session.endsAt)}</p><p className="mt-3 text-xs font-black text-slate-500">{session.availability.length} availability flags</p></button>)}
            </div>
          </section>
        ) : null}

        {mode === 'sessions' && teams.length > 0 ? (
          <CoachCalendarSurface
            teams={coachTeams}
            sessions={coachSessions}
            facilities={facilities}
            groups={groups}
            editSessionId={editSessionId}
            onEditSessionHandled={clearEditSessionParam}
            onCreateSession={handleDemoCreateSession}
            onUpdateSession={handleDemoUpdateSession}
            onDeleteSession={handleDemoDeleteSession}
            onDetails={(session) => setActiveSession(sessions.find((item) => item.id === session.id) ?? null)}
          />
        ) : null}

        {mode === 'facilities' && teams.length > 0 ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Facilities</p><h2 className="mt-2 text-2xl font-black">Department halls</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{facilities.map((facility) => {
              const facilityTeams = teams.filter((team) => facility.departmentIds.includes(team.department));
              const teamNames = facilityTeams.map((team) => team.name).join(',');
              const departmentNames = Array.from(new Set(facilityTeams.map((team) => team.department))).join(',');
              const singleTeam = facilityTeams.length === 1 ? facilityTeams[0] : null;
              return <Link key={facility.id} href={`/demo/coach/facilities/${encodeURIComponent(facility.id)}/calendar?from=coachFacilities&teamName=${encodeURIComponent(singleTeam?.name ?? '')}&departmentName=${encodeURIComponent(singleTeam?.department ?? '')}&teamNames=${encodeURIComponent(teamNames)}&departmentNames=${encodeURIComponent(departmentNames)}`} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 transition hover:border-sky-300/45"><p className="text-lg font-black text-white">{facility.name}</p></Link>;
            })}</div>
          </section>
        ) : null}

        {mode === 'history' && teams.length > 0 ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">History</p><h2 className="mt-2 text-2xl font-black">Recent sessions</h2>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">{historySessions.length > 0 ? historySessions.slice(0, 12).map((session) => <button key={session.id} type="button" onClick={() => setActiveSession(sessions.find((item) => item.id === session.id) ?? null)} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-left transition hover:border-violet-300/45"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{session.teamName} · {new Date(session.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })}</p><h3 className="mt-2 text-xl font-black text-white">{session.title}</h3><p className="mt-3 text-sm font-bold text-slate-400">Demo attendance/RPE breakdown placeholder</p></button>) : <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm font-bold text-slate-500">No completed sessions yet.</div>}</div>
          </section>
        ) : null}

        {mode === 'team' ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Teams</p><h2 className="mt-2 text-2xl font-black">Select team</h2></div></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {teams.map((team) => {
              const nextSession = nextSessionByTeamId.get(team.id);
              return (
                <Link key={team.id} href={`/demo/coach/team?teamId=${encodeURIComponent(team.id)}`} className="block rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white transition hover:border-emerald-300/50 hover:bg-slate-900/70">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{team.department}</p>
                  <h3 className="mt-2 text-2xl font-black">{team.name}</h3>
                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Next session</p>
                    <p className="mt-1 text-sm font-black text-slate-200">{nextSession ? nextSession.title : 'None planned'}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{formatNextSession(nextSession)}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
        ) : null}

        {activeSession ? (
          <SessionDetailSheet
            title={activeSession.title}
            startsAt={activeSession.startsAt}
            endsAt={activeSession.endsAt}
            teamName={activeSession.teamName}
            departmentName={activeSession.departmentName}
            facilityName={activeSession.facilityName}
            attendance={{
              expected: activeSession.players.length,
              late: activeSession.availability.filter((item) => item.status === 'late').length,
              out: activeSession.availability.filter((item) => item.status === 'out').length,
              notes: activeSession.availability.map((item) => ({
                id: item.id,
                name: item.playerName,
                status: item.status,
                detail: item.status === 'late' && item.lateMinutes ? `${item.lateMinutes} min` : item.reason,
              })),
            }}
            loadRisks={activeSession.players
              .filter((player) => player.risk === 'high' || player.risk === 'low')
              .map((player) => ({ id: player.id, name: player.name, status: player.risk as 'high' | 'low', detail: `${player.acwr.toFixed(2)} ACWR` }))}
            participants={activeSession.players.map((player) => {
              const flag = activeSession.availability.find((item) => item.playerId === player.id || item.playerName === player.name);
              return {
                id: player.id,
                name: player.name,
                status: flag?.status ?? 'expected',
                detail: flag?.status === 'late' && flag.lateMinutes ? `${flag.lateMinutes} min` : flag?.reason ?? null,
              };
            })}
            actions={<>
              <button type="button" onClick={() => { setActiveSession(null); router.push(`/demo/coach/sessions?editSessionId=${encodeURIComponent(activeSession.id)}`); }} className="rounded-xl border border-sky-500/55 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/40">Edit session</button>
              <button type="button" onClick={() => setDeleteSessionId(activeSession.id)} className="rounded-xl border border-red-500/60 px-3 py-2 text-xs font-black text-red-100 hover:bg-red-950/35">Delete session</button>
              <Link href={`/demo/coach/sessions`} className="rounded-xl border border-sky-500/55 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/40">Open calendar</Link>
            </>}
            onClose={() => setActiveSession(null)}
          />
        ) : null}

        <AppConfirmDialog isOpen={Boolean(deleteSessionId)} title="Delete session?" description="This removes the session from coach, team and athlete calendars." confirmLabel="Delete session" cancelLabel="Keep session" tone="danger" isConfirming={false} onConfirm={() => { if (deleteSessionId) void handleDemoDeleteSession(deleteSessionId); }} onCancel={() => setDeleteSessionId(null)} />
      </div>
    </main>
  );
}
