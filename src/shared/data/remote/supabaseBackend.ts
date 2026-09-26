/**
 * The server store on Supabase: a `RemoteClient` over supabase-js, plus the
 * browser wiring (reload when the app comes back to the foreground and every
 * half minute while it is visible, so a coach sees a player's cancellation
 * without reloading the page).
 *
 * Only loaded when this device chose the server (start page), through a
 * dynamic import in the repository.
 *
 * Offline (piece 18): a request that finds no network throws `OfflineError`,
 * so the store keeps the change waiting instead of reporting a refusal, and
 * coming back online sends it.
 */

import { createClient, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';

import { LocalDataError } from '../schema';
import { OfflineError, RemoteStore, type OfflineCache, type RemoteClient } from './remoteStore';
import type { Row, TableName } from './tables';

/** PostgREST returns at most this many rows per request; larger tables are paged. */
const PAGE_SIZE = 1000;
const REFRESH_MS = 30_000;

type KeyValueStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };

/**
 * Where supabase-js keeps the sign-in session. The storage object is handed in
 * by the repository, which stays the only module touching localStorage.
 */
export function authStorage(storage: KeyValueStorage): KeyValueStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  };
}

let client: SupabaseClient | null = null;

/** The one Supabase client of this page. Sign-in (Run 10) uses it too. */
export function getSupabase(storage?: KeyValueStorage): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new LocalDataError('Server mode needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }
  client = createClient(url, key, {
    auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

/** The browser knows it has no network. */
function knownOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function checkOnline() {
  if (knownOffline()) throw new OfflineError();
}

type RequestError = { message: string; code?: string };

/** A failed request: no network (the request never got an answer), or the server's refusal. */
function fail(table: TableName, action: string, error: RequestError, status: number): never {
  if (status === 0 || knownOffline()) throw new OfflineError();
  throw Object.assign(new Error(`${action} ${table}: ${error.message}`), { code: error.code });
}

export function supabaseRemoteClient(supabase: SupabaseClient): RemoteClient {
  return {
    async userId() {
      const { data, error } = await supabase.auth.getSession();
      // An expired sign-in cannot be renewed without a network; it is not a sign-out.
      if (!data.session && error && (isAuthRetryableFetchError(error) || knownOffline())) throw new OfflineError();
      return data.session?.user.id ?? null;
    },
    async selectAll(table) {
      checkOnline();
      const rows: Row[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error, status } = await supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1);
        if (error) fail(table, 'Loading', error, status);
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE_SIZE) return rows;
      }
    },
    async insert(table, rows) {
      // No `.select()`: a row may be writable but not yet readable (a staff
      // member added before their membership), which would fail the request.
      checkOnline();
      const { error, status } = await supabase.from(table).insert(rows);
      if (error) fail(table, 'Creating', error, status);
    },
    async update(table, key, changes) {
      checkOnline();
      const { error, count, status } = await supabase.from(table).update(changes, { count: 'exact' }).match(key);
      if (error) fail(table, 'Updating', error, status);
      return count ?? 0;
    },
    async delete(table, key) {
      checkOnline();
      const { error, count, status } = await supabase.from(table).delete({ count: 'exact' }).match(key);
      if (error) fail(table, 'Deleting', error, status);
      return count ?? 0;
    },
    async rpc(name, args) {
      if (knownOffline()) throw new OfflineError("You're offline. Try again when you have a connection.", 'data.offlineTryAgain');
      const { data, error, status } = await supabase.rpc(name, args);
      if (error && status === 0) throw new OfflineError("You're offline. Try again when you have a connection.", 'data.offlineTryAgain');
      // Database functions raise messages meant for the person.
      if (error) throw new Error(error.message);
      return data;
    },
  };
}

export function createSupabaseStore(
  version: string,
  storage: KeyValueStorage,
  rememberedIdentity: ConstructorParameters<typeof RemoteStore>[2] = null,
  offlineCache: OfflineCache | null = null,
): RemoteStore {
  const supabase = getSupabase(storage);
  const store = new RemoteStore(supabaseRemoteClient(supabase), version, rememberedIdentity, offlineCache);

  // Signing in or out elsewhere (another tab, token expiry) reloads.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void store.load();
  });

  if (typeof window !== 'undefined') {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void store.refresh();
    };
    window.addEventListener('focus', refreshIfVisible);
    // Back online: send what waited, then reload.
    window.addEventListener('online', () => void store.refresh());
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.setInterval(refreshIfVisible, REFRESH_MS);
  }
  return store;
}
