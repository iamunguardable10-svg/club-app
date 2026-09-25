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
 *
 * When the build knows the pilot server (Supabase URL and key) and this
 * device chose it on the start page, the same document is backed by the
 * pilot database instead (`./remote`, docs/simplify-decisions.md point 8).
 * The local test mode stays available on every device, without an account.
 * Every function below works unchanged in both modes: reads come from the
 * document, writes go through `mutate`, and only `readDatabase`/`mutate`
 * know where the document lives.
 */

import { calculateACWR, getLatestACWR, loadZone, sevenDayLoad, summarizeLoadEntries } from './loadCalculations';
import { DATABASE_KEY, LEGACY_KEY_PREFIXES, SCHEMA_VERSION, isCurrent } from './migrations';
import { COACH_ROLE_TEMPLATES, createSeedDatabase } from './seed';
import type { OfflineCache, OfflineSnapshot, RemoteStore } from './remote/remoteStore';
import {
  COACH_PERMISSIONS,
  COACH_PERMISSION_REQUIRES,
  CLUB_MANAGEMENT_PERMISSIONS,
  LOAD_PERMISSIONS,
  LocalDataError,
  type ActiveIdentity,
  type CoachPermission,
  type ClubRole,
  type ClubRoleInvite,
  type ClubRoleKind,
  type CoachRole,
  type Membership,
  type AttendanceConfirmation,
  type Absence,
  type AbsenceKind,
  type SquadStatus,
  type TeamMessage,
  type Availability,
  type AvailabilityStatus,
  type Facility,
  type DateOnly,
  type PrivateEvent,
  type Id,
  type Timestamp,
  type LoadEntry,
  type LoadEntryReview,
  type LocalDatabase,
  type IdentityRole,
  type MembershipRole,
  type Person,
  type Session,
  type SessionSeries,
  type SessionDetails,
  type GameDetails,
  type StaffInvite,
  type SessionType,
  type Team,
  type TeamFeature,
} from './schema';

type Listener = () => void;

/** The server store once connected; null in the local test mode. */
let remote: RemoteStore | null = null;
let remoteStarting = false;

const BACKEND_CHOICE_KEY = 'club-app.backend';
/** Server mode: which of your own roles this device last acted as. */
const IDENTITY_KEY = 'club-app.identity';
/** Server mode: the last server state and the changes waiting for the network (piece 18). Gone on sign-out. */
const OFFLINE_KEY = 'club-app.offline';

/** The device's copy of the server state, kept in localStorage like everything else. */
function offlineCache(): OfflineCache {
  return {
    read() {
      try {
        const raw = window.localStorage.getItem(OFFLINE_KEY);
        return raw ? (JSON.parse(raw) as OfflineSnapshot) : null;
      } catch {
        return null;
      }
    },
    write(snapshot) {
      try {
        window.localStorage.setItem(OFFLINE_KEY, JSON.stringify(snapshot));
      } catch {
        // Full storage: the app still works online, it just cannot show this state offline.
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(OFFLINE_KEY);
      } catch {
        // Nothing to clear.
      }
    },
  };
}

function readRememberedIdentity(): ActiveIdentity | null {
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as ActiveIdentity) : null;
  } catch {
    return null;
  }
}

export type BackendChoice = 'local' | 'server';

let backendChoice: BackendChoice | null = null;

/** Whether this build knows a pilot server at all. */
export function isServerAvailable(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

/**
 * Which store this device uses: the pilot server (with sign-in) or the local
 * test mode (no account, test data in this browser). Chosen on the start
 * page; the local mode is the default and always available.
 */
export function getBackendChoice(): BackendChoice {
  if (!isServerAvailable() || !isBrowser()) return 'local';
  if (backendChoice === null) {
    try {
      backendChoice = window.localStorage.getItem(BACKEND_CHOICE_KEY) === 'server' ? 'server' : 'local';
    } catch {
      backendChoice = 'local';
    }
  }
  return backendChoice;
}

/**
 * Remembers the choice for this device. Callers then load a new page
 * (`window.location.assign`): the two modes never share a document in memory.
 */
export function setBackendChoice(choice: BackendChoice): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(BACKEND_CHOICE_KEY, choice);
  backendChoice = choice;
}

/** Hints that can be put away with "Not now": installing the app, turning on notifications. */
export type HintName = 'install' | 'notifications';

const hintKey = (name: HintName) => `club-app.hint-dismissed.${name}`;

/** Whether a hint was put away on this device. */
export function isHintDismissed(name: HintName): boolean {
  if (!isBrowser()) return true;
  try {
    return window.localStorage.getItem(hintKey(name)) === '1';
  } catch {
    return false;
  }
}

export function dismissHint(name: HintName): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(hintKey(name), '1');
  } catch {
    // Not remembering is fine; the hint just shows again next time.
  }
}

/** Whether this page talks to the pilot database instead of localStorage. */
export function isRemoteMode(): boolean {
  return remote !== null || getBackendChoice() === 'server';
}

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
  if (remote) return remote.read();
  if (!isBrowser()) return null;
  if (isRemoteMode()) {
    startRemote();
    return null;
  }
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
 * A new record id. UUIDs, because the pilot server stores ids as `uuid`.
 *
 * Not `crypto.randomUUID()`: browsers only offer it on https or localhost,
 * and the app is also opened on phones over the local network during
 * development. `getRandomValues` is available everywhere.
 */
export function newId(): Id {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Keeps `loadSummaries` in step with the entries: recomputed for every person
 * whose entries this change touched, and only for them — on the server an
 * athlete may only write their own summary.
 */
function refreshLoadSummaries(before: LocalDatabase, after: LocalDatabase) {
  const signature = (database: LocalDatabase) => {
    const byPerson = new Map<Id, string>();
    for (const entry of database.loadEntries) {
      byPerson.set(entry.personId, `${byPerson.get(entry.personId) ?? ''}|${entry.id}:${entry.date}:${entry.load}`);
    }
    return byPerson;
  };
  const previous = signature(before);
  const next = signature(after);
  const changed = new Set<Id>();
  for (const personId of new Set([...previous.keys(), ...next.keys()])) {
    if (previous.get(personId) !== next.get(personId)) changed.add(personId);
  }
  if (changed.size === 0) return;
  const now = new Date().toISOString();
  after.loadSummaries = [
    ...after.loadSummaries.filter((row) => !changed.has(row.personId)),
    ...Array.from(changed).map((personId) => ({
      personId,
      ...summarizeLoadEntries(after.loadEntries.filter((entry) => entry.personId === personId)),
      updatedAt: now,
    })),
  ];
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
  refreshLoadSummaries(current, draft);
  if (remote) {
    // Shown at once; the store sends the difference and notifies again when
    // the server has answered.
    void remote.write(current, draft);
    return;
  }
  persist(draft);
  notify();
}

/**
 * Connects the server store. The browser does this itself in remote mode
 * (`startRemote`); tests call it with a store on a local Postgres.
 */
export function connectRemoteStore(store: RemoteStore): void {
  remote = store;
  cache = null;
  store.subscribe(notify);
}

function startRemote() {
  if (remoteStarting) return;
  remoteStarting = true;
  // Loaded on demand, so the local test mode never ships the server client.
  import('./remote/supabaseBackend')
    .then(async ({ createSupabaseStore, authStorage }) => {
      const store = createSupabaseStore(SCHEMA_VERSION, authStorage(window.localStorage), readRememberedIdentity(), offlineCache());
      connectRemoteStore(store);
      await store.load();
      ensureFreshLoadSummary();
    })
    .catch((error) => {
      remoteLoadError = error instanceof Error ? error.message : String(error);
      notify();
    });
}

let remoteLoadError: string | null = null;

export type BackendStatus = {
  mode: 'local' | 'remote';
  phase: 'loading' | 'ready' | 'signedOut' | 'unlinked' | 'error';
  error: string | null;
  /** The last change the server did not (fully) accept. */
  rejected: string | null;
  /** Changes not yet answered by the server (offline: waiting for the network). */
  pending: number;
  /** No network: the screen shows the state kept on this device. */
  offline: boolean;
  /** When the shown state last came from the server. */
  savedAt: string | null;
};

const QUIET = { rejected: null, pending: 0, offline: false, savedAt: null } as const;

/** Where the data comes from and whether it is there yet. */
export function getBackendStatus(): BackendStatus {
  if (!isRemoteMode()) return { mode: 'local', phase: 'ready', error: null, ...QUIET };
  if (remoteLoadError) return { mode: 'remote', phase: 'error', error: remoteLoadError, ...QUIET };
  if (!remote) return { mode: 'remote', phase: 'loading', error: null, ...QUIET };
  return { mode: 'remote', ...remote.getStatus() };
}

/** Hides the message about a refused change. */
export function dismissRejectedChange(): void {
  remote?.clearRejected();
}

/** Reloads from the server (remote mode); a no-op locally. */
export function refreshFromServer(): Promise<void> {
  return remote ? remote.refresh() : Promise.resolve();
}

/** Resolves once every change sent to the server has been answered. */
export function flushRemote(): Promise<void> {
  return remote ? remote.flush() : Promise.resolve();
}

/**
 * The traffic light depends on today's date, so an athlete's app refreshes
 * its own summary once a day even without new entries. Only the athlete may
 * write it on the server.
 */
export function ensureFreshLoadSummary(): void {
  const database = readDatabase();
  const identity = database?.activeIdentity;
  if (!database || identity?.role !== 'athlete' || !athleteHasLoad(database, identity.personId)) return;
  const today = new Date().toISOString().slice(0, 10);
  const row = database.loadSummaries.find((candidate) => candidate.personId === identity.personId);
  const entries = database.loadEntries.filter((entry) => entry.personId === identity.personId);
  if (entries.length === 0 || row?.updatedAt.slice(0, 10) === today) return;
  mutate((draft) => {
    draft.loadSummaries = [
      ...draft.loadSummaries.filter((candidate) => candidate.personId !== identity.personId),
      { personId: identity.personId, ...summarizeLoadEntries(entries), updatedAt: new Date().toISOString() },
    ];
  });
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
  if (isRemoteMode()) throw new LocalDataError('There is no test data to reset while signed in to the club.');
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
// Accounts and access (pilot server)
// ---------------------------------------------------------------------------

function supabaseModule() {
  return import('./remote/supabaseBackend');
}

async function authClient() {
  if (!isBrowser()) throw new LocalDataError('Signing in only works in the browser.');
  const { getSupabase, authStorage } = await supabaseModule();
  return getSupabase(authStorage(window.localStorage));
}

/** Supabase answers in English; these are the messages people actually meet. */
function authMessage(message: string): string {
  const known: [RegExp, string][] = [
    [/invalid login credentials/i, 'Email or password is incorrect.'],
    [/email not confirmed/i, 'Please confirm your email address first, using the link we sent you.'],
    [/already registered|already exists/i, 'There is already an account with this email. Please sign in.'],
    [/password should be at least (\d+)/i, 'The password is too short.'],
    [/rate limit|too many/i, 'Too many attempts. Please wait a moment and try again.'],
    [/not authorized/i, 'The server cannot send mail to this address right now.'],
    [/unable to validate email|invalid format|invalid email/i, 'This email address does not look valid.'],
  ];
  return known.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const supabase = await authClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new LocalDataError(authMessage(error.message));
}

/**
 * Creates an account. When the project asks for e-mail confirmation there is
 * no session yet and the person has to click the link in the mail first.
 */
export async function signUpWithPassword(email: string, password: string, returnTo: string): Promise<{ confirmationNeeded: boolean }> {
  const supabase = await authClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: `${window.location.origin}${returnTo}` },
  });
  if (error) throw new LocalDataError(authMessage(error.message));
  return { confirmationNeeded: !data.session };
}

