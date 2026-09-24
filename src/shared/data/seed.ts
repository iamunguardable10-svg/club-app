/**
 * Builds the local test club.
 *
 * Runs once on first start and again after every reset. The data is
 * deterministic for a given day: the same seed produces the same club, so a
 * tester who resets twice sees the same numbers and can tell a real change
 * from noise.
 *
 * The important non-obvious requirement is the load history. ACWR compares a
 * 7-day average against a 28-day average, so anything shorter than ~30 days of
 * varied history shows either nothing or a meaningless 1.0. The seed therefore
 * generates SEED_HISTORY_DAYS of load with real variation, including rest days.
 */

import { SCHEMA_VERSION } from './migrations';
import { COACH_PERMISSIONS } from './schema';
import type {
  AthletePlan,
  CoachPermission,
  CoachRole,
  Availability,
  Club,
  Department,
  DepartmentFacility,
  Facility,
  Id,
  LoadEntry,
  LoadSummaryRow,
  LocalDatabase,
  Membership,
  Person,
  PlayerGroup,
  PlayerGroupMember,
  Session,
  SessionSeries,
  SessionType,
  ClubRole,
} from './schema';
import { sessionTypeToLoadType } from './loadTypes';
import { summarizeLoadEntries } from './loadCalculations';

/** Days of load history before today. Must stay above 28 for ACWR to work. */
const SEED_HISTORY_DAYS = 42;

/** Days of planned sessions after today. */
const SEED_FUTURE_DAYS = 21;

const CLUB_ID = 'club-ruhrtal';
const DEPARTMENT_ID = 'dep-basketball';

const TEAM_U16 = 'team-u16';
const TEAM_U18 = 'team-u18';

const FACILITY_MAIN = 'facility-sporthalle-nord';
const FACILITY_SMALL = 'facility-gymnastikhalle';
const FACILITY_GYM = 'facility-kraftraum';

/**
 * Deterministic pseudo-random numbers, so a reset reproduces the same club.
 *
 * The hash has to avalanche properly. A plain `state * 31 + char` accumulator
 * leaves neighbouring seeds — and session ids differ only in their trailing
 * characters — mapped to neighbouring states, which correlated the draws
 * within one session: whole teams reported absent for one session and nobody
 * for the next. FNV-1a plus mulberry32 with a warm-up decorrelates them.
 */
function makeRandom(seed: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  let state = hash;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };

  // Discard the first draws so the output no longer reflects the raw hash.
  next();
  next();
  return next;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function dateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function at(date: Date, time: string) {
  const [hour, minute] = time.split(':').map(Number);
  const copy = new Date(date);
  copy.setHours(hour, minute, 0, 0);
  return copy;
}

function mondayOf(date: Date) {
  const copy = startOfDay(date);
  const weekday = copy.getDay();
  return addDays(copy, weekday === 0 ? -6 : 1 - weekday);
}

const U16_NAMES: [string, string][] = [
  ['Jonas', 'Kern'], ['Elias', 'Brandt'], ['Noah', 'Wagner'], ['Leon', 'Hoffmann'],
  ['Luis', 'Schröder'], ['Finn', 'Kaiser'], ['Matteo', 'Vogel'], ['Emil', 'Busch'],
  ['Tim', 'Lorenz'], ['Jannik', 'Seidel'], ['Paul', 'Hartmann'], ['Ben', 'Albrecht'],
];

const U18_NAMES: [string, string][] = [
  ['Lena', 'Sturm'], ['Marie', 'Köhler'], ['Amelie', 'Ziegler'], ['Clara', 'Böhm'],
  ['Mia', 'Frank'], ['Hanna', 'Engel'], ['Sophia', 'Keller'], ['Lina', 'Roth'],
  ['Emma', 'Winkler'], ['Nele', 'Bergmann'], ['Ida', 'Schuster'], ['Frieda', 'Walther'],
];

/**
 * Default coach roles every team starts with. Agreed with the club: head
 * coach, co-trainer and athletic coach see and may do everything; the
 * Team Manager sees who is in the squad and who is coming, nothing
 * about load or the reasons someone is out. Head coaches can change any of this
 * per team except their own role, which is locked.
 */
