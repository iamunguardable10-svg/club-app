/** The practice boundary: real storage and server spies, no live database. */
import assert from 'node:assert/strict';
import { createSeedDatabase } from './seed';
import { DATABASE_KEY } from './migrations';
import type { RemoteStore } from './remote/remoteStore';

const storage = new Map<string, string>();
let storageWrites = 0;
Object.assign(globalThis, { window: {
  localStorage: {
    get length() { return storage.size; },
    key: (index: number) => [...storage.keys()][index] ?? null,
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storageWrites++; storage.set(key, value); },
    removeItem: (key: string) => { storageWrites++; storage.delete(key); },
  },
  addEventListener: () => {},
} });
const repo = await import('./repository');
const real = repo.readDatabase()!;
const persisted = storage.get(DATABASE_KEY);
const writesBefore = storageWrites;
let notifications = 0;
const stop = repo.subscribe(() => notifications++);
repo.startPractice();
assert.ok(repo.isPracticeActive());
assert.notEqual(repo.readDatabase(), real);
assert.notEqual(repo.readDatabase()!.teams, real.teams);
repo.startPractice(); // idempotent, does not replace work in progress
repo.mutate((db) => { db.teams[0].name = 'Practice'; });
assert.equal(repo.readDatabase()!.teams[0].name, 'Practice');
assert.notEqual(real.teams[0].name, 'Practice');
assert.equal(storage.get(DATABASE_KEY), persisted);
repo.storeLocale('de'); repo.dismissHint('install'); repo.markTourSeen('ignored'); repo.resetTours(); repo.setBackendChoice('server');
assert.equal(storageWrites, writesBefore, 'all practice storage entry points are inert');
repo.endPractice();
assert.equal(repo.readDatabase(), real);
assert.ok(!repo.isPracticeActive());
assert.equal(storageWrites, writesBefore);
assert.ok(notifications >= 3);
repo.startPractice();
assert.throws(() => repo.mutate(() => { throw new Error('form failed'); }));
assert.ok(!repo.isPracticeActive(), 'exceptions discard the copy');

let serverDocument = createSeedDatabase();
let remoteCalls = 0;
let refreshed = 0;
let remoteNotify = () => {};
const store = {
  read: () => serverDocument,
  write: async () => { remoteCalls++; },
  call: async () => { remoteCalls++; },
  refresh: async () => { refreshed++; },
  flush: async () => { refreshed++; },
  subscribe: (listener: () => void) => { remoteNotify = listener; return () => {}; },
  getUserId: () => null,
} as unknown as RemoteStore;
repo.connectRemoteStore(store);
repo.startPractice();
const frozen = repo.readDatabase();
serverDocument = { ...serverDocument, club: { ...serverDocument.club, name: 'Background refresh' } };
remoteNotify();
assert.equal(repo.readDatabase(), frozen, 'background refresh cannot replace practice');
repo.mutate((db) => { db.club.name = 'Practice club'; });
assert.equal(repo.readDatabase()!.club.name, 'Practice club');
assert.equal(serverDocument.club.name, 'Background refresh');
const team = repo.createTeam(serverDocument.departments[0].id, 'Practice team');
assert.ok(repo.readDatabase()!.coachRoles.some((role) => role.teamId === team && role.locked));
await repo.refreshFromServer();
await repo.flushRemote();
assert.equal(refreshed, 0);
assert.equal(await repo.remindOpenPlayers('anything'), 0);
assert.equal(await repo.joinTeamWithCode('unused', 'A', 'B'), null);
assert.equal(await repo.serverMessageReach('anything', {}, 'all'), null);
assert.equal(await repo.getPushPublicKey(), null);
await repo.savePushSubscription({ endpoint: 'unused', p256dh: '', auth: '' });
await repo.deletePushSubscription('unused');
await repo.sendErrorReport('error', 'unused', null, { page: '/', role: 'coach', mode: 'server', version: '', device: '' });
await repo.syncAppleCalendar();
await repo.connectAppleCalendar('unused', 'unused');
await repo.disconnectAppleCalendar();
await repo.loadToursFromAccount();
await repo.signInWithPassword('unused', 'unused');
await repo.signOut();
assert.equal(await repo.getCalendarLink(), null);
assert.deepEqual(await repo.listCalendarSources(), []);
assert.equal(await repo.completeLoginHandoff('unused'), false);
assert.equal(await repo.previewInvite('unused'), null);
repo.markMessagesRead(repo.readDatabase()!.activeIdentity!.personId, []);
assert.equal(remoteCalls, 0, 'no remote writes or calls');
assert.equal(storageWrites, writesBefore, 'practice never writes storage');
repo.endPractice();
assert.equal(repo.readDatabase(), serverDocument, 'latest real document returns after exit');
assert.ok(!repo.readDatabase()!.teams.some((row) => row.id === team));
repo.mutate((db) => { db.club.name = 'Real edit'; });
assert.equal(remoteCalls, 1, 'ordinary write path still works');
stop();
console.log('practice passed: isolated copy, discard, exceptions, refresh, storage, remote writes and RPCs');
