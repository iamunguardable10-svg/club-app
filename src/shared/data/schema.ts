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
 * What the app can act as: a team role, or `club` for a club admin or
 * department lead (piece 8), whose home is the club area.
 */
export type IdentityRole = MembershipRole | 'club';

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
 * Features a team can have switched on. Not every team needs training load;
 * later the club's subscription decides which teams have which features, and
 * this list is what it sets. For now they are switched in the database only
 * (docs/plan-next-runs.md, piece 3.5); new teams start with load.
 */
export const TEAM_FEATURES = ['load'] as const;
export type TeamFeature = (typeof TEAM_FEATURES)[number];

/**
 * Coach rights that only exist in teams with load tracking. A role may keep
 * them ticked; they take effect only while the team has `load` (the server's
 * `app.team_permissions` drops them the same way).
 */
export const LOAD_PERMISSIONS: readonly CoachPermission[] = ['viewLoadSummary', 'viewLoadDetails', 'viewAthletePlans'];

/**
 * What club admins and department leads may do in the teams they manage:
 * run the team, but not see player data (roster, attendance, reasons, load,
 * plans) unless they also hold a coach role there. Same list as the server's
 * `app.team_permissions`.
 */
export const CLUB_MANAGEMENT_PERMISSIONS: readonly CoachPermission[] = ['editSessions', 'planSeries', 'manageGroups', 'manageFacilities', 'manageStaff'];

/**
 * A coach role within one team, for example Head Coach, Assistant Coach or
 * Athletic Coach, with the rights it carries.
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

/**
 * How an athlete reports in for a specific session. `late` and `out` are said
 * beforehand; `missed` ("I didn't take part") is said afterwards, when the app
 * asks how hard a session was that the player did not attend. Coaches see it
 * as an absence with its own label, not as a cancellation.
 */
export type AvailabilityStatus = 'in' | 'late' | 'out' | 'missed';

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
  /** Switched-on features, see `TEAM_FEATURES`. */
  features: TeamFeature[];
  /** Archived teams keep their data but leave every list. */
  archivedAt: Timestamp | null;
  createdAt: Timestamp;
};

export type Facility = {
  id: Id;
  clubId: Id;
  name: string;
  address: string;
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
  /** The account this person signs in with (pilot server). Always null in the local test mode. */
  userId: Id | null;
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
} & SessionDetails & GameDetails;

/**
 * What players need to know beyond time and hall (piece 14). Optional, so
 * documents from before still load; missing means none.
 */
export type SessionDetails = {
  /** e.g. "Indoor shoes, video at 17:30". */
  notes?: string | null;
  /** Meet this many minutes before the start (null: at the start). */
  meetMinutesBefore?: number | null;
  /** Where to meet, e.g. "Car park" or "Changing room 2". */
  meetPoint?: string | null;
};

/** Games only (piece 14). An away game has an address instead of a hall. */
export type GameDetails = {
  opponent?: string | null;
  homeAway?: 'home' | 'away' | null;
  venueAddress?: string | null;
  /** When the coach last published the squad (piece 15); players see their status from then on. */
  squadPublishedAt?: Timestamp | null;
};

/** A player's place in a game's squad (piece 15). */
export type SquadStatus = 'squad' | 'reserve' | 'not_selected';

export type SquadEntry = {
  sessionId: Id;
  personId: Id;
  status: SquadStatus;
  setBy: Id | null;
  setAt: Timestamp;
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
} & SessionDetails;

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
 * The code athletes enter to join a team (`team_join_codes`). One per team,
 * replaceable by roles with `manageStaff`. Only meaningful with the server.
 */
export type JoinCode = {
  teamId: Id;
  code: string;
  createdAt: Timestamp;
};

/**
 * A personal invitation link for a staff member added by name
 * (`staff_invites`). Accepting it links the invitee's account to that person.
 */
/**
 * A role above the teams (piece 8): the club admin manages the whole club,
 * a department lead one department. Held next to coach or athlete
 * memberships. In the teams they manage they get the management rights
 * (`CLUB_MANAGEMENT_PERMISSIONS`), never player data.
 */
export type ClubRoleKind = 'admin' | 'department_lead';

