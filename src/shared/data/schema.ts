/**
 * Schema of the local data layer.
 *
 * This is the single source of truth for the local test mode. There is no
 * backend at runtime: everything below lives in one JSON document in
 * localStorage, written and read exclusively through `repository.ts`.
 *
 * The shapes follow the existing Supabase schema (see docs/database-schema.md)
 * wherever that schema was sound, and deviate where it was awkward. Because no
 * data needs to be migrated (docs/simplify-decisions.md, point 2), the old
 * schema is a reference rather than a contract. Deviations are noted inline.
 */

import type { AthleteLoadEntry, AthleteLoadPlan, LoadTrainingType } from './loadTypes';

export type Id = string;

/** ISO 8601 instant, e.g. 2026-09-22T18:15:00.000Z */
export type Timestamp = string;

/** Local calendar day, e.g. 2026-09-22 */
export type DateOnly = string;

/** Wall-clock time of day, e.g. "18:15" */
export type TimeOfDay = string;

export type MembershipRole = 'coach' | 'athlete';

/**
 * What a coach role may see of athletes and do in the team.
 *
 * The list is the contract for role-based access: views read it today, and the
 * database's row-level security will enforce the same keys once the app has a
 * server again (docs/simplify-decisions.md, point 8). New rights are added by
 * extending this list, not by reshaping roles.
 */
export const COACH_PERMISSIONS = [
  'viewRoster',
  'viewAttendance',
  'viewAbsenceReasons',
  'viewLoadSummary',
  'viewLoadDetails',
  'viewAthletePlans',
  'editSessions',
  'planSeries',
  'manageGroups',
  'manageFacilities',
  'manageStaff',
] as const;

export type CoachPermission = (typeof COACH_PERMISSIONS)[number];

/**
 * Rights that only make sense together with another one: absence reasons
 * without the attendance list, or load details without the traffic light.
 * Granting a right grants what it needs; the data layer applies this on every
 * write, so no stored role can hold one without the other.
 */
export const COACH_PERMISSION_REQUIRES: Partial<Record<CoachPermission, CoachPermission[]>> = {
  viewAbsenceReasons: ['viewAttendance'],
  viewLoadDetails: ['viewLoadSummary'],
};

/**
 * A coach role within one team, for example Head Coach, Co-Trainer or
 * Athletiktrainer, with the rights it carries.
 *
 * `locked` marks the Head Coach role: it always holds every right and can be
 * neither edited nor deleted, so a team can never lock itself out of managing
 * its own staff.
 */
export type CoachRole = {
  id: Id;
  teamId: Id;
  name: string;
  permissions: CoachPermission[];
  locked: boolean;
  createdAt: Timestamp;
};

export type SessionType = 'training' | 's_and_c' | 'game' | 'recovery' | 'other';

export const SESSION_TYPES: SessionType[] = ['training', 's_and_c', 'game', 'recovery', 'other'];

export type FacilityScope = 'club_shared' | 'department_only';

/** How an athlete reports in for a specific session. */
export type AvailabilityStatus = 'in' | 'late' | 'out';

export type Club = {
  id: Id;
  name: string;
  city: string;
  country: string;
  createdAt: Timestamp;
};

export type Department = {
  id: Id;
  clubId: Id;
  name: string;
};

export type Team = {
  id: Id;
  clubId: Id;
  departmentId: Id;
  name: string;
  defaultFacilityId: Id | null;
  createdAt: Timestamp;
};

export type Facility = {
  id: Id;
  clubId: Id;
  name: string;
  address: string;
  scope: FacilityScope;
  ownerDepartmentId: Id | null;
};

/** Which departments may book which facility. Mirrors `department_facilities`. */
export type DepartmentFacility = {
  departmentId: Id;
  facilityId: Id;
};

/**
 * A human being. Deviation from the old schema: `profiles` carried auth
 * identity, club membership and display data at once. Without accounts, a
 * person is just a name; roles live on memberships.
 */
export type Person = {
  id: Id;
  clubId: Id;
  firstName: string;
  lastName: string;
  createdAt: Timestamp;
};

/**
 * Roles come from memberships, never from a single global role on the person.
 * This rule predates the simplification and still holds without accounts.
 */
export type Membership = {
  id: Id;
  personId: Id;
  teamId: Id;
  role: MembershipRole;
  /** Only for coach memberships: which coach role, and thus which rights. */
  coachRoleId: Id | null;
  createdAt: Timestamp;
};

