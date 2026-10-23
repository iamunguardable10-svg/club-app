/**
 * Unlocking in three levels (docs/plan-features-freischaltung.md), in the
 * local test mode with the real browser document: the team decides by
 * default, the club can decide for all teams, paid features need an
 * entitlement, and a switched-off feature refuses changes.
 *
 *   npx tsx src/shared/data/features.test.ts
 */
import assert from 'node:assert/strict';
import { LocalDataError } from './schema';
import { createSeedDatabase } from './seed';
import { DATABASE_KEY } from './migrations';
import { fromServerRows, toServerRows } from './remote/tables';

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'window', { value: {
  localStorage: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key), key: (index: number) => [...memory.keys()][index] ?? null, get length() { return memory.size; } },
  addEventListener() {},
} });
const data = await import('./repository');
const seed = createSeedDatabase();
seed.carpools = []; seed.carpoolRiders = []; seed.carpoolRequests = []; seed.clubFeatureSettings = [];
memory.set(DATABASE_KEY, JSON.stringify(seed));
const db = () => data.readDatabase()!;
const TEAM = 'team-u16';
const game = seed.sessions.find((s) => s.teamId === TEAM && s.sessionType === 'game' && Date.parse(s.startsAt) > Date.now())!;
const as = (id: string, role: 'athlete' | 'coach' | 'club' = 'athlete') => data.setActiveIdentity({ personId: id, role });
const off = (action: () => void) => assert.throws(action, (error: unknown) => error instanceof LocalDataError && error.messageKey === 'features.error.off');

// Older documents: the basic features are on, load as before.
assert.equal(data.teamHasFeature(db(), TEAM, 'carpools'), true);
assert.equal(data.teamHasFeature(db(), TEAM, 'load'), true);
assert.equal(data.teamHasFeature(db(), 'team-u18', 'load'), false);

// The team decides (head coach).
as('athlete-u16-1');
assert.throws(() => data.setTeamFeature(TEAM, 'carpools', false));
as('coach-1', 'coach');
data.setTeamFeature(TEAM, 'carpools', false);
assert.equal(data.teamHasFeature(db(), TEAM, 'carpools'), false);
assert.deepEqual(db().teams.find((team) => team.id === TEAM)?.features.includes('carpools'), false);
as('athlete-u16-1');
off(() => data.offerRide(game.id));
off(() => data.needSeat(game.id));

// The club decides for all teams; back to the teams.
as('club-admin-1', 'club');
data.setClubFeatureMode('carpools', 'on');
assert.equal(data.teamHasFeature(db(), TEAM, 'carpools'), true, 'on for all wins over the team');
data.setClubFeatureMode('polls', 'off');
assert.equal(data.teamHasFeature(db(), TEAM, 'polls'), false);
assert.equal(data.pollsAllowed(db(), { teamIds: [TEAM] }), false);
assert.equal(data.pollsAllowed(db(), {}), true, 'club and department news are not switched per team');
as('coach-1', 'coach');
off(() => data.postMessage({ teamIds: [TEAM], body: 'Jersey colour?', poll: { options: ['red', 'blue'] } }));
assert.throws(() => data.setClubFeatureMode('polls', 'on'), 'only the club admin sets club modes');
as('club-admin-1', 'club');
data.setClubFeatureMode('carpools', 'teams');
data.setClubFeatureMode('polls', 'teams');
assert.equal(data.teamHasFeature(db(), TEAM, 'carpools'), false, "the team's own choice counts again");
assert.equal(data.teamHasFeature(db(), TEAM, 'polls'), true);

// Paid features need an entitlement (on the club server).
const withEntitlement = (validUntil: string | null) => ({ ...db(), clubEntitlements: [{ clubId: db().club.id, feature: 'load' as const, source: 'pilot' as const, validUntil }] });
assert.equal(data.teamHasFeature({ ...db(), clubEntitlements: [] }, TEAM, 'load'), false);
assert.equal(data.teamHasFeature(withEntitlement('2000-01-01'), TEAM, 'load'), false, 'ran out');
assert.equal(data.teamHasFeature(withEntitlement('2999-12-31'), TEAM, 'load'), true);
assert.equal(data.teamHasFeature(withEntitlement(null), TEAM, 'load'), true);

// Server rows: the choice and the club setting go, `features` is the server's.
as('club-admin-1', 'club');
data.setClubFeatureMode('squads', 'off');
const rows = toServerRows(db());
const team = rows.teams.find((row) => row.id === TEAM)!;
assert.equal('features' in team, false);
assert.deepEqual(team.feature_choices, ['load', 'polls', 'squads', 'attendance']);
assert.deepEqual(rows.club_feature_settings, [{ club_id: db().club.id, feature: 'squads', mode: 'off' }]);
const back = fromServerRows({ ...rows, teams: rows.teams.map((row) => ({ ...row, features: ['load', 'polls', 'attendance'] })) }, { userId: 'test', version: seed.version, previous: db() })!;
assert.deepEqual(back.teams.find((t) => t.id === TEAM)?.featureChoices, ['load', 'polls', 'squads', 'attendance']);
assert.deepEqual(back.clubFeatureSettings, db().clubFeatureSettings);

console.log('all feature unlocking checks passed');
