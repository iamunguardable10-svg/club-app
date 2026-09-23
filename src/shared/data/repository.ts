/**
 * The only place in the app that touches localStorage.
 *
 * Everything else — coach views, athlete views, the entry page — goes through
 * the functions here. Before the simplification 13 files managed their own
 * storage keys, several of them holding independent copies of the same key
 * with their own getters and setters. That double bookkeeping is what this
 * module exists to end.
 *
 * Three properties matter and are easy to lose:
 *
 * 1. SSR safety. Next.js renders on the server, where localStorage does not
 *    exist. Every entry point guards on `typeof window`.
 * 2. Change notification. Coach and athlete views read the same document, so
 *    a write on one side must reach the other without a reload. Readers
 *    subscribe; writers notify.
 * 3. No silent fallbacks. A missing document means "first start" and is
 *    seeded. A present but unreadable document is an error and is thrown, not
 *    quietly replaced with fresh test data.
 */

import { calculateEWMA, getLatestACWR, loadZone, sevenDayLoad } from './loadCalculations';
import { DATABASE_KEY, LEGACY_KEY_PREFIXES, SCHEMA_VERSION, isCurrent } from './migrations';
import { createSeedDatabase } from './seed';
import {
  LocalDataError,
  type ActiveIdentity,
  type Availability,
  type AvailabilityStatus,
  type Facility,
  type Id,
  type LoadEntry,
  type LocalDatabase,
  type MembershipRole,
  type Person,
  type Session,
  type SessionSeries,
  type SessionType,
  type Team,
} from './schema';

type Listener = () => void;

const listeners = new Set<Listener>();

/** In-memory copy so repeated reads in one render do not re-parse the JSON. */
let cache: LocalDatabase | null = null;

function isBrowser() {
  return typeof window !== 'undefined';
}

let legacyKeysPurged = false;

/** Removes keys written by code that no longer exists; once per page load. */
function purgeLegacyKeys() {
  if (legacyKeysPurged || !isBrowser()) return;
  legacyKeysPurged = true;
  const stale: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && LEGACY_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) stale.push(key);
  }
  for (const key of stale) window.localStorage.removeItem(key);
}

function notify() {
  for (const listener of listeners) listener();
}

function persist(database: LocalDatabase) {
  if (!isBrowser()) return;
  cache = database;
  try {
    window.localStorage.setItem(DATABASE_KEY, JSON.stringify(database));
  } catch (error) {
    throw new LocalDataError('Could not write the local database.', error);
  }
}

/**
 * Reads the database, seeding it on first start.
 *
 * Returns null on the server, where there is nothing to read. Callers that
 * render data should use `useLocalDatabase` instead of handling null by hand.
 *
 * Throws `LocalDataError` when a document exists but cannot be parsed. That is
 * deliberate: silently reseeding would hide the bug and destroy whatever the
 * tester had entered, which looks like the app losing data at random.
 */
export function readDatabase(): LocalDatabase | null {
  if (!isBrowser()) return null;
  if (cache) return cache;
  purgeLegacyKeys();

  const raw = window.localStorage.getItem(DATABASE_KEY);

  if (raw === null) {
    const seeded = createSeedDatabase();
    persist(seeded);
    return seeded;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new LocalDataError(
      `The stored local database is not valid JSON. Reset the test data to continue (key: ${DATABASE_KEY}).`,
      error,
    );
  }

  // A document from an older schema version is not an error: no data is worth
  // preserving, so the honest move is to reseed rather than to patch it up.
  if (!isCurrent(parsed)) {
    const seeded = createSeedDatabase();
    persist(seeded);
    return seeded;
  }

  cache = parsed;
  return parsed;
}

/**
 * Applies a change and notifies subscribers.
 *
 * The callback receives a structural copy, so a half-finished mutation cannot
 * leave the in-memory cache inconsistent if it throws.
 */
export function mutate(apply: (database: LocalDatabase) => void): void {
  const current = readDatabase();
  if (!current) return;

  const draft: LocalDatabase = JSON.parse(JSON.stringify(current));
  apply(draft);
  persist(draft);
  notify();
}

/** Subscribes to every change. Returns the unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Drops the local database and seeds a fresh test club. */
export function resetDatabase(): void {
  if (!isBrowser()) return;
  cache = null;
  window.localStorage.removeItem(DATABASE_KEY);
  persist(createSeedDatabase());
  notify();
}

/** Forgets the in-memory copy; the next read parses from storage again. */
export function invalidateCache(): void {
  cache = null;
}

if (isBrowser()) {
  // Another tab wrote the document: drop the cache and let subscribers re-read.
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== DATABASE_KEY) return;
    cache = null;
    notify();
  });
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export function getActiveIdentity(): ActiveIdentity | null {
  return readDatabase()?.activeIdentity ?? null;
}