/** Sends a link to choose a new password; it leads to /reset-password. */
export async function requestPasswordReset(email: string): Promise<void> {
  const supabase = await authClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new LocalDataError(authMessage(error.message));
}

/** Sets a new password for the signed-in account (after the reset link). */
export async function updatePassword(password: string): Promise<void> {
  const supabase = await authClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new LocalDataError(authMessage(error.message));
}

/**
 * Changes the account's e-mail address. Supabase sends a confirmation link;
 * the address changes once it is clicked.
 */
export async function changeEmail(email: string): Promise<void> {
  const clean = email.trim();
  if (!clean) throw new LocalDataError('Enter the new email address.');
  const supabase = await authClient();
  const { error } = await supabase.auth.updateUser({ email: clean }, { emailRedirectTo: `${window.location.origin}/settings` });
  if (error) throw new LocalDataError(authMessage(error.message));
}

/** Signs out on this device, or with `everywhere` on every device of the account. */
export async function signOut(options: { everywhere?: boolean } = {}): Promise<void> {
  const supabase = await authClient();
  // This device stops getting the account's notifications (piece 7): the
  // next person signing in here must not see them.
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription) {
      await supabase.rpc('delete_push_subscription', { p_endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
  } catch {
    // Signing out must not fail over notifications.
  }
  await supabase.auth.signOut({ scope: options.everywhere ? 'global' : 'local' });
  // Nothing of the account stays on the device, changes still waiting included.
  offlineCache().clear();
}

// ---------------------------------------------------------------------------
// Push notifications (piece 7): devices of the signed-in account
// ---------------------------------------------------------------------------

/** The server's public VAPID key, needed to subscribe a device. */
export async function getPushPublicKey(): Promise<string | null> {
  const supabase = await authClient();
  const { data, error } = await supabase.rpc('push_public_key');
  if (error) throw new LocalDataError(error.message);
  return typeof data === 'string' && data ? data : null;
}

/** Turns notifications on for this device and the signed-in account. */
export async function savePushSubscription(subscription: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
  const supabase = await authClient();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint, p_p256dh: subscription.p256dh, p_auth: subscription.auth,
  });
  if (error) throw new LocalDataError(error.message);
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const supabase = await authClient();
  const { error } = await supabase.rpc('delete_push_subscription', { p_endpoint: endpoint });
  if (error) throw new LocalDataError(error.message);
}

/** Kinds of message that can be switched off; "How hard was it?" cannot (piece 12). */
export type MutablePushKind = 'changed' | 'cancelled' | 'reminder' | 'summary' | 'review' | 'message';

/** Per account: switched-off kinds and quiet hours (club time, whole hours; null = none). */
export type NotificationSettings = { mutedKinds: MutablePushKind[]; quietFrom: number | null; quietTo: number | null };

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = { mutedKinds: [], quietFrom: 22, quietTo: 7 };

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const supabase = await authClient();
  const { data, error } = await supabase.from('notification_settings').select('muted_kinds, quiet_from, quiet_to').maybeSingle();
  if (error) throw new LocalDataError(error.message);
  if (!data) return DEFAULT_NOTIFICATION_SETTINGS;
  return { mutedKinds: data.muted_kinds ?? [], quietFrom: data.quiet_from, quietTo: data.quiet_to };
}

export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  const { quietFrom, quietTo } = settings;
  if ((quietFrom === null) !== (quietTo === null)) throw new LocalDataError('Quiet hours need a start and an end.');
  if (quietFrom !== null && quietFrom === quietTo) throw new LocalDataError('Quiet hours must start and end at different times.');
  const supabase = await authClient();
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new LocalDataError('Please sign in again.');
  const { error } = await supabase.from('notification_settings').upsert({
    user_id: userId,
    muted_kinds: [...new Set(settings.mutedKinds)],
    quiet_from: quietFrom,
    quiet_to: quietTo,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new LocalDataError(error.message);
}

// ---------------------------------------------------------------------------
// Staying signed in when the app is added to the home screen
// ---------------------------------------------------------------------------

/** A one-time code for the app on the home screen (migration 0025); needs a signed-in account. */
export async function createLoginHandoff(): Promise<string> {
  const supabase = await authClient();
  const { data, error } = await supabase.rpc('create_login_handoff');
  if (error) throw new LocalDataError(error.message);
  return data as string;
}

/**
 * Signs this app in with the code it was installed with. False when the code
 * is used up or too old (then the person signs in once, as before).
 */
export async function completeLoginHandoff(code: string): Promise<boolean> {
  const supabase = await authClient();
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/login-handoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) return false;
  const { token_hash: tokenHash } = (await response.json()) as { token_hash?: string };
  if (!tokenHash) return false;
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  return !error;
}

