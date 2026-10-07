/** Repository rules, using the real browser document with an in-memory device. */
import assert from 'node:assert/strict';
import { LocalDataError } from './schema';
import { createSeedDatabase } from './seed';
import { DATABASE_KEY } from './migrations';
import { fromServerRows, toServerRows } from './remote/tables';
import { renderPush, type PushTexts } from '../../../supabase/functions/push-dispatch/render';
import pushTexts from '../../../supabase/functions/push-dispatch/push-texts.json';

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'window', { value: {
  localStorage: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key), key: (index: number) => [...memory.keys()][index] ?? null, get length() { return memory.size; } },
  addEventListener() {},
} });
const data = await import('./repository');
const seed = createSeedDatabase();
seed.carpools = []; seed.carpoolRiders = []; seed.carpoolRequests = [];
memory.set(DATABASE_KEY, JSON.stringify(seed));
const db = () => data.readDatabase()!;
const game = seed.sessions.find((s) => s.teamId === 'team-u16' && s.sessionType === 'game' && Date.parse(s.startsAt) > Date.now())!;
const as = (id: string, role: 'athlete' | 'coach' = 'athlete') => data.setActiveIdentity({ personId: id, role });
function refused(key: string, action: () => void) {
  assert.throws(action, (error: unknown) => error instanceof LocalDataError && error.messageKey === `carpools.error.${key}`);
}
as('coach-1', 'coach');
for (const seats of [0, 9, 1.5, NaN]) refused('seats', () => data.offerRide(game.id, seats));
refused('note', () => data.offerRide(game.id, 3, 'x'.repeat(201)));
const first = data.offerRide(game.id, 2, 'School gate');
refused('offered', () => data.offerRide(game.id));
as('athlete-u16-2');
const second = data.offerRide(game.id);
refused('driving', () => data.joinRide(first));
as('athlete-u16-1');
data.needSeat(game.id);
data.joinRide(first);
assert.equal(db().carpoolRequests?.length, 0);
refused('riding', () => data.joinRide(second));
refused('riding', () => data.offerRide(game.id));
refused('riding', () => data.needSeat(game.id));
refused('own', () => data.updateRide(first, 3));
refused('own', () => data.removeRider(first, 'athlete-u16-1'));
as('athlete-u16-3'); data.joinRide(first);
as('athlete-u16-4'); refused('full', () => data.joinRide(first));
as('coach-1', 'coach'); refused('occupied', () => data.updateRide(first, 1));
data.updateRide(first, 3, '  Leaving at 17:15  ');
assert.equal(db().carpools?.find((c) => c.id === first)?.note, 'Leaving at 17:15');
data.removeRider(first, 'athlete-u16-3');
as('athlete-u16-1'); data.leaveRide(first); data.needSeat(game.id); data.cancelNeedSeat(game.id);
assert.equal(db().carpoolRequests?.length, 0);
as('athlete-u18-1'); refused('member', () => data.offerRide(game.id)); refused('member', () => data.needSeat(game.id)); refused('member', () => data.joinRide(first));
as('coach-1', 'coach');
const training = seed.sessions.find((s) => s.sessionType === 'training' && Date.parse(s.startsAt) > Date.now())!;
refused('game', () => data.offerRide(training.id));
const rows = toServerRows(db());
const roundtrip = fromServerRows(rows, { userId: 'test', version: seed.version, previous: db() })!;
assert.deepEqual(roundtrip.carpools, db().carpools);
assert.deepEqual(roundtrip.carpoolRiders, db().carpoolRiders);
assert.deepEqual(roundtrip.carpoolRequests, db().carpoolRequests);
for (const key of ['push.carpoolJoined', 'push.carpoolLeft', 'push.carpoolOffered']) {
  for (const locale of ['de', 'fr', 'es']) {
    const result = renderPush(pushTexts as PushTexts, locale, key, { name: 'Lena', seats: 3, title: 'Game', at: game.startsAt }, { title: 'English', body: 'English' });
    assert.ok(result && result.title.includes('Lena') && !result.body.includes('English'));
  }
}
data.mutate((d) => { d.sessions.find((s) => s.id === game.id)!.startsAt = new Date(Date.now() - 1000).toISOString(); });
for (const action of [() => data.offerRide(game.id), () => data.updateRide(first, 3), () => data.withdrawRide(first), () => data.joinRide(second), () => data.leaveRide(first), () => data.removeRider(first, 'athlete-u16-3'), () => data.needSeat(game.id), () => data.cancelNeedSeat(game.id)]) refused('past', action);
data.mutate((d) => { d.sessions.find((s) => s.id === game.id)!.startsAt = game.startsAt; });
data.withdrawRide(second); // coach editSessions removes another person's offer
assert.ok(!db().carpools?.some((c) => c.id === second));
data.deleteSession(game.id);
assert.equal(db().carpools?.length, 0);
assert.equal(db().carpoolRiders?.length, 0);
console.log('all carpool checks passed');
