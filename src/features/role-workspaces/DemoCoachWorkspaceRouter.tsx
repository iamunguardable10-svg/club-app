'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DemoTeamWorkspace, buildDemoPlayers } from '@/features/teams/DemoTeamWorkspace';
import type { TeamWorkspaceSection } from '@/features/teams/TeamWorkspaceView';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { CoachDrawer } from '@/features/role-workspaces/CoachDrawer';
import { CoachCalendarSurface, CoachSessionEditSheet, normalizeCoachSessionType } from '@/features/role-workspaces/CoachWorkspaceRouter';
import type { CoachFacility, CoachGroup, CoachMode, CoachSession, CoachSessionCreateInput, CoachSessionMutation, CoachTeam } from '@/features/role-workspaces/CoachTypes';
import { CoachHistoryInsights, CoachSessionDetailOverlay, type CoachSessionInsight } from '@/features/role-workspaces/CoachSessionSurfaces';
import type { ConflictSession } from '@/features/calendar/sessionConflicts';
import type { SeriesTemplateInput } from '@/features/sessions/SeriesTemplateEditSheet';
import type { SeriesTemplate, SeriesWeekItem, SeriesWeekState } from '@/features/sessions/sessionSeriesPlanner';
import { getLatestACWR, loadZone } from '@/features/load/loadCalculations';
import { sessionTypeToLoadType, type AthleteLoadEntry } from '@/features/load/loadTypes';
import { getDemoClubSetup, getDemoSessionSeries, getDemoSessionSeriesWeekStates, getDemoSessions, getDemoTeams, saveDemoSessionSeries, saveDemoSessionSeriesWeekStates, saveDemoSessions, type DemoClubSetup, type DemoSession, type DemoSessionSeries, type DemoSessionSeriesWeekState, type DemoTeam } from '@/shared/dev/demoStorage';

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
  players: { id: string; name: string; risk: 'high' | 'low' | 'ready'; acwr: number | null; loadEntries?: AthleteLoadEntry[] }[];
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
  if (value === 'strength' || value === 's_and_c') return 'Strength';
  if (value === 'individual' || value === 'other') return 'Individual';
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

function demoLoadEntriesForSession(session: DemoCoachSession, player: DemoCoachSession['players'][number]): AthleteLoadEntry[] {
  if (new Date(session.startsAt).getTime() >= Date.now()) return [];
  const flag = session.availability.find((item) => item.playerId === player.id || item.playerName === player.name);
  if (flag?.status === 'out') return [];
  const trainingType = sessionTypeToLoadType(session.sessionType);
  const durationMinutes = session.endsAt ? Math.max(30, Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60_000)) : 90;
  const baseRpe = trainingType === 'game' ? 10 : trainingType === 'strength' ? 7 : 6;
  const hash = Array.from(`${player.id}:${session.id}`).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const stableDelta = (hash % 5) - 2;
  const rpe = Math.min(10, Math.max(1, baseRpe + stableDelta));
  return [{
    id: `${session.id}-${player.id}-load`,
    sessionId: session.id,
    teamId: session.teamId,
    teamName: session.teamName,
    date: session.startsAt.slice(0, 10),
    startsAt: session.startsAt,
    title: session.title,
    trainingType,
    rpe,
    durationMinutes,
    load: rpe * durationMinutes,
    note: null,
    source: 'planned_session',
  }];
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
  if (teams.length === 0) return getDemoPlayers();
  const activeTeamIds = new Set(teams.map((team) => team.id));
  const existing = getDemoPlayers();
  // Seed and prune against all demo teams, not only the coach-visible subset.
  const pruned = existing.filter((player) => activeTeamIds.has(player.teamId));
  const teamIds = new Set(pruned.map((player) => player.teamId));
  const missingTeams = teams.filter((team) => !teamIds.has(team.id));
  const merged = [...pruned, ...missingTeams.flatMap((team) => buildDemoPlayers(team.id))];
  if (merged.length !== existing.length || missingTeams.length > 0) saveDemoPlayers(merged);
  return merged;
}