export const COACH_ROLE_TEMPLATES: { key: string; name: string; permissions: CoachPermission[]; locked: boolean }[] = [
  { key: 'head', name: 'Head Coach', permissions: [...COACH_PERMISSIONS], locked: true },
  { key: 'assistant', name: 'Assistant Coach', permissions: [...COACH_PERMISSIONS], locked: false },
  { key: 'athletic', name: 'Athletic Coach', permissions: [...COACH_PERMISSIONS], locked: false },
  { key: 'manager', name: 'Team Manager', permissions: ['viewRoster', 'viewAttendance'], locked: false },
];

/** Staff of the test club, with the role each holds per team. */
const STAFF: { firstName: string; lastName: string; roles: { teamId: Id; role: string }[] }[] = [
  { firstName: 'Martin', lastName: 'Weber', roles: [{ teamId: 'team-u16', role: 'head' }] },
  { firstName: 'Sabine', lastName: 'Köhler', roles: [{ teamId: 'team-u18', role: 'head' }] },
  { firstName: 'Tobias', lastName: 'Neumann', roles: [{ teamId: 'team-u16', role: 'assistant' }, { teamId: 'team-u18', role: 'assistant' }] },
  { firstName: 'Jana', lastName: 'Vogt', roles: [{ teamId: 'team-u16', role: 'athletic' }] },
  { firstName: 'Uwe', lastName: 'Heller', roles: [{ teamId: 'team-u16', role: 'manager' }] },
];

type SeriesTemplate = {
  id: Id;
  teamId: Id;
  title: string;
  sessionType: SessionType;
  weekday: number;
  startTime: string;
  endTime: string;
  facilityId: Id;
};

const SERIES_TEMPLATES: SeriesTemplate[] = [
  { id: 'series-u16-mon', teamId: TEAM_U16, title: 'Mannschaftstraining', sessionType: 'training', weekday: 1, startTime: '17:30', endTime: '19:00', facilityId: FACILITY_MAIN },
  { id: 'series-u16-wed', teamId: TEAM_U16, title: 'Mannschaftstraining', sessionType: 'training', weekday: 3, startTime: '17:30', endTime: '19:00', facilityId: FACILITY_MAIN },
  { id: 'series-u16-fri', teamId: TEAM_U16, title: 'Athletik', sessionType: 's_and_c', weekday: 5, startTime: '16:30', endTime: '17:30', facilityId: FACILITY_GYM },
  { id: 'series-u16-sat', teamId: TEAM_U16, title: 'Spieltag', sessionType: 'game', weekday: 6, startTime: '11:00', endTime: '13:00', facilityId: FACILITY_MAIN },
  { id: 'series-u18-tue', teamId: TEAM_U18, title: 'Mannschaftstraining', sessionType: 'training', weekday: 2, startTime: '19:00', endTime: '20:45', facilityId: FACILITY_MAIN },
  { id: 'series-u18-thu', teamId: TEAM_U18, title: 'Mannschaftstraining', sessionType: 'training', weekday: 4, startTime: '19:00', endTime: '20:45', facilityId: FACILITY_SMALL },
  { id: 'series-u18-fri', teamId: TEAM_U18, title: 'Athletik', sessionType: 's_and_c', weekday: 5, startTime: '18:00', endTime: '19:00', facilityId: FACILITY_GYM },
  { id: 'series-u18-sun', teamId: TEAM_U18, title: 'Spieltag', sessionType: 'game', weekday: 0, startTime: '15:00', endTime: '17:00', facilityId: FACILITY_MAIN },
];

/** Typical RPE per session type, before per-athlete and per-day variation. */
const BASE_RPE: Record<SessionType, number> = {
  training: 6,
  s_and_c: 5,
  game: 8,
  recovery: 3,
  other: 5,
};

/** One traffic-light row per athlete with entries, as the repository keeps them. */
function summariesFor(entries: LoadEntry[], now: Date): LoadSummaryRow[] {
  const byPerson = new Map<Id, LoadEntry[]>();
  for (const entry of entries) byPerson.set(entry.personId, [...(byPerson.get(entry.personId) ?? []), entry]);
  return Array.from(byPerson, ([personId, personEntries]) => ({
    personId,
    ...summarizeLoadEntries(personEntries),
    updatedAt: now.toISOString(),
  }));
}

