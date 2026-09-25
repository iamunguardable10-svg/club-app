'use client';

/**
 * Team workspace on local data.
 *
 * The presentation layer is `TeamWorkspaceView`; this container builds the
 * props it expects and puts it into the coach frame (`CoachShell`). The team's
 * sessions are planned in the coach calendar, filtered to this team, so there
 * is one calendar implementation rather than two. The Supabase
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
import { labelForCoachSessionType, normalizeCoachSessionType } from '@/features/sessions/sessionTypeLabels';
import { CoachShell } from '@/features/role-workspaces/RoleShell';
import { MISSED_LABEL, buildCoachData } from '@/features/role-workspaces/coachData';
import { awayUntilLabel } from '@/features/absences/absenceText';
import { loadAccessFor } from '@/features/load/loadAccess';
import { TeamStaffPanel } from '@/features/teams/TeamStaffPanel';
import {
  absenceOn,
  athletesForTeam,
  awayForSession,
  publishedSquadStatus,
  coachPermissions,
  coachesForTeam,
  deleteSession,
  displayName,
  mutate,
  newId,
  removeAthleteFromTeam,
  setTeamDefaultFacility,
  updateSession,
  todayISO,
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
    // A game the player was not picked for does not count (piece 15).
    .filter((session) => session.teamId === teamId && new Date(session.startsAt).getTime() < now
      && publishedSquadStatus(database, personId, session) !== 'not_selected')
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const reports = database.availability.filter((entry) => entry.personId === personId);
  const reportBySessionId = new Map(reports.map((entry) => [entry.sessionId, entry]));

  const attendanceEvents = pastSessions
    .map((session) => {
      const report = reportBySessionId.get(session.id);
      if (!report) {
        // Away for a period (piece 16) without a report of their own.
        const absence = awayForSession(database, personId, session);
        return absence
          ? { sessionId: session.id, title: session.title, startsAt: session.startsAt, status: 'out' as const,
              reason: awayUntilLabel(absence, true), lateMinutes: null, missed: false, awayUntil: absence.toDate }
          : null;
      }
      if (report.status === 'in') return null;
      return {
        sessionId: session.id,
        title: session.title,
        startsAt: session.startsAt,
        status: report.status === 'missed' ? ('out' as const) : report.status,
        reason: report.status === 'missed' ? MISSED_LABEL : report.reason,
        lateMinutes: report.lateMinutes,
        missed: report.status === 'missed',
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
  back,
  initialSection = 'dashboard',
}: {
  teamId: string;
  back?: { href: string; label: string };
  initialSection?: TeamWorkspaceSection;
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

    const departmentName = database.departments.find((department) => department.id === team.departmentId)?.name ?? 'Department';
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
        absenceReasonsShared: reasonsShared,
        // Away right now, or starting today (piece 16).
        awayUntil: attendanceShared ? absenceOn(database, person.id, todayISO())?.toDate ?? null : null,
        ...(attendanceShared
          ? {
              ...attendance,
              attendanceEvents: reasonsShared
                ? attendance.attendanceEvents
                : attendance.attendanceEvents.map((event) => (
                    event.missed ? event
                    // Away for a period: the period is attendance, the kind is a reason.
                    : 'awayUntil' in event && event.awayUntil ? { ...event, reason: awayUntilLabel({ kind: null, toDate: event.awayUntil }, false) }
                    : { ...event, reason: null })),
            }
          : { attendanceRate: null, missedSessions: null, attendanceEvents: [] }),
      };
    });

    const coaches = coachesForTeam(database, team.id).map(displayName);

    const sessions = database.sessions
      .filter((session) => session.teamId === team.id)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
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
      groups: groupsOfTeam.map((group) => {
        const playerIds = database.playerGroupMembers
          .filter((member) => member.groupId === group.id)
          .map((member) => member.personId);
        return { id: group.id, name: group.name, description: '', playerCount: playerIds.length, playerIds };
      }),
      calendarHref: `/coach/sessions?teamId=${encodeURIComponent(team.id)}`,
      loadTracked: team.features.includes('load'),
    };
  }, [database, permissions, teamId]);

  const coachSessions = useMemo(
    () => (database ? buildCoachData(database, activePersonId).sessions.filter((session) => session.teamId === teamId) : []),
    [database, activePersonId, teamId],
  );

  const handleSessionTimeChange = useCallback((sessionId: string, startsAt: string, endsAt: string) => {
    updateSession(sessionId, { startsAt, endsAt });
  }, []);

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
  const canManageGroups = permissions.has('manageGroups');
  const staffPanel: ReactNode = database && permissions.size > 0
    ? <TeamStaffPanel database={database} teamId={teamId} canManage={permissions.has('manageStaff')} />
    : null;

  return (
    <CoachShell
      active="team"
      title={data.name}
      subtitle={`${data.departmentName}${data.defaultFacilityName ? ` · ${data.defaultFacilityName}` : ''}`}
      back={back}
    >
    <TeamWorkspaceView
      data={data}
      initialSection={initialSection}
      canMessage={permissions.has('viewAttendance') || permissions.has('editSessions')}
      coachSessions={coachSessions}
      onDefaultFacilityChange={permissions.has('manageFacilities') ? handleDefaultFacilityChange : undefined}
      onSessionTimeChange={canEditSessions ? handleSessionTimeChange : undefined}
      onSessionFacilityChange={canEditSessions ? handleSessionFacilityChange : undefined}
      onSessionGroupsChange={canEditSessions ? handleSessionGroupsChange : undefined}
      onSessionTypeChange={canEditSessions ? handleSessionTypeChange : undefined}
      onSessionDelete={canEditSessions ? handleSessionDelete : undefined}
      onAddGroup={canManageGroups ? handleAddGroup : undefined}
      onRemoveGroup={canManageGroups ? handleRemoveGroup : undefined}
      onTogglePlayerGroup={canManageGroups ? handleTogglePlayerGroup : undefined}
      onRemovePlayer={permissions.has('manageStaff') ? (personId) => removeAthleteFromTeam(teamId, personId) : undefined}
      staffPanel={staffPanel}
    />
    </CoachShell>
  );
}
