/**
 * Translation between the app's document (`LocalDatabase`) and the rows of the
 * pilot database (supabase/pilot/migrations).
 *
 * The app keeps working on one document, exactly as in the local test mode.
 * The server store turns that document into rows per table, compares them
 * with the rows before a change and sends only the difference. Both
 * directions live here so they cannot drift apart.
 *
 * Everything is pure: no network, no storage.
 */

import { TEAM_FEATURES } from '../schema';
import type {
  Availability,
  LoadSummaryRow,
  LocalDatabase,
  ClubRoleKind,
  SessionType,
  TeamFeature,
} from '../schema';
import type { LoadTrainingType } from '../loadTypes';

export type Row = Record<string, unknown>;
export type ServerRows = Record<TableName, Row[]>;

type ColumnKind = 'timestamp' | 'time' | 'number';

type TableSpec = {
  name: TableName;
  key: string[];
  /** Columns whose value format differs between Postgres and the app. */
  kinds?: Record<string, ColumnKind>;
  /** The app never changes these; nothing is sent for them. */
  readOnly?: boolean;
};

/**
 * In dependency order: a table only refers to tables above it. Inserts and
 * updates run top-down, deletes bottom-up.
 */
export const TABLES: readonly TableSpec[] = [
  // Renamed by the club admin (piece 12); founded through a database function.
  { name: 'clubs', key: ['id'], kinds: { created_at: 'timestamp' } },
  // Created and renamed by the club admin (piece 8).
  { name: 'departments', key: ['id'] },
  { name: 'facilities', key: ['id'] },
  { name: 'teams', key: ['id'], kinds: { created_at: 'timestamp', archived_at: 'timestamp' } },
  { name: 'team_join_codes', key: ['team_id'], kinds: { created_at: 'timestamp' } },
  { name: 'department_facilities', key: ['department_id', 'facility_id'] },
  { name: 'people', key: ['id'], kinds: { created_at: 'timestamp' } },
  { name: 'coach_roles', key: ['id'], kinds: { created_at: 'timestamp' } },
  { name: 'memberships', key: ['id'], kinds: { created_at: 'timestamp' } },
  { name: 'club_roles', key: ['id'], kinds: { created_at: 'timestamp' } },
  { name: 'club_role_invites', key: ['token'], kinds: { created_at: 'timestamp', expires_at: 'timestamp', accepted_at: 'timestamp' } },
  { name: 'staff_invites', key: ['token'], kinds: { created_at: 'timestamp', expires_at: 'timestamp', accepted_at: 'timestamp' } },
  { name: 'player_groups', key: ['id'] },
  { name: 'player_group_members', key: ['group_id', 'person_id'] },
  { name: 'session_series', key: ['id'], kinds: { start_time: 'time', end_time: 'time', created_at: 'timestamp' } },
  { name: 'sessions', key: ['id'], kinds: { starts_at: 'timestamp', ends_at: 'timestamp', created_at: 'timestamp' } },
  { name: 'session_series_week_states', key: ['series_id', 'week_start'], kinds: { updated_at: 'timestamp' } },
  { name: 'availability', key: ['id'], kinds: { reported_at: 'timestamp' } },
  { name: 'availability_reasons', key: ['availability_id'] },
  { name: 'load_entries', key: ['id'], kinds: { starts_at: 'timestamp', created_at: 'timestamp', rpe: 'number', load: 'number' } },
  { name: 'load_entry_reviews', key: ['entry_id'], kinds: { created_at: 'timestamp' } },
  { name: 'attendance_confirmations', key: ['session_id', 'person_id'], kinds: { confirmed_at: 'timestamp' } },
  { name: 'load_summaries', key: ['person_id'], kinds: { acwr: 'number', updated_at: 'timestamp' } },
  { name: 'athlete_plans', key: ['id'], kinds: { starts_at: 'timestamp', created_at: 'timestamp', expected_rpe: 'number' } },
  { name: 'acknowledged_sessions', key: ['person_id', 'session_id'] },
];

export type TableName =
  | 'clubs' | 'departments' | 'facilities' | 'teams' | 'team_join_codes' | 'department_facilities' | 'people' | 'coach_roles'
  | 'staff_invites' | 'club_roles' | 'club_role_invites'
  | 'memberships' | 'player_groups' | 'player_group_members' | 'session_series' | 'sessions'
  | 'session_series_week_states' | 'availability' | 'availability_reasons' | 'load_entries'
  | 'load_summaries' | 'athlete_plans' | 'acknowledged_sessions' | 'load_entry_reviews' | 'attendance_confirmations';