export function setActiveIdentity(identity: ActiveIdentity | null): void {
  mutate((database) => {
    database.activeIdentity = identity;
  });
}

/** The person behind the active identity, or null when none is chosen. */
export function getActivePerson(database: LocalDatabase): Person | null {
  const identity = database.activeIdentity;
  if (!identity) return null;
  return database.people.find((person) => person.id === identity.personId) ?? null;
}

export function displayName(person: Person): string {
  return `${person.firstName} ${person.lastName}`;
}

// ---------------------------------------------------------------------------
// People, teams, memberships
// ---------------------------------------------------------------------------

export function peopleWithRole(database: LocalDatabase, role: MembershipRole): Person[] {
  const ids = new Set(
    database.memberships.filter((membership) => membership.role === role).map((membership) => membership.personId),
  );
  return database.people.filter((person) => ids.has(person.id));
}

export function teamsForPerson(database: LocalDatabase, personId: Id): Team[] {
  const teamIds = new Set(
    database.memberships.filter((membership) => membership.personId === personId).map((membership) => membership.teamId),
  );
  return database.teams.filter((team) => teamIds.has(team.id));
}

export function athletesForTeam(database: LocalDatabase, teamId: Id): Person[] {
  const ids = new Set(
    database.memberships
      .filter((membership) => membership.teamId === teamId && membership.role === 'athlete')
      .map((membership) => membership.personId),
  );
  return database.people.filter((person) => ids.has(person.id));
}

export function coachesForTeam(database: LocalDatabase, teamId: Id): Person[] {
  const ids = new Set(
    database.memberships
      .filter((membership) => membership.teamId === teamId && membership.role === 'coach')
      .map((membership) => membership.personId),
  );
  return database.people.filter((person) => ids.has(person.id));
}

