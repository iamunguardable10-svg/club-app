/**
 * Maps the local database onto the shapes the coach surfaces already expect.
 *
 * The presentation layer (`CoachCalendarSurface`, `CoachSessionSurfaces`,
 * `TeamWorkspaceView` and friends) is shared and was not touched by the
 * simplification: it keeps consuming `CoachTeam`, `CoachSession` and the rest
 * from `CoachTypes`. Only where those objects come from changed — from a dozen
 * Supabase queries to one local document.
 *
 * Everything here is pure. Give it a database and a coach, get the view model
 * back; no I/O, no state.
 */

import {
  athletesForTeam,
  coachPermissions,
  teamHasFeature,
  displayName,
  loadZone,
  sessionTypeToLoadType,
  type AthleteLoadEntry,
  type CoachPermission,
  type Id,
  type LocalDatabase,
} from '@/shared/data';
import { loadAccessFor, summarizeLoadEntries, type LoadAccess } from '@/features/load/loadAccess';
import type { ConflictSession } from '@/features/calendar/sessionConflicts';
import type { SeriesTemplate, SeriesWeekState } from '@/features/sessions/sessionSeriesPlanner';
import type {
  CoachAvailability,
  CoachFacility,
  CoachGroup,
  CoachPlayer,
  CoachSession,
  CoachTeam,
} from '@/features/role-workspaces/CoachTypes';

export type CoachData = {
  teams: CoachTeam[];
  sessions: CoachSession[];
  facilities: CoachFacility[];
  groups: CoachGroup[];
  seriesTemplates: SeriesTemplate[];
  seriesWeekStates: SeriesWeekState[];
  facilityConflictSessions: ConflictSession[];
};

export const EMPTY_COACH_DATA: CoachData = {
  teams: [],
  sessions: [],
  facilities: [],
  groups: [],
  seriesTemplates: [],
  seriesWeekStates: [],
  facilityConflictSessions: [],
};

/** Same window the Supabase version used: 90 days either side of today. */
const WINDOW_DAYS = 90;

function toCoachPlayer(database: LocalDatabase, personId: Id, teamId: Id, access: LoadAccess): CoachPlayer {
  const person = database.people.find((candidate) => candidate.id === personId);
  const entries: AthleteLoadEntry[] = database.loadEntries
    .filter((entry) => entry.personId === personId && (!entry.teamId || entry.teamId === teamId))
    .map(({ personId: _personId, createdAt: _createdAt, ...entry }) => entry);

  // Full access computes the ratio from the entries. Summary-only roles read
  // the stored traffic light: on the server they never receive the entries.
  const storedSummary = database.loadSummaries.find((row) => row.personId === personId);
  const loadSummary = access === 'none'
    ? null
    : access === 'full'
      ? summarizeLoadEntries(entries)
      : { acwr: storedSummary?.acwr ?? null, chronicFull: storedSummary?.chronicFull ?? false };
  const zone = loadZone(loadSummary?.acwr ?? null, loadSummary?.chronicFull ?? false);

  return {
    id: personId,
    name: person ? displayName(person) : 'Player',
    loadEntries: access === 'full' ? entries : [],
    loadAccess: access,
    loadSummary,
    acwr: loadSummary?.acwr ?? null,
    risk: zone.tone === 'high' ? 'high' : zone.tone === 'low' ? 'low' : zone.tone === 'ready' ? 'ready' : 'baseline',
  };
}

/**
 * Builds everything the coach workspace renders, scoped to the teams this
 * coach actually has a membership for.
 *
 * The scoping is the local equivalent of the row-level security the Supabase
 * version relied on: a coach sees their own teams, not the whole club. Without
 * accounts there is nothing to enforce it for us, so it is enforced here.
 */
/** How a report of "I didn't take part" reads for coaches. */
export const MISSED_LABEL = 'did not take part';

