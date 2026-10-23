/**
 * The server store on Supabase: a `RemoteClient` over supabase-js, plus the
 * browser wiring for live updates. Every change on the server counts up a
 * version of its table (`data_changes`, migration 0045); the app listens to
 * those versions over Realtime and reloads just the tables that moved, so a
 * coach sees a player's cancellation within a second or two. A cheap check
 * of the versions when the app comes back to the foreground and every half
 * minute while it is visible covers a dropped connection.
 *
 * Only loaded when this device chose the server (start page), through a
 * dynamic import in the repository.
 *
 * Offline (piece 18): a request that finds no network throws `OfflineError`,
 * so the store keeps the change waiting instead of reporting a refusal, and
 * coming back online sends it.
 */

import { createClient, isAuthApiError, type SupabaseClient } from '@supabase/supabase-js';

import { LocalDataError } from '../schema';
import { OfflineError, RemoteStore, type ChangeVersion, type OfflineCache, type RemoteClient } from './remoteStore';
import type { Row, TableName } from './tables';

/** PostgREST returns at most this many rows per request; larger tables are paged. */
const PAGE_SIZE = 1000;
const CHECK_MS = 30_000;
/** Changes that arrive together (one save touching several tables) load together. */
const LIVE_DELAY_MS = 300;
/** How long one table may take to load before it counts as no network. */
const LOAD_TIMEOUT_MS = 20_000;

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

/** Where supabase-js keeps the session by default: `sb-<project ref>-auth-token`. */
function sessionStorageKey(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return null;
  }
}

/** The account id in the kept session, without the network (it may be expired). */
export function storedSessionUserId(storage: KeyValueStorage | undefined): string | null {
  const key = sessionStorageKey();
  if (!storage || !key) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: { id?: unknown }; currentSession?: { user?: { id?: unknown } } };
    const id = parsed.user?.id ?? parsed.currentSession?.user?.id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

export function supabaseRemoteClient(supabase: SupabaseClient, storage?: KeyValueStorage): RemoteClient {
  return {
    async userId() {
      const { data, error } = await supabase.auth.getSession();
      if (data.session) return data.session.user.id;
      // Only the server saying the sign-in is no longer valid (revoked or
      // expired refresh token) signs out. A timeout, a dropped connection or
      // any other failure to renew keeps the saved state, like being offline.
      if (error && !(isAuthApiError(error) && [400, 401, 403].includes(error.status ?? 0))) throw new OfflineError();
      return null;
    },
    storedUserId() {
      return storedSessionUserId(storage);
    },
    async selectAll(table) {
      checkOnline();
      const rows: Row[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        // A request that hangs ends after a while and counts as no network,
        // so the screen shows the saved state instead of waiting forever.
        const { data, error, status } = await supabase
          .from(table)
          .select(table === 'people' ? 'id,club_id,user_id,first_name,last_name,rsvp_mode,photo_at,created_at' : '*')
          .range(from, from + PAGE_SIZE - 1)
          .abortSignal(AbortSignal.timeout(LOAD_TIMEOUT_MS));
        if (error) fail(table, 'Loading', error, status);
        rows.push(...(data as unknown as Row[] ?? []));
        if (!data || data.length < PAGE_SIZE) return rows;
      }
    },
    async changeVersions() {
      checkOnline();
      const { data, error, status } = await supabase
        .from('data_changes')
        .select('club_id,table_name,version')
        .abortSignal(AbortSignal.timeout(LOAD_TIMEOUT_MS));
      if (error && (status === 0 || knownOffline())) throw new OfflineError();
      // Not there (yet) or refused: the app reloads everything as before.
      if (error) return null;
      return (data ?? []) as ChangeVersion[];
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
  const store = new RemoteStore(supabaseRemoteClient(supabase, storage), version, rememberedIdentity, offlineCache);

  // Signing in or out elsewhere (another tab, token expiry) reloads. A
  // changed account (language, e-mail, password) changes no club data.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void store.load();
  });

  if (typeof window !== 'undefined') {
    const visible = () => document.visibilityState === 'visible';

    // Live: a version moved. Hidden, the check on coming back does it.
    let liveTimer: number | undefined;
    const onLiveChange = () => {
      window.clearTimeout(liveTimer);
      liveTimer = window.setTimeout(() => {
        if (visible()) void store.refreshChanged();
      }, LIVE_DELAY_MS);
    };
    let channel: ReturnType<SupabaseClient['channel']> | null = null;
    const listen = (signedIn: boolean) => {
      if (!signedIn) {
        if (channel) void supabase.removeChannel(channel);
        channel = null;
        return;
      }
      if (channel) return;
      // Row-level security decides which clubs' versions arrive.
      channel = supabase
        .channel('data-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'data_changes' }, onLiveChange)
        // (Re)connected: what changed while the connection was down.
        .subscribe((state) => {
          if (state === 'SUBSCRIBED') onLiveChange();
        });
    };
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') listen(Boolean(session));
    });

    // Focus and visibility often fire together when the app comes back;
    // one check covers both (the store also shares a load in flight).
    let lastCheck = 0;
    const checkIfVisible = () => {
      if (!visible()) return;
      const now = Date.now();
      if (now - lastCheck < 2_000) return;
      lastCheck = now;
      void store.refreshChanged();
    };
    window.addEventListener('focus', checkIfVisible);
    // Back online: send what waited, then reload.
    window.addEventListener('online', () => void store.refresh());
    document.addEventListener('visibilitychange', checkIfVisible);
    window.setInterval(checkIfVisible, CHECK_MS);
  }
  return store;
}
