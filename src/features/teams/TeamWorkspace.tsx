'use client';

/**
 * Team workspace on local data.
 *
 * The presentation layer is `TeamWorkspaceView` (2000 lines, shared and
 * untouched). This container only builds the props it expects. The Supabase
 * version needed roughly a thousand lines to assemble the same object from
 * eighteen tables; against one local document most of that plumbing
 * disappears, and what is left is the mapping itself.
 *
 * Invites and join codes went away with accounts (there is nobody to invite
 * yet). Coach roles came back without them: what the active coach may see and
 * change here follows the rights of their role on this team. Player data a role
 * may not see is left out of the props, and handlers it may not use are not
 * passed — the view hides those controls on its own.
 */

import { useCallback, useMemo, type ReactNode } from 'react';

import {
  TeamWorkspaceView,
  type TeamWorkspaceData,
  type TeamWorkspacePlayer,
  type TeamWorkspaceSection,
  type TeamWorkspaceSession,
} from '@/features/teams/TeamWorkspaceView';
import type { SeriesTemplateInput } from '@/features/sessions/SeriesTemplateEditSheet';
import type { SeriesWeekItem } from '@/features/sessions/sessionSeriesPlanner';
import { labelForCoachSessionType, normalizeCoachSessionType } from '@/features/sessions/sessionTypeLabels';
import { buildCoachData } from '@/features/role-workspaces/coachData';
import { loadAccessFor } from '@/features/load/loadAccess';
import { TeamStaffPanel } from '@/features/teams/TeamStaffPanel';
import {
  athletesForTeam,
  coachPermissions,
  coachesForTeam,
  createSession,
  deleteSession,
  displayName,
  mutate,
  newId,
  setSeriesWeekState,
  setTeamDefaultFacility,
  updateSession,
  useLocalDatabase,
  type AthleteLoadEntry,
  type CoachPermission,
  type Id,
  type LocalDatabase,
  type SessionType,
} from '@/shared/data';

function toWorkspaceSession(session: {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  facilityId: string | null;
  groupIds: string[];
  sessionType: string;
}, facilityNameById: Map<string, string>): TeamWorkspaceSession {
  return {
    id: session.id,
    title: session.title,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    facilityId: session.facilityId,
    facilityName: session.facilityId ? facilityNameById.get(session.facilityId) ?? null : null,
    groupIds: session.groupIds,
    sessionType: session.sessionType,
  };
}

/**
 * Attendance for one athlete, computed from real reports.
 *
 * Previously this was either `null` (Supabase never calculated it) or invented
 * (`82 + (index % 4) * 3` in the demo build). Now the data layer holds actual
 * availability, so the figure is derived: past sessions of the team, minus the
 * ones this athlete reported out of.
 *
 * `null` when there are no past sessions yet — better an empty state than a
 * confident 100%.
 */
function attendanceForPlayer(database: LocalDatabase, personId: Id, teamId: Id) {
  const now = Date.now();
  const pastSessions = database.sessions
    .filter((session) => session.teamId === teamId && new Date(session.startsAt).getTime() < now)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const reports = database.availability.filter((entry) => entry.personId === personId);
  const reportBySessionId = new Map(reports.map((entry) => [entry.sessionId, entry]));

  const attendanceEvents = pastSessions
    .map((session) => {
      const report = reportBySessionId.get(session.id);
      if (!report || report.status === 'in') return null;
      return {
        sessionId: session.id,
        title: session.title,
        startsAt: session.startsAt,
        status: report.status,
        reason: report.reason,
        lateMinutes: report.lateMinutes,
      };
    })
    .filter((event): event is NonNullable<typeof event> => event !== null);

  const missedSessions = attendanceEvents.filter((event) => event.status === 'out').length;
  const attendanceRate = pastSessions.length === 0
    ? null
    : Math.round(((pastSessions.length - missedSessions) / pastSessions.length) * 100);

  return { attendanceRate, missedSessions, attendanceEvents };
}