export function buildCoachData(database: LocalDatabase, coachPersonId: Id | null): CoachData {
  if (!coachPersonId) return EMPTY_COACH_DATA;

  const coachMemberships = database.memberships.filter(
    (membership) => membership.personId === coachPersonId && membership.role === 'coach',
  );
  if (coachMemberships.length === 0) return EMPTY_COACH_DATA;

  const teamIds = new Set(coachMemberships.map((membership) => membership.teamId));
  const departmentNameById = new Map(database.departments.map((department) => [department.id, department.name]));
  const facilityNameById = new Map(database.facilities.map((facility) => [facility.id, facility.name]));

  const permissionsByTeam = new Map(
    [...teamIds].map((teamId) => [teamId, coachPermissions(database, coachPersonId, teamId)] as const),
  );
  const permissionsFor = (teamId: Id) => permissionsByTeam.get(teamId) ?? new Set<CoachPermission>();

  const teams: CoachTeam[] = database.teams
    .filter((team) => teamIds.has(team.id))
    .map((team) => ({
      id: team.id,
      clubId: team.clubId,
      name: team.name,
      departmentId: team.departmentId,
      departmentName: departmentNameById.get(team.departmentId) ?? 'Department',
      defaultFacilityId: team.defaultFacilityId,
      role: 'coach',
      loadTracked: teamHasFeature(database, team.id, 'load'),
      roleName: database.coachRoles.find((role) => role.id === coachMemberships.find((m) => m.teamId === team.id)?.coachRoleId)?.name ?? null,
      permissions: [...permissionsFor(team.id)],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const teamById = new Map(teams.map((team) => [team.id, team]));

  const now = Date.now();
  const windowStart = now - WINDOW_DAYS * 86_400_000;
  const windowEnd = now + WINDOW_DAYS * 86_400_000;
  const inWindow = (startsAt: string) => {
    const time = new Date(startsAt).getTime();
    return time >= windowStart && time <= windowEnd;
  };

  const departmentIds = new Set(teams.map((team) => team.departmentId));
  const facilityIds = new Set(
    database.departmentFacilities
      .filter((link) => departmentIds.has(link.departmentId))
      .map((link) => link.facilityId),
  );

  const facilities: CoachFacility[] = database.facilities
    .filter((facility) => facilityIds.has(facility.id))
    .map((facility) => ({
      id: facility.id,
      name: facility.name,
      departmentIds: database.departmentFacilities
        .filter((link) => link.facilityId === facility.id)
        .map((link) => link.departmentId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const groupMemberCount = new Map<Id, number>();
  for (const member of database.playerGroupMembers) {
    groupMemberCount.set(member.groupId, (groupMemberCount.get(member.groupId) ?? 0) + 1);
  }

  const groups: CoachGroup[] = database.playerGroups
    .filter((group) => teamIds.has(group.teamId))
    .map((group) => ({
      id: group.id,
      teamId: group.teamId,
      name: group.name,
      playerCount: groupMemberCount.get(group.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const groupIdsByPerson = new Map<Id, Set<Id>>();
  for (const member of database.playerGroupMembers) {
    const existing = groupIdsByPerson.get(member.personId) ?? new Set<Id>();
    existing.add(member.groupId);
    groupIdsByPerson.set(member.personId, existing);
  }

  const playersByTeamId = new Map<Id, CoachPlayer[]>();
  for (const team of teams) {
    const permissions = permissionsFor(team.id);
    playersByTeamId.set(
      team.id,
      permissions.has('viewRoster')
        ? athletesForTeam(database, team.id).map((person) => toCoachPlayer(database, person.id, team.id, loadAccessFor(permissions)))
        : [],
    );
  }

  const personNameById = new Map(database.people.map((person) => [person.id, displayName(person)]));
  const availabilityBySessionId = new Map<Id, CoachAvailability[]>();
  for (const entry of database.availability) {
    // The coach view only ever showed exceptions; 'in' is the absence of a row.
    if (entry.status === 'in') continue;
    availabilityBySessionId.set(entry.sessionId, [
      ...(availabilityBySessionId.get(entry.sessionId) ?? []),
      {
        id: entry.id,
        userId: entry.personId,
        playerName: personNameById.get(entry.personId) ?? 'Player',
        // "Did not take part" is an absence for every count, with its own label.
        status: entry.status === 'missed' ? 'out' : entry.status,
        reason: entry.status === 'missed' ? MISSED_LABEL : entry.reason,
        lateMinutes: entry.lateMinutes,
        missed: entry.status === 'missed',
      },
    ]);
  }

  const sessions: CoachSession[] = database.sessions
    .filter((session) => teamIds.has(session.teamId) && inWindow(session.startsAt))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((session) => {
      const team = teamById.get(session.teamId)!;
      const teamPlayers = playersByTeamId.get(team.id) ?? [];
      const scopedPlayers = session.groupIds.length === 0
        ? teamPlayers
        : teamPlayers.filter((player) => {
            const playerGroups = groupIdsByPerson.get(player.id);
            return playerGroups ? session.groupIds.some((groupId) => playerGroups.has(groupId)) : false;
          });
      const scopedPlayerIds = new Set(scopedPlayers.map((player) => player.id));
      const permissions = permissionsFor(team.id);
      // Who is coming is one right, why someone is not is another: absence
      // reasons are often about health.
      const sessionAvailability = !permissions.has('viewAttendance')
        ? []
        : (availabilityBySessionId.get(session.id) ?? []).map((entry) =>
            // "did not take part" is a status, not a private reason.
            permissions.has('viewAbsenceReasons') || entry.missed ? entry : { ...entry, reason: null },
          );

      return {
        id: session.id,
        title: session.title,
        sessionType: session.sessionType,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        teamId: team.id,
        teamName: team.name,
        departmentName: team.departmentName,
        facilityId: session.facilityId,
        facilityName: session.facilityId ? facilityNameById.get(session.facilityId) ?? null : null,
        groupIds: session.groupIds,
        availability: session.groupIds.length === 0
          ? sessionAvailability
          : sessionAvailability.filter((entry) => scopedPlayerIds.has(entry.userId)),
        players: scopedPlayers,
        attendanceShared: permissions.has('viewAttendance'),
        loadTracked: team.loadTracked,
      } satisfies CoachSession;
    });

  const seriesTemplates: SeriesTemplate[] = database.sessionSeries
    .filter((series) => teamIds.has(series.teamId))
    .map((series) => {
      const team = teamById.get(series.teamId)!;
      const facilityName = series.facilityId ? facilityNameById.get(series.facilityId) ?? null : null;
      return {
        id: series.id,
        department: team.departmentName,
        teamId: team.id,
        teamName: team.name,
        team: team.name,
        sessionType: series.sessionType,
        weekday: series.weekday,
        startTime: series.startTime,
        endTime: series.endTime,
        facilityId: series.facilityId,
        facilityName,
        facility: facilityName,
        groupIds: series.groupIds,
        activeFrom: series.activeFrom,
        activeUntil: series.activeUntil,
      } satisfies SeriesTemplate;
    })
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));

  const seriesIds = new Set(seriesTemplates.map((series) => series.id));
  const seriesWeekStates: SeriesWeekState[] = database.sessionSeriesWeekStates
    .filter((state) => seriesIds.has(state.seriesId))
    .map((state) => ({
      seriesId: state.seriesId,
      weekStart: state.weekStart,
      checked: state.checked,
      committedSessionId: state.committedSessionId,
    }));

  // Every booking in the same facilities, including other teams'. This is what
  // makes the conflict guard work: a clash with a team the coach does not
  // manage still has to show up.
  const teamNameById = new Map(database.teams.map((team) => [team.id, team.name]));
  const facilityConflictSessions: ConflictSession[] = database.sessions
    .filter((session) => session.facilityId !== null && facilityIds.has(session.facilityId) && inWindow(session.startsAt))
    .map((session) => ({
      id: session.id,
      title: session.title,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      facilityId: session.facilityId,
      facilityName: session.facilityId ? facilityNameById.get(session.facilityId) ?? null : null,
      teamName: teamNameById.get(session.teamId) ?? 'Andere Buchung',
      departmentName: departmentNameById.get(session.departmentId) ?? null,
    }));

  return { teams, sessions, facilities, groups, seriesTemplates, seriesWeekStates, facilityConflictSessions };
}

/**
 * Attendance rate for one athlete, as a percentage of the sessions they were
 * expected at.
 *
 * The Supabase version left this field `null` and never computed it; the demo
 * version invented values like `82 + (index % 4) * 3`. Neither was usable. With
 * availability in the data layer the real figure is finally available, so it is
 * computed here and the invented one is gone.
 *
 * Returns null when there are no past sessions to judge by, so the view can say
 * "no data" instead of showing a misleading 100%.
 */
export function attendanceRateForPerson(database: LocalDatabase, personId: Id, teamId: Id): number | null {
  const now = Date.now();
  const pastSessions = database.sessions.filter(
    (session) => session.teamId === teamId && new Date(session.startsAt).getTime() < now,
  );
  if (pastSessions.length === 0) return null;

  const absences = new Set(
    database.availability
      .filter((entry) => entry.personId === personId && (entry.status === 'out' || entry.status === 'missed'))
      .map((entry) => entry.sessionId),
  );
  const attended = pastSessions.filter((session) => !absences.has(session.id)).length;
  return Math.round((attended / pastSessions.length) * 100);
}
