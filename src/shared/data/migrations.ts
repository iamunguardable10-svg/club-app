/**
 * Schema versioning for the local data layer.
 *
 * There is deliberately no import of legacy data. Per
 * docs/simplify-decisions.md (point 2) no stored data is worth preserving:
 * there are no real users, so the local database may be dropped and reseeded
 * whenever the schema changes.
 *
 * This file therefore has exactly one job: track the version the stored
 * document was written with, so later runs of the simplification work can
 * change the schema and have the data rebuilt on the next start.
 *
 * The mechanism is the one `demoStorage.ts` already used successfully through
 * `CURRENT_DEMO_DATA_VERSION`; only the scope changed from many keys to one
 * document.
 */

import type { LocalDatabase } from './schema';

/**
 * Bump this whenever the shape of `LocalDatabase` or the seed changes in a way
 * that makes older stored documents wrong. The next start then reseeds.
 *
 * Format: date plus a short reason, so the history stays readable.
 */
export const SCHEMA_VERSION = '2026-09-24-club-roles-v10';

/** Storage key of the database document. */
export const DATABASE_KEY = 'club-app.local.db';

/**
 * Key prefixes left behind by code that no longer exists: the demo areas
 * (`club-app.demo.*`), the Supabase admin overview (`club-app.admin.*`) and
 * the athlete workspace's own share-link key (`club-app.athlete-load.*`).
 *
 * They were kept untouched while `/demo/admin/*` and `/demo/department/*`
 * still read them. Run 5 removed those areas, so nothing reads these keys any
 * more and the repository clears them once on start. No data is lost that
 * anyone needs (docs/simplify-decisions.md, point 2).
 */
export const LEGACY_KEY_PREFIXES = ['club-app.demo.', 'club-app.admin.', 'club-app.athlete-load.'];

/**
 * Decides whether a stored document can be used as-is.
 *
 * Returns false when the document is missing its version, was written by a
 * different schema version, or is structurally not a database document. The
 * caller reseeds in that case — which is the intended, lossless-by-decision
 * behaviour, not an error.
 */
export function isCurrent(value: unknown): value is LocalDatabase {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<LocalDatabase>;
  if (candidate.version !== SCHEMA_VERSION) return false;
  // A document claiming the current version must carry the collections the
  // current code reads; anything less means the version was bumped without
  // the seed being updated.
  return (
    typeof candidate.club === 'object' &&
    Array.isArray(candidate.teams) &&
    Array.isArray(candidate.people) &&
    Array.isArray(candidate.memberships) &&
    Array.isArray(candidate.coachRoles) &&
    Array.isArray(candidate.joinCodes) &&
    Array.isArray(candidate.staffInvites) &&
    Array.isArray(candidate.clubRoles) &&
    Array.isArray(candidate.clubRoleInvites) &&
    Array.isArray(candidate.sessions) &&
    Array.isArray(candidate.availability) &&
    Array.isArray(candidate.loadEntries) &&
    Array.isArray(candidate.loadSummaries) &&
    Array.isArray(candidate.athletePlans) &&
    Array.isArray(candidate.acknowledgedSessions) &&
    typeof candidate.shareLinks === 'object'
  );
}