export function TeamWorkspace({
  teamId,
  backHref = '/coach/team',
  backLabel = 'Back to teams',
  initialSection = 'dashboard',
  frame = 'coach',
}: {
  teamId: string;
  backHref?: string;
  backLabel?: string;
  initialSection?: TeamWorkspaceSection;
  frame?: 'admin' | 'coach' | 'department';
}) {
  const { database, error, ready } = useLocalDatabase();

  const activePersonId = database?.activeIdentity?.role === 'coach' ? database.activeIdentity.personId : null;
  const permissions = useMemo<ReadonlySet<CoachPermission>>(
    () => (database ? coachPermissions(database, activePersonId, teamId) : new Set()),
    [database, activePersonId, teamId],
  );

  const data = useMemo<TeamWorkspaceData | null>(() => {
    if (!database) return null;
    const team = database.teams.find((candidate) => candidate.id === teamId);
    if (!team) return null;

    const loadAccess = loadAccessFor(permissions);
    const storedSummary = (personId: Id) => {
      const row = database.loadSummaries.find((candidate) => candidate.personId === personId);
      return { acwr: row?.acwr ?? null, chronicFull: row?.chronicFull ?? false };
    };
    const attendanceShared = permissions.has('viewAttendance');
    const reasonsShared = permissions.has('viewAbsenceReasons');

    const departmentName = database.departments.find((department) => department.id === team.departmentId)?.name ?? 'Abteilung';
    const facilityNameById = new Map(database.facilities.map((facility) => [facility.id, facility.name]));

    const availableFacilityIds = new Set(
      database.departmentFacilities
        .filter((link) => link.departmentId === team.departmentId)
        .map((link) => link.facilityId),
    );
    const availableFacilities = database.facilities
      .filter((facility) => availableFacilityIds.has(facility.id))
      .map((facility) => ({ id: facility.id, name: facility.name }));

    const groupsOfTeam = database.playerGroups.filter((group) => group.teamId === team.id);
    const groupIdsByPerson = new Map<Id, string[]>();
    for (const member of database.playerGroupMembers) {
      groupIdsByPerson.set(member.personId, [...(groupIdsByPerson.get(member.personId) ?? []), member.groupId]);
    }

    const roster = permissions.has('viewRoster') ? athletesForTeam(database, team.id) : [];
    const players: TeamWorkspacePlayer[] = roster.map((person) => {
      const loadEntries: AthleteLoadEntry[] = database.loadEntries
        .filter((entry) => entry.personId === person.id)
        .map(({ personId: _personId, createdAt: _createdAt, ...entry }) => entry);
      const attendance = attendanceForPlayer(database, person.id, team.id);
      return {
        id: person.id,
        name: displayName(person),
        groups: groupIdsByPerson.get(person.id) ?? [],
        // Entries only for full access; summary-only roles get the stored
        // traffic light, as they would from the server.
        loadEntries: loadAccess === 'full' ? loadEntries : undefined,
        loadAccess,
        loadSummary: loadAccess === 'summary' ? storedSummary(person.id) : null,
        attendanceShared,
        ...(attendanceShared
          ? {
              ...attendance,
              attendanceEvents: reasonsShared
                ? attendance.attendanceEvents
                : attendance.attendanceEvents.map((event) => ({ ...event, reason: null })),
            }
          : { attendanceRate: null, missedSessions: null, attendanceEvents: [] }),
      };
    });

    const coaches = coachesForTeam(database, team.id).map(displayName);

    const sessions = database.sessions
      .filter((session) => session.teamId === team.id)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((session) => toWorkspaceSession(session, facilityNameById));

    // Other teams' bookings in the same facilities, so the calendar can show
    // what a slot would collide with.
    const contextSessions = database.sessions
      .filter((session) => session.teamId !== team.id && session.facilityId !== null && availableFacilityIds.has(session.facilityId))
      .map((session) => toWorkspaceSession(session, facilityNameById));

    return {
      id: team.id,
      name: team.name,
      departmentName,
      defaultFacilityId: team.defaultFacilityId,
      defaultFacilityName: team.defaultFacilityId ? facilityNameById.get(team.defaultFacilityId) ?? null : null,
      availableFacilities,
      playerCount: roster.length,
      players,
      attendanceShared,
      role: 'coach',
      // Only the read-only fallback uses this; staff with a role on this team
      // see roles and rights in the staff panel instead.
      staff: { headCoaches: coaches, assistantCoaches: [] },
      sessions,
      contextSessions,
      groups: groupsOfTeam.map((group) => {
        const playerIds = database.playerGroupMembers
          .filter((member) => member.groupId === group.id)
          .map((member) => member.personId);
        return { id: group.id, name: group.name, description: '', playerCount: playerIds.length, playerIds };
      }),
      backHref,
      backLabel,
      coachNav: frame === 'coach' ? { basePath: '/coach' } : null,
    };
  }, [database, permissions, teamId, backHref, backLabel, frame]);

  const { seriesTemplates, seriesWeekStates } = useMemo(() => {
    if (!database) return { seriesTemplates: [], seriesWeekStates: [] };
    // Series belong to the team, not to whoever is looking at it, so this is
    // scoped by team rather than by the active coach.
    const coachId = database.memberships.find((m) => m.teamId === teamId && m.role === 'coach')?.personId ?? null;
    const built = buildCoachData(database, coachId);
    return {
      seriesTemplates: built.seriesTemplates.filter((series) => series.teamId === teamId),
      seriesWeekStates: built.seriesWeekStates,
    };
  }, [database, teamId]);

  const handleSessionTimeChange = useCallback((sessionId: string, startsAt: string, endsAt: string) => {
    updateSession(sessionId, { startsAt, endsAt });
  }, []);

  const handleSessionCreate = useCallback((startsAt: string, endsAt: string) => {
    createSession({
      teamId,
      title: labelForCoachSessionType('training'),
      sessionType: 'training',
      startsAt,
      endsAt,
      facilityId: data?.defaultFacilityId ?? null,
    });
  }, [teamId, data?.defaultFacilityId]);

  const handleSessionFacilityChange = useCallback((sessionId: string, facilityId: string) => {
    updateSession(sessionId, { facilityId: facilityId || null });
  }, []);

  const handleSessionGroupsChange = useCallback((sessionId: string, groupIds: string[]) => {
    updateSession(sessionId, { groupIds });
  }, []);

  const handleSessionTypeChange = useCallback((sessionId: string, sessionType: string) => {
    const normalized = normalizeCoachSessionType(sessionType) as SessionType;
    updateSession(sessionId, { sessionType: normalized, title: labelForCoachSessionType(sessionType) });
  }, []);

  const handleSessionDelete = useCallback((sessionId: string) => {
    deleteSession(sessionId);
  }, []);

  const handleDefaultFacilityChange = useCallback((facilityId: string) => {
    setTeamDefaultFacility(teamId, facilityId || null);
  }, [teamId]);

  const handleAddGroup = useCallback((name: string) => {
    mutate((draft) => {
      draft.playerGroups.push({ id: newId(), teamId, name });
    });
  }, [teamId]);

  const handleRemoveGroup = useCallback((groupId: string) => {
    mutate((draft) => {
      draft.playerGroups = draft.playerGroups.filter((group) => group.id !== groupId);
      draft.playerGroupMembers = draft.playerGroupMembers.filter((member) => member.groupId !== groupId);
      // A session scoped to a group that no longer exists would silently show
      // nobody, so drop the reference too.
      for (const session of draft.sessions) {
        session.groupIds = session.groupIds.filter((id) => id !== groupId);
      }
    });
  }, []);

  const handleTogglePlayerGroup = useCallback((groupId: string, playerId: string) => {
    mutate((draft) => {
      const exists = draft.playerGroupMembers.some(
        (member) => member.groupId === groupId && member.personId === playerId,
      );
      draft.playerGroupMembers = exists
        ? draft.playerGroupMembers.filter((member) => !(member.groupId === groupId && member.personId === playerId))
        : [...draft.playerGroupMembers, { groupId, personId: playerId }];
    });
  }, []);

  const handleCreateSeries = useCallback((input: SeriesTemplateInput) => {
    mutate((draft) => {
      const team = draft.teams.find((candidate) => candidate.id === (input.teamId || teamId));
      if (!team) return;
      draft.sessionSeries.push({
        id: newId(),
        clubId: team.clubId,
        departmentId: team.departmentId,
        teamId: team.id,
        title: labelForCoachSessionType(input.sessionType),
        sessionType: normalizeCoachSessionType(input.sessionType) as SessionType,
        weekday: input.weekday,
        startTime: input.startTime,
        endTime: input.endTime,
        facilityId: input.facilityId || null,
        groupIds: input.groupIds ?? [],
        activeFrom: null,
        activeUntil: null,
        createdAt: new Date().toISOString(),
      });
    });
  }, [teamId]);

  const handleUpdateSeries = useCallback((seriesId: string, input: SeriesTemplateInput) => {
    mutate((draft) => {
      const series = draft.sessionSeries.find((candidate) => candidate.id === seriesId);
      if (!series) return;
      series.sessionType = normalizeCoachSessionType(input.sessionType) as SessionType;
      series.weekday = input.weekday;
      series.startTime = input.startTime;
      series.endTime = input.endTime;
      series.facilityId = input.facilityId || null;
      series.groupIds = input.groupIds ?? [];
    });
  }, []);

  const handleDeleteSeries = useCallback((seriesId: string) => {
    mutate((draft) => {
      draft.sessionSeries = draft.sessionSeries.filter((series) => series.id !== seriesId);
      draft.sessionSeriesWeekStates = draft.sessionSeriesWeekStates.filter((state) => state.seriesId !== seriesId);
    });
  }, []);

  const handleToggleSeriesWeek = useCallback((seriesId: string, weekStart: string, checked: boolean) => {
    const existing = seriesWeekStates.find((state) => state.seriesId === seriesId && state.weekStart === weekStart);
    setSeriesWeekState(seriesId, weekStart, checked, existing?.committedSessionId ?? null);
  }, [seriesWeekStates]);

  const handleConfirmSeriesWeek = useCallback((items: SeriesWeekItem[]) => {
    const created: string[] = [];
    try {
      for (const item of items) {
        if (item.committedSessionId) continue;
        const sessionId = createSession({
          teamId: item.teamId ?? teamId,
          title: labelForCoachSessionType(item.sessionType),
          sessionType: normalizeCoachSessionType(item.sessionType) as SessionType,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          facilityId: item.facilityId ?? null,
          groupIds: item.groupIds ?? [],
        });
        created.push(sessionId);
        setSeriesWeekState(item.id, item.weekStart, true, sessionId);
      }
    } catch (confirmError) {
      // Same rollback the Supabase version had: a half-confirmed week is worse
      // than none, because a coach cannot see which half went through.
      for (const sessionId of created) deleteSession(sessionId);
      throw confirmError;
    }
  }, [teamId]);

  if (!ready) {
    return <main className="os-page"><div className="os-container"><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-white">Loading team …</section></div></main>;
  }

  if (error) {
    return <main className="os-page"><div className="os-container"><section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-6 text-red-100">{error.message}</section></div></main>;
  }

  if (!data) {
    return <main className="os-page"><div className="os-container"><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-white">This team does not exist.</section></div></main>;
  }

  const canEditSessions = permissions.has('editSessions');
  const canPlanSeries = permissions.has('planSeries');
  const canManageGroups = permissions.has('manageGroups');
  const staffPanel: ReactNode = database && permissions.size > 0
    ? <TeamStaffPanel database={database} teamId={teamId} canManage={permissions.has('manageStaff')} />
    : null;

  return (
    <TeamWorkspaceView
      data={data}
      initialSection={initialSection}
      seriesTemplates={seriesTemplates}
      seriesWeekStates={seriesWeekStates}
      onDefaultFacilityChange={permissions.has('manageFacilities') ? handleDefaultFacilityChange : undefined}
      onSessionTimeChange={canEditSessions ? handleSessionTimeChange : undefined}
      onSessionCreate={canEditSessions ? handleSessionCreate : undefined}
      onSessionFacilityChange={canEditSessions ? handleSessionFacilityChange : undefined}
      onSessionGroupsChange={canEditSessions ? handleSessionGroupsChange : undefined}
      onSessionTypeChange={canEditSessions ? handleSessionTypeChange : undefined}
      onSessionDelete={canEditSessions ? handleSessionDelete : undefined}
      onCreateSeries={canPlanSeries ? handleCreateSeries : undefined}
      onUpdateSeries={canPlanSeries ? handleUpdateSeries : undefined}
      onDeleteSeries={canPlanSeries ? handleDeleteSeries : undefined}
      onToggleSeriesWeek={canPlanSeries ? handleToggleSeriesWeek : undefined}
      onConfirmSeriesWeek={canPlanSeries ? handleConfirmSeriesWeek : undefined}
      onAddGroup={canManageGroups ? handleAddGroup : undefined}
      onRemoveGroup={canManageGroups ? handleRemoveGroup : undefined}
      onTogglePlayerGroup={canManageGroups ? handleTogglePlayerGroup : undefined}
      staffPanel={staffPanel}
    />
  );
}