export function tableSpec(name: TableName): TableSpec {
  return TABLES.find((table) => table.name === name)!;
}

/**
 * Brings a value into the one format both sides compare in: timestamps as
 * `toISOString()`, times of day as `HH:MM`, numerics as numbers (Postgres
 * `numeric` may arrive as a string).
 */
export function normalizeRow(table: TableName, row: Row): Row {
  const kinds = tableSpec(table).kinds ?? {};
  const normalized: Row = {};
  for (const [column, value] of Object.entries(row)) {
    const kind = kinds[column];
    if (value === null || value === undefined) {
      normalized[column] = null;
    } else if (kind === 'timestamp') {
      normalized[column] = new Date(value as string).toISOString();
    } else if (kind === 'time') {
      normalized[column] = String(value).slice(0, 5);
    } else if (kind === 'number') {
      normalized[column] = Number(value);
    } else {
      normalized[column] = value;
    }
  }
  return normalized;
}

export function rowKey(table: TableName, row: Row): string {
  return tableSpec(table).key.map((column) => String(row[column])).join('|');
}

// ---------------------------------------------------------------------------
// Document → rows
// ---------------------------------------------------------------------------

export function toServerRows(database: LocalDatabase): ServerRows {
  const rows: ServerRows = {
    clubs: [{ id: database.club.id, name: database.club.name, city: database.club.city, country: database.club.country, created_at: database.club.createdAt }],
    departments: database.departments.map((d) => ({ id: d.id, club_id: d.clubId, name: d.name })),
    facilities: database.facilities.map((f) => ({ id: f.id, club_id: f.clubId, name: f.name, address: f.address })),
    teams: database.teams.map((t) => ({
      id: t.id, club_id: t.clubId, department_id: t.departmentId, name: t.name, default_facility_id: t.defaultFacilityId, features: t.features,
      archived_at: t.archivedAt, created_at: t.createdAt,
    })),
    team_join_codes: database.joinCodes.map((c) => ({ team_id: c.teamId, code: c.code, created_at: c.createdAt })),
    staff_invites: database.staffInvites.map((i) => ({
      token: i.token, person_id: i.personId, team_id: i.teamId, created_at: i.createdAt, expires_at: i.expiresAt, accepted_at: i.acceptedAt,
    })),
    club_roles: database.clubRoles.map((r) => ({
      id: r.id, club_id: r.clubId, person_id: r.personId, role: r.role, department_id: r.departmentId, created_at: r.createdAt,
    })),
    club_role_invites: database.clubRoleInvites.map((i) => ({
      token: i.token, club_role_id: i.clubRoleId, created_at: i.createdAt, expires_at: i.expiresAt, accepted_at: i.acceptedAt,
    })),
    department_facilities: database.departmentFacilities.map((l) => ({ department_id: l.departmentId, facility_id: l.facilityId })),
    people: database.people.map((p) => ({
      id: p.id, club_id: p.clubId, user_id: p.userId, first_name: p.firstName, last_name: p.lastName, created_at: p.createdAt,
    })),
    coach_roles: database.coachRoles.map((r) => ({
      id: r.id, team_id: r.teamId, name: r.name, permissions: r.permissions, locked: r.locked, created_at: r.createdAt,
    })),
    memberships: database.memberships.map((m) => ({
      id: m.id, person_id: m.personId, team_id: m.teamId, role: m.role, coach_role_id: m.coachRoleId, created_at: m.createdAt,
    })),
    player_groups: database.playerGroups.map((g) => ({ id: g.id, team_id: g.teamId, name: g.name })),
    player_group_members: database.playerGroupMembers.map((m) => ({ group_id: m.groupId, person_id: m.personId })),
    session_series: database.sessionSeries.map((s) => ({
      id: s.id, club_id: s.clubId, department_id: s.departmentId, team_id: s.teamId, title: s.title, session_type: s.sessionType,
      weekday: s.weekday, start_time: s.startTime, end_time: s.endTime, facility_id: s.facilityId, group_ids: s.groupIds,
      active_from: s.activeFrom, active_until: s.activeUntil, created_at: s.createdAt,
      notes: s.notes ?? null, meet_minutes_before: s.meetMinutesBefore ?? null, meet_point: s.meetPoint ?? null,
    })),
    sessions: database.sessions.map((s) => ({
      id: s.id, club_id: s.clubId, department_id: s.departmentId, team_id: s.teamId, title: s.title, session_type: s.sessionType,
      starts_at: s.startsAt, ends_at: s.endsAt, facility_id: s.facilityId, group_ids: s.groupIds, series_id: s.seriesId,
      series_week_start: s.seriesWeekStart, created_at: s.createdAt,
      notes: s.notes ?? null, meet_minutes_before: s.meetMinutesBefore ?? null, meet_point: s.meetPoint ?? null,
      opponent: s.opponent ?? null, home_away: s.homeAway ?? null, venue_address: s.venueAddress ?? null,
    })),
    session_series_week_states: database.sessionSeriesWeekStates.map((w) => ({
      series_id: w.seriesId, week_start: w.weekStart, checked: w.checked, committed_session_id: w.committedSessionId, updated_at: w.updatedAt,
    })),
    availability: database.availability.map((a) => ({
      id: a.id, session_id: a.sessionId, person_id: a.personId, status: a.status, late_minutes: a.lateMinutes, reported_at: a.reportedAt,
    })),
    // The reason lives in its own table on the server (narrower right).
    availability_reasons: database.availability
      .filter((a) => a.reason !== null && a.reason.trim() !== '')
      .map((a) => ({ availability_id: a.id, reason: a.reason })),
    load_entries: database.loadEntries.map((e) => ({
      id: e.id, person_id: e.personId, session_id: e.sessionId, team_id: e.teamId, date: e.date, starts_at: e.startsAt ?? null,
      title: e.title, training_type: e.trainingType, rpe: e.rpe, duration_minutes: e.durationMinutes, load: e.load,
      note: e.note ?? null, source: e.source, created_at: e.createdAt,
    })),
    load_summaries: database.loadSummaries.map((s) => ({
      person_id: s.personId, acwr: s.acwr, chronic_full: s.chronicFull, updated_at: s.updatedAt,
    })),
    athlete_plans: database.athletePlans.map((p) => ({
      id: p.id, person_id: p.personId, team_id: p.teamId, title: p.title, date: p.date, starts_at: p.startsAt ?? null,
      training_type: p.trainingType, expected_rpe: p.expectedRpe, expected_duration_minutes: p.expectedDurationMinutes,
      note: p.note ?? null, created_at: p.createdAt,
    })),
    acknowledged_sessions: database.acknowledgedSessions.map((a) => ({ person_id: a.personId, session_id: a.sessionId })),
    load_entry_reviews: database.loadEntryReviews.map((r) => ({
      entry_id: r.entryId, person_id: r.personId, requested_by: r.requestedBy, note: r.note, created_at: r.createdAt,
    })),
    attendance_confirmations: database.attendanceConfirmations.map((c) => ({
      session_id: c.sessionId, person_id: c.personId, present: c.present, confirmed_by: c.confirmedBy, confirmed_at: c.confirmedAt,
    })),
  };
  for (const table of TABLES) rows[table.name] = rows[table.name].map((row) => normalizeRow(table.name, row));
  return rows;
}

