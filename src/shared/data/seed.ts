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

import { LEGAL_VERSION } from './consentRules';
import { SCHEMA_VERSION } from './migrations';
import { COACH_PERMISSIONS } from './schema';
import type {
  Absence,
  AttendanceConfirmation,
  LoadEntryReview,
  SquadEntry,
  MessageRead,
  Message,
  MessageVote,
  MessageWriter,
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
import { DEMO_TEXTS } from './demoTexts';
import type { Locale } from '@/shared/i18n/locales';

/** Days of load history before today. Must stay above 28 for ACWR to work. */
const SEED_HISTORY_DAYS = 42;

/** Days of planned sessions after today. */
const SEED_FUTURE_DAYS = 21;

const CLUB_ID = 'club-ruhrtal';
const DEPARTMENT_ID = 'dep-basketball';
const DEPARTMENT_VOLLEYBALL = 'dep-volleyball';

const TEAM_U16 = 'team-u16';
const TEAM_U18 = 'team-u18';
const TEAM_W1 = 'team-w1';

const FACILITY_MAIN = 'facility-sporthalle-nord';
const FACILITY_SMALL = 'facility-gymnastikhalle';
const FACILITY_GYM = 'facility-kraftraum';
const FACILITY_SOUTH = 'facility-turnhalle-sued';

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

const W1_NAMES: [string, string][] = [
  ['Anna', 'Krüger'], ['Julia', 'Lange'], ['Katharina', 'Peters'], ['Sarah', 'Jung'],
  ['Laura', 'Graf'], ['Lisa', 'Haas'], ['Nina', 'Sommer'], ['Eva', 'Fuchs'],
  ['Carla', 'Wolf'], ['Tina', 'Arnold'],
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
  { firstName: 'Petra', lastName: 'Lindner', roles: [{ teamId: 'team-w1', role: 'head' }] },
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
  { id: 'series-u16-mon', teamId: TEAM_U16, title: 'Team training', sessionType: 'training', weekday: 1, startTime: '17:30', endTime: '19:00', facilityId: FACILITY_MAIN },
  { id: 'series-u16-wed', teamId: TEAM_U16, title: 'Team training', sessionType: 'training', weekday: 3, startTime: '17:30', endTime: '19:00', facilityId: FACILITY_MAIN },
  { id: 'series-u16-fri', teamId: TEAM_U16, title: 'Strength', sessionType: 's_and_c', weekday: 5, startTime: '16:30', endTime: '17:30', facilityId: FACILITY_GYM },
  { id: 'series-u16-sat', teamId: TEAM_U16, title: 'Game', sessionType: 'game', weekday: 6, startTime: '11:00', endTime: '13:00', facilityId: FACILITY_MAIN },
  { id: 'series-u18-tue', teamId: TEAM_U18, title: 'Team training', sessionType: 'training', weekday: 2, startTime: '19:00', endTime: '20:45', facilityId: FACILITY_MAIN },
  { id: 'series-u18-thu', teamId: TEAM_U18, title: 'Team training', sessionType: 'training', weekday: 4, startTime: '19:00', endTime: '20:45', facilityId: FACILITY_SMALL },
  { id: 'series-u18-fri', teamId: TEAM_U18, title: 'Strength', sessionType: 's_and_c', weekday: 5, startTime: '18:00', endTime: '19:00', facilityId: FACILITY_GYM },
  { id: 'series-u18-sun', teamId: TEAM_U18, title: 'Game', sessionType: 'game', weekday: 0, startTime: '15:00', endTime: '17:00', facilityId: FACILITY_MAIN },
  // Volleyball shares the North Hall right after the U18 (hall calendar, piece 8).
  { id: 'series-w1-tue', teamId: TEAM_W1, title: 'Team training', sessionType: 'training', weekday: 2, startTime: '20:45', endTime: '22:15', facilityId: FACILITY_MAIN },
  { id: 'series-w1-thu', teamId: TEAM_W1, title: 'Team training', sessionType: 'training', weekday: 4, startTime: '19:30', endTime: '21:00', facilityId: FACILITY_SOUTH },
  { id: 'series-w1-sat', teamId: TEAM_W1, title: 'Game', sessionType: 'game', weekday: 6, startTime: '15:00', endTime: '17:00', facilityId: FACILITY_SOUTH },
];

const DEPARTMENT_OF_TEAM: Record<Id, Id> = { [TEAM_U16]: DEPARTMENT_ID, [TEAM_U18]: DEPARTMENT_ID, [TEAM_W1]: DEPARTMENT_VOLLEYBALL };

/** Typical RPE per session type, before per-athlete and per-day variation. */
const BASE_RPE: Record<SessionType, number> = {
  training: 6,
  s_and_c: 5,
  game: 8,
  recovery: 3,
  other: 5,
  // Never rated (0048).
  meeting: 0,
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

/**
 * The demo club. `locale` picks the language of its own words (`DEMO_TEXTS`);
 * tests use the English default.
 */
export function createSeedDatabase(now: Date = new Date(), locale: Locale = 'en'): LocalDatabase {
  const T = DEMO_TEXTS[locale];
  const today = startOfDay(now);
  const createdAt = addDays(today, -SEED_HISTORY_DAYS).toISOString();

  const club: Club = {
    id: CLUB_ID,
    name: 'SV Ruhrtal',
    city: 'Essen',
    country: 'Germany',
    createdAt,
  };

  // Two departments that share the North Hall (piece 8); the South Gym is Volleyball's own.
  const departments: Department[] = [
    { id: DEPARTMENT_ID, clubId: CLUB_ID, name: 'Basketball' },
    { id: DEPARTMENT_VOLLEYBALL, clubId: CLUB_ID, name: 'Volleyball' },
  ];

  const facilities: Facility[] = [
    { id: FACILITY_MAIN, clubId: CLUB_ID, name: T.halls.main, address: 'Nordring 12, 45141 Essen' },
    { id: FACILITY_SMALL, clubId: CLUB_ID, name: T.halls.small, address: 'Nordring 12, 45141 Essen' },
    { id: FACILITY_GYM, clubId: CLUB_ID, name: T.halls.gym, address: 'Nordring 14, 45141 Essen' },
    { id: FACILITY_SOUTH, clubId: CLUB_ID, name: T.halls.south, address: 'Rüttenscheider Str. 160, 45131 Essen' },
  ];

  const departmentFacilities: DepartmentFacility[] = [
    ...[FACILITY_MAIN, FACILITY_SMALL, FACILITY_GYM].map((facilityId) => ({ departmentId: DEPARTMENT_ID, facilityId })),
    ...[FACILITY_MAIN, FACILITY_SOUTH].map((facilityId) => ({ departmentId: DEPARTMENT_VOLLEYBALL, facilityId })),
  ];

  const teams: LocalDatabase['teams'] = [
    { id: TEAM_U16, clubId: CLUB_ID, departmentId: DEPARTMENT_ID, name: T.teams.u16, ageGroup: 'U16', defaultFacilityId: FACILITY_MAIN, features: ['load'], archivedAt: null, createdAt },
    // Without load tracking, to show a team that only plans sessions and
    // attendance (piece 3.5). Its players' load history stays, unseen.
    { id: TEAM_U18, clubId: CLUB_ID, departmentId: DEPARTMENT_ID, name: T.teams.u18, ageGroup: 'U18', defaultFacilityId: FACILITY_MAIN, features: [], archivedAt: null, createdAt },
    { id: TEAM_W1, clubId: CLUB_ID, departmentId: DEPARTMENT_VOLLEYBALL, name: T.teams.women, ageGroup: 'adults', defaultFacilityId: FACILITY_SOUTH, features: ['load'], archivedAt: null, createdAt },
  ];

  const people: Person[] = [];
  const memberships: Membership[] = [];

  const coachRoles: CoachRole[] = [TEAM_U16, TEAM_U18, TEAM_W1].flatMap((teamId) =>
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

  // Piece A: two U16 players say yes themselves, so the coach sees open answers.
  const saysYesThemselves = new Set(['athlete-u16-4', 'athlete-u16-7']);
  const addAthletes = (teamId: Id, names: [string, string][], prefix: string) => {
    names.forEach(([firstName, lastName], index) => {
      const id = `${prefix}-${index + 1}`;
      people.push({ id, clubId: CLUB_ID, userId: null, firstName, lastName, rsvpMode: saysYesThemselves.has(id) ? 'manual' : 'auto', createdAt });
      memberships.push({ id: `m-${id}`, personId: id, teamId, role: 'athlete', coachRoleId: null, createdAt });
    });
  };

  addAthletes(TEAM_U16, U16_NAMES, 'athlete-u16');
  addAthletes(TEAM_U18, U18_NAMES, 'athlete-u18');
  addAthletes(TEAM_W1, W1_NAMES, 'athlete-w1');

  const playerGroups: PlayerGroup[] = [
    { id: 'group-u16-starters', teamId: TEAM_U16, name: T.groups.starters },
    { id: 'group-u16-rehab', teamId: TEAM_U16, name: T.groups.rehab },
    { id: 'group-u18-starters', teamId: TEAM_U18, name: T.groups.starters },
  ];

  const playerGroupMembers: PlayerGroupMember[] = [
    ...U16_NAMES.slice(0, 5).map((_, index) => ({ groupId: 'group-u16-starters', personId: `athlete-u16-${index + 1}` })),
    ...U16_NAMES.slice(10).map((_, index) => ({ groupId: 'group-u16-rehab', personId: `athlete-u16-${index + 11}` })),
    ...U18_NAMES.slice(0, 5).map((_, index) => ({ groupId: 'group-u18-starters', personId: `athlete-u18-${index + 1}` })),
  ];

  const sessionSeries: SessionSeries[] = SERIES_TEMPLATES.map((template) => ({
    id: template.id,
    clubId: CLUB_ID,
    departmentId: DEPARTMENT_OF_TEAM[template.teamId],
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

  // Piece 14: games get an opponent and a meeting, trainings sometimes a note.
  function demoDetails(sessionType: SessionType, teamId: Id, offset: number): Partial<Session> {
    const week = Math.floor((offset + SEED_HISTORY_DAYS) / 7);
    if (sessionType === 'game') {
      const away = week % 2 === 1;
      const opponents = ['TSV Neustadt', 'SC Rotweiß', 'BG Essen-West', 'TuS Kray'];
      return {
        opponent: opponents[(week + (teamId === TEAM_U18 ? 2 : 0)) % opponents.length],
        homeAway: away ? 'away' : 'home',
        venueAddress: away ? 'Sportpark 3, 45127 Essen' : null,
        ...(away ? { facilityId: null } : {}),
        meetMinutesBefore: away ? 90 : 45,
        meetPoint: away ? T.meetAway : T.meetHome,
        notes: away ? T.noteAway : null,
      };
    }
    if (sessionType === 'training' && week % 3 === 0) return { notes: T.noteTraining, meetMinutesBefore: 15 };
    return {};
  }

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
        departmentId: DEPARTMENT_OF_TEAM[template.teamId],
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
        ...demoDetails(template.sessionType, template.teamId, offset),
      });
    }
  }
  // A parents' and players' meeting, online (0048): shows the link, asks for no rating.
  const meetingDay = addDays(today, 2);
  sessions.push({
    id: `session-meeting-u16-${dateOnly(meetingDay)}`,
    clubId: CLUB_ID,
    departmentId: DEPARTMENT_ID,
    teamId: TEAM_U16,
    title: 'Meeting',
    sessionType: 'meeting',
    startsAt: at(meetingDay, '19:30').toISOString(),
    endsAt: at(meetingDay, '20:15').toISOString(),
    facilityId: null,
    groupIds: [],
    seriesId: null,
    seriesWeekStart: null,
    createdAt,
    notes: T.noteMeeting,
    onlineUrl: 'https://meet.example.com/u16-season',
  });
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

  // Messages (pieces 17, B, C): two announcements and a poll to the U16
  // players (most have read the older one, the demo player neither), one to
  // the whole club and one to Basketball. The Head Coach of U16 may write to
  // Basketball as well (the lead allowed it).
  const team = { teamIds: [TEAM_U16], groupIds: [], departmentIds: [], wholeClub: false, audience: 'players' as const };
  const messages: Message[] = [
    {
      id: 'message-demo-1', clubId: CLUB_ID, ...team, authorId: 'coach-5', important: false, pinnedUntil: null,
      body: T.messages.kit,
      createdAt: addDays(now, -3).toISOString(), remindedAt: null,
    },
    {
      id: 'message-demo-2', clubId: CLUB_ID, ...team, authorId: 'coach-1', important: true, pinnedUntil: addDays(now, 6).toISOString(),
      body: T.messages.game,
      createdAt: addDays(now, -1).toISOString(), remindedAt: null,
    },
    {
      id: 'message-demo-3', clubId: CLUB_ID, ...team, authorId: 'coach-1', important: false, pinnedUntil: null,
      body: T.messages.dinner,
      createdAt: addDays(now, -2).toISOString(), remindedAt: null,
      pollOptions: [...T.messages.dinnerOptions], pollMultiple: true, pollClosedAt: null,
    },
    {
      id: 'news-demo-1', clubId: CLUB_ID, teamIds: [], groupIds: [], departmentIds: [], wholeClub: true, audience: 'all',
      authorId: 'club-admin-1', important: false, pinnedUntil: null,
      body: T.messages.general,
      createdAt: addDays(now, -4).toISOString(), remindedAt: null,
    },
    {
      id: 'news-demo-2', clubId: CLUB_ID, teamIds: [], groupIds: [], departmentIds: [DEPARTMENT_ID], wholeClub: false, audience: 'all',
      authorId: 'department-lead-1', important: false, pinnedUntil: null,
      body: T.messages.camp,
      createdAt: addDays(now, -2).toISOString(), remindedAt: null,
    },
    {
      id: 'news-demo-3', clubId: CLUB_ID, teamIds: [], groupIds: [], departmentIds: [DEPARTMENT_VOLLEYBALL], wholeClub: false, audience: 'all',
      authorId: 'club-admin-1', important: false, pinnedUntil: null,
      body: T.messages.volleyball,
      createdAt: addDays(now, -1).toISOString(), remindedAt: null,
    },
    {
      // Reminded once (piece C): the U18 coach chased the answers.
      id: 'message-demo-4', clubId: CLUB_ID, teamIds: [TEAM_U18], groupIds: [], departmentIds: [], wholeClub: false, audience: 'players',
      authorId: 'coach-2', important: false, pinnedUntil: null,
      body: T.messages.u18,
      createdAt: addDays(now, -2).toISOString(), remindedAt: addDays(now, -1).toISOString(),
    },
  ];
  const messageWriters: MessageWriter[] = [
    { id: 'message-writer-1', clubId: CLUB_ID, personId: 'coach-1', departmentId: DEPARTMENT_ID, createdAt },
  ];
  const messageVotes: MessageVote[] = ([
    ['athlete-u16-2', [0, 1]], ['athlete-u16-3', [1]], ['athlete-u16-4', [1, 2]], ['athlete-u16-5', [0]], ['athlete-u16-6', [1]],
  ] as const).map(([personId, options]) => ({ messageId: 'message-demo-3', personId, options: [...options], votedAt: addDays(now, -1).toISOString() }));
  const messageReads: MessageRead[] = [
    ...['athlete-u16-2', 'athlete-u16-3', 'athlete-u16-4', 'athlete-u16-5', 'athlete-u16-6', 'athlete-u16-8', 'athlete-u16-9']
      .map((personId) => ({ messageId: 'message-demo-1', personId, readAt: addDays(now, -2).toISOString() })),
    ...['athlete-u16-2', 'athlete-u16-4', 'athlete-u16-6']
      .map((personId) => ({ messageId: 'message-demo-2', personId, readAt: now.toISOString() })),
  ];

  const availability: Availability[] = [];

  // Piece 16: one U16 player is injured for a while; their sessions in that
  // period have no report and no load of their own.
  const injured = { personId: 'athlete-u16-7', fromDate: dateOnly(addDays(today, -3)), toDate: dateOnly(addDays(today, 9)) };
  const absences: Absence[] = [{
    id: 'absence-demo-1', personId: injured.personId, fromDate: injured.fromDate, toDate: injured.toDate,
    kind: 'injured', note: T.injuryNote, createdBy: injured.personId, createdAt,
  }, {
    // Planned ahead (piece 16): a U18 player is away on holiday next week.
    id: 'absence-demo-2', personId: 'athlete-u18-3', fromDate: dateOnly(addDays(today, 5)), toDate: dateOnly(addDays(today, 12)),
    kind: 'holiday', note: T.holidayNote, createdBy: 'athlete-u18-3', createdAt,
  }];
  const loadEntries: LoadEntry[] = [];
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

  for (const session of sessions) {
    const sessionDay = new Date(session.startsAt);
    const isPast = sessionDay.getTime() < now.getTime();
    const athletes = athletesByTeam.get(session.teamId) ?? [];

    for (const personId of athletes) {
      if (absences.some((absence) => absence.personId === personId && dateOnly(sessionDay) >= absence.fromDate && dateOnly(sessionDay) <= absence.toDate)) continue;
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
          reason: status === 'out' ? (roll < 0.04 ? T.reasonSick : T.reasonFamily) : roll < 0.11 ? T.reasonBus : T.reasonExam,
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
        title: index % 2 === 0 ? T.soloRun : T.soloShooting,
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

  // The latest sessions are not rated yet (above), which would leave every
  // week looking too light. Extra work of their own in the last days gives
  // the traffic lights a real mix: most players in the green, one clearly
  // too high, a few low.
  const HEAVY = new Set(['athlete-u16-3', 'athlete-u18-5', 'athlete-w1-2']);
  for (const membership of athleteMemberships) {
    const random = makeRandom(`recent:${membership.personId}`);
    const heavy = HEAVY.has(membership.personId);
    // Heavy: two extra sessions a day for most of the week.
    const count = heavy ? 10 : membership.personId === 'athlete-u16-1' ? 5 : random() < 0.8 ? 3 : 0;
    for (let index = 0; index < count; index += 1) {
      const day = addDays(today, -(heavy ? Math.floor(index / 2) + 1 : index + 1));
      // The demo player sits in the green.
      const demoPlayer = membership.personId === 'athlete-u16-1';
      const durationMinutes = heavy ? 90 : demoPlayer ? 75 : 50 + Math.round(random() * 30);
      const rpe = heavy ? 9 : demoPlayer ? 7 : 5 + Math.round(random() * 2);
      loadEntries.push({
        id: `load-recent-${membership.personId}-${index}`,
        personId: membership.personId,
        sessionId: null,
        teamId: membership.teamId,
        teamName: teamNameById.get(membership.teamId) ?? null,
        date: dateOnly(day),
        startsAt: null,
        title: index % 2 === 0 ? T.soloShooting : T.soloRun,
        trainingType: 'individual',
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
      // A weekly strength series (piece 22), three weeks ahead.
      ...[0, 7, 14].map((offset) => {
        const day = addDays(strengthDay, offset);
        return {
          id: `plan-${membership.personId}-strength${offset === 0 ? '' : `-${offset}`}`,
          personId: membership.personId,
          teamId: null,
          teamName: null,
          title: 'Strength',
          date: dateOnly(day),
          startsAt: at(day, '17:00').toISOString(),
          trainingType: 'strength' as const,
          expectedRpe: 7,
          expectedDurationMinutes: 60,
          note: null,
          seriesId: `series-${membership.personId}-strength`,
          createdAt,
        };
      }),
      {
        id: `plan-${membership.personId}-recovery`,
        personId: membership.personId,
        teamId: null,
        teamName: null,
        title: 'Recovery',
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

  // One away game shows seats and a request immediately in both role views.
  const rideGame = sessions.find((session) => session.teamId === TEAM_U16 && session.sessionType === 'game' && Date.parse(session.startsAt) > now.getTime());
  if (rideGame) {
    rideGame.homeAway = 'away';
    rideGame.facilityId = null;
    rideGame.venueAddress = 'Sportpark 3, 45127 Essen';
  }

  // The coach published the squad for that game (piece 15): the injured
  // player is out, one is a reserve, the rest are in.
  const squadEntries: SquadEntry[] = rideGame
    ? (athletesByTeam.get(TEAM_U16) ?? []).map((personId) => ({
      sessionId: rideGame.id, personId,
      status: personId === injured.personId ? 'not_selected' as const : personId === 'athlete-u16-12' ? 'reserve' as const : 'squad' as const,
      setBy: 'coach-1', setAt: addDays(now, -1).toISOString(),
    }))
    : [];
  if (rideGame) rideGame.squadPublishedAt = addDays(now, -1).toISOString();

  // The last U16 training is confirmed (piece 13): everyone who came, and one
  // player who said nothing and did not show up.
  const lastTraining = [...sessions].reverse().find((session) => session.teamId === TEAM_U16 && session.sessionType === 'training' && Date.parse(session.endsAt) < now.getTime());
  const attendanceConfirmations: AttendanceConfirmation[] = lastTraining
    ? (athletesByTeam.get(TEAM_U16) ?? []).map((personId) => ({
      sessionId: lastTraining.id, personId,
      present: personId !== 'athlete-u16-9' && !availability.some((a) => a.sessionId === lastTraining.id && a.personId === personId && a.status === 'out')
        && !absences.some((a) => a.personId === personId && dateOnly(new Date(lastTraining.startsAt)) >= a.fromDate && dateOnly(new Date(lastTraining.startsAt)) <= a.toDate),
      confirmedBy: 'coach-1', confirmedAt: lastTraining.endsAt,
    }))
    : [];

  // The coach asks the demo player to check an entry that looks too high (piece 13).
  const doubtful = [...loadEntries].reverse().find((entry) => entry.personId === 'athlete-u16-1' && entry.trainingType === 'team_training');
  if (doubtful) {
    doubtful.rpe = 10;
    doubtful.load = 10 * doubtful.durationMinutes;
  }
  const loadEntryReviews: LoadEntryReview[] = doubtful
    ? [{ entryId: doubtful.id, personId: doubtful.personId, requestedBy: 'coach-1', note: T.reviewNote, createdAt: addDays(now, -1).toISOString() }]
    : [];

  // Two U14 players play up; Paul has parental consent, Ben awaits it.
  for (const person of people) person.birthYear = now.getFullYear() - (['athlete-u16-11', 'athlete-u16-12'].includes(person.id) ? 14 : 18);
  const limited = 'athlete-u16-12';
  const consents: NonNullable<LocalDatabase['consents']> = people.flatMap((person) => [
    { id: `terms-${person.id}`, personId: person.id, userId: null, kind: 'terms' as const, version: LEGAL_VERSION, givenAt: createdAt, withdrawnAt: null, byParentName: null, byParentEmail: null },
    ...(person.id === limited ? [] : [{ id: `health-${person.id}`, personId: person.id, userId: null, kind: person.id === 'athlete-u16-11' ? 'parent_health' as const : 'health' as const, version: LEGAL_VERSION, givenAt: createdAt, withdrawnAt: null, byParentName: person.id === 'athlete-u16-11' ? T.parentName : null, byParentEmail: person.id === 'athlete-u16-11' ? 'parent@example.test' : null }]),
  ]);
  // No historic health data exist for the example awaiting consent.
  const consentedEntries = loadEntries.filter((e) => e.personId !== limited);
  return {
    version: SCHEMA_VERSION,
    seededAt: now.toISOString(),
    club,
    departments,
    teams,
    facilities,
    departmentFacilities,
    people,
    consents,
    parentTokens: {},
    parentWithdrawals: {},
    memberships,
    coachRoles,
    // Codes exist locally so the data looks like the server's; joining with
    // them needs accounts and only works there.
    joinCodes: teams.map((team, index) => ({ teamId: team.id, code: ['TESTABCD', 'TESTEFGH'][index] ?? 'TESTJKMN', createdAt })),
    // The Team Manager has not accepted the invitation yet (piece 8b).
    staffInvites: [{ token: '5eed0000-0000-4000-8000-000000000005', personId: 'coach-5', teamId: TEAM_U16, createdAt: addDays(now, -2).toISOString(), expiresAt: addDays(now, 28).toISOString(), acceptedAt: null }],
    clubRoles,
    clubRoleInvites: [],
    playerGroups,
    playerGroupMembers,
    sessions,
    sessionSeries,
    sessionSeriesWeekStates: [],
    availability: availability.map((a) => a.personId === limited ? { ...a, reason: null } : a),
    loadEntries: consentedEntries,
    loadSummaries: summariesFor(consentedEntries, now),
    athletePlans: athletePlans.filter((p) => p.personId !== limited),
    acknowledgedSessions: [],
    loadEntryReviews,
    attendanceConfirmations,
    absences: absences.map((a) => a.personId === limited ? { ...a, kind: null, note: null } : a),
    squadEntries,
    // With a departure and a pin (0047): riders open it in Google Maps.
    carpools: rideGame ? [{
      id: 'carpool-demo-1', sessionId: rideGame.id, driverId: 'coach-1', seats: 3, note: T.carpool.note, createdAt: now.toISOString(),
      departAt: new Date(Date.parse(rideGame.startsAt) - 75 * 60_000).toISOString(), meetPoint: T.carpool.meetPoint, meetLat: 51.4627, meetLng: 7.0121,
    }] : [],
    carpoolRiders: rideGame ? [{ carpoolId: 'carpool-demo-1', personId: 'athlete-u16-2', createdAt: now.toISOString() }] : [],
    carpoolRequests: rideGame ? [{ sessionId: rideGame.id, personId: 'athlete-u16-1', createdAt: now.toISOString() }] : [],
    messages,
    messageReads,
    messageVotes,
    messageWriters,
    // Playbooks (0049): one for the whole team, one for the starters only, one draft.
    playbooks: ([
      ['playbook-demo-horns', 'horns', 'offense', 'released', [], 'horns.pdf'],
      ['playbook-demo-press', 'press', 'defense', 'released', ['group-u16-starters'], 'press-122.pdf'],
      ['playbook-demo-ato', 'ato', 'set_pieces', 'draft', [], 'ato-sideline.pdf'],
    ] as const).map(([id, key, category, status, groupIds, file], index) => ({
      id, clubId: CLUB_ID, teamId: TEAM_U16, title: T.playbooks[key][0], description: T.playbooks[key][1], category,
      filePath: `/demo/playbooks/${file}`, fileName: file, fileType: 'application/pdf' as const, fileSize: 50_000,
      status, groupIds: [...groupIds], releaseAt: null, releasedAt: status === 'released' ? addDays(now, -5 + index).toISOString() : null,
      position: index, createdBy: 'coach-1', createdAt: addDays(now, -6).toISOString(), updatedAt: addDays(now, -5 + index).toISOString(),
    })),
    // The club decided carpools for every team (0046); everything else is up to the teams.
    clubFeatureSettings: [{ clubId: CLUB_ID, feature: 'carpools', mode: 'on' }],
    seedLocale: locale,
    shareLinks: {},
    // Start as the first coach so the app is usable immediately. Run 3 adds
    // the entry page that asks which role to test as and lets the person
    // switch; until then an unset identity would leave every screen empty
    // with no way to fix it.
    activeIdentity: { role: 'coach', personId: 'coach-1' },
  };
}
