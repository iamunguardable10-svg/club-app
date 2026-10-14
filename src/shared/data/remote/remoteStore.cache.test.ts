/**
 * The server store's start behaviour, against a fake server with controllable
 * delays (no Postgres needed):
 * - the state kept on this device shows before the sign-in is checked,
 * - another account's kept state never shows after the check,
 * - loads asked for at the same time share one request per table,
 * - a timeout while renewing the sign-in keeps the data (no sign-out),
 * - a clear "not signed in" from the server removes it.
 *
 *   npx tsx src/shared/data/remote/remoteStore.cache.test.ts
 */

import assert from 'node:assert/strict';

import type { LocalDatabase } from '../schema';
import { OfflineError, RemoteStore, type OfflineCache, type OfflineSnapshot, type RemoteClient } from './remoteStore';
import { TABLES, type Row } from './tables';

const VERSION = 'test-version';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function memoryCache(snapshot: OfflineSnapshot | null): OfflineCache & { cleared: boolean } {
  let current = snapshot;
  return {
    cleared: false,
    read: () => current,
    write: (next) => { current = next; },
    clear() { current = null; this.cleared = true; },
  };
}

function savedFor(userId: string): OfflineSnapshot {
  const document = { activeIdentity: { role: 'athlete', personId: 'p1' }, marker: userId } as unknown as LocalDatabase;
  return { userId, version: VERSION, savedAt: '2026-10-14T10:00:00.000Z', document, outbox: [] };
}

type FakeOptions = { stored: string | null; userId: () => Promise<string | null> };

function fakeClient({ stored, userId }: FakeOptions) {
  const calls = { selectAll: 0 };
  const client: RemoteClient = {
    userId,
    storedUserId: () => stored,
    async selectAll() {
      calls.selectAll += 1;
      return [] as Row[];
    },
    async insert() {},
    async update() { return 1; },
    async delete() { return 1; },
    async rpc() { return null; },
  };
  return { client, calls };
}

const marker = (store: RemoteStore) => (store.read() as unknown as { marker?: string } | null)?.marker ?? null;

async function run(name: string, test: () => Promise<void>) {
  await test();
  console.log(`ok  ${name}`);
}

await run('kept state shows before the sign-in check answers', async () => {
  const check = deferred<string | null>();
  const { client } = fakeClient({ stored: 'u1', userId: () => check.promise });
  const store = new RemoteStore(client, VERSION, null, memoryCache(savedFor('u1')));
  const loading = store.load();
  assert.equal(marker(store), 'u1');
  assert.equal(store.getStatus().phase, 'ready');
  check.resolve('u1');
  await loading;
  assert.equal(store.getStatus().phase, 'unlinked'); // the fake server has no rows: fresh state replaced the kept one
});

await run("another account's kept state never shows", async () => {
  const check = deferred<string | null>();
  const cache = memoryCache(savedFor('u1'));
  const { client } = fakeClient({ stored: 'u2', userId: () => check.promise });
  const store = new RemoteStore(client, VERSION, null, cache);
  const loading = store.load();
  assert.equal(store.read(), null);
  check.resolve('u2');
  await loading;
  assert.equal(cache.cleared, true);
});

await run('kept state goes when the check finds a different account', async () => {
  const check = deferred<string | null>();
  const cache = memoryCache(savedFor('u1'));
  const { client } = fakeClient({ stored: 'u1', userId: () => check.promise });
  const store = new RemoteStore(client, VERSION, null, cache);
  const loading = store.load();
  assert.equal(marker(store), 'u1');
  check.resolve('u3');
  await loading;
  assert.notEqual(marker(store), 'u1');
  assert.equal(cache.cleared, true);
});

await run('loads asked for together share one request per table', async () => {
  const { client, calls } = fakeClient({ stored: null, userId: async () => 'u1' });
  const store = new RemoteStore(client, VERSION, null, memoryCache(null));
  await Promise.all([store.load(), store.load(), store.refresh(), store.load()]);
  assert.equal(calls.selectAll, TABLES.length);
});

await run('a timeout while renewing the sign-in keeps the data', async () => {
  const cache = memoryCache(savedFor('u1'));
  const { client } = fakeClient({ stored: 'u1', userId: () => Promise.reject(new OfflineError()) });
  const store = new RemoteStore(client, VERSION, null, cache);
  await store.load();
  assert.equal(marker(store), 'u1');
  assert.equal(store.getStatus().offline, true);
  assert.equal(store.getStatus().phase, 'ready');
  assert.equal(cache.cleared, false);
});

await run('a clear "not signed in" removes the kept state', async () => {
  const cache = memoryCache(savedFor('u1'));
  const { client } = fakeClient({ stored: 'u1', userId: async () => null });
  const store = new RemoteStore(client, VERSION, null, cache);
  await store.load();
  assert.equal(store.read(), null);
  assert.equal(store.getStatus().phase, 'signedOut');
  assert.equal(cache.cleared, true);
});

console.log('all server store start checks passed');