/** Whether this device has a signed-in account (server mode). */
export async function hasSignedInAccount(): Promise<boolean> {
  if (!isServerAvailable()) return false;
  const supabase = await authClient();
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

// ---------------------------------------------------------------------------
// Calendar subscription link (piece 19)
// ---------------------------------------------------------------------------

export type CalendarLink = {
  /** https address for copying and for Google/Outlook. */
  url: string;
  /** The same as webcal://, which Apple devices open as "Subscribe". */
  webcalUrl: string;
  /** When a calendar app last fetched it, if ever. */
  lastFetchedAt: string | null;
};

function calendarLink(token: string, lastFetchedAt: string | null): CalendarLink {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/calendar-feed/${token}.ics`;
  return { url, webcalUrl: url.replace(/^https?:/, 'webcal:'), lastFetchedAt };
}

/** The account's calendar link, or null when it has none (it is only made when asked for). */
export async function getCalendarLink(): Promise<CalendarLink | null> {
  const supabase = await authClient();
  const { data, error } = await supabase.rpc('calendar_feed_status');
  if (error) throw new LocalDataError(error.message);
  const status = data as { token: string; last_fetched_at: string | null } | null;
  return status?.token ? calendarLink(status.token, status.last_fetched_at) : null;
}

/** Makes the link, or with `renew` a new one; the old one stops working at once. */
export async function createCalendarLink(renew = false): Promise<CalendarLink> {
  const supabase = await authClient();
  const { data, error } = await supabase.rpc('calendar_feed_token', { p_new: renew });
  if (error) throw new LocalDataError(error.message);
  return calendarLink(data as string, null);
}

/** Switches the link off; subscribed calendars stop getting sessions. */
export async function stopCalendarLink(): Promise<void> {
  const supabase = await authClient();
  const { error } = await supabase.rpc('calendar_feed_stop');
  if (error) throw new LocalDataError(error.message);
}

// ---------------------------------------------------------------------------
// Apple Calendar connection (piece 20), optional
// ---------------------------------------------------------------------------

export type AppleCalendarStatus = { appleId: string; status: 'ok' | 'error'; lastError: string | null; lastSyncAt: string | null };
export type CalendarSource = { url: string; name: string; color: string | null; import: boolean; coachSees: 'none' | 'busy' | 'title' };

/** The connection, or null when this account has none (the usual case). */
export async function getAppleCalendarStatus(): Promise<AppleCalendarStatus | null> {
  const supabase = await authClient();
  const { data, error } = await supabase.rpc('apple_calendar_status');
  if (error) throw new LocalDataError(error.message);
  const row = data as { apple_id: string; status: 'ok' | 'error'; last_error: string | null; last_sync_at: string | null } | null;
  return row ? { appleId: row.apple_id, status: row.status, lastError: row.last_error, lastSyncAt: row.last_sync_at } : null;
}

async function callAppleCalendar(body: Record<string, string>): Promise<Record<string, unknown>> {
  const supabase = await authClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new LocalDataError('Please sign in again.');
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/apple-calendar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!response) throw new LocalDataError("You're offline. Try again when you have a connection.");
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof result.error === 'string') throw new LocalDataError(typeof result.error === 'string' ? result.error : 'Apple Calendar is not available right now.');
  return result;
}

/** Checks the Apple ID and app-specific password with iCloud, stores them and runs the first sync. */
export async function connectAppleCalendar(appleId: string, password: string): Promise<void> {
  await callAppleCalendar({ action: 'connect', appleId, password });
  await refreshFromServer();
}

export async function syncAppleCalendar(): Promise<void> {
  await callAppleCalendar({ action: 'sync' });
  await refreshFromServer();
}

/** Deletes the stored password, the calendar list and imported events. */
export async function disconnectAppleCalendar(): Promise<void> {
  const supabase = await authClient();
  const { error } = await supabase.rpc('disconnect_apple_calendar');
  if (error) throw new LocalDataError(error.message);
  await refreshFromServer();
}

export async function listCalendarSources(): Promise<CalendarSource[]> {
  const supabase = await authClient();
  const { data, error } = await supabase.from('calendar_sources').select('url, name, color, import, coach_sees').order('name');
  if (error) throw new LocalDataError(error.message);
  return (data ?? []).map((row) => ({ url: row.url, name: row.name, color: row.color, import: row.import, coachSees: row.coach_sees }));
}

/** Lets Club OS read a calendar or not (off: its events go at once). */
export async function setCalendarImport(url: string, value: boolean): Promise<void> {
  const supabase = await authClient();
  const { error } = await supabase.from('calendar_sources').update({ import: value }).eq('url', url);
  if (error) throw new LocalDataError(error.message);
  if (!value) await refreshFromServer();
}

/** The signed-in person's imported events between two times (for their own calendar). */
export function privateEventsBetween(database: LocalDatabase, fromMs: number, toMs: number): PrivateEvent[] {
  return (database.privateEvents ?? []).filter((event) => Date.parse(event.endsAt) > fromMs && Date.parse(event.startsAt) < toMs);
}

// ---------------------------------------------------------------------------
// Errors and problem reports (piece 13)
// ---------------------------------------------------------------------------

export type ErrorReportKind = 'crash' | 'error' | 'rejected' | 'push';

/** Where a report comes from; no content, no health data. */
export type ReportContext = { page: string; role: IdentityRole | null; mode: 'server' | 'demo'; version: string; device: string };

/** Sends an error to the server. Works signed in or not; does nothing without a server. */
export async function sendErrorReport(kind: ErrorReportKind, message: string, detail: string | null, context: ReportContext): Promise<void> {
  if (!isServerAvailable()) return;
  const supabase = await authClient();
  await supabase.rpc('report_error', {
    p_kind: kind, p_message: message, p_detail: detail, p_page: context.page, p_role: context.role,
    p_mode: context.mode, p_version: context.version, p_device: context.device,
  });
}

/** "Report a problem" from the account menu. */
export async function sendProblemReport(text: string, context: ReportContext): Promise<void> {
  if (!isServerAvailable()) throw new LocalDataError('Reports need a connection to the club server.');
  const supabase = await authClient();
  const { error } = await supabase.rpc('report_problem', {
    p_text: text, p_page: context.page, p_role: context.role, p_mode: context.mode,
    p_version: context.version, p_device: context.device,
  });
  if (error) throw new LocalDataError(error.message);
}

export type ErrorReport = {
  id: string;
  kind: ErrorReportKind | 'server' | 'problem';
  message: string;
  detail: string | null;
  page: string | null;
  role: IdentityRole | null;
  mode: 'server' | 'demo' | null;
  appVersion: string | null;
  device: string | null;
  reporter: string | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
  resolvedAt: string | null;
};

/** Whether the signed-in account may read the reports (operators, set on the server). */
export async function isOperator(): Promise<boolean> {
  if (!isRemoteMode()) return false;
  const supabase = await authClient();
  const { data, error } = await supabase.rpc('am_i_operator');
  return !error && data === true;
}

export async function listErrorReports(includeResolved: boolean): Promise<ErrorReport[]> {
  const supabase = await authClient();
  const { data, error } = await supabase.rpc('list_error_reports', { p_include_resolved: includeResolved });
  if (error) throw new LocalDataError(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id), kind: row.kind as ErrorReport['kind'], message: String(row.message),
    detail: (row.detail as string | null) ?? null, page: (row.page as string | null) ?? null,
    role: (row.role as IdentityRole | null) ?? null, mode: (row.mode as ErrorReport['mode']) ?? null,
    appVersion: (row.app_version as string | null) ?? null, device: (row.device as string | null) ?? null,
    reporter: (row.reporter as string | null) ?? null, count: Number(row.count),
    firstSeen: String(row.first_seen), lastSeen: String(row.last_seen), resolvedAt: (row.resolved_at as string | null) ?? null,
  }));
}

export async function resolveErrorReport(id: string, resolved: boolean): Promise<void> {
  const supabase = await authClient();
  const { error } = await supabase.rpc('resolve_error_report', { p_id: id, p_resolved: resolved });
  if (error) throw new LocalDataError(error.message);
}

/** The signed-in account, or null. */
export async function currentAccount(): Promise<{ email: string } | null> {
  if (!isServerAvailable()) return null;
  const supabase = await authClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ? { email: data.session.user.email } : null;
}

export type InvitePreview = {
  /** `staff` for a team's staff, `club` for a club admin or department lead. */
  kind: 'staff' | 'club';
  clubName: string;
  teamName: string;
  firstName: string;
  lastName: string;
  roleName: string | null;
  usable: boolean;
};

/** What an invitation link is for; works before signing in. */
export async function previewInvite(token: string): Promise<InvitePreview | null> {
  const supabase = await authClient();
  const { data, error } = await supabase.rpc('invite_preview', { p_token: token });
  if (error) throw new LocalDataError(error.message);
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (!row) return null;
  return {
    kind: row.kind === 'club' ? 'club' : 'staff',
    clubName: String(row.club_name), teamName: String(row.team_name), firstName: String(row.first_name),
    lastName: String(row.last_name), roleName: row.role_name ? String(row.role_name) : null, usable: Boolean(row.usable),
  };
}

export type JoinCodePreview = { clubName: string; teamName: string; usable: boolean };

/** Which club and team a join code belongs to; works before signing in. Null for an unknown code. */
export async function previewJoinCode(code: string): Promise<JoinCodePreview | null> {
  const supabase = await authClient();
  const { data, error } = await supabase.rpc('join_code_preview', { p_code: code });
  if (error) throw new LocalDataError(error.message);
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (!row) return null;
  return { clubName: String(row.club_name), teamName: String(row.team_name), usable: Boolean(row.usable) };
}

/** Whether a founding code can still be used; works before signing in. */
export async function isFoundingCodeUsable(code: string): Promise<boolean> {
  const supabase = await authClient();
  const { data, error } = await supabase.rpc('founding_code_usable', { p_code: code });
  if (error) throw new LocalDataError(error.message);
  return Boolean(data);
}

function requireRemote(): RemoteStore {
  if (!remote) throw new LocalDataError('Joining needs the club server and a signed-in account.');
  return remote;
}

/** Joins the team behind a join code as an athlete. Returns the team id. */
export async function joinTeamWithCode(code: string, firstName: string, lastName: string): Promise<Id> {
  try {
    return (await requireRemote().call('join_team', { p_code: code, p_first_name: firstName, p_last_name: lastName })) as Id;
  } catch (error) {
    throw error instanceof LocalDataError ? error : new LocalDataError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Founds a club with a one-time founding code (piece 8): club, first
 * department, first team, and the signed-in account as club admin, if asked
 * also as the team's Head Coach. Only with the club server; the code comes
 * from the platform owner. Returns the club id.
 */
export async function foundClub(input: {
  code: string;
  clubName: string;
  city: string;
  firstName: string;
  lastName: string;
  departmentName: string;
  teamName: string;
  coachTeam: boolean;
}): Promise<Id> {
  try {
    return (await requireRemote().call('found_club', {
      p_code: input.code,
      p_club_name: input.clubName,
      p_city: input.city,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_department_name: input.departmentName,
      p_team_name: input.teamName,
      p_coach_team: input.coachTeam,
    })) as Id;
  } catch (error) {
    throw error instanceof LocalDataError ? error : new LocalDataError(error instanceof Error ? error.message : String(error));
  }
}

/** Links the signed-in account to the invited staff member or club role. Returns the team (or club) id. */
export async function acceptStaffInvite(token: string): Promise<Id> {
  try {
    return (await requireRemote().call('accept_staff_invite', { p_token: token })) as Id;
  } catch (error) {
    throw error instanceof LocalDataError ? error : new LocalDataError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * The people this device acts as. With the server: every person linked to
 * the signed-in account (one per club). Locally: whoever is active.
 */
export function ownPersonIds(database: LocalDatabase): Id[] {
  const userId = remote?.getUserId();
  if (userId) return database.people.filter((person) => person.userId === userId).map((person) => person.id);
  return database.activeIdentity ? [database.activeIdentity.personId] : [];
}

/** Changes the name of one of your own people (the one you act as). */
export function renameOwnPerson(personId: Id, firstName: string, lastName: string): void {
  const first = firstName.trim();
  const last = lastName.trim();
  if (!first || !last) throw new LocalDataError('First and last name are required.');
  mutate((database) => {
    if (!ownPersonIds(database).includes(personId)) throw new LocalDataError('You can only change your own name.');
    const person = database.people.find((candidate) => candidate.id === personId);
    if (!person) throw new LocalDataError(`Unknown person: ${personId}`);
    person.firstName = first;
    person.lastName = last;
  });
}

export function joinCodeFor(database: LocalDatabase, teamId: Id): string | null {
  return database.joinCodes.find((code) => code.teamId === teamId)?.code ?? null;
}

const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Replaces the team's join code; the old one stops working. */
export function rotateJoinCode(teamId: Id): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  const code = Array.from(bytes, (byte) => JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length]).join('');
  mutate((database) => {
    const existing = database.joinCodes.find((candidate) => candidate.teamId === teamId);
    if (!existing) throw new LocalDataError('This team has no join code.');
    existing.code = code;
  });
  return code;
}

/** The open (not accepted, not expired) invitation for this staff member, if any. */
export function openInviteFor(database: LocalDatabase, personId: Id, teamId: Id): StaffInvite | null {
  const now = Date.now();
  return database.staffInvites.find(
    (invite) => invite.personId === personId && invite.teamId === teamId && !invite.acceptedAt && Date.parse(invite.expiresAt) >= now,
  ) ?? null;
}

/** A personal invitation link for a staff member without an account, valid 30 days. */
export function createStaffInvite(personId: Id, teamId: Id): Id {
  const token = newId();
  mutate((database) => {
    const isStaff = database.memberships.some((m) => m.personId === personId && m.teamId === teamId && m.role === 'coach');
    if (!isStaff) throw new LocalDataError('Invitations are only for members of the staff.');
    if (database.people.find((person) => person.id === personId)?.userId) throw new LocalDataError('This person already has an account.');
    const now = new Date();
    database.staffInvites.push({
      token, personId, teamId, createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(), acceptedAt: null,
    });
  });
  return token;
}

export function revokeStaffInvite(token: Id): void {
  mutate((database) => {
    database.staffInvites = database.staffInvites.filter((invite) => invite.token !== token);
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
    // With the server you are always yourself: only a switch between your
    // own roles (coach and athlete) is possible.
    if (remote && identity && !ownPersonIds(database).includes(identity.personId)) {
      throw new LocalDataError('Signed in, you can only switch between your own roles.');
    }
    database.activeIdentity = identity;
    // The server document is rebuilt on every load; remember the choice here.
    if (remote && isBrowser()) {
      try {
        window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
      } catch {
        // Not being able to remember a role is no reason to fail the switch.
      }
    }
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

export function peopleWithRole(database: LocalDatabase, role: IdentityRole): Person[] {
  const ids = new Set(
    role === 'club'
      ? database.clubRoles.map((clubRole) => clubRole.personId)
      : database.memberships.filter((membership) => membership.role === role).map((membership) => membership.personId),
  );
  return database.people.filter((person) => ids.has(person.id));
}

/** Whether this person can act in this role: a team membership, or a club role for `club`. */
export function hasIdentityRole(database: LocalDatabase, personId: Id, role: IdentityRole): boolean {
  if (role === 'club') return database.clubRoles.some((clubRole) => clubRole.personId === personId);
  return database.memberships.some((membership) => membership.personId === personId && membership.role === role);
}

/** "Club admin", or "Department lead · Handball" (several joined with commas). */
export function clubRoleLabel(database: LocalDatabase, personId: Id): string {
  return clubRolesOf(database, personId)
    .map((clubRole) => {
      if (clubRole.role === 'admin') return 'Club admin';
      const department = database.departments.find((candidate) => candidate.id === clubRole.departmentId);
      return department ? `Department lead · ${department.name}` : 'Department lead';
    })
    .join(', ');
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
// Coach roles and permissions
// ---------------------------------------------------------------------------

const ALL_PERMISSIONS: ReadonlySet<CoachPermission> = new Set(COACH_PERMISSIONS);
const NO_PERMISSIONS: ReadonlySet<CoachPermission> = new Set();

function roleById(database: LocalDatabase, roleId: Id | null): CoachRole | null {
  if (!roleId) return null;
  return database.coachRoles.find((role) => role.id === roleId) ?? null;
}

function permissionsOfRole(role: CoachRole | null): ReadonlySet<CoachPermission> {
  if (!role) return NO_PERMISSIONS;
  // The locked Head Coach role always carries everything, whatever is stored.
  return role.locked ? ALL_PERMISSIONS : new Set(role.permissions);
}

/**
 * What this person may see and do in this team as a coach.
 *
 * Empty when they have no coach membership there. Views use this to decide
 * what to render; once there is a server, row-level security enforces the same
 * rules — until then the local test mode lets anyone switch identity, so this
 * shapes the interface rather than protecting data.
 */
export function coachPermissions(database: LocalDatabase, personId: Id | null, teamId: Id): ReadonlySet<CoachPermission> {
  if (!personId) return NO_PERMISSIONS;
  const membership = database.memberships.find(
    (candidate) => candidate.personId === personId && candidate.teamId === teamId && candidate.role === 'coach',
  );
  const fromRole = membership ? permissionsOfRole(roleById(database, membership.coachRoleId)) : NO_PERMISSIONS;
  // Club admins and department leads run the teams they manage, without
  // seeing player data (piece 8, same as the server's app.team_permissions).
  const granted = managesTeam(database, personId, teamId)
    ? new Set<CoachPermission>([...fromRole, ...CLUB_MANAGEMENT_PERMISSIONS])
    : fromRole;
  if (granted.size === 0) return NO_PERMISSIONS;
  // Load rights only take effect in teams that track load, as on the server.
  if (teamHasFeature(database, teamId, 'load')) return granted;
  return new Set([...granted].filter((permission) => !LOAD_PERMISSIONS.includes(permission)));
}

/** Whether a team has a feature switched on (`TEAM_FEATURES`). */
export function teamHasFeature(database: LocalDatabase, teamId: Id | null, feature: TeamFeature): boolean {
  if (!teamId) return false;
  return database.teams.find((team) => team.id === teamId)?.features.includes(feature) ?? false;
}

/**
 * Whether a player tracks training load: when at least one of their teams
 * does. RPE is asked only for sessions of such teams.
 */
export function athleteHasLoad(database: LocalDatabase, personId: Id | null): boolean {
  if (!personId) return false;
  return database.memberships.some(
    (membership) => membership.personId === personId && membership.role === 'athlete' && teamHasFeature(database, membership.teamId, 'load'),
  );
}

export function hasCoachPermission(database: LocalDatabase, personId: Id | null, teamId: Id, permission: CoachPermission): boolean {
  return coachPermissions(database, personId, teamId).has(permission);
}

export function coachRolesForTeam(database: LocalDatabase, teamId: Id): CoachRole[] {
  return database.coachRoles
    .filter((role) => role.teamId === teamId)
    .sort((a, b) => Number(b.locked) - Number(a.locked) || a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name));
}

export type StaffMember = {
  membershipId: Id;
  personId: Id;
  name: string;
  roleId: Id | null;
  roleName: string | null;
};

export function staffForTeam(database: LocalDatabase, teamId: Id): StaffMember[] {
  const roles = coachRolesForTeam(database, teamId);
  return database.memberships
    .filter((membership) => membership.teamId === teamId && membership.role === 'coach')
    .map((membership) => {
      const person = database.people.find((candidate) => candidate.id === membership.personId);
      const role = roleById(database, membership.coachRoleId);
      return {
        membershipId: membership.id,
        personId: membership.personId,
        name: person ? displayName(person) : 'Unbekannt',
        roleId: role?.id ?? null,
        roleName: role?.name ?? null,
      };
    })
    .sort((a, b) => roleOrder(a.roleId) - roleOrder(b.roleId) || a.name.localeCompare(b.name));

  function roleOrder(roleId: Id | null) {
    const index = roles.findIndex((role) => role.id === roleId);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  }
}

/**
 * Throws when a change would leave the team with nobody who may manage staff.
 * Called on the draft, after the change is applied, so every path that could
 * lock a team out — reassigning, removing, editing a role — goes through it.
 */
function assertTeamKeepsStaffManager(database: LocalDatabase, teamId: Id) {
  const stillManaged = database.memberships.some(
    (membership) =>
      membership.teamId === teamId &&
      membership.role === 'coach' &&
      permissionsOfRole(roleById(database, membership.coachRoleId)).has('manageStaff'),
  );
  // The club admin or the department lead above the team count too.
  const team = database.teams.find((candidate) => candidate.id === teamId);
  const managedByClub = Boolean(team) && database.clubRoles.some(
    (role) => role.role === 'admin' || role.departmentId === team!.departmentId,
  );
  if (!stillManaged && !managedByClub) {
    throw new LocalDataError('The team needs at least one person who may manage staff and roles.');
  }
}

function sanitizePermissions(permissions: readonly string[]): CoachPermission[] {
  const granted = new Set(COACH_PERMISSIONS.filter((permission) => permissions.includes(permission)));
  for (const permission of [...granted]) {
    for (const required of COACH_PERMISSION_REQUIRES[permission] ?? []) granted.add(required);
  }
  return COACH_PERMISSIONS.filter((permission) => granted.has(permission));
}

function assertRoleNameFree(database: LocalDatabase, teamId: Id, name: string, exceptRoleId: Id | null) {
  const taken = database.coachRoles.some(
    (role) => role.teamId === teamId && role.id !== exceptRoleId && role.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) throw new LocalDataError(`This team already has a role called "${name}".`);
}

export function createCoachRole(teamId: Id, name: string, permissions: readonly string[]): Id {
  const trimmed = name.trim();
  if (!trimmed) throw new LocalDataError('The role needs a name.');
  const id = newId();
  mutate((database) => {
    assertRoleNameFree(database, teamId, trimmed, null);
    database.coachRoles.push({
      id,
      teamId,
      name: trimmed,
      permissions: sanitizePermissions(permissions),
      locked: false,
      createdAt: new Date().toISOString(),
    });
  });
  return id;
}

export function updateCoachRole(roleId: Id, changes: { name?: string; permissions?: readonly string[] }): void {
  mutate((database) => {
    const role = database.coachRoles.find((candidate) => candidate.id === roleId);
    if (!role) throw new LocalDataError(`Unknown role: ${roleId}`);
    if (role.locked) throw new LocalDataError('The Head Coach role always has every right and cannot be changed.');
    if (changes.name !== undefined) {
      const trimmed = changes.name.trim();
      if (!trimmed) throw new LocalDataError('The role needs a name.');
      assertRoleNameFree(database, role.teamId, trimmed, role.id);
      role.name = trimmed;
    }
    if (changes.permissions !== undefined) role.permissions = sanitizePermissions(changes.permissions);
    assertTeamKeepsStaffManager(database, role.teamId);
  });
}

export function deleteCoachRole(roleId: Id): void {
  mutate((database) => {
    const role = database.coachRoles.find((candidate) => candidate.id === roleId);
    if (!role) return;
    if (role.locked) throw new LocalDataError('The Head Coach role cannot be deleted.');
    if (database.memberships.some((membership) => membership.coachRoleId === roleId)) {
      throw new LocalDataError(`"${role.name}" is still assigned. Give those people another role first.`);
    }
    database.coachRoles = database.coachRoles.filter((candidate) => candidate.id !== roleId);
  });
}

export function assignCoachRole(membershipId: Id, roleId: Id): void {
  mutate((database) => {
    const membership = database.memberships.find((candidate) => candidate.id === membershipId);
    const role = database.coachRoles.find((candidate) => candidate.id === roleId);
    if (!membership || membership.role !== 'coach') throw new LocalDataError(`Unknown staff membership: ${membershipId}`);
    if (!role || role.teamId !== membership.teamId) throw new LocalDataError('This role belongs to another team.');
    membership.coachRoleId = roleId;
    assertTeamKeepsStaffManager(database, membership.teamId);
  });
}

/**
 * Adds a coach to the team by name.
 *
 * Without accounts there is nobody to invite, so staff are entered directly.
 * Once access exists (docs/simplify-decisions.md, point 8, step 4) this is
 * where an invitation will come in; the membership and role model stays.
 */
export function addStaffMember(teamId: Id, firstName: string, lastName: string, roleId: Id): Id {
  const first = firstName.trim();
  const last = lastName.trim();
  if (!first || !last) throw new LocalDataError('First and last name are required.');
  const personId = newId();
  mutate((database) => {
    const team = database.teams.find((candidate) => candidate.id === teamId);
    const role = database.coachRoles.find((candidate) => candidate.id === roleId);
    if (!team) throw new LocalDataError(`Unknown team: ${teamId}`);
    if (!role || role.teamId !== teamId) throw new LocalDataError('This role belongs to another team.');
    const now = new Date().toISOString();
    database.people.push({ id: personId, clubId: team.clubId, userId: null, firstName: first, lastName: last, createdAt: now });
    const membership: Membership = { id: newId(), personId, teamId, role: 'coach', coachRoleId: roleId, createdAt: now };
    database.memberships.push(membership);
  });
  return personId;
}

export function removeStaffMember(membershipId: Id): void {
  mutate((database) => {
    const membership = database.memberships.find((candidate) => candidate.id === membershipId);
    if (!membership || membership.role !== 'coach') return;
    database.memberships = database.memberships.filter((candidate) => candidate.id !== membershipId);
    assertTeamKeepsStaffManager(database, membership.teamId);
    // Someone acting as this coach for this team would otherwise keep rights
    // they no longer have; fall back to the start page.
    if (
      database.activeIdentity?.personId === membership.personId &&
      !database.memberships.some((candidate) => candidate.personId === membership.personId && candidate.role === 'coach')
    ) {
      database.activeIdentity = null;
    }
  });
}

/**
 * Takes a player out of a team, e.g. after joining the wrong team with a code.
 *
 * The membership and the player's places in this team's groups go. The person,
 * their availability reports and load entries stay: they are the player's own
 * history and the team's past attendance. On the server only staff with
 * `manageStaff` may do this (migration 0008); the interface offers it only to
 * them. A removed player can rejoin with the join code until it is replaced.
 */
export function removeAthleteFromTeam(teamId: Id, personId: Id): void {
  mutate((database) => {
    const membership = database.memberships.find(
      (candidate) => candidate.teamId === teamId && candidate.personId === personId && candidate.role === 'athlete',
    );
    if (!membership) return;
    database.memberships = database.memberships.filter((candidate) => candidate.id !== membership.id);
    const teamGroupIds = new Set(database.playerGroups.filter((group) => group.teamId === teamId).map((group) => group.id));
    database.playerGroupMembers = database.playerGroupMembers.filter(
      (member) => !(member.personId === personId && teamGroupIds.has(member.groupId)),
    );
    // Someone acting as this player would otherwise stay in a team they left.
    if (
      database.activeIdentity?.role === 'athlete' &&
      database.activeIdentity.personId === personId &&
      !database.memberships.some((candidate) => candidate.personId === personId && candidate.role === 'athlete')
    ) {
      database.activeIdentity = null;
    }
  });
}

/**
 * A player leaves a team themselves (piece 12). Same effect as being removed
 * by the staff: past reports and load stay, rejoining works with the code.
 */
export function leaveTeam(teamId: Id, personId: Id): void {
  const database = readDatabase();
  if (!database || !ownPersonIds(database).includes(personId)) throw new LocalDataError('You can only leave a team yourself.');
  removeAthleteFromTeam(teamId, personId);
}

// ---------------------------------------------------------------------------
// Club administration (piece 8): club admin and department leads
// ---------------------------------------------------------------------------

export function clubRolesOf(database: LocalDatabase, personId: Id | null): ClubRole[] {
  if (!personId) return [];
  return database.clubRoles.filter((role) => role.personId === personId);
}

export function isClubAdmin(database: LocalDatabase, personId: Id | null): boolean {
  return clubRolesOf(database, personId).some((role) => role.role === 'admin');
}

/** Departments this person manages: all for a club admin, their own for a lead. */
export function managedDepartmentIds(database: LocalDatabase, personId: Id | null): Id[] {
  const roles = clubRolesOf(database, personId);
  if (roles.some((role) => role.role === 'admin')) return database.departments.map((department) => department.id);
  return roles.filter((role) => role.departmentId).map((role) => role.departmentId!);
}

export function managesTeam(database: LocalDatabase, personId: Id | null, teamId: Id): boolean {
  const team = database.teams.find((candidate) => candidate.id === teamId);
  return Boolean(team && managedDepartmentIds(database, personId).includes(team.departmentId));
}

/** Teams in use, without archived ones. */
export function activeTeams(database: LocalDatabase): Team[] {
  return database.teams.filter((team) => !team.archivedAt);
}

function requireName(value: string, what: string) {
  const name = value.trim();
  if (!name) throw new LocalDataError(`${what} needs a name.`);
  return name;
}

export function createDepartment(name: string): Id {
  const id = newId();
  const clean = requireName(name, 'The department');
  mutate((database) => {
    if (database.departments.some((department) => department.name.toLowerCase() === clean.toLowerCase())) {
      throw new LocalDataError('There is already a department with this name.');
    }
    database.departments.push({ id, clubId: database.club.id, name: clean });
  });
  return id;
}

export function renameDepartment(departmentId: Id, name: string): void {
  const clean = requireName(name, 'The department');
  mutate((database) => {
    const department = database.departments.find((candidate) => candidate.id === departmentId);
    if (!department) throw new LocalDataError(`Unknown department: ${departmentId}`);
    department.name = clean;
  });
}

/** The club's name (club admin, piece 12). */
export function renameClub(name: string): void {
  const clean = requireName(name, 'The club');
  if (clean.length > 80) throw new LocalDataError('The club name can be at most 80 characters.');
  mutate((database) => {
    database.club.name = clean;
  });
}

/**
 * Deletes a department (club admin, piece 12). Only one without teams,
 * archived ones included: teams, their sessions and history hang on it.
 * Its hall shares and its leads go with it.
 */
export function deleteDepartment(departmentId: Id): void {
  mutate((database) => {
    if (database.teams.some((team) => team.departmentId === departmentId)) {
      throw new LocalDataError('Only a department without teams can be deleted.');
    }
    database.departments = database.departments.filter((department) => department.id !== departmentId);
    database.departmentFacilities = database.departmentFacilities.filter((link) => link.departmentId !== departmentId);
    const leadIds = new Set(database.clubRoles.filter((role) => role.departmentId === departmentId).map((role) => role.id));
    database.clubRoles = database.clubRoles.filter((role) => !leadIds.has(role.id));
    database.clubRoleInvites = database.clubRoleInvites.filter((invite) => !leadIds.has(invite.clubRoleId));
  });
}

/**
 * A new team in a department. On the server its coach role templates and
 * join code come from database triggers; locally they are added here.
 */
export function createTeam(departmentId: Id, name: string): Id {
  const id = newId();
  const clean = requireName(name, 'The team');
  mutate((database) => {
    const department = database.departments.find((candidate) => candidate.id === departmentId);
    if (!department) throw new LocalDataError(`Unknown department: ${departmentId}`);
    const now = new Date().toISOString();
    database.teams.push({
      id, clubId: department.clubId, departmentId, name: clean, defaultFacilityId: null,
      features: ['load'], archivedAt: null, createdAt: now,
    });
    if (!remote) {
      COACH_ROLE_TEMPLATES.forEach((template, index) => {
        database.coachRoles.push({
          id: newId(), teamId: id, name: template.name, permissions: [...template.permissions], locked: template.locked,
          createdAt: new Date(Date.parse(now) + index).toISOString(),
        });
      });
      const bytes = new Uint8Array(8);
      globalThis.crypto.getRandomValues(bytes);
      database.joinCodes.push({ teamId: id, code: Array.from(bytes, (byte) => JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length]).join(''), createdAt: now });
    }
  });
  return id;
}

export function renameTeam(teamId: Id, name: string): void {
  const clean = requireName(name, 'The team');
  mutate((database) => {
    const team = database.teams.find((candidate) => candidate.id === teamId);
    if (!team) throw new LocalDataError(`Unknown team: ${teamId}`);
    team.name = clean;
  });
}

/** Archived teams keep sessions, players and history, and leave every list. */
export function setTeamArchived(teamId: Id, archived: boolean): void {
  mutate((database) => {
    const team = database.teams.find((candidate) => candidate.id === teamId);
    if (!team) throw new LocalDataError(`Unknown team: ${teamId}`);
    team.archivedAt = archived ? new Date().toISOString() : null;
  });
}

/**
 * Adds someone to a club role by name, before they have an account; they
 * get an invitation link (`createClubRoleInvite`). Returns the club role id.
 */
export function addClubRolePerson(input: { firstName: string; lastName: string; role: ClubRoleKind; departmentId: Id | null }): Id {
  const first = input.firstName.trim();
  const last = input.lastName.trim();
  if (!first || !last) throw new LocalDataError('First and last name are required.');
  if ((input.role === 'department_lead') !== Boolean(input.departmentId)) {
    throw new LocalDataError('A department lead needs a department; a club admin none.');
  }
  const roleId = newId();
  mutate((database) => {
    const now = new Date().toISOString();
    const personId = newId();
    database.people.push({ id: personId, clubId: database.club.id, userId: null, firstName: first, lastName: last, createdAt: now });
    database.clubRoles.push({ id: roleId, clubId: database.club.id, personId, role: input.role, departmentId: input.departmentId, createdAt: now });
  });
  return roleId;
}

/** Removes a club role; the club always keeps an admin. */
export function removeClubRole(clubRoleId: Id): void {
  mutate((database) => {
    const role = database.clubRoles.find((candidate) => candidate.id === clubRoleId);
    if (!role) return;
    database.clubRoles = database.clubRoles.filter((candidate) => candidate.id !== clubRoleId);
    if (!database.clubRoles.some((candidate) => candidate.role === 'admin')) {
      throw new LocalDataError('The club needs at least one admin.');
    }
    database.clubRoleInvites = database.clubRoleInvites.filter((invite) => invite.clubRoleId !== clubRoleId);
  });
}

export function openClubRoleInviteFor(database: LocalDatabase, clubRoleId: Id): ClubRoleInvite | null {
  const now = Date.now();
  return database.clubRoleInvites.find(
    (invite) => invite.clubRoleId === clubRoleId && !invite.acceptedAt && Date.parse(invite.expiresAt) >= now,
  ) ?? null;
}

/** An invitation link for someone added to a club role, valid 30 days. */
export function createClubRoleInvite(clubRoleId: Id): Id {
  const token = newId();
  mutate((database) => {
    const role = database.clubRoles.find((candidate) => candidate.id === clubRoleId);
    if (!role) throw new LocalDataError('Unknown club role.');
    if (database.people.find((person) => person.id === role.personId)?.userId) throw new LocalDataError('This person already has an account.');
    const now = new Date();
    database.clubRoleInvites.push({
      token, clubRoleId, createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(), acceptedAt: null,
    });
  });
  return token;
}

export function revokeClubRoleInvite(token: Id): void {
  mutate((database) => {
    database.clubRoleInvites = database.clubRoleInvites.filter((invite) => invite.token !== token);
  });
}

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

/**
 * Departments in which this person may manage halls: those where they coach
 * at least one team with `manageFacilities`.
 *
 * Halls belong to the club and are shared through departments, so the right
 * is held per team but applies per department.
 */
export function facilityManagerDepartmentIds(database: LocalDatabase, personId: Id | null): ReadonlySet<Id> {
  // Club admins and department leads manage the halls of their departments,
  // as on the server (app.facility_manager_department_ids).
  const departmentIds = new Set<Id>(managedDepartmentIds(database, personId));
  if (!personId) return departmentIds;
  for (const membership of database.memberships) {
    if (membership.personId !== personId || membership.role !== 'coach') continue;
    if (!coachPermissions(database, personId, membership.teamId).has('manageFacilities')) continue;
    const team = database.teams.find((candidate) => candidate.id === membership.teamId);
    if (team) departmentIds.add(team.departmentId);
  }
  return departmentIds;
}

/**
 * Whether this person may edit or delete a hall: every department that uses
 * it must be one they manage halls in. A hall shared with another department
 * stays read-only for them, so nobody changes a hall under someone else's
 * feet. A hall no department uses yet is open to anyone who manages halls.
 */
export function canManageFacility(database: LocalDatabase, personId: Id | null, facilityId: Id): boolean {
  const managed = facilityManagerDepartmentIds(database, personId);
  if (managed.size === 0) return false;
  return database.departmentFacilities
    .filter((link) => link.facilityId === facilityId)
    .every((link) => managed.has(link.departmentId));
}

export function facilityDepartmentIds(database: LocalDatabase, facilityId: Id): Id[] {
  return database.departmentFacilities.filter((link) => link.facilityId === facilityId).map((link) => link.departmentId);
}

/** What deleting a hall would touch, for the confirmation. */
export function facilityUsage(database: LocalDatabase, facilityId: Id) {
  const now = Date.now();
  return {
    upcomingSessions: database.sessions.filter((session) => session.facilityId === facilityId && new Date(session.startsAt).getTime() >= now).length,
    pastSessions: database.sessions.filter((session) => session.facilityId === facilityId && new Date(session.startsAt).getTime() < now).length,
    series: database.sessionSeries.filter((series) => series.facilityId === facilityId).length,
    defaultForTeams: database.teams.filter((team) => team.defaultFacilityId === facilityId),
  };
}

function requireFacility(database: LocalDatabase, facilityId: Id): Facility {
  const facility = database.facilities.find((candidate) => candidate.id === facilityId);
  if (!facility) throw new LocalDataError(`Unknown facility: ${facilityId}`);
  return facility;
}

export function createFacility(input: { name: string; address: string; departmentIds: readonly Id[] }): Id {
  const name = input.name.trim();
  if (!name) throw new LocalDataError('The hall needs a name.');
  const id = newId();
  mutate((database) => {
    const departments = database.departments.filter((department) => input.departmentIds.includes(department.id));
    database.facilities.push({ id, clubId: database.club.id, name, address: input.address.trim() });
    for (const department of departments) {
      database.departmentFacilities.push({ departmentId: department.id, facilityId: id });
    }
  });
  return id;
}

export function updateFacility(facilityId: Id, changes: { name?: string; address?: string }): void {
  mutate((database) => {
    const facility = requireFacility(database, facilityId);
    if (changes.name !== undefined) {
      const name = changes.name.trim();
      if (!name) throw new LocalDataError('The hall needs a name.');
      facility.name = name;
    }
    if (changes.address !== undefined) facility.address = changes.address.trim();
  });
}

/**
 * Makes a hall bookable for a department or takes it away. Taking it away
 * also clears it as default for that department's teams, since a team may
 * only default to a hall it can book. Existing sessions keep their hall.
 */
export function setFacilityDepartment(facilityId: Id, departmentId: Id, available: boolean): void {
  mutate((database) => {
    requireFacility(database, facilityId);
    if (!database.departments.some((department) => department.id === departmentId)) {
      throw new LocalDataError(`Unknown department: ${departmentId}`);
    }
    const linked = database.departmentFacilities.some((link) => link.facilityId === facilityId && link.departmentId === departmentId);
    if (available && !linked) database.departmentFacilities.push({ departmentId, facilityId });
    if (!available && linked) {
      database.departmentFacilities = database.departmentFacilities.filter(
        (link) => !(link.facilityId === facilityId && link.departmentId === departmentId),
      );
      for (const team of database.teams) {
        if (team.departmentId === departmentId && team.defaultFacilityId === facilityId) team.defaultFacilityId = null;
      }
    }
  });
}

/**
 * Deletes a hall. Sessions, series and team defaults that pointed to it keep
 * existing without a hall rather than disappearing with it; the confirmation
 * shows how many that are (`facilityUsage`).
 */
export function deleteFacility(facilityId: Id): void {
  mutate((database) => {
    requireFacility(database, facilityId);
    database.facilities = database.facilities.filter((facility) => facility.id !== facilityId);
    database.departmentFacilities = database.departmentFacilities.filter((link) => link.facilityId !== facilityId);
    for (const team of database.teams) if (team.defaultFacilityId === facilityId) team.defaultFacilityId = null;
    for (const session of database.sessions) if (session.facilityId === facilityId) session.facilityId = null;
    for (const series of database.sessionSeries) if (series.facilityId === facilityId) series.facilityId = null;
  });
}

/** `null` clears the default. The hall must be bookable for the team's department. */
export function setTeamDefaultFacility(teamId: Id, facilityId: Id | null): void {
  mutate((database) => {
    const team = database.teams.find((candidate) => candidate.id === teamId);
    if (!team) throw new LocalDataError(`Unknown team: ${teamId}`);
    if (facilityId !== null) {
      requireFacility(database, facilityId);
      const bookable = database.departmentFacilities.some((link) => link.facilityId === facilityId && link.departmentId === team.departmentId);
      if (!bookable) throw new LocalDataError('This hall is not shared with the team\'s department.');
    }
    team.defaultFacilityId = facilityId;
  });
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
} & SessionDetails & GameDetails;

function optionalText(value: string | null | undefined, max: number, what: string): string | null {
  const clean = (value ?? '').trim();
  if (!clean) return null;
  if (clean.length > max) throw new LocalDataError(`${what} can be at most ${max} characters.`);
  return clean;
}

/**
 * Notes, meeting and game details as stored (piece 14): trimmed, empty is
 * none, game fields only on games. Same limits as the database.
 */
export function cleanSessionDetails(sessionType: SessionType, input: SessionDetails & GameDetails): Required<SessionDetails> & Required<Omit<GameDetails, 'squadPublishedAt'>> {
  const meet = input.meetMinutesBefore ?? null;
  if (meet !== null && (!Number.isInteger(meet) || meet < 0 || meet > 240)) {
    throw new LocalDataError('The meeting time can be at most 4 hours before the start.');
  }
  const game = sessionType === 'game';
  const homeAway = game ? input.homeAway ?? null : null;
  return {
    notes: optionalText(input.notes, 1000, 'The note'),
    meetMinutesBefore: meet === 0 ? null : meet,
    meetPoint: optionalText(input.meetPoint, 120, 'The meeting point'),
    opponent: game ? optionalText(input.opponent, 80, 'The opponent') : null,
    homeAway,
    venueAddress: game && homeAway === 'away' ? optionalText(input.venueAddress, 200, 'The address') : null,
  };
}

export function createSession(input: SessionInput): Id {
  const id = newId();
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
      ...cleanSessionDetails(input.sessionType, input),
    });
  });
  return id;
}

const DETAIL_KEYS = ['notes', 'meetMinutesBefore', 'meetPoint', 'opponent', 'homeAway', 'venueAddress'] as const;

export function updateSession(sessionId: Id, changes: Partial<SessionInput>): void {
  mutate((database) => {
    const session = database.sessions.find((candidate) => candidate.id === sessionId);
    if (!session) throw new LocalDataError(`Unknown session: ${sessionId}`);
    Object.assign(session, changes);
    // Details are cleaned together: a game turned into training loses its opponent.
    if (changes.sessionType !== undefined || DETAIL_KEYS.some((key) => key in changes)) {
      Object.assign(session, cleanSessionDetails(session.sessionType, session));
    }
  });
}

export function deleteSession(sessionId: Id): void {
  mutate((database) => {
    database.sessions = database.sessions.filter((session) => session.id !== sessionId);
    // Same as the server's foreign keys: reports and dismissals go with the
    // session; load an athlete logged stays theirs, just no longer tied to it.
    database.availability = database.availability.filter((entry) => entry.sessionId !== sessionId);
    database.acknowledgedSessions = database.acknowledgedSessions.filter((entry) => entry.sessionId !== sessionId);
    for (const entry of database.loadEntries) if (entry.sessionId === sessionId) entry.sessionId = null;
    for (const state of database.sessionSeriesWeekStates) if (state.committedSessionId === sessionId) state.committedSessionId = null;
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
    if (input.status === 'missed') {
      const session = database.sessions.find((candidate) => candidate.id === input.sessionId);
      if (session && new Date(session.startsAt).getTime() > Date.now()) {
        throw new LocalDataError('You can only say you did not take part once the session has started.');
      }
    }
    const previous = database.availability.find(
      (entry) => entry.sessionId === input.sessionId && entry.personId === input.personId,
    );
    database.availability = database.availability.filter((entry) => entry !== previous);
    // "In" is normally the absence of a report; during an absence it is said
    // out loud, so it wins over the absence for this session (piece 16).
    const session = database.sessions.find((candidate) => candidate.id === input.sessionId);
    if (input.status === 'in' && !(session && absenceOn(database, input.personId, sessionDate(session.startsAt)))) return;
    database.availability.push({
      // A changed report keeps its row (and its id on the server).
      id: previous?.id ?? newId(),
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
  const id = newId();
  mutate((database) => {
    if (!athleteHasLoad(database, input.personId)) throw new LocalDataError('Your team does not track training load.');
    if (input.teamId && !teamHasFeature(database, input.teamId, 'load')) throw new LocalDataError('This team does not track training load.');
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
    database.loadEntryReviews = database.loadEntryReviews.filter((review) => review.entryId !== entryId);
  });
}

// ---------------------------------------------------------------------------
// Asking a player to check an entry (piece 10)
// ---------------------------------------------------------------------------

/** Whether this coach may see (and so question) the player's load details in any shared team. */
function coachSeesLoadDetails(database: LocalDatabase, coachId: Id | null, athleteId: Id) {
  return database.memberships.some(
    (membership) => membership.personId === athleteId && membership.role === 'athlete'
      && coachPermissions(database, coachId, membership.teamId).has('viewLoadDetails'),
  );
}

export function reviewForEntry(database: LocalDatabase, entryId: Id): LoadEntryReview | null {
  return database.loadEntryReviews.find((review) => review.entryId === entryId) ?? null;
}

export function reviewsForPerson(database: LocalDatabase, personId: Id): LoadEntryReview[] {
  return database.loadEntryReviews.filter((review) => review.personId === personId);
}

/** The active coach asks the entry's owner to check it, with an optional note. */
export function requestEntryReview(entryId: Id, note: string | null = null): void {
  const clean = note?.trim() ? note.trim().slice(0, 300) : null;
  mutate((database) => {
    const entry = database.loadEntries.find((candidate) => candidate.id === entryId);
    if (!entry) throw new LocalDataError('This entry no longer exists.');
    const coachId = database.activeIdentity?.role === 'coach' ? database.activeIdentity.personId : null;
    if (!coachSeesLoadDetails(database, coachId, entry.personId)) {
      throw new LocalDataError('Only a coach who may see load details can ask for a check.');
    }
    database.loadEntryReviews = [
      ...database.loadEntryReviews.filter((review) => review.entryId !== entryId),
      { entryId, personId: entry.personId, requestedBy: coachId, note: clean, createdAt: new Date().toISOString() },
    ];
  });
}

/** Withdrawn by the coach, or "it is correct" from the player. */
export function clearEntryReview(entryId: Id): void {
  mutate((database) => {
    database.loadEntryReviews = database.loadEntryReviews.filter((review) => review.entryId !== entryId);
  });
}

// ---------------------------------------------------------------------------
// Confirmed attendance (piece 11)
// ---------------------------------------------------------------------------

export function attendanceConfirmationsFor(database: LocalDatabase, sessionId: Id): AttendanceConfirmation[] {
  return database.attendanceConfirmations.filter((confirmation) => confirmation.sessionId === sessionId);
}

/**
 * Who was actually there, recorded by the active coach once the session has
 * started. Overrides what the players said in every count.
 */
export function confirmAttendance(sessionId: Id, presence: { personId: Id; present: boolean }[]): void {
  mutate((database) => {
    const session = database.sessions.find((candidate) => candidate.id === sessionId);
    if (!session) throw new LocalDataError('This session no longer exists.');
    if (new Date(session.startsAt).getTime() > Date.now()) throw new LocalDataError('Attendance can only be confirmed once the session has started.');
    const coachId = database.activeIdentity?.role === 'coach' ? database.activeIdentity.personId : null;
    if (!coachPermissions(database, coachId, session.teamId).has('viewAttendance')) {
      throw new LocalDataError('Only a coach who may see attendance can confirm it.');
    }
    const athletes = new Set(
      database.memberships.filter((m) => m.teamId === session.teamId && m.role === 'athlete').map((m) => m.personId),
    );
    const now = new Date().toISOString();
    for (const { personId, present } of presence) {
      if (!athletes.has(personId)) throw new LocalDataError('Attendance can only be confirmed for players of the team.');
      const existing = database.attendanceConfirmations.find((c) => c.sessionId === sessionId && c.personId === personId);
      if (existing) {
        if (existing.present === present) continue;
        existing.present = present;
        existing.confirmedBy = coachId;
        existing.confirmedAt = now;
      } else {
        database.attendanceConfirmations.push({ sessionId, personId, present, confirmedBy: coachId, confirmedAt: now });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Own training the coach sees (piece 21a)
// ---------------------------------------------------------------------------

/** One planned own session of a player, as the staff see it. */
export type OwnTrainingItem = {
  planId: Id;
  personId: Id;
  playerName: string;
  title: string;
  date: DateOnly;
  /** Null: planned for the day without a time. */
  startsAt: Timestamp | null;
  endsAt: Timestamp | null;
};

function ownTrainingItem(database: LocalDatabase, plan: LocalDatabase['athletePlans'][number]): OwnTrainingItem {
  const person = database.people.find((candidate) => candidate.id === plan.personId);
  return {
    planId: plan.id,
    personId: plan.personId,
    playerName: person ? displayName(person) : 'Player',
    title: plan.title,
    date: plan.date,
    startsAt: plan.startsAt ?? null,
    endsAt: plan.startsAt ? new Date(new Date(plan.startsAt).getTime() + plan.expectedDurationMinutes * 60_000).toISOString() : null,
  };
}

/**
 * Own training of a team's players from `fromDate` to `toDate` (both
 * included), for staff whose role may see athlete plans (decided
 * 2026-09-25: own training is always visible to them). Empty otherwise.
 */
export function ownTrainingForTeam(
  database: LocalDatabase,
  viewerId: Id | null,
  teamId: Id,
  fromDate: DateOnly,
  toDate: DateOnly,
  personId?: Id,
): OwnTrainingItem[] {
  if (!hasCoachPermission(database, viewerId, teamId, 'viewAthletePlans')) return [];
  const players = new Set(
    database.memberships
      .filter((membership) => membership.teamId === teamId && membership.role === 'athlete' && (!personId || membership.personId === personId))
      .map((membership) => membership.personId),
  );
  return database.athletePlans
    .filter((plan) => players.has(plan.personId) && plan.date >= fromDate && plan.date <= toDate)
    .map((plan) => ownTrainingItem(database, plan))
    .sort((a, b) => `${a.date}|${a.startsAt ?? ''}`.localeCompare(`${b.date}|${b.startsAt ?? ''}`));
}

// ---------------------------------------------------------------------------
// Absences over a period (piece 16)
// ---------------------------------------------------------------------------

/** The local date (YYYY-MM-DD) a session starts on. */
export function sessionDate(startsAt: string): string {
  const date = new Date(startsAt);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** A person's absences that have not ended before `fromDate` (default: all), earliest first. */
export function absencesForPerson(database: LocalDatabase, personId: Id, fromDate?: string): Absence[] {
  return (database.absences ?? [])
    .filter((absence) => absence.personId === personId && (!fromDate || absence.toDate >= fromDate))
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate));
}

export function absenceOn(database: LocalDatabase, personId: Id, date: string): Absence | null {
  return (database.absences ?? []).find((absence) => absence.personId === personId && absence.fromDate <= date && absence.toDate >= date) ?? null;
}

/**
 * Away for this session: an absence covers its day and the player did not
 * say "in" for it anyway (an explicit "in" wins; same rule as the server).
 */
export function awayForSession(database: LocalDatabase, personId: Id, session: Pick<Session, 'id' | 'startsAt'>): Absence | null {
  const absence = absenceOn(database, personId, sessionDate(session.startsAt));
  if (!absence) return null;
  const said = database.availability.find((entry) => entry.sessionId === session.id && entry.personId === personId);
  return said?.status === 'in' ? null : absence;
}

/** Whoever enters absences for this person: themselves, or a coach with attendance rights in one of their teams. */
function mayEditAbsences(database: LocalDatabase, personId: Id): boolean {
  if (ownPersonIds(database).includes(personId)) return true;
  const coachId = database.activeIdentity?.role === 'coach' ? database.activeIdentity.personId : null;
  return database.memberships.some(
    (membership) => membership.personId === personId && membership.role === 'athlete'
      && coachPermissions(database, coachId, membership.teamId).has('viewAttendance'),
  );
}

export function canEditAbsences(database: LocalDatabase, personId: Id): boolean {
  return mayEditAbsences(database, personId);
}

export type AbsenceInput = { id?: Id; personId: Id; fromDate: string; toDate: string; kind: AbsenceKind | null; note?: string | null };

/** Adds or changes an absence. Returns its id. */
export function saveAbsence(input: AbsenceInput): Id {
  const id = input.id ?? newId();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.toDate)) {
    throw new LocalDataError('Choose a start and an end date.');
  }
  if (input.toDate < input.fromDate) throw new LocalDataError('The end cannot be before the start.');
  const days = (Date.parse(`${input.toDate}T00:00:00Z`) - Date.parse(`${input.fromDate}T00:00:00Z`)) / 86_400_000;
  if (days > 366) throw new LocalDataError('An absence can be at most a year long.');
  const note = input.note?.trim() || null;
  if (note && note.length > 300) throw new LocalDataError('The note can be at most 300 characters.');
  mutate((database) => {
    if (!mayEditAbsences(database, input.personId)) throw new LocalDataError('You may not enter absences for this player.');
    database.absences = database.absences ?? [];
    const existing = database.absences.find((absence) => absence.id === id);
    if (existing) {
      if (existing.personId !== input.personId) throw new LocalDataError('This absence belongs to someone else.');
      existing.fromDate = input.fromDate;
      existing.toDate = input.toDate;
      // Someone who cannot see the reason leaves it as it is.
      if (input.kind !== null) {
        existing.kind = input.kind;
        existing.note = note;
      }
      return;
    }
    const me = database.activeIdentity?.personId ?? null;
    database.absences.push({
      id, personId: input.personId, fromDate: input.fromDate, toDate: input.toDate,
      kind: input.kind, note: input.kind ? note : null, createdBy: me, createdAt: new Date().toISOString(),
    });
  });
  return id;
}

export function deleteAbsence(absenceId: Id): void {
  mutate((database) => {
    const absence = (database.absences ?? []).find((candidate) => candidate.id === absenceId);
    if (!absence) return;
    if (!mayEditAbsences(database, absence.personId)) throw new LocalDataError('You may not remove this absence.');
    database.absences = database.absences.filter((candidate) => candidate.id !== absenceId);
  });
}

// ---------------------------------------------------------------------------
// Squads for games (piece 15)
// ---------------------------------------------------------------------------

/** Picks for a game, by player. */
export function squadForSession(database: LocalDatabase, sessionId: Id): Map<Id, SquadStatus> {
  return new Map((database.squadEntries ?? []).filter((entry) => entry.sessionId === sessionId).map((entry) => [entry.personId, entry.status]));
}

/** A player's status once the squad is published (null before, or if not picked). */
export function publishedSquadStatus(database: LocalDatabase, personId: Id, session: Pick<Session, 'id' | 'squadPublishedAt'>): SquadStatus | null {
  if (!session.squadPublishedAt) return null;
  return (database.squadEntries ?? []).find((entry) => entry.sessionId === session.id && entry.personId === personId)?.status ?? null;
}

function requireSquadRights(database: LocalDatabase, sessionId: Id): Session {
  const session = database.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) throw new LocalDataError('This session no longer exists.');
  if (session.sessionType !== 'game') throw new LocalDataError('A squad can only be picked for a game.');
  const coachId = database.activeIdentity?.role === 'coach' ? database.activeIdentity.personId : null;
  if (!coachPermissions(database, coachId, session.teamId).has('editSessions')) {
    throw new LocalDataError('Your role may not pick the squad.');
  }
  return session;
}

/** Sets (or with null clears) one player's pick. Players see it once published. */
export function setSquadStatus(sessionId: Id, personId: Id, status: SquadStatus | null): void {
  mutate((database) => {
    const session = requireSquadRights(database, sessionId);
    if (!database.memberships.some((m) => m.teamId === session.teamId && m.personId === personId && m.role === 'athlete')) {
      throw new LocalDataError('Only players of the team can be picked.');
    }
    database.squadEntries = (database.squadEntries ?? []).filter((entry) => !(entry.sessionId === sessionId && entry.personId === personId));
    if (status) {
      database.squadEntries.push({
        sessionId, personId, status,
        setBy: database.activeIdentity?.personId ?? null, setAt: new Date().toISOString(),
      });
    }
  });
}

/**
 * Publishes the squad: every player of the team not picked yet is "not
 * selected", and each player is told their status (on the server, a push to
 * those whose status is new to them).
 */
export function publishSquad(sessionId: Id): void {
  mutate((database) => {
    const session = requireSquadRights(database, sessionId);
    database.squadEntries = database.squadEntries ?? [];
    const picked = new Set(database.squadEntries.filter((entry) => entry.sessionId === sessionId).map((entry) => entry.personId));
    const now = new Date().toISOString();
    const me = database.activeIdentity?.personId ?? null;
    for (const membership of database.memberships) {
      if (membership.teamId !== session.teamId || membership.role !== 'athlete' || picked.has(membership.personId)) continue;
      database.squadEntries.push({ sessionId, personId: membership.personId, status: 'not_selected', setBy: me, setAt: now });
    }
    session.squadPublishedAt = now;
  });
}

// ---------------------------------------------------------------------------
// Team messages (piece 17)
// ---------------------------------------------------------------------------

/** Players a message is for: the team, or those in its groups. */
export function messageRecipientIds(database: LocalDatabase, message: Pick<TeamMessage, 'teamId' | 'groupIds'>): Id[] {
  const players = database.memberships.filter((m) => m.teamId === message.teamId && m.role === 'athlete').map((m) => m.personId);
  if (message.groupIds.length === 0) return players;
  const inGroups = new Set(database.playerGroupMembers.filter((member) => message.groupIds.includes(member.groupId)).map((member) => member.personId));
  return players.filter((personId) => inGroups.has(personId));
}

/** Messages for a player, newest first. */
export function messagesForPlayer(database: LocalDatabase, personId: Id): TeamMessage[] {
  return (database.teamMessages ?? [])
    .filter((message) => messageRecipientIds(database, message).includes(personId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function messagesForTeam(database: LocalDatabase, teamId: Id): TeamMessage[] {
  return (database.teamMessages ?? []).filter((message) => message.teamId === teamId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function isMessageRead(database: LocalDatabase, messageId: Id, personId: Id): boolean {
  return (database.messageReads ?? []).some((read) => read.messageId === messageId && read.personId === personId);
}

export function unreadMessagesFor(database: LocalDatabase, personId: Id): TeamMessage[] {
  return messagesForPlayer(database, personId).filter((message) => !isMessageRead(database, message.id, personId));
}

/** Who has read a message, for the staff. */
export function messageReadStats(database: LocalDatabase, message: TeamMessage): { read: number; total: number; unreadIds: Id[] } {
  const recipients = messageRecipientIds(database, message);
  const unreadIds = recipients.filter((personId) => !isMessageRead(database, message.id, personId));
  return { read: recipients.length - unreadIds.length, total: recipients.length, unreadIds };
}

/** Roles that see attendance or plan sessions write to the team. */
export function mayMessageTeam(database: LocalDatabase, personId: Id | null, teamId: Id): boolean {
  const permissions = coachPermissions(database, personId, teamId);
  return permissions.has('viewAttendance') || permissions.has('editSessions');
}

function requireMessageRights(database: LocalDatabase, teamId: Id): Id {
  const coachId = database.activeIdentity?.role === 'coach' ? database.activeIdentity.personId : null;
  if (!coachId || !mayMessageTeam(database, coachId, teamId)) throw new LocalDataError('Your role may not write to this team.');
  return coachId;
}

export function postTeamMessage(input: { teamId: Id; groupIds?: Id[]; body: string; important?: boolean }): Id {
  const body = input.body.trim();
  if (!body) throw new LocalDataError('Write a message first.');
  if (body.length > 2000) throw new LocalDataError('A message can be at most 2000 characters.');
  const id = newId();
  mutate((database) => {
    const authorId = requireMessageRights(database, input.teamId);
    const groupIds = input.groupIds ?? [];
    if (groupIds.some((groupId) => !database.playerGroups.some((group) => group.id === groupId && group.teamId === input.teamId))) {
      throw new LocalDataError('The groups must belong to the team.');
    }
    database.teamMessages = database.teamMessages ?? [];
    database.teamMessages.push({
      id, teamId: input.teamId, groupIds, authorId, body, important: Boolean(input.important),
      createdAt: new Date().toISOString(), remindedAt: null,
    });
  });
  return id;
}

export function deleteTeamMessage(messageId: Id): void {
  mutate((database) => {
    const message = (database.teamMessages ?? []).find((candidate) => candidate.id === messageId);
    if (!message) return;
    requireMessageRights(database, message.teamId);
    database.teamMessages = database.teamMessages.filter((candidate) => candidate.id !== messageId);
    database.messageReads = (database.messageReads ?? []).filter((read) => read.messageId !== messageId);
  });
}

/** Reminds everyone who has not read it yet, once. */
export function remindUnread(messageId: Id): void {
  mutate((database) => {
    const message = (database.teamMessages ?? []).find((candidate) => candidate.id === messageId);
    if (!message) throw new LocalDataError('This message no longer exists.');
    requireMessageRights(database, message.teamId);
    if (message.remindedAt) throw new LocalDataError('Players were already reminded of this message.');
    message.remindedAt = new Date().toISOString();
  });
}

/** Seen: the player has had these messages on screen. Only their own, only messages for them. */
export function markMessagesRead(personId: Id, messageIds: Id[]): void {
  const database = readDatabase();
  if (!database || !ownPersonIds(database).includes(personId)) return;
  const unread = messageIds.filter((messageId) => {
    const message = database.teamMessages?.find((candidate) => candidate.id === messageId);
    return message && !isMessageRead(database, messageId, personId) && messageRecipientIds(database, message).includes(personId);
  });
  if (unread.length === 0) return;
  mutate((draft) => {
    draft.messageReads = draft.messageReads ?? [];
    const now = new Date().toISOString();
    for (const messageId of unread) draft.messageReads.push({ messageId, personId, readAt: now });
  });
}

/**
 * Load summary for one athlete.
 *
 * The maths lives in `loadCalculations.ts` and is not reimplemented here; this
 * only selects the right entries and hands them over. Views must not compute
 * ACWR themselves.
 *
 * Uses the EWMA ratio, like the athlete cockpit, the coach roster and the
 * nightly server summary.
 */
export function loadSummaryForPerson(database: LocalDatabase, personId: Id) {
  const entries = loadEntriesForPerson(database, personId);
  const latest = getLatestACWR(entries);
  return {
    entries,
    series: calculateACWR(entries),
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