export function facilityById(database: LocalDatabase, facilityId: Id | null): Facility | null {
  if (!facilityId) return null;
  return database.facilities.find((facility) => facility.id === facilityId) ?? null;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function sessionsForTeam(database: LocalDatabase, teamId: Id): Session[] {
  return database.sessions
    .filter((session) => session.teamId === teamId)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function sessionsForPerson(database: LocalDatabase, personId: Id): Session[] {
  const teamIds = new Set(teamsForPerson(database, personId).map((team) => team.id));
  return database.sessions
    .filter((session) => teamIds.has(session.teamId))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function sessionsOnDay(sessions: Session[], day: Date): Session[] {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return sessions.filter((session) => {
    const startsAt = new Date(session.startsAt);
    return startsAt >= start && startsAt < end;
  });
}

export type SessionInput = {
  teamId: Id;
  title: string;
  sessionType: SessionType;
  startsAt: string;
  endsAt: string;
  facilityId: Id | null;
  groupIds?: Id[];
};

export function createSession(input: SessionInput): Id {
  const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  mutate((database) => {
    const team = database.teams.find((candidate) => candidate.id === input.teamId);
    if (!team) throw new LocalDataError(`Unknown team: ${input.teamId}`);
    database.sessions.push({
      id,
      clubId: team.clubId,
      departmentId: team.departmentId,
      teamId: team.id,
      title: input.title,
      sessionType: input.sessionType,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      facilityId: input.facilityId,
      groupIds: input.groupIds ?? [],
      seriesId: null,
      seriesWeekStart: null,
      createdAt: new Date().toISOString(),
    });
  });
  return id;
}

export function updateSession(sessionId: Id, changes: Partial<SessionInput>): void {
  mutate((database) => {
    const session = database.sessions.find((candidate) => candidate.id === sessionId);
    if (!session) throw new LocalDataError(`Unknown session: ${sessionId}`);
    Object.assign(session, changes);
  });
}

export function deleteSession(sessionId: Id): void {
  mutate((database) => {
    database.sessions = database.sessions.filter((session) => session.id !== sessionId);
    // Reports that referred to the session would otherwise linger forever.
    database.availability = database.availability.filter((entry) => entry.sessionId !== sessionId);
    database.loadEntries = database.loadEntries.filter((entry) => entry.sessionId !== sessionId);
  });
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

export function seriesForTeam(database: LocalDatabase, teamId: Id): SessionSeries[] {
  return database.sessionSeries.filter((series) => series.teamId === teamId);
}

export function setSeriesWeekState(seriesId: Id, weekStart: string, checked: boolean, committedSessionId: Id | null): void {
  mutate((database) => {
    const existing = database.sessionSeriesWeekStates.find(
      (state) => state.seriesId === seriesId && state.weekStart === weekStart,
    );
    if (existing) {
      existing.checked = checked;
      existing.committedSessionId = committedSessionId;
      existing.updatedAt = new Date().toISOString();
      return;
    }
    database.sessionSeriesWeekStates.push({
      seriesId,
      weekStart,
      checked,
      committedSessionId,
      updatedAt: new Date().toISOString(),
    });
  });
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export function availabilityForSession(database: LocalDatabase, sessionId: Id): Availability[] {
  return database.availability.filter((entry) => entry.sessionId === sessionId);
}

export function availabilityForPerson(database: LocalDatabase, personId: Id): Availability[] {
  return database.availability.filter((entry) => entry.personId === personId);
}

export function availabilityFor(database: LocalDatabase, sessionId: Id, personId: Id): Availability | null {
  return database.availability.find((entry) => entry.sessionId === sessionId && entry.personId === personId) ?? null;
}

/**
 * Records how an athlete reports in for a session. Reporting 'in' removes an
 * earlier absence rather than storing a row, so "no record" always means
 * "expected to attend".
 */
export function reportAvailability(input: {
  sessionId: Id;
  personId: Id;
  status: AvailabilityStatus;
  reason?: string | null;
  lateMinutes?: number | null;
}): void {
  mutate((database) => {
    database.availability = database.availability.filter(
      (entry) => !(entry.sessionId === input.sessionId && entry.personId === input.personId),
    );
    if (input.status === 'in') return;
    database.availability.push({
      id: `av-${input.sessionId}-${input.personId}`,
      sessionId: input.sessionId,
      personId: input.personId,
      status: input.status,
      reason: input.reason ?? null,
      lateMinutes: input.status === 'late' ? input.lateMinutes ?? null : null,
      reportedAt: new Date().toISOString(),
      seeded: false,
    });
  });
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export function loadEntriesForPerson(database: LocalDatabase, personId: Id): LoadEntry[] {
  return database.loadEntries
    .filter((entry) => entry.personId === personId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type LoadEntryInput = {
  personId: Id;
  sessionId: Id | null;
  teamId: Id | null;
  date: string;
  title: string;
  trainingType: LoadEntry['trainingType'];
  rpe: number;
  durationMinutes: number;
  note?: string | null;
  source?: LoadEntry['source'];
};

export function recordLoadEntry(input: LoadEntryInput): Id {
  const id = `load-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  mutate((database) => {
    if (input.rpe < 1 || input.rpe > 10) throw new LocalDataError(`RPE out of range: ${input.rpe}`);
    if (input.durationMinutes <= 0) throw new LocalDataError(`Duration must be positive: ${input.durationMinutes}`);

    // One entry per athlete and session; a correction replaces the old value.
    if (input.sessionId) {
      database.loadEntries = database.loadEntries.filter(
        (entry) => !(entry.sessionId === input.sessionId && entry.personId === input.personId),
      );
    }

    const team = input.teamId ? database.teams.find((candidate) => candidate.id === input.teamId) : null;
    database.loadEntries.push({
      id,
      personId: input.personId,
      sessionId: input.sessionId,
      teamId: input.teamId,
      teamName: team?.name ?? null,
      date: input.date,
      startsAt: null,
      title: input.title,
      trainingType: input.trainingType,
      rpe: input.rpe,
      durationMinutes: input.durationMinutes,
      load: input.rpe * input.durationMinutes,
      note: input.note ?? null,
      source: input.source ?? (input.sessionId ? 'planned_session' : 'solo'),
      createdAt: new Date().toISOString(),
    });
  });
  return id;
}

export function deleteLoadEntry(entryId: Id): void {
  mutate((database) => {
    database.loadEntries = database.loadEntries.filter((entry) => entry.id !== entryId);
  });
}

/**
 * Load summary for one athlete.
 *
 * The maths lives in `loadCalculations.ts` and is not reimplemented here; this
 * only selects the right entries and hands them over. Views must not compute
 * ACWR themselves.
 *
 * Uses EWMA, like the athlete cockpit and the coach roster. An earlier version
 * used the rolling average, so the same athlete would have shown two different
 * ratios depending on which screen read the number.
 */
export function loadSummaryForPerson(database: LocalDatabase, personId: Id) {
  const entries = loadEntriesForPerson(database, personId);
  const latest = getLatestACWR(entries, 'ewma');
  return {
    entries,
    series: calculateEWMA(entries),
    acwr: latest?.acwr ?? null,
    acuteLoad: latest?.acuteLoad ?? 0,
    chronicLoad: latest?.chronicLoad ?? 0,
    /** False while fewer than 28 days of history exist; show no ratio then. */
    chronicFull: latest?.chronicFull ?? false,
    sevenDayLoad: sevenDayLoad(entries),
    zone: loadZone(latest?.acwr ?? null, latest?.chronicFull ?? false),
  };
}

export { SCHEMA_VERSION };
