/**
 * The server store on Supabase: a `RemoteClient` over supabase-js, plus the
 * browser wiring (reload when the app comes back to the foreground and every
 * half minute while it is visible, so a coach sees a player's cancellation
 * without reloading the page).
 *
 * Only loaded when this device chose the server (start page), through a
 * dynamic import in the repository.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { LocalDataError } from '../schema';
import { RemoteStore, type RemoteClient } from './remoteStore';
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
    throw new LocalDataError('Servermodus ohne NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }
  client = createClient(url, key, {
    auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

function fail(table: TableName, action: string, message: string): never {
  throw new Error(`${action} ${table}: ${message}`);
}

export function supabaseRemoteClient(supabase: SupabaseClient): RemoteClient {
  return {
    async userId() {
      const { data } = await supabase.auth.getSession();
      return data.session?.user.id ?? null;
    },
    async selectAll(table) {
      const rows: Row[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1);
        if (error) fail(table, 'Loading', error.message);
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE_SIZE) return rows;
      }
    },
    async insert(table, rows) {
      // No `.select()`: a row may be writable but not yet readable (a staff
      // member added before their membership), which would fail the request.
      const { error } = await supabase.from(table).insert(rows);
      if (error) fail(table, 'Creating', error.message);
    },
    async update(table, key, changes) {
      const { error, count } = await supabase.from(table).update(changes, { count: 'exact' }).match(key);
      if (error) fail(table, 'Updating', error.message);
      return count ?? 0;
    },
    async delete(table, key) {
      const { error, count } = await supabase.from(table).delete({ count: 'exact' }).match(key);
      if (error) fail(table, 'Deleting', error.message);
      return count ?? 0;
    },
    async rpc(name, args) {
      const { data, error } = await supabase.rpc(name, args);
      // Database functions raise messages meant for the person.
      if (error) throw new Error(error.message);
      return data;
    },
  };
}

export function createSupabaseStore(version: string, storage: KeyValueStorage): RemoteStore {
  const supabase = getSupabase(storage);
  const store = new RemoteStore(supabaseRemoteClient(supabase), version);

  // Signing in or out elsewhere (another tab, token expiry) reloads.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void store.load();
  });

  if (typeof window !== 'undefined') {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void store.refresh();
    };
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.setInterval(refreshIfVisible, REFRESH_MS);
  }
  return store;
}