export type ClubRole = {
  id: Id;
  clubId: Id;
  personId: Id;
  role: ClubRoleKind;
  /** Only for department leads. */
  departmentId: Id | null;
  createdAt: Timestamp;
};

/** Invitation link for someone added to a club role by name. */
export type ClubRoleInvite = {
  token: Id;
  clubRoleId: Id;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  acceptedAt: Timestamp | null;
};

export type StaffInvite = {
  token: Id;
  personId: Id;
  teamId: Id;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  acceptedAt: Timestamp | null;
};

/**
 * The ACWR traffic light of one athlete, without the entries it comes from.
 *
 * Coach roles with `viewLoadSummary` but not `viewLoadDetails` read this
 * instead of the entries (`load_summaries` on the server). The repository
 * recomputes it whenever an athlete's entries change; it depends on today's
 * date, so it can age while nobody writes.
 */
export type LoadSummaryRow = {
  personId: Id;
  acwr: number | null;
  chronicFull: boolean;
  updatedAt: Timestamp;
};

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
 * A coach asks a player to check one load entry (piece 10). Changing the
 * entry clears it; the player can also confirm it is right (delete).
 */
export type LoadEntryReview = {
  entryId: Id;
  /** The player who owns the entry. */
  personId: Id;
  /** The coach who asked. */
  requestedBy: Id | null;
  note: string | null;
  createdAt: Timestamp;
};

/** Who was actually at a session, recorded by a coach afterwards (piece 11). */
/** Why someone is away (piece 16); health information, shared narrowly. */
export type AbsenceKind = 'injured' | 'sick' | 'holiday' | 'school_work' | 'other';

export const ABSENCE_KINDS: AbsenceKind[] = ['injured', 'sick', 'holiday', 'school_work', 'other'];

/**
 * Away for a period (piece 16): every session of the player's teams from
 * `fromDate` to `toDate` (inclusive, club time) counts as out, unless the
 * player says "in" for one anyway. `kind` and `note` are null for viewers
 * who may not see absence reasons.
 */
export type Absence = {
  id: Id;
  personId: Id;
  fromDate: DateOnly;
  toDate: DateOnly;
  kind: AbsenceKind | null;
  note: string | null;
  /** Who entered it: the player, or a coach for them. */
  createdBy: Id | null;
  createdAt: Timestamp;
};

/**
 * An announcement from the staff to a team or some of its groups (piece 17).
 * No replies. Read counts as soon as the player has seen it.
 */
export type TeamMessage = {
  id: Id;
  teamId: Id;
  /** Empty: the whole team. */
  groupIds: Id[];
  authorId: Id | null;
  body: string;
  important: boolean;
  createdAt: Timestamp;
  /** Set once: unread players were reminded. */
  remindedAt: Timestamp | null;
};

export type MessageRead = {
  messageId: Id;
  personId: Id;
  readAt: Timestamp;
};

export type AttendanceConfirmation = {
  sessionId: Id;
  personId: Id;
  present: boolean;
  confirmedBy: Id | null;
  confirmedAt: Timestamp;
};

/**
 * Who the app is currently acting as. Replaces the login session.
 *
 * Role alone is not enough: "the athlete sees their sessions" is undefined
 * without naming which athlete. Role and person are always set together.
 */
export type ActiveIdentity = {
  role: IdentityRole;
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
  joinCodes: JoinCode[];
  staffInvites: StaffInvite[];
  clubRoles: ClubRole[];
  clubRoleInvites: ClubRoleInvite[];
  playerGroups: PlayerGroup[];
  playerGroupMembers: PlayerGroupMember[];
  sessions: Session[];
  sessionSeries: SessionSeries[];
  sessionSeriesWeekStates: SessionSeriesWeekState[];
  availability: Availability[];
  loadEntries: LoadEntry[];
  loadSummaries: LoadSummaryRow[];
  athletePlans: AthletePlan[];
  acknowledgedSessions: AcknowledgedSession[];
  loadEntryReviews: LoadEntryReview[];
  attendanceConfirmations: AttendanceConfirmation[];
  absences: Absence[];
  squadEntries: SquadEntry[];
  teamMessages: TeamMessage[];
  messageReads: MessageRead[];
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
