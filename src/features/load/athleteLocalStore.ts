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
  mutate,
  sessionTypeToLoadType,
  teamsForPerson,
  type AthleteLoadEntry,
  type Id,
  type LocalDatabase,
} from '@/shared/data';
import type { AthleteLoadPlan, AthletePendingSession } from './loadTypes';

export type AthleteAvailabilityMark = {
  status: 'expected' | 'late' | 'out';
  reason: string | null;
  lateMinutes: number | null;
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
    .map((session) => {
      const startsAt = new Date(session.startsAt);
      return {
        id: session.id,
        title: session.title,
        teamId: session.teamId,
        teamName: teamById.get(session.teamId)?.name ?? null,
        date: `${startsAt.getFullYear()}-${String(startsAt.getMonth() + 1).padStart(2, '0')}-${String(startsAt.getDate()).padStart(2, '0')}`,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        trainingType: sessionTypeToLoadType(session.sessionType),
        source: 'team_session' as const,
      };
    });
}

export function readEntries(database: LocalDatabase, personId: Id): AthleteLoadEntry[] {
  return database.loadEntries
    .filter((entry) => entry.personId === personId)
    .map(({ personId: _personId, createdAt: _createdAt, ...entry }) => entry)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The athlete's entries become exactly `entries`. */
export function saveEntries(personId: Id, entries: AthleteLoadEntry[]) {
  deferWrite((database) => {
    const createdAtById = new Map(
      database.loadEntries.filter((entry) => entry.personId === personId).map((entry) => [entry.id, entry.createdAt]),
    );
    const now = new Date().toISOString();
    database.loadEntries = [
      ...database.loadEntries.filter((entry) => entry.personId !== personId),
      ...entries.map((entry) => ({ ...entry, personId, createdAt: createdAtById.get(entry.id) ?? now })),
    ].sort((a, b) => a.date.localeCompare(b.date));
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
    database.acknowledgedSessions = [
      ...database.acknowledgedSessions.filter((item) => item.personId !== personId),
      ...Array.from(new Set(sessionIds)).map((sessionId) => ({ personId, sessionId })),
    ];
  });
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
      .filter(([, mark]) => mark.status === 'late' || mark.status === 'out')
      .map(([sessionId, mark]) => {
        const status = mark.status as 'late' | 'out';
        const previous = existing.get(sessionId);
        const unchanged =
          previous !== undefined &&
          previous.status === status &&
          previous.reason === mark.reason &&
          previous.lateMinutes === (status === 'late' ? mark.lateMinutes : null);
        if (unchanged) return previous;
        return {
          id: `av-${sessionId}-${personId}`,
          sessionId,
          personId,
          status,
          reason: mark.reason,
          lateMinutes: status === 'late' ? mark.lateMinutes : null,
          reportedAt: now,
          seeded: false,
        };
      });
    database.availability = [...database.availability.filter((entry) => entry.personId !== personId), ...next];
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
