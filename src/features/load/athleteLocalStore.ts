/**
 * Storage adapter for the athlete workspace.
 *
 * `AthleteLoadWorkspace` has carried a complete local mode for a long time:
 * logging RPE, planning own sessions, dismissing pending ones, reporting
 * availability. It kept all of that in five keys of its own, hard-wired to one
 * demo team. This file keeps the same read/save shapes the workspace already
 * calls, and puts the shared data layer underneath them — scoped to whichever
 * athlete is active. The workspace's product logic is untouched.
 *
 * Why writes are deferred: the workspace saves from inside React state
 * updaters (`setEntries((current) => { ...; save(next); return next; })`).
 * That was harmless while `save` only wrote to localStorage. Writing through
 * the repository notifies subscribers, which sets state — doing that during a
 * render is a React error. Deferring to a microtask moves the write after the
 * render. Every save replaces the person's collection wholesale, so a
 * StrictMode double-invocation writes the same thing twice and is harmless.
 */

import {
  awayForSession,
  publishedSquadStatus,
  mutate,
  newId,
  reportAvailability,
  sessionTypeToLoadType,
  teamsForPerson,
  type AthleteLoadEntry,
  type Id,
  type LocalDatabase,
  type Session,
  type SquadStatus,
} from '@/shared/data';
import type { AthleteLoadPlan, AthletePendingSession } from './loadTypes';
import { awayUntilLabel } from '@/features/absences/absenceText';

export type AthleteAvailabilityMark = {
  /** `missed`: did not take part, said after the session. */
  status: 'expected' | 'late' | 'out' | 'missed';
  reason: string | null;
  lateMinutes: number | null;
  /** Out because of an absence over a period (piece 16), not a report of its own; never saved as a row. */
  fromAbsence?: boolean;
};

/** Same window the demo workspace used around today. */
const PAST_DAYS = 28;
const FUTURE_DAYS = 21;

function deferWrite(apply: (database: LocalDatabase) => void) {
  queueMicrotask(() => mutate(apply));
}