export type PlayerGroup = {
  id: Id;
  teamId: Id;
  name: string;
};

export type PlayerGroupMember = {
  groupId: Id;
  personId: Id;
};

export type Session = {
  id: Id;
  clubId: Id;
  departmentId: Id;
  teamId: Id;
  title: string;
  sessionType: SessionType;
  startsAt: Timestamp;
  endsAt: Timestamp;
  facilityId: Id | null;
  /** Empty means: the whole team. */
  groupIds: Id[];
  seriesId: Id | null;
  seriesWeekStart: DateOnly | null;
  createdAt: Timestamp;
};

export type SessionSeries = {
  id: Id;
  clubId: Id;
  departmentId: Id;
  teamId: Id;
  title: string;
  sessionType: SessionType;
  /** 0 = Sunday, 1 = Monday, ... matching Date.getDay(). */
  weekday: number;
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  facilityId: Id | null;
  groupIds: Id[];
  activeFrom: DateOnly | null;
  activeUntil: DateOnly | null;
  createdAt: Timestamp;
};

export type SessionSeriesWeekState = {
  seriesId: Id;
  /** Monday of the week this state belongs to. */
  weekStart: DateOnly;
  checked: boolean;
  committedSessionId: Id | null;
  updatedAt: Timestamp;
};

/**
 * An athlete's report for one session.
 *
 * Deviation from the old demo behaviour: availability used to be generated
 * from a hash of the session id, so nobody ever reported anything. Here it is
 * a real record with an author and a timestamp. Seeded entries are marked so
 * the UI can tell seed data from something a tester actually entered.
 */
export type Availability = {
  id: Id;
  sessionId: Id;
  personId: Id;
  status: AvailabilityStatus;
  reason: string | null;
  /** Only meaningful for status 'late'. */
  lateMinutes: number | null;
  reportedAt: Timestamp;
  seeded: boolean;
};

/**
 * One training load record: RPE times duration.
 *
 * Structurally identical to `AthleteLoadEntry` so the existing, well-tested
 * calculations in `loadCalculations.ts` keep working unchanged. `personId`
 * and `createdAt` are added because the local layer stores every athlete's
 * entries in one document.
 */
export type LoadEntry = AthleteLoadEntry & {
  personId: Id;
  createdAt: Timestamp;
};

export type { AthleteLoadEntry, LoadTrainingType };

/**
 * A session an athlete plans for themselves — gym, a run, extra shooting.
 *
 * Existed in the athlete workspace under its own demo key and the Supabase
 * table `athlete_load_plans`; the load forecast uses it to project ACWR ahead.
 * Structurally `AthleteLoadPlan`, so the workspace keeps working unchanged.
 */
export type AthletePlan = AthleteLoadPlan & {
  personId: Id;
  createdAt: Timestamp;
};

/**
 * A pending session the athlete dismissed without logging load, so it stops
 * asking. Kept separate from availability: dismissing is not the same as
 * reporting absence to the coach.
 */
export type AcknowledgedSession = {
  personId: Id;
  sessionId: Id;
};

/**
 * Who the app is currently acting as. Replaces the login session.
 *
 * Role alone is not enough: "the athlete sees their sessions" is undefined
 * without naming which athlete. Role and person are always set together.
 */
export type ActiveIdentity = {
  role: MembershipRole;
  personId: Id;
};

/** The whole local database, stored as one JSON document. */
export type LocalDatabase = {
  /** Schema version this document was written with. */
  version: string;
  seededAt: Timestamp;
  club: Club;
  departments: Department[];
  teams: Team[];
  facilities: Facility[];
  departmentFacilities: DepartmentFacility[];
  people: Person[];
  memberships: Membership[];
  coachRoles: CoachRole[];
  playerGroups: PlayerGroup[];
  playerGroupMembers: PlayerGroupMember[];
  sessions: Session[];
  sessionSeries: SessionSeries[];
  sessionSeriesWeekStates: SessionSeriesWeekState[];
  availability: Availability[];
  loadEntries: LoadEntry[];
  athletePlans: AthletePlan[];
  acknowledgedSessions: AcknowledgedSession[];
  /** The last load link an athlete shared with a coach, per person. */
  shareLinks: Record<Id, string>;
  activeIdentity: ActiveIdentity | null;
};

/** Raised when stored data exists but cannot be read. Never swallowed. */
export class LocalDataError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'LocalDataError';
    this.cause = cause;
  }
}