// ---------------------------------------------------------------------------
// Rows → document
// ---------------------------------------------------------------------------

const s = (value: unknown) => value as string;
const sn = (value: unknown) => (value === null || value === undefined ? null : (value as string));

/**
 * Builds the document from what the signed-in user may read. Returns null
 * when they can see no club at all, i.e. their account is not linked to a
 * person yet.
 *
 * `previous` carries over what only exists on this device: who the app is
 * acting as (if still valid) and the last shared load links.
 */
export function fromServerRows(
  raw: ServerRows,
  context: { userId: string; version: string; previous: LocalDatabase | null },
): LocalDatabase | null {
  const rows = {} as ServerRows;
  for (const table of TABLES) rows[table.name] = (raw[table.name] ?? []).map((row) => normalizeRow(table.name, row));

  const club = rows.clubs[0];
  if (!club) return null;
  const teamNameById = new Map(rows.teams.map((t) => [s(t.id), s(t.name)]));
  const reasonByAvailability = new Map(rows.availability_reasons.map((r) => [s(r.availability_id), s(r.reason)]));

  const database: LocalDatabase = {
    version: context.version,
    seededAt: context.previous?.seededAt ?? new Date().toISOString(),
    club: { id: s(club.id), name: s(club.name), city: s(club.city), country: s(club.country), createdAt: s(club.created_at) },
    departments: rows.departments.map((d) => ({ id: s(d.id), clubId: s(d.club_id), name: s(d.name) })),
    teams: rows.teams.map((t) => ({
      id: s(t.id), clubId: s(t.club_id), departmentId: s(t.department_id), name: s(t.name),
      defaultFacilityId: sn(t.default_facility_id), features: ((t.features as string[] | null) ?? []).filter((f): f is TeamFeature => (TEAM_FEATURES as readonly string[]).includes(f)),
      archivedAt: sn(t.archived_at), createdAt: s(t.created_at),
    })),
    facilities: rows.facilities.map((f) => ({ id: s(f.id), clubId: s(f.club_id), name: s(f.name), address: s(f.address) })),
    departmentFacilities: rows.department_facilities.map((l) => ({ departmentId: s(l.department_id), facilityId: s(l.facility_id) })),
    people: rows.people.map((p) => ({
      id: s(p.id), clubId: s(p.club_id), userId: sn(p.user_id), firstName: s(p.first_name), lastName: s(p.last_name), createdAt: s(p.created_at),
    })),
    memberships: rows.memberships.map((m) => ({
      id: s(m.id), personId: s(m.person_id), teamId: s(m.team_id), role: m.role as 'coach' | 'athlete',
      coachRoleId: sn(m.coach_role_id), createdAt: s(m.created_at),
    })),
    coachRoles: rows.coach_roles.map((r) => ({
      id: s(r.id), teamId: s(r.team_id), name: s(r.name), permissions: r.permissions as LocalDatabase['coachRoles'][number]['permissions'],
      locked: Boolean(r.locked), createdAt: s(r.created_at),
    })),
    joinCodes: rows.team_join_codes.map((c) => ({ teamId: s(c.team_id), code: s(c.code), createdAt: s(c.created_at) })),
    staffInvites: rows.staff_invites.map((i) => ({
      token: s(i.token), personId: s(i.person_id), teamId: s(i.team_id), createdAt: s(i.created_at), expiresAt: s(i.expires_at),
      acceptedAt: sn(i.accepted_at),
    })),
    clubRoles: rows.club_roles.map((r) => ({
      id: s(r.id), clubId: s(r.club_id), personId: s(r.person_id), role: r.role as ClubRoleKind, departmentId: sn(r.department_id),
      createdAt: s(r.created_at),
    })),
    clubRoleInvites: rows.club_role_invites.map((i) => ({
      token: s(i.token), clubRoleId: s(i.club_role_id), createdAt: s(i.created_at), expiresAt: s(i.expires_at), acceptedAt: sn(i.accepted_at),
    })),
    playerGroups: rows.player_groups.map((g) => ({ id: s(g.id), teamId: s(g.team_id), name: s(g.name) })),
    playerGroupMembers: rows.player_group_members.map((m) => ({ groupId: s(m.group_id), personId: s(m.person_id) })),
    sessions: rows.sessions
      .map((x) => ({
        id: s(x.id), clubId: s(x.club_id), departmentId: s(x.department_id), teamId: s(x.team_id), title: s(x.title),
        sessionType: x.session_type as SessionType, startsAt: s(x.starts_at), endsAt: s(x.ends_at), facilityId: sn(x.facility_id),
        groupIds: (x.group_ids as string[]) ?? [], seriesId: sn(x.series_id), seriesWeekStart: sn(x.series_week_start), createdAt: s(x.created_at),
        notes: sn(x.notes), meetMinutesBefore: x.meet_minutes_before === null || x.meet_minutes_before === undefined ? null : Number(x.meet_minutes_before),
        meetPoint: sn(x.meet_point), opponent: sn(x.opponent), homeAway: (sn(x.home_away) as 'home' | 'away' | null), venueAddress: sn(x.venue_address),
      }))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    sessionSeries: rows.session_series.map((x) => ({
      id: s(x.id), clubId: s(x.club_id), departmentId: s(x.department_id), teamId: s(x.team_id), title: s(x.title),
      sessionType: x.session_type as SessionType, weekday: Number(x.weekday), startTime: s(x.start_time), endTime: s(x.end_time),
      facilityId: sn(x.facility_id), groupIds: (x.group_ids as string[]) ?? [], activeFrom: sn(x.active_from), activeUntil: sn(x.active_until),
      createdAt: s(x.created_at),
      notes: sn(x.notes), meetMinutesBefore: x.meet_minutes_before === null || x.meet_minutes_before === undefined ? null : Number(x.meet_minutes_before),
      meetPoint: sn(x.meet_point),
    })),
    sessionSeriesWeekStates: rows.session_series_week_states.map((w) => ({
      seriesId: s(w.series_id), weekStart: s(w.week_start), checked: Boolean(w.checked), committedSessionId: sn(w.committed_session_id),
      updatedAt: s(w.updated_at),
    })),
    availability: rows.availability.map((a): Availability => ({
      id: s(a.id), sessionId: s(a.session_id), personId: s(a.person_id), status: a.status as Availability['status'],
      reason: reasonByAvailability.get(s(a.id)) ?? null, lateMinutes: a.late_minutes === null ? null : Number(a.late_minutes),
      reportedAt: s(a.reported_at), seeded: false,
    })),
    loadEntries: rows.load_entries
      .map((e) => ({
        id: s(e.id), personId: s(e.person_id), sessionId: sn(e.session_id), teamId: sn(e.team_id),
        teamName: e.team_id ? teamNameById.get(s(e.team_id)) ?? null : null, date: s(e.date), startsAt: sn(e.starts_at),
        title: s(e.title), trainingType: e.training_type as LoadTrainingType, rpe: Number(e.rpe), durationMinutes: Number(e.duration_minutes),
        load: Number(e.load), note: sn(e.note), source: e.source as 'planned_session' | 'solo' | 'manual', createdAt: s(e.created_at),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    loadSummaries: rows.load_summaries.map((x): LoadSummaryRow => ({
      personId: s(x.person_id), acwr: x.acwr === null ? null : Number(x.acwr), chronicFull: Boolean(x.chronic_full), updatedAt: s(x.updated_at),
    })),
    athletePlans: rows.athlete_plans.map((p) => ({
      id: s(p.id), personId: s(p.person_id), teamId: sn(p.team_id), teamName: p.team_id ? teamNameById.get(s(p.team_id)) ?? null : null,
      title: s(p.title), date: s(p.date), startsAt: sn(p.starts_at), trainingType: p.training_type as LoadTrainingType,
      expectedRpe: Number(p.expected_rpe), expectedDurationMinutes: Number(p.expected_duration_minutes), note: sn(p.note), createdAt: s(p.created_at),
    })),
    acknowledgedSessions: rows.acknowledged_sessions.map((a) => ({ personId: s(a.person_id), sessionId: s(a.session_id) })),
    loadEntryReviews: rows.load_entry_reviews.map((r) => ({
      entryId: s(r.entry_id), personId: s(r.person_id), requestedBy: sn(r.requested_by), note: sn(r.note), createdAt: s(r.created_at),
    })),
    attendanceConfirmations: rows.attendance_confirmations.map((c) => ({
      sessionId: s(c.session_id), personId: s(c.person_id), present: Boolean(c.present), confirmedBy: sn(c.confirmed_by), confirmedAt: s(c.confirmed_at),
    })),
    shareLinks: context.previous?.shareLinks ?? {},
    activeIdentity: null,
  };

  database.activeIdentity = identityFor(database, context.userId, context.previous?.activeIdentity ?? null);
  return database;
}

/**
 * Who the app acts as: always the signed-in person. Coach if they coach a
 * team, athlete otherwise, club admin or department lead (`club`) without a
 * team; a previous choice between their own roles is kept.
 */
export function identityFor(
  database: LocalDatabase,
  userId: string,
  previous: LocalDatabase['activeIdentity'],
): LocalDatabase['activeIdentity'] {
  const mine = database.people.filter((person) => person.userId === userId).map((person) => person.id);
  const roles = database.memberships.filter((m) => mine.includes(m.personId));
  const clubRole = database.clubRoles.find((candidate) => mine.includes(candidate.personId));
  if (previous && mine.includes(previous.personId)) {
    if (previous.role === 'club' ? clubRole?.personId === previous.personId : roles.some((m) => m.personId === previous.personId && m.role === previous.role)) {
      return previous;
    }
  }
  const coach = roles.find((m) => m.role === 'coach');
  if (coach) return { role: 'coach', personId: coach.personId };
  const athlete = roles.find((m) => m.role === 'athlete');
  if (athlete) return { role: 'athlete', personId: athlete.personId };
  if (clubRole) return { role: 'club', personId: clubRole.personId };
  return null;
}