/** Team sessions of the athlete's teams in the working window. */
export function readTeamSessions(database: LocalDatabase, personId: Id): AthletePendingSession[] {
  const teams = teamsForPerson(database, personId);
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = today.getTime() - PAST_DAYS * 86_400_000;
  const end = today.getTime() + (FUTURE_DAYS + 1) * 86_400_000;

  return database.sessions
    .filter((session) => teamById.has(session.teamId))
    .filter((session) => {
      const time = new Date(session.startsAt).getTime();
      return time >= start && time < end;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((session) => toPendingSession(
      session,
      teamById.get(session.teamId)?.name ?? null,
      teamById.get(session.teamId)?.features.includes('load') ?? false,
      session.facilityId ? database.facilities.find((facility) => facility.id === session.facilityId)?.name ?? null : null,
      publishedSquadStatus(database, personId, session),
    ));
}

function toPendingSession(session: Session, teamName: string | null, loadTracked: boolean, facilityName: string | null = null, squad: SquadStatus | null = null): AthletePendingSession {
  const startsAt = new Date(session.startsAt);
  return {
    id: session.id,
    title: session.title,
    teamId: session.teamId,
    teamName,
    date: `${startsAt.getFullYear()}-${String(startsAt.getMonth() + 1).padStart(2, '0')}-${String(startsAt.getDate()).padStart(2, '0')}`,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    trainingType: sessionTypeToLoadType(session.sessionType),
    source: 'team_session',
    loadTracked,
    info: {
      facilityName,
      notes: session.notes ?? null,
      meetMinutesBefore: session.meetMinutesBefore ?? null,
      meetPoint: session.meetPoint ?? null,
      opponent: session.opponent ?? null,
      homeAway: session.homeAway ?? null,
      venueAddress: session.venueAddress ?? null,
      squad,
    },
  };
}

/**
 * Warmups are not sessions of their own: the workspace invents one before
 * every game (`<game id>-warmup`). Stored, a warmup entry points at the game
 * session and is told apart by its training type, because the server only
 * accepts real session ids. These two helpers translate between the two.
 */
const WARMUP_SUFFIX = '-warmup';

function toStoredSessionId(entry: Pick<AthleteLoadEntry, 'sessionId'>) {
  return entry.sessionId?.endsWith(WARMUP_SUFFIX) ? entry.sessionId.slice(0, -WARMUP_SUFFIX.length) : entry.sessionId;
}

function toWorkspaceSessionId(entry: Pick<AthleteLoadEntry, 'sessionId' | 'trainingType'>) {
  if (entry.trainingType !== 'warmup' || !entry.sessionId || entry.sessionId.endsWith(WARMUP_SUFFIX)) return entry.sessionId;
  return `${entry.sessionId}${WARMUP_SUFFIX}`;
}

export function readEntries(database: LocalDatabase, personId: Id): AthleteLoadEntry[] {
  return database.loadEntries
    .filter((entry) => entry.personId === personId)
    .map(({ personId: _personId, createdAt: _createdAt, ...entry }) => ({ ...entry, sessionId: toWorkspaceSessionId(entry) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The athlete's entries become exactly `entries`. */
export function saveEntries(personId: Id, entries: AthleteLoadEntry[]) {
  deferWrite((database) => {
    const before = new Map(database.loadEntries.map((entry) => [entry.id, entry]));
    const createdAtById = new Map(
      database.loadEntries.filter((entry) => entry.personId === personId).map((entry) => [entry.id, entry.createdAt]),
    );
    const now = new Date().toISOString();
    database.loadEntries = [
      ...database.loadEntries.filter((entry) => entry.personId !== personId),
      ...entries.map((entry) => ({ ...entry, sessionId: toStoredSessionId(entry), personId, createdAt: createdAtById.get(entry.id) ?? now })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    // A check request ends when its entry is changed or gone (the server does
    // the same in a trigger); "it is correct" is `clearEntryReview`.
    const next = new Map(entries.map((entry) => [entry.id, entry]));
    database.loadEntryReviews = database.loadEntryReviews.filter((review) => {
      if (review.personId !== personId) return true;
      const updated = next.get(review.entryId);
      const original = before.get(review.entryId);
      if (!updated) return false;
      return !original || (original.rpe === updated.rpe && original.durationMinutes === updated.durationMinutes
        && original.load === updated.load && original.date === updated.date && original.trainingType === updated.trainingType);
    });
  });
}

export function readPlans(database: LocalDatabase, personId: Id): AthleteLoadPlan[] {
  return database.athletePlans
    .filter((plan) => plan.personId === personId)
    .map(({ personId: _personId, createdAt: _createdAt, ...plan }) => plan)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function savePlans(personId: Id, plans: AthleteLoadPlan[]) {
  deferWrite((database) => {
    const createdAtById = new Map(
      database.athletePlans.filter((plan) => plan.personId === personId).map((plan) => [plan.id, plan.createdAt]),
    );
    const now = new Date().toISOString();
    database.athletePlans = [
      ...database.athletePlans.filter((plan) => plan.personId !== personId),
      ...plans.map((plan) => ({ ...plan, personId, createdAt: createdAtById.get(plan.id) ?? now })),
    ];
  });
}

export function readAcknowledged(database: LocalDatabase, personId: Id): string[] {
  return database.acknowledgedSessions.filter((item) => item.personId === personId).map((item) => item.sessionId);
}

export function saveAcknowledged(personId: Id, sessionIds: string[]) {
  deferWrite((database) => {
    // Only real team sessions can be acknowledged on the server; warmups and
    // own plans have ids of their own and would be refused.
    const sessionIdSet = new Set(database.sessions.map((session) => session.id));
    database.acknowledgedSessions = [
      ...database.acknowledgedSessions.filter((item) => item.personId !== personId),
      ...Array.from(new Set(sessionIds)).filter((sessionId) => sessionIdSet.has(sessionId)).map((sessionId) => ({ personId, sessionId })),
    ];
  });
}

/**
 * Saves the answer to "How hard was it?" for one session: its entry, and for
 * a game the warmup entry too. Written at once (not deferred): it is called
 * from a button, and the queue is read back from the stored data.
 */
export function saveSessionRating(personId: Id, entries: AthleteLoadEntry[]) {
  const now = new Date().toISOString();
  const stored = entries.map((entry) => ({ ...entry, sessionId: toStoredSessionId(entry), personId, createdAt: now }));
  const keyOf = (entry: { sessionId: string | null; trainingType: string }) => `${entry.sessionId}|${entry.trainingType === 'warmup'}`;
  const replaced = new Set(stored.filter((entry) => entry.sessionId).map(keyOf));
  mutate((database) => {
    database.loadEntries = [
      ...database.loadEntries.filter((entry) => !(entry.personId === personId && entry.sessionId && replaced.has(keyOf(entry)))),
      ...stored,
    ].sort((a, b) => a.date.localeCompare(b.date));
  });
}

/** "I didn't take part": the coach sees the player as absent from that session. */
export function saveMissedSession(personId: Id, sessionId: Id) {
  reportAvailability({ sessionId, personId, status: 'missed' });
}

/**
 * Team sessions the player still has to rate (piece 4): every session that
 * is over, of a team that tracks load, since the player joined that team,
 * that concerned them (whole team, or one of their groups), and that they
 * neither rated, cancelled beforehand, said they missed nor dismissed.
 * Oldest first, no time limit.
 */
export function readSessionsToRate(database: LocalDatabase, personId: Id, now = Date.now()): AthletePendingSession[] {
  const joinedAtByTeam = new Map(
    database.memberships
      .filter((membership) => membership.personId === personId && membership.role === 'athlete')
      .map((membership) => [membership.teamId, new Date(membership.createdAt).getTime()]),
  );
  const teamById = new Map(database.teams.map((team) => [team.id, team]));
  const myGroupIds = new Set(database.playerGroupMembers.filter((member) => member.personId === personId).map((member) => member.groupId));
  const rated = new Set(
    database.loadEntries.filter((entry) => entry.personId === personId && entry.sessionId && entry.trainingType !== 'warmup').map((entry) => entry.sessionId),
  );
  const answered = new Set(
    database.availability.filter((entry) => entry.personId === personId && (entry.status === 'out' || entry.status === 'missed')).map((entry) => entry.sessionId),
  );
  // Confirmed absent by a coach (piece 11): nothing to rate.
  for (const confirmation of database.attendanceConfirmations) {
    if (confirmation.personId === personId && !confirmation.present) answered.add(confirmation.sessionId);
  }
  // Away for a period (piece 16), or not in the squad (piece 15): nothing to rate either.
  for (const session of database.sessions) {
    if (awayForSession(database, personId, session) || publishedSquadStatus(database, personId, session) === 'not_selected') answered.add(session.id);
  }
  const dismissed = new Set(readAcknowledged(database, personId));

  return database.sessions
    .filter((session) => {
      const joinedAt = joinedAtByTeam.get(session.teamId);
      if (joinedAt === undefined || !teamById.get(session.teamId)?.features.includes('load')) return false;
      const start = new Date(session.startsAt).getTime();
      const end = session.endsAt ? new Date(session.endsAt).getTime() : start + 60 * 60_000;
      if (end > now || start < joinedAt) return false;
      if (session.groupIds.length > 0 && !session.groupIds.some((groupId) => myGroupIds.has(groupId))) return false;
      return !rated.has(session.id) && !answered.has(session.id) && !dismissed.has(session.id);
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((session) => toPendingSession(session, teamById.get(session.teamId)?.name ?? null, true));
}

/**
 * All of the athlete's availability, not just the visible window: the save
 * below replaces the whole set, so reading less would delete the rest.
 */
export function readAvailability(database: LocalDatabase, personId: Id): Map<string, AthleteAvailabilityMark> {
  const map = new Map<string, AthleteAvailabilityMark>();
  for (const entry of database.availability) {
    if (entry.personId !== personId || entry.status === 'in') continue;
    map.set(entry.sessionId, { status: entry.status, reason: entry.reason, lateMinutes: entry.lateMinutes });
  }
  // Sessions during an absence show as out (piece 16), unless said otherwise.
  const teamIds = new Set(teamsForPerson(database, personId).map((team) => team.id));
  for (const session of database.sessions) {
    if (!teamIds.has(session.teamId) || map.has(session.id)) continue;
    const absence = awayForSession(database, personId, session);
    if (absence) map.set(session.id, { status: 'out', reason: awayUntilLabel(absence, true), lateMinutes: null, fromAbsence: true });
  }
  return map;
}

/**
 * The athlete's availability becomes exactly `marks`. "expected" is the absence
 * of a row, matching the rest of the app: no record means attending.
 *
 * A row that is unchanged keeps its `seeded` flag and timestamp, so saving one
 * report does not relabel every seeded entry as something the tester entered.
 */
export function saveAvailability(personId: Id, marks: Map<string, AthleteAvailabilityMark>) {
  deferWrite((database) => {
    const existing = new Map(
      database.availability.filter((entry) => entry.personId === personId).map((entry) => [entry.sessionId, entry]),
    );
    const now = new Date().toISOString();
    const next = Array.from(marks.entries())
      .filter(([, mark]) => !mark.fromAbsence && (mark.status === 'late' || mark.status === 'out' || mark.status === 'missed'))
      .map(([sessionId, mark]) => {
        const status = mark.status as 'late' | 'out' | 'missed';
        const previous = existing.get(sessionId);
        const unchanged =
          previous !== undefined &&
          previous.status === status &&
          previous.reason === mark.reason &&
          previous.lateMinutes === (status === 'late' ? mark.lateMinutes : null);
        if (unchanged) return previous;
        return {
          // Keep the row's identity when the report changes; a new one otherwise.
          id: previous?.id ?? newId(),
          sessionId,
          personId,
          status,
          reason: mark.reason,
          lateMinutes: status === 'late' ? mark.lateMinutes : null,
          reportedAt: now,
          seeded: false,
        };
      });
    // An explicit "in" said during an absence (piece 16) stays unless the
    // session got another report now.
    const saidIn = database.availability.filter((entry) => entry.personId === personId && entry.status === 'in' && !marks.has(entry.sessionId));
    database.availability = [...database.availability.filter((entry) => entry.personId !== personId), ...next, ...saidIn];
  });
}

/**
 * "Available" for one session during an absence (piece 16): said out loud,
 * so it wins over the absence for that session only.
 */
export function sayInDuringAbsence(personId: Id, sessionId: Id) {
  deferWrite((database) => {
    if (database.availability.some((entry) => entry.personId === personId && entry.sessionId === sessionId && entry.status === 'in')) return;
    database.availability = database.availability.filter((entry) => !(entry.personId === personId && entry.sessionId === sessionId));
    database.availability.push({
      id: newId(), sessionId, personId, status: 'in', reason: null, lateMinutes: null,
      reportedAt: new Date().toISOString(), seeded: false,
    });
  });
}

export function readShareLink(database: LocalDatabase, personId: Id): string | null {
  return database.shareLinks[personId] ?? null;
}

export function saveShareLink(personId: Id, url: string) {
  deferWrite((database) => {
    database.shareLinks = { ...database.shareLinks, [personId]: url };
  });
}