function seriesTemplateToDemo(input: SeriesTemplateInput, teams: DemoTeam[], id = `demo-series-${Date.now()}`): DemoSessionSeries | null {
  const team = teams.find((item) => item.id === input.teamId);
  if (!team) return null;
  return {
    id,
    department: team.department,
    teamId: team.id,
    team: team.name,
    sessionType: input.sessionType,
    weekday: input.weekday,
    startTime: input.startTime,
    endTime: input.endTime,
    facility: input.facilityId,
    groupIds: input.groupIds,
    activeFrom: null,
    activeUntil: null,
    createdAt: new Date().toISOString(),
  };
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

function isoDateAtOffset(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(0, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

function playerSeedIndex(player: Pick<DemoPlayer, 'id'>) {
  const match = player.id.match(/demo-player-(\d+)$/);
  return match ? Number(match[1]) - 1 : Array.from(player.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 12;
}

function participantPlayersForSession(team: DemoTeam, session: DemoSession, players: DemoPlayer[]) {
  const teamPlayers = players.filter((player) => player.teamId === team.id);
  const groupIds = session.groupIds ?? [];
  if (groupIds.length === 0) return teamPlayers;
  const scoped = teamPlayers.filter((player) => groupIds.some((groupId) => player.groups?.includes(groupId)));
  return scoped.length > 0 ? scoped : teamPlayers;
}

function demoRiskForPlayer(player: DemoPlayer) {
  const index = playerSeedIndex(player);
  if (index === 0 || index === 7) return { risk: 'high' as const, acwr: 1.36 + (index % 2) * 0.08 };
  if (index === 2 || index === 10) return { risk: 'low' as const, acwr: 0.71 + (index % 2) * 0.04 };
  return { risk: 'ready' as const, acwr: 0.92 + (index % 5) * 0.07 };
}

function demoBaselineEntriesForPlayer(player: Pick<DemoPlayer, 'id'>, teamId: string, teamName: string): AthleteLoadEntry[] {
  const seed = demoRiskForPlayer({ id: player.id, teamId, name: '', groups: [] });
  const trainingTypes = ['team_training', 'strength', 'individual', 'recovery'] as const;

  return Array.from({ length: 42 }, (_, index) => {
    const offset = -42 + index;
    const recent = offset >= -7;
    const trainingType = trainingTypes[index % trainingTypes.length];
    const profile =
      seed.risk === 'high'
        ? recent
          ? { rpe: 8, durationMinutes: 95 }
          : { rpe: 4, durationMinutes: 75 }
        : seed.risk === 'low'
          ? recent
            ? { rpe: 2, durationMinutes: 50 }
            : { rpe: 7, durationMinutes: 80 }
          : recent
            ? { rpe: 6, durationMinutes: 75 + (index % 2) * 10 }
            : { rpe: 5 + (index % 2), durationMinutes: 75 };
    return {
      id: `demo-player-baseline-${player.id}-${index}`,
      sessionId: null,
      teamId,
      teamName,
      date: isoDateAtOffset(offset),
      startsAt: null,
      title: 'Demo load',
      trainingType,
      rpe: profile.rpe,
      durationMinutes: profile.durationMinutes,
      load: profile.rpe * profile.durationMinutes,
      note: null,
      source: 'manual',
    } satisfies AthleteLoadEntry;
  });
}

function demoLoadSummary(entries: AthleteLoadEntry[]) {
  const latest = getLatestACWR(entries, 'ewma');
  const zone = loadZone(latest?.acwr ?? null, latest?.chronicFull ?? false);
  return {
    acwr: latest?.acwr ?? null,
    risk: zone.tone === 'high' ? 'high' as const : zone.tone === 'low' ? 'low' as const : 'ready' as const,
  };
}

function automaticAvailabilityForSession(session: DemoSession, participants: DemoPlayer[]) {
  if (participants.length < 4) return [];
  const seed = Array.from(session.id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const outPlayer = participants[seed % participants.length];
  const latePlayer = [3, 4, 5]
    .map((offset) => participants[(seed + offset) % participants.length])
    .find((player) => player && player !== outPlayer);
  const flags = [];
  if (latePlayer && latePlayer !== outPlayer) {
    flags.push({
      id: `${session.id}-${latePlayer.id}-late`,
      playerId: latePlayer.id,
      playerName: latePlayer.name,
      status: 'late' as const,
      reason: seed % 2 === 0 ? 'Traffic' : 'School runs late',
      lateMinutes: 10 + (seed % 3) * 5,
    });
  }
  if (outPlayer && participants.length >= 5) {
    flags.push({
      id: `${session.id}-${outPlayer.id}-out`,
      playerId: outPlayer.id,
      playerName: outPlayer.name,
      status: 'out' as const,
      reason: seed % 2 === 0 ? 'School' : 'Sick',
      lateMinutes: null,
    });
  }
  return flags;
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

function buildCoachSessions(teams: DemoTeam[], storedSessions: DemoSession[], demoPlayers: DemoPlayer[]) {
  const availability = readDemoAvailability();
  const sessions = storedSessions.length > 0 ? storedSessions : fallbackSessions(teams);
  const teamByName = new Map(teams.map((team) => [`${team.department}:${team.name}`, team]));
  const builtSessions = sessions
    .map((session) => {
      const team = teamByName.get(`${session.department}:${session.team}`);
      if (!team) return null;
      const participants = participantPlayersForSession(team, session, demoPlayers);
      const mark = availability.get(session.id);
      const fallbackFlags = mark ? [] : automaticAvailabilityForSession(session, participants);
      return {
        id: session.id,
        title: session.title,
        sessionType: session.sessionType ?? 'training',
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        teamId: team.id,
        teamName: team.name,
        departmentName: team.department,
        facilityName: session.facility ?? team.defaultFacility ?? null,
        groupIds: session.groupIds ?? [],
        availability: mark && (mark.status === 'late' || mark.status === 'out') ? [{ id: `${session.id}-demo-athlete`, playerId: 'demo-athlete', playerName: 'Demo Athlete', status: mark.status, reason: mark.reason, lateMinutes: mark.lateMinutes }] : fallbackFlags,
        players: participants.map((player) => ({ id: player.id, name: player.name, risk: 'ready' as const, acwr: null })),
      } satisfies DemoCoachSession;
    })
    .filter(Boolean) as DemoCoachSession[];
  return builtSessions.map((session) => ({
    ...session,
    players: session.players.map((player) => ({
      ...player,
      ...demoLoadSummary([
        ...demoBaselineEntriesForPlayer({ id: player.id }, session.teamId, session.teamName),
        ...builtSessions.flatMap((candidate) =>
        candidate.players.some((candidatePlayer) => candidatePlayer.id === player.id)
          ? demoLoadEntriesForSession(candidate, player)
          : [],
        ),
      ]),
      loadEntries: [
        ...demoBaselineEntriesForPlayer({ id: player.id }, session.teamId, session.teamName),
        ...builtSessions.flatMap((candidate) =>
          candidate.players.some((candidatePlayer) => candidatePlayer.id === player.id)
            ? demoLoadEntriesForSession(candidate, player)
            : [],
        ),
      ].sort((a, b) => a.date.localeCompare(b.date)),
    })),
  }));
}

function DemoSessionCard({ session, onDetails }: { session: DemoCoachSession; onDetails: () => void }) {
  const out = session.availability.filter((item) => item.status === 'out');
  const late = session.availability.filter((item) => item.status === 'late');
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
  const [allDemoTeams, setAllDemoTeams] = useState<DemoTeam[]>([]);
  const [demoSessions, setDemoSessions] = useState<DemoCoachSession[]>([]);
  const [rawSessions, setRawSessions] = useState<DemoSession[]>([]);
  const [demoSeries, setDemoSeries] = useState<DemoSessionSeries[]>([]);
  const [demoSeriesWeekStates, setDemoSeriesWeekStates] = useState<DemoSessionSeriesWeekState[]>([]);
  const [facilities, setFacilities] = useState<CoachFacility[]>([]);
  const [groups, setGroups] = useState<CoachGroup[]>([]);
  const [activeSession, setActiveSession] = useState<DemoCoachSession | null>(null);
  const [activeHistoryInsight, setActiveHistoryInsight] = useState<CoachSessionInsight | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [returnToSessionId, setReturnToSessionId] = useState<string | null>(null);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [isSavingSessionEdit, setIsSavingSessionEdit] = useState(false);
  const clearEditSessionParam = useCallback(() => {
    router.replace('/demo/coach/sessions');
  }, [router]);

  function openDemoSessionDetails(session: DemoCoachSession | null, insight: CoachSessionInsight | null = null) {
    setActiveHistoryInsight(insight);
    setActiveSession(session);
  }

  function closeDemoSessionDetails() {
    setActiveHistoryInsight(null);
    setActiveSession(null);
  }

  useEffect(() => {
    const currentSetup = getDemoClubSetup();
    const allTeams = getDemoTeams(currentSetup);
    const currentTeams = allTeams.filter((team) => DEMO_COACH_TEAM_IDS.has(team.id));
    const currentSessions = getDemoSessions();
    const currentSeries = getDemoSessionSeries(allTeams).filter((series) => DEMO_COACH_TEAM_IDS.has(series.teamId));
    const currentSeriesWeekStates = getDemoSessionSeriesWeekStates();
    const assignments = getDemoFacilityAssignments();
    const playerGroups = ensureDemoPlayerGroups(currentTeams);
    const demoPlayers = ensureDemoPlayers(allTeams);
    const facilityNames = currentSetup?.facilities ?? [];
    const effectiveSessions = currentSessions.length > 0 ? currentSessions : fallbackSessions(currentTeams);
    const demoDepartments = Array.from(new Set(currentTeams.map((team) => team.department)));
    const effectiveAssignments = assignments.length > 0
      ? assignments
      : facilityNames.flatMap((facility) => demoDepartments.map((department) => ({ facility, department })));
    setSetup(currentSetup);
    setAllDemoTeams(allTeams);
    setTeams(currentTeams);
    setRawSessions(effectiveSessions);
    setDemoSeries(currentSeries);
    setDemoSeriesWeekStates(currentSeriesWeekStates);
    setDemoSessions(buildCoachSessions(currentTeams, effectiveSessions, demoPlayers));
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
  const todaySessions = demoSessions.filter((session) => sameLocalDay(session.startsAt, today));
  const upcomingSessions = demoSessions.filter((session) => new Date(session.startsAt).getTime() >= Date.now() && !sameLocalDay(session.startsAt, today)).slice(0, 4);
  const nextSessionByTeamId = useMemo(() => {
    const map = new Map<string, DemoCoachSession>();
    const upcoming = [...demoSessions]
      .filter((session) => new Date(session.startsAt).getTime() >= Date.now())
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    for (const session of upcoming) {
      if (!map.has(session.teamId)) map.set(session.teamId, session);
    }
    return map;
  }, [demoSessions]);

  const coachTeams = useMemo<CoachTeam[]>(() => teams.map((team) => ({ id: team.id, clubId: 'demo-club', name: team.name, departmentId: team.department, departmentName: team.department, defaultFacilityId: team.defaultFacility, role: 'coach' })), [teams]);
  const coachSeries = useMemo<SeriesTemplate[]>(() => demoSeries.map((series) => ({
    id: series.id,
    department: series.department,
    teamId: series.teamId,
    teamName: series.team,
    team: series.team,
    sessionType: series.sessionType,
    weekday: series.weekday,
    startTime: series.startTime,
    endTime: series.endTime,
    facilityId: series.facility,
    facilityName: series.facility,
    facility: series.facility,
    groupIds: series.groupIds ?? [],
    activeFrom: series.activeFrom,
    activeUntil: series.activeUntil,
  })), [demoSeries]);
  const coachSeriesWeekStates = useMemo<SeriesWeekState[]>(() => demoSeriesWeekStates.map((state) => ({
    seriesId: state.seriesId,
    weekStart: state.weekStart,
    checked: state.checked,
    committedSessionId: state.committedSessionId,
  })), [demoSeriesWeekStates]);
  const coachSessions = useMemo<CoachSession[]>(() => demoSessions.map((session) => ({
    ...session,
    sessionType: session.sessionType,
    facilityId: session.facilityName,
    groupIds: session.groupIds,
    availability: session.availability.map((item) => ({ ...item, userId: item.playerId ?? item.playerName })),
    players: session.players.map((player) => ({ ...player, loadEntries: player.loadEntries ?? demoLoadEntriesForSession(session, player) })),
  })), [demoSessions]);
  const facilityConflictSessions = useMemo<ConflictSession[]>(() => {
    const allTeams = allDemoTeams.length > 0 ? allDemoTeams : teams;
    const teamByName = new Map(allTeams.map((team) => [`${team.department}:${team.name}`, team]));
    return rawSessions.map((session) => {
      const team = teamByName.get(`${session.department}:${session.team}`) ?? null;
      const resolvedFacility = session.facility ?? team?.defaultFacility ?? null;
      return {
        id: session.id,
        title: session.title,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        facilityId: resolvedFacility,
        facilityName: resolvedFacility,
        teamName: team?.name ?? session.team,
        departmentName: team?.department ?? session.department,
      };
    });
  }, [allDemoTeams, rawSessions, teams]);

  function refreshDemoSessions(nextRaw: DemoSession[]) {
    saveDemoSessions(nextRaw);
    setRawSessions(nextRaw);
    setDemoSessions(buildCoachSessions(teams, nextRaw, ensureDemoPlayers(allDemoTeams.length > 0 ? allDemoTeams : teams)));
  }

  function refreshDemoSeries(nextSeries: DemoSessionSeries[]) {
    saveDemoSessionSeries(nextSeries);
    setDemoSeries(nextSeries.filter((series) => DEMO_COACH_TEAM_IDS.has(series.teamId)));
  }

  function refreshDemoSeriesWeekStates(nextStates: DemoSessionSeriesWeekState[]) {
    saveDemoSessionSeriesWeekStates(nextStates);
    setDemoSeriesWeekStates(nextStates);
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
    closeDemoSessionDetails();
    setReturnToSessionId(null);
    setDeleteSessionId(null);
  }

  async function handleDemoCreateSeries(input: SeriesTemplateInput) {
    const next = seriesTemplateToDemo(input, allDemoTeams.length > 0 ? allDemoTeams : teams);
    if (!next) return;
    refreshDemoSeries([...getDemoSessionSeries(allDemoTeams.length > 0 ? allDemoTeams : teams), next]);
  }

  async function handleDemoUpdateSeries(seriesId: string, input: SeriesTemplateInput) {
    const sourceTeams = allDemoTeams.length > 0 ? allDemoTeams : teams;
    const replacement = seriesTemplateToDemo(input, sourceTeams, seriesId);
    if (!replacement) return;
    refreshDemoSeries(getDemoSessionSeries(sourceTeams).map((series) => series.id === seriesId ? { ...replacement, createdAt: series.createdAt } : series));
  }

  async function handleDemoDeleteSeries(seriesId: string) {
    const sourceTeams = allDemoTeams.length > 0 ? allDemoTeams : teams;
    refreshDemoSeries(getDemoSessionSeries(sourceTeams).filter((series) => series.id !== seriesId));
    refreshDemoSeriesWeekStates(getDemoSessionSeriesWeekStates().filter((state) => state.seriesId !== seriesId));
    refreshDemoSessions(rawSessions.filter((session) => session.seriesId !== seriesId));
  }

  async function handleDemoToggleSeriesWeek(seriesId: string, weekStart: string, checked: boolean) {
    const allStates = getDemoSessionSeriesWeekStates();
    const nextState = { seriesId, weekStart, checked, committedSessionId: allStates.find((state) => state.seriesId === seriesId && state.weekStart === weekStart)?.committedSessionId ?? null, updatedAt: new Date().toISOString() };
    refreshDemoSeriesWeekStates([...allStates.filter((state) => !(state.seriesId === seriesId && state.weekStart === weekStart)), nextState]);
  }

  async function handleDemoConfirmSeriesWeek(items: SeriesWeekItem[]) {
    const allStates = getDemoSessionSeriesWeekStates();
    const nextSessions = [...rawSessions];
    const nextStates = [...allStates];
    for (const item of items) {
      if (!item.checked || item.committedSessionId) continue;
      const team = (allDemoTeams.length > 0 ? allDemoTeams : teams).find((candidate) => candidate.id === item.teamId);
      if (!team) continue;
      const sessionId = `demo-session-${item.id}-${item.weekStart}`;
      if (!nextSessions.some((session) => session.id === sessionId)) {
        nextSessions.push({
          id: sessionId,
          department: team.department,
          team: team.name,
          title: labelForDemoSessionType(item.sessionType),
          sessionType: item.sessionType,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          facility: item.facilityId ?? item.facility ?? team.defaultFacility,
          groupIds: item.groupIds ?? [],
          seriesId: item.id,
          seriesWeekStart: item.weekStart,
          createdAt: new Date().toISOString(),
        });
      }
      const stateIndex = nextStates.findIndex((state) => state.seriesId === item.id && state.weekStart === item.weekStart);
      const nextState = { seriesId: item.id, weekStart: item.weekStart, checked: true, committedSessionId: sessionId, updatedAt: new Date().toISOString() };
      if (stateIndex >= 0) nextStates[stateIndex] = { ...nextStates[stateIndex], ...nextState };
      else nextStates.push(nextState);
    }
    refreshDemoSessions(nextSessions);
    refreshDemoSeriesWeekStates(nextStates);
  }

  const historySessions = useMemo(() => coachSessions.filter((session) => new Date(session.startsAt).getTime() < Date.now()).sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()), [coachSessions]);
  const editingSession = editingSessionId ? coachSessions.find((session) => session.id === editingSessionId) ?? null : null;
  const activeCoachSession = activeSession ? coachSessions.find((session) => session.id === activeSession.id) ?? null : null;
  function closeSessionEditor() {
    const returnSession = returnToSessionId ? demoSessions.find((session) => session.id === returnToSessionId) ?? null : null;
    setEditingSessionId(null);
    setReturnToSessionId(null);
    if (returnSession) openDemoSessionDetails(returnSession);
  }

  const shouldOpenTeamWorkspace = mode === 'team' || mode === 'attendance' || mode === 'load';
  const teamWorkspaceBackHref = mode === 'team' && selectedTeam && teams.length > 1 ? '/demo/coach/team' : '/demo/coach/today';
  const teamWorkspaceBackLabel = mode === 'team' && selectedTeam && teams.length > 1 ? 'Back to Teams' : 'Back to Today';
  if (selectedTeam && shouldOpenTeamWorkspace) {
    return <DemoTeamWorkspace teamId={selectedTeam.id} backHref={teamWorkspaceBackHref} backLabel={teamWorkspaceBackLabel} initialSection={initialSection} frame="coach" role="coach" />;
  }
  if (singleTeam && shouldOpenTeamWorkspace) {
    // Single-team coaches have no team-list screen to return to.
    return <DemoTeamWorkspace teamId={singleTeam.id} backHref="/demo/coach/today" backLabel="Back to Today" initialSection={initialSection} frame="coach" role="coach" />;
  }

  return (
    <main className="os-page pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-64">
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
              {todaySessions.length > 0 ? todaySessions.map((session) => <DemoSessionCard key={session.id} session={session} onDetails={() => openDemoSessionDetails(session)} />) : <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm font-bold text-slate-500">No sessions today.</div>}
            </div>
          </section>
        ) : null}

        {mode === 'today' && upcomingSessions.length > 0 ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Next</p>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {upcomingSessions.map((session) => <button key={session.id} type="button" onClick={() => openDemoSessionDetails(session)} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-left transition hover:border-sky-300/50"><p className="text-sm font-black">{session.teamName}</p><p className="mt-1 text-xs font-bold text-slate-400">{new Date(session.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })} · {formatTimeRange(session.startsAt, session.endsAt)}</p><p className="mt-3 text-xs font-black text-slate-500">{session.availability.length} availability flags</p></button>)}
            </div>
          </section>
        ) : null}

        {mode === 'sessions' && teams.length > 0 ? (
          <CoachCalendarSurface
            teams={coachTeams}
            sessions={coachSessions}
            facilities={facilities}
            groups={groups}
            facilityConflictSessions={facilityConflictSessions}
            seriesTemplates={coachSeries}
            seriesWeekStates={coachSeriesWeekStates}
            facilityCalendarHrefForFacility={(facilityId) => `/demo/coach/facilities/${encodeURIComponent(facilityId)}/calendar?from=coachCalendar`}
            editSessionId={editSessionId}
            onEditSessionHandled={clearEditSessionParam}
            onCreateSession={handleDemoCreateSession}
            onUpdateSession={handleDemoUpdateSession}
            onDeleteSession={handleDemoDeleteSession}
            onCreateSeries={handleDemoCreateSeries}
            onUpdateSeries={handleDemoUpdateSeries}
            onDeleteSeries={handleDemoDeleteSeries}
            onToggleSeriesWeek={handleDemoToggleSeriesWeek}
            onConfirmSeriesWeek={handleDemoConfirmSeriesWeek}
            onDetails={(session) => openDemoSessionDetails(demoSessions.find((item) => item.id === session.id) ?? null)}
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
          <CoachHistoryInsights
            sessions={historySessions}
            teams={teams.map((team) => ({ id: team.id, name: team.name, departmentName: team.department }))}
            onDetails={(session, insight) => openDemoSessionDetails(demoSessions.find((item) => item.id === session.id) ?? null, insight ?? null)}
          />
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

        {activeCoachSession ? (
          <CoachSessionDetailOverlay
            session={activeCoachSession}
            calendarHref={mode === 'today' ? '/demo/coach/sessions' : null}
            initialInsight={activeHistoryInsight}
            onEdit={() => { setReturnToSessionId(activeCoachSession.id); setEditingSessionId(activeCoachSession.id); closeDemoSessionDetails(); }}
            onDelete={() => setDeleteSessionId(activeCoachSession.id)}
            onClose={closeDemoSessionDetails}
          />
        ) : null}

        {editingSession ? (
          <CoachSessionEditSheet
            title={editingSession.title}
            teams={coachTeams}
            facilities={facilities}
            groups={groups}
            initial={{
              startsAt: editingSession.startsAt,
              endsAt: editingSession.endsAt ?? new Date(new Date(editingSession.startsAt).getTime() + 90 * 60_000).toISOString(),
              teamId: editingSession.teamId,
              facilityId: editingSession.facilityId,
              groupIds: editingSession.groupIds,
              sessionType: normalizeCoachSessionType(editingSession.sessionType),
            }}
            allowTeamChange={false}
            isSaving={isSavingSessionEdit}
            onSave={async (value) => {
              setIsSavingSessionEdit(true);
              try {
                await handleDemoUpdateSession({ sessionId: editingSession.id, ...value });
                setEditingSessionId(null);
                setReturnToSessionId(null);
              } finally {
                setIsSavingSessionEdit(false);
              }
            }}
            onDelete={async () => {
              setIsSavingSessionEdit(true);
              try {
                await handleDemoDeleteSession(editingSession.id);
                setEditingSessionId(null);
                setReturnToSessionId(null);
              } finally {
                setIsSavingSessionEdit(false);
              }
            }}
            onClose={closeSessionEditor}
          />
        ) : null}

        <AppConfirmDialog isOpen={Boolean(deleteSessionId)} title="Delete session?" description="This removes the session from coach, team and athlete calendars." confirmLabel="Delete session" cancelLabel="Keep session" tone="danger" isConfirming={false} onConfirm={() => { if (deleteSessionId) void handleDemoDeleteSession(deleteSessionId); }} onCancel={() => setDeleteSessionId(null)} />
      </div>
    </main>
  );
}