export function createSeedDatabase(now: Date = new Date()): LocalDatabase {
  const today = startOfDay(now);
  const createdAt = addDays(today, -SEED_HISTORY_DAYS).toISOString();

  const club: Club = {
    id: CLUB_ID,
    name: 'SV Ruhrtal',
    city: 'Essen',
    country: 'Deutschland',
    createdAt,
  };

  const departments: Department[] = [
    { id: DEPARTMENT_ID, clubId: CLUB_ID, name: 'Basketball' },
  ];

  const facilities: Facility[] = [
    { id: FACILITY_MAIN, clubId: CLUB_ID, name: 'Sporthalle Nord', address: 'Nordring 12, 45141 Essen' },
    { id: FACILITY_SMALL, clubId: CLUB_ID, name: 'Gymnastikhalle', address: 'Nordring 12, 45141 Essen' },
    { id: FACILITY_GYM, clubId: CLUB_ID, name: 'Kraftraum', address: 'Nordring 14, 45141 Essen' },
  ];

  const departmentFacilities: DepartmentFacility[] = facilities.map((facility) => ({
    departmentId: DEPARTMENT_ID,
    facilityId: facility.id,
  }));

  const teams: LocalDatabase['teams'] = [
    { id: TEAM_U16, clubId: CLUB_ID, departmentId: DEPARTMENT_ID, name: 'U16 Jungen', defaultFacilityId: FACILITY_MAIN, features: ['load'], archivedAt: null, createdAt },
    // Without load tracking, to show a team that only plans sessions and
    // attendance (piece 3.5). Its players' load history stays, unseen.
    { id: TEAM_U18, clubId: CLUB_ID, departmentId: DEPARTMENT_ID, name: 'U18 Mädchen', defaultFacilityId: FACILITY_MAIN, features: [], archivedAt: null, createdAt },
  ];

  const people: Person[] = [];
  const memberships: Membership[] = [];

  const coachRoles: CoachRole[] = [TEAM_U16, TEAM_U18].flatMap((teamId) =>
    COACH_ROLE_TEMPLATES.map((template, index) => ({
      id: `role-${teamId}-${template.key}`,
      teamId,
      name: template.name,
      permissions: [...template.permissions],
      locked: template.locked,
      // One millisecond apart, so the roles keep their template order
      // (head, co, athletic, manager) wherever they are sorted by age.
      createdAt: new Date(Date.parse(createdAt) + index).toISOString(),
    })),
  );

  STAFF.forEach((member, index) => {
    const id = `coach-${index + 1}`;
    people.push({ id, clubId: CLUB_ID, userId: null, firstName: member.firstName, lastName: member.lastName, createdAt });
    member.roles.forEach(({ teamId, role }) => {
      memberships.push({
        id: `m-${id}-${teamId}`,
        personId: id,
        teamId,
        role: 'coach',
        coachRoleId: `role-${teamId}-${role}`,
        createdAt,
      });
    });
  });

  // Above the teams (piece 8): a club admin and the Basketball lead, neither
  // of them coaching, so the demo shows what these roles see on their own.
  people.push(
    { id: 'club-admin-1', clubId: CLUB_ID, userId: null, firstName: 'Claudia', lastName: 'Brandt', createdAt },
    { id: 'department-lead-1', clubId: CLUB_ID, userId: null, firstName: 'Frank', lastName: 'Meyer', createdAt },
  );
  const clubRoles: ClubRole[] = [
    { id: 'club-role-admin-1', clubId: CLUB_ID, personId: 'club-admin-1', role: 'admin', departmentId: null, createdAt },
    { id: 'club-role-lead-1', clubId: CLUB_ID, personId: 'department-lead-1', role: 'department_lead', departmentId: DEPARTMENT_ID, createdAt },
  ];

  const addAthletes = (teamId: Id, names: [string, string][], prefix: string) => {
    names.forEach(([firstName, lastName], index) => {
      const id = `${prefix}-${index + 1}`;
      people.push({ id, clubId: CLUB_ID, userId: null, firstName, lastName, createdAt });
      memberships.push({ id: `m-${id}`, personId: id, teamId, role: 'athlete', coachRoleId: null, createdAt });
    });
  };

  addAthletes(TEAM_U16, U16_NAMES, 'athlete-u16');
  addAthletes(TEAM_U18, U18_NAMES, 'athlete-u18');

  const playerGroups: PlayerGroup[] = [
    { id: 'group-u16-starters', teamId: TEAM_U16, name: 'Starting Five' },
    { id: 'group-u16-rehab', teamId: TEAM_U16, name: 'Aufbau' },
    { id: 'group-u18-starters', teamId: TEAM_U18, name: 'Starting Five' },
  ];

  const playerGroupMembers: PlayerGroupMember[] = [
    ...U16_NAMES.slice(0, 5).map((_, index) => ({ groupId: 'group-u16-starters', personId: `athlete-u16-${index + 1}` })),
    ...U16_NAMES.slice(10).map((_, index) => ({ groupId: 'group-u16-rehab', personId: `athlete-u16-${index + 11}` })),
    ...U18_NAMES.slice(0, 5).map((_, index) => ({ groupId: 'group-u18-starters', personId: `athlete-u18-${index + 1}` })),
  ];

  const sessionSeries: SessionSeries[] = SERIES_TEMPLATES.map((template) => ({
    id: template.id,
    clubId: CLUB_ID,
    departmentId: DEPARTMENT_ID,
    teamId: template.teamId,
    title: template.title,
    sessionType: template.sessionType,
    weekday: template.weekday,
    startTime: template.startTime,
    endTime: template.endTime,
    facilityId: template.facilityId,
    groupIds: [],
    activeFrom: null,
    activeUntil: null,
    createdAt,
  }));

  // Materialise the series across the whole window so both past history and
  // upcoming sessions exist without anyone having to confirm a week first.
  const sessions: Session[] = [];
  for (let offset = -SEED_HISTORY_DAYS; offset <= SEED_FUTURE_DAYS; offset += 1) {
    const day = addDays(today, offset);
    for (const template of SERIES_TEMPLATES) {
      if (day.getDay() !== template.weekday) continue;
      sessions.push({
        id: `session-${template.id}-${dateOnly(day)}`,
        clubId: CLUB_ID,
        departmentId: DEPARTMENT_ID,
        teamId: template.teamId,
        title: template.title,
        sessionType: template.sessionType,
        startsAt: at(day, template.startTime).toISOString(),
        endsAt: at(day, template.endTime).toISOString(),
        facilityId: template.facilityId,
        groupIds: [],
        seriesId: template.id,
        seriesWeekStart: dateOnly(mondayOf(day)),
        createdAt,
      });
    }
  }
  sessions.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const athleteMemberships = memberships.filter((membership) => membership.role === 'athlete');
  const athletesByTeam = new Map<Id, Id[]>();
  for (const membership of athleteMemberships) {
    athletesByTeam.set(membership.teamId, [...(athletesByTeam.get(membership.teamId) ?? []), membership.personId]);
  }

  // The most recent past sessions are not rated yet, as after a real
  // training day: the latest one by nobody, the one before by about half. The
  // demo then shows the "How hard was it?" prompt (piece 4).
  const latestPastByTeam = new Map<Id, Id[]>();
  for (const session of [...sessions].reverse()) {
    if (new Date(session.endsAt).getTime() >= now.getTime()) continue;
    const list = latestPastByTeam.get(session.teamId) ?? [];
    if (list.length < 2) latestPastByTeam.set(session.teamId, [...list, session.id]);
  }
  const unratedByAll = new Set([...latestPastByTeam.values()].map((ids) => ids[0]).filter(Boolean));
  const unratedBySome = new Set([...latestPastByTeam.values()].map((ids) => ids[1]).filter(Boolean));

  const availability: Availability[] = [];
  const loadEntries: LoadEntry[] = [];
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

  for (const session of sessions) {
    const sessionDay = new Date(session.startsAt);
    const isPast = sessionDay.getTime() < now.getTime();
    const athletes = athletesByTeam.get(session.teamId) ?? [];

    for (const personId of athletes) {
      const random = makeRandom(`${session.id}:${personId}`);
      const roll = random();

      // Roughly one in twelve reports absent, one in sixteen reports late.
      let status: Availability['status'] = 'in';
      if (roll < 0.08) status = 'out';
      else if (roll < 0.14) status = 'late';

      if (status !== 'in') {
        availability.push({
          id: `av-${session.id}-${personId}`,
          sessionId: session.id,
          personId,
          status,
          reason: status === 'out' ? (roll < 0.04 ? 'Krank' : 'Familientermin') : 'Bus verpasst',
          lateMinutes: status === 'late' ? 10 + Math.round(random() * 15) : null,
          reportedAt: addDays(sessionDay, -1).toISOString(),
          seeded: true,
        });
      }

      if (!isPast || status === 'out') continue;
      if (unratedByAll.has(session.id) || (unratedBySome.has(session.id) && random() < 0.5)) continue;

      // Past sessions the athlete attended produce a load entry.
      const durationMinutes = Math.round(
        (new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60_000,
      );
      const jitter = Math.round((random() - 0.5) * 3);
      const rpe = Math.min(10, Math.max(1, BASE_RPE[session.sessionType] + jitter));
      const effectiveDuration = status === 'late'
        ? Math.max(20, durationMinutes - (20 + Math.round(random() * 20)))
        : durationMinutes;

      loadEntries.push({
        id: `load-${session.id}-${personId}`,
        personId,
        sessionId: session.id,
        teamId: session.teamId,
        teamName: teamNameById.get(session.teamId) ?? null,
        date: dateOnly(sessionDay),
        startsAt: session.startsAt,
        title: session.title,
        trainingType: sessionTypeToLoadType(session.sessionType),
        rpe,
        durationMinutes: effectiveDuration,
        load: rpe * effectiveDuration,
        note: null,
        source: 'planned_session',
        createdAt: session.endsAt,
      });
    }
  }

  // A handful of solo entries per athlete so the history is not a perfectly
  // regular weekly pattern; a constant rhythm makes ACWR sit at 1.0 forever.
  for (const membership of athleteMemberships) {
    const random = makeRandom(`solo:${membership.personId}`);
    for (let index = 0; index < 6; index += 1) {
      const offset = -Math.floor(random() * SEED_HISTORY_DAYS) - 1;
      const day = addDays(today, offset);
      const durationMinutes = 30 + Math.round(random() * 30);
      const rpe = 3 + Math.round(random() * 3);
      loadEntries.push({
        id: `load-solo-${membership.personId}-${index}`,
        personId: membership.personId,
        sessionId: null,
        teamId: membership.teamId,
        teamName: teamNameById.get(membership.teamId) ?? null,
        date: dateOnly(day),
        startsAt: null,
        title: index % 2 === 0 ? 'Lauf' : 'Wurftraining',
        trainingType: index % 2 === 0 ? 'individual' : 'individual',
        rpe,
        durationMinutes,
        load: rpe * durationMinutes,
        note: null,
        source: 'solo',
        createdAt: day.toISOString(),
      });
    }
  }

  loadEntries.sort((a, b) => a.date.localeCompare(b.date));

  // Two self-planned sessions per athlete, as the old demo workspace seeded
  // them, so the planning feature and the load forecast have something to
  // show from the first start.
  const athletePlans: AthletePlan[] = athleteMemberships.flatMap((membership) => {
    const strengthDay = addDays(today, 2);
    const recoveryDay = addDays(today, 4);
    return [
      {
        id: `plan-${membership.personId}-strength`,
        personId: membership.personId,
        teamId: null,
        teamName: null,
        title: 'Kraft',
        date: dateOnly(strengthDay),
        startsAt: at(strengthDay, '17:00').toISOString(),
        trainingType: 'strength' as const,
        expectedRpe: 7,
        expectedDurationMinutes: 60,
        note: null,
        createdAt,
      },
      {
        id: `plan-${membership.personId}-recovery`,
        personId: membership.personId,
        teamId: null,
        teamName: null,
        title: 'Regeneration',
        date: dateOnly(recoveryDay),
        startsAt: at(recoveryDay, '10:00').toISOString(),
        trainingType: 'recovery' as const,
        expectedRpe: 3,
        expectedDurationMinutes: 35,
        note: null,
        createdAt,
      },
    ];
  });

  return {
    version: SCHEMA_VERSION,
    seededAt: now.toISOString(),
    club,
    departments,
    teams,
    facilities,
    departmentFacilities,
    people,
    memberships,
    coachRoles,
    // Codes exist locally so the data looks like the server's; joining with
    // them needs accounts and only works there.
    joinCodes: teams.map((team, index) => ({ teamId: team.id, code: ['TESTABCD', 'TESTEFGH'][index] ?? 'TESTJKMN', createdAt })),
    staffInvites: [],
    clubRoles,
    clubRoleInvites: [],
    playerGroups,
    playerGroupMembers,
    sessions,
    sessionSeries,
    sessionSeriesWeekStates: [],
    availability,
    loadEntries,
    loadSummaries: summariesFor(loadEntries, now),
    athletePlans,
    acknowledgedSessions: [],
    shareLinks: {},
    // Start as the first coach so the app is usable immediately. Run 3 adds
    // the entry page that asks which role to test as and lets the person
    // switch; until then an unset identity would leave every screen empty
    // with no way to fix it.
    activeIdentity: { role: 'coach', personId: 'coach-1' },
  };
}
