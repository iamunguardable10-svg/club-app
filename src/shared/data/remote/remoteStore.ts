/**
 * The server store: the same document the local test mode keeps, backed by
 * the pilot database instead of localStorage.
 *
 * How a change travels:
 * 1. The repository applies it to the document as always and hands this store
 *    the document before and after.
 * 2. The store shows the new document at once (the interface does not wait),
 *    turns both into rows and sends only the difference: deletes bottom-up,
 *    then inserts and updates top-down, one table after another.
 * 3. Then it reloads what the user may read and compares the rows it meant to
 *    write with what the server now holds. The server is the authority: row-
 *    level security may refuse a change silently (an update of a row you may
 *    not change touches nothing), and triggers may refuse one loudly. Either
 *    way the reloaded document replaces the optimistic one and a message says
 *    what did not go through.
 *
 * Changes are sent one after another in the order they were made. Reloads
 * only happen when nothing is waiting, so a reload never overwrites a change
 * that is still on its way.
 *
 * Offline (piece 18): the last server state, with the changes still waiting,
 * is kept on the device (the repository hands in where). Without a network
 * the app shows it and marks itself offline; new changes wait in order and go
 * out once the network is back, then the usual reload and check say what the
 * server refused.
 *
 * No React and no browser APIs here, so the whole path can be tested in Node
 * against a real Postgres with the pilot's row-level security
 * (src/shared/data/remote/remoteStore.test.ts).
 */

import type { LocalDatabase } from '../schema';
import { serverError, serverMessageKey } from '../serverMessages';
import { isMessageKey, translate, type MessageKey } from '@/shared/i18n/translate';
import {
  TABLES,
  fromServerRows,
  normalizeRow,
  rowKey,
  tableSpec,
  toServerRows,
  type Row,
  type ServerRows,
  type TableName,
} from './tables';

/** What the store needs from a database connection. Implemented with supabase-js in the app. */
export interface RemoteClient {
  /** The signed-in user's id, or null when nobody is signed in. */
  userId(): Promise<string | null>;
  /**
   * The account of the sign-in kept on this device, read without the network
   * (may be expired or revoked). Only used to show that account's saved state
   * at once while `userId` checks it; it never grants anything.
   */
  storedUserId?(): string | null;
  selectAll(table: TableName): Promise<Row[]>;
  /**
   * How often each table of the user's clubs changed (`data_changes`, one
   * row per club and table). Null when the server cannot say (then every
   * refresh reloads all), as without this method.
   */
  changeVersions?(): Promise<ChangeVersion[] | null>;
  insert(table: TableName, rows: Row[]): Promise<void>;
  /** Returns how many rows changed; 0 when row-level security hid the row. */
  update(table: TableName, key: Row, changes: Row): Promise<number>;
  delete(table: TableName, key: Row): Promise<number>;
  /** Calls one of the database functions the app may call (join_team, accept_staff_invite, invite_preview). */
  rpc(name: string, args: Row): Promise<unknown>;
}

export type ChangeVersion = { club_id: string; table_name: string; version: number };

/**
 * Tables whose change can change what the user may read elsewhere (a new
 * membership shows a team's sessions, a consent the load data): everything
 * reloads.
 */
const RELOAD_ALL = new Set<string>([
  'clubs', 'departments', 'facilities', 'teams', 'department_facilities', 'people', 'coach_roles',
  'memberships', 'club_roles', 'player_groups', 'player_group_members', 'consents',
]);

/**
 * What else reloads with a table: rows deleted along with it (which may not
 * count on their own) and the views computed from it.
 */
const RELOAD_WITH: Partial<Record<string, TableName[]>> = {
  session_series: ['sessions', 'session_series_week_states'],
  sessions: ['availability', 'attendance_confirmations', 'squad_entries', 'carpools', 'carpool_requests', 'acknowledged_sessions', 'load_entries'],
  availability: ['availability_reasons'],
  absences: ['absence_reasons'],
  load_entries: ['load_entry_reviews', 'load_summaries'],
  carpools: ['carpool_riders', 'carpool_requests'],
  messages: ['message_reads', 'message_votes', 'message_stats'],
  message_reads: ['message_stats'],
  message_votes: ['message_stats'],
};

function versionMap(rows: ChangeVersion[] | null): Map<string, number> | null {
  if (!rows) return null;
  return new Map(rows.map((row) => [`${row.club_id}:${row.table_name}`, Number(row.version)]));
}

/**
 * The tables to reload after the versions moved from `before` to `after`
 * (plus `also`, e.g. the tables this device just wrote); 'all' or none.
 */
export function tablesToReload(before: Map<string, number>, after: Map<string, number>, also: Iterable<string> = []): TableName[] | 'all' {
  const changed = new Set<string>(also);
  for (const [key, version] of after) if (before.get(key) !== version) changed.add(key.slice(key.indexOf(':') + 1));
  for (const key of before.keys()) if (!after.has(key)) changed.add(key.slice(key.indexOf(':') + 1));
  if ([...changed].some((table) => RELOAD_ALL.has(table))) return 'all';
  const known = new Set<string>(TABLES.map((spec) => spec.name));
  const result = new Set<TableName>();
  const add = (table: string) => {
    if (!known.has(table) || result.has(table as TableName)) return;
    result.add(table as TableName);
    for (const next of RELOAD_WITH[table] ?? []) add(next);
  };
  for (const table of changed) add(table);
  return [...result];
}

/** No network: nothing reached the server. The change waits; reading shows the saved state. */
export class OfflineError extends Error {
  /** The text key the interface shows (see `LocalDataError.messageKey`). */
  readonly messageKey: string;

  constructor(message = "You're offline.", messageKey = 'data.offline') {
    super(message);
    this.name = 'OfflineError';
    this.messageKey = messageKey;
  }
}

export type Operation =
  | { kind: 'insert'; table: TableName; key: Row; row: Row }
  | { kind: 'update'; table: TableName; key: Row; changes: Row; row: Row }
  | { kind: 'delete'; table: TableName; key: Row };

/** What the device keeps between visits: the last server state plus the changes still waiting. */
export type OfflineSnapshot = {
  userId: string;
  version: string;
  /** When this state last came from the server. */
  savedAt: string;
  document: LocalDatabase;
  outbox: Operation[][];
};

/** Where the snapshot lives (localStorage in the app, memory in tests). */
export interface OfflineCache {
  read(): OfflineSnapshot | null;
  write(snapshot: OfflineSnapshot): void;
  clear(): void;
}

/** A refused change for the interface: `errorText(t, notice)` shows it in the app language. */
export type RejectedNotice = { messageKey: MessageKey; messageParams: Record<string, string> };

export type RemotePhase = 'loading' | 'ready' | 'signedOut' | 'unlinked' | 'error';

export type RemoteStatus = {
  phase: RemotePhase;
  /** Loading failed. */
  error: string | null;
  /** The last change the server did not (fully) accept, in English (error reports). */
  rejected: string | null;
  /** The same as a text key with values, for the interface. */
  rejectedNotice: RejectedNotice | null;
  /** Changes still on their way (or waiting for the network). */
  pending: number;
  /** The last request found no network; the screen shows the saved state. */
  offline: boolean;
  /** When the shown state last came from the server. */
  savedAt: string | null;
};

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function keyOf(table: TableName, row: Row): Row {
  return Object.fromEntries(tableSpec(table).key.map((column) => [column, row[column]]));
}

/** The operations that turn `before` into `after`, in a safe order. */
export function diffRows(before: ServerRows, after: ServerRows): Operation[] {
  const deletes: Operation[] = [];
  const writes: Operation[] = [];
  for (const spec of TABLES) {
    if (spec.readOnly) continue;
    const table = spec.name;
    const previous = new Map(before[table].map((row) => [rowKey(table, row), row]));
    const next = new Map(after[table].map((row) => [rowKey(table, row), row]));
    for (const [key, row] of previous) {
      if (!next.has(key)) deletes.push({ kind: 'delete', table, key: keyOf(table, row) });
    }
    for (const [key, row] of next) {
      const old = previous.get(key);
      if (!old) {
        writes.push({ kind: 'insert', table, key: keyOf(table, row), row });
        continue;
      }
      const changes: Row = {};
      for (const [column, value] of Object.entries(row)) {
        if (!sameValue(value, old[column])) changes[column] = value;
      }
      if (Object.keys(changes).length > 0) writes.push({ kind: 'update', table, key: keyOf(table, row), changes, row });
    }
  }
  // Deletes bottom-up first (children before parents, and a replaced row is
  // gone before its successor arrives), then writes top-down.
  return [...deletes.reverse(), ...writes];
}

/**
 * What a run of operations should leave on the server, one operation per row:
 * a row inserted and then changed is checked as inserted with its final
 * values, a row inserted and deleted again is not checked at all.
 */
export function netOperations(operations: Operation[]): Operation[] {
  const byRow = new Map<string, Operation>();
  for (const operation of operations) {
    const id = `${operation.table}:${rowKey(operation.table, operation.key)}`;
    const previous = byRow.get(id);
    if (operation.kind === 'update' && previous?.kind === 'insert') {
      byRow.set(id, { ...previous, row: { ...previous.row, ...operation.changes } });
    } else if (operation.kind === 'update' && previous?.kind === 'update') {
      byRow.set(id, { ...operation, changes: { ...previous.changes, ...operation.changes } });
    } else if (operation.kind === 'delete' && previous?.kind === 'insert') {
      byRow.delete(id);
    } else {
      byRow.set(id, operation);
    }
  }
  return [...byRow.values()];
}

/** Human-readable names for the message when the server refuses something. */
/** Rows that only mark that something happened (read, seen); their time is not compared. */
const MARK_TABLES = new Set<TableName>(['message_reads', 'acknowledged_sessions']);

/** What a table is called in "Not saved (…)"; text keys (docs/i18n.md). */
const TABLE_KEY: Partial<Record<TableName, MessageKey>> = {
  facilities: 'sync.table.facilities',
  teams: 'sync.table.teams',
  department_facilities: 'sync.table.departmentFacilities',
  people: 'sync.table.people',
  coach_roles: 'sync.table.coachRoles',
  memberships: 'sync.table.memberships',
  player_groups: 'sync.table.playerGroups',
  player_group_members: 'sync.table.playerGroupMembers',
  session_series: 'sync.table.sessionSeries',
  sessions: 'sync.table.sessions',
  session_series_week_states: 'sync.table.sessionSeriesWeekStates',
  availability: 'sync.table.availability',
  availability_reasons: 'sync.table.availabilityReasons',
  load_entries: 'sync.table.loadEntries',
  load_summaries: 'sync.table.loadSummaries',
  athlete_plans: 'sync.table.athletePlans',
  acknowledged_sessions: 'sync.table.acknowledgedSessions',
  load_entry_reviews: 'sync.table.loadEntryReviews',
  attendance_confirmations: 'sync.table.attendanceConfirmations',
  absences: 'sync.table.absences',
  absence_reasons: 'sync.table.absenceReasons',
  carpools: 'carpools.title',
  carpool_riders: 'carpools.title',
  carpool_requests: 'carpools.title',
  squad_entries: 'sync.table.squadEntries',
  messages: 'sync.table.messages',
  message_reads: 'sync.table.messageReads',
  message_votes: 'sync.table.messageVotes',
  message_writers: 'sync.table.messageWriters',
};

export class RemoteStore {
  private document: LocalDatabase | null = null;
  private status: RemoteStatus = { phase: 'loading', error: null, rejected: null, rejectedNotice: null, pending: 0, offline: false, savedAt: null };
  private queue: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  private userId: string | null = null;
  /** Changes not yet answered by the server, one entry per change, oldest first. */
  private outbox: Operation[][] = [];
  /** What the device kept from the last visit, until it is used or found to be someone else's. */
  private saved: OfflineSnapshot | null;
  /** The last snapshot written, so an unchanged state is not written again. */
  private lastWritten = '';
  /** Sent, but not yet compared with a reload (and the first refusal among them). */
  private unchecked: Operation[] = [];
  private uncheckedFailure: string | null = null;
  /** The load in flight, so focus, visibility and timers share one request. */
  private loading: Promise<void> | null = null;
  /** Counts full reloads; an older one that answers late must not replace a newer one. */
  private fetchGeneration = 0;
  /** Sending waiting changes; that ends with its own reload. */
  private draining = false;
  /** The rows behind the shown document and the change versions they reflect (null: reload all next time). */
  private rows: ServerRows | null = null;
  private versions: Map<string, number> | null = null;

  constructor(
    private readonly client: RemoteClient,
    private readonly version: string,
    /** The role this device last acted as, kept across reloads (people with two roles). */
    private readonly rememberedIdentity: LocalDatabase['activeIdentity'] = null,
    private readonly cache: OfflineCache | null = null,
  ) {
    const saved = cache?.read() ?? null;
    this.saved = saved && saved.version === version ? saved : null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }

  private setStatus(patch: Partial<RemoteStatus>) {
    this.status = { ...this.status, ...patch };
  }

  read(): LocalDatabase | null {
    return this.document;
  }

  getStatus(): RemoteStatus {
    return this.status;
  }

  /** The signed-in account, as of the last load. */
  getUserId(): string | null {
    return this.userId;
  }

  clearRejected() {
    this.setStatus({ rejected: null, rejectedNotice: null });
    this.notify();
  }

  /** Keeps the current state and the waiting changes on the device. */
  private persist() {
    if (!this.cache || !this.userId || !this.document || !this.status.savedAt) return;
    const snapshot: OfflineSnapshot = {
      userId: this.userId,
      version: this.version,
      savedAt: this.status.savedAt,
      document: this.document,
      outbox: this.outbox,
    };
    const text = JSON.stringify(snapshot);
    if (text === this.lastWritten) return;
    this.lastWritten = text;
    this.cache.write(snapshot);
  }

  private forgetSaved() {
    this.saved = null;
    this.outbox = [];
    this.unchecked = [];
    this.uncheckedFailure = null;
    this.lastWritten = '';
    this.rows = null;
    this.versions = null;
    this.cache?.clear();
    this.setStatus({ pending: 0, savedAt: null });
  }

  /** Shows what the device kept for this account (once), with its waiting changes. */
  private adoptSaved(userId: string | null): boolean {
    const saved = this.saved;
    if (!saved || (userId !== null && saved.userId !== userId)) return false;
    this.saved = null;
    if (this.document) return true;
    this.userId = saved.userId;
    this.document = saved.document;
    this.outbox = saved.outbox;
    this.lastWritten = JSON.stringify(saved);
    this.setStatus({
      phase: saved.document.activeIdentity ? 'ready' : 'unlinked',
      error: null,
      pending: saved.outbox.length,
      savedAt: saved.savedAt,
    });
    return true;
  }

  private goOffline() {
    this.adoptSaved(null);
    if (this.document) {
      this.setStatus({ offline: true, error: null, phase: this.document.activeIdentity ? 'ready' : 'unlinked' });
    } else {
      this.setStatus({
        offline: true,
        phase: 'error',
        error: "You're offline and this device has no saved data yet. Open the app once with a connection.",
      });
    }
  }

  /**
   * Loads everything the signed-in user may read. Changes still waiting are
   * sent first (the reload follows them).
   */
  load(): Promise<void> {
    if (!this.loading) {
      this.loading = this.loadOnce().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  private async loadOnce(): Promise<void> {
    // The saved state of the account kept on this device appears before the
    // sign-in is checked over the network; the check below replaces or
    // removes it.
    const storedUserId = this.document ? null : this.client.storedUserId?.() ?? null;
    if (storedUserId && this.adoptSaved(storedUserId)) this.notify();
    try {
      const userId = await this.client.userId();
      if (!userId) {
        this.userId = null;
        this.document = null;
        this.forgetSaved();
        this.setStatus({ phase: 'signedOut', error: null, offline: false });
        return;
      }
      if (this.userId && this.userId !== userId) {
        // Another account on this device: nothing of the previous one stays.
        this.document = null;
        this.forgetSaved();
      }
      if (this.saved && this.saved.userId !== userId) this.forgetSaved();
      this.userId = userId;
      // The kept state appears at once while the fresh one loads.
      if (this.adoptSaved(userId)) this.notify();
      if (this.outbox.length > 0) {
        this.queue = this.queue.then(() => this.drain());
        return this.queue;
      }
      // Changes are being sent: their reload follows and checks them.
      if (this.draining) return this.queue;
      await this.fetchAll(userId);
    } catch (error) {
      if (error instanceof OfflineError) this.goOffline();
      else this.setStatus({ phase: 'error', error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.notify();
    }
  }

  /** Replaces the document with the server's; false when a newer change arrived meanwhile. */
  private async fetchAll(userId: string): Promise<boolean> {
    const generation = ++this.fetchGeneration;
    // Read before the tables: a change in between is loaded again next time, never missed.
    const versions = this.client.changeVersions ? versionMap(await this.client.changeVersions()) : null;
    const tables = await Promise.all(TABLES.map((table) => this.client.selectAll(table.name)));
    // A change made while this was loading goes first; its own reload follows.
    if (this.outbox.length > 0) return false;
    // A newer reload started meanwhile: its answer is the one to show.
    if (generation !== this.fetchGeneration) return false;
    // Signed out or another account meanwhile: this answer belongs to nobody here.
    if (this.userId !== userId) return false;
    const rows = Object.fromEntries(TABLES.map((table, index) => [table.name, tables[index]])) as ServerRows;
    const previous = this.document ?? (this.rememberedIdentity ? ({ activeIdentity: this.rememberedIdentity } as LocalDatabase) : null);
    const document = fromServerRows(rows, { userId, version: this.version, previous });
    this.document = document;
    this.rows = rows;
    this.versions = versions;
    // Signed in, but not (or no longer) anyone in a team: the account needs
    // a join code or an invitation first.
    this.setStatus({ phase: document?.activeIdentity ? 'ready' : 'unlinked', error: null, offline: false, savedAt: new Date().toISOString() });
    this.persist();
    return true;
  }

  /**
   * Reloads only what changed on the server since the last load (someone
   * else's change, announced by Realtime or found by the regular check);
   * nothing when nothing changed.
   */
  refreshChanged(): Promise<void> {
    if (this.outbox.length > 0) return this.refresh();
    // Sending ends with a reload; a load in flight answers this too.
    if (this.draining) return this.queue;
    if (this.loading) return this.loading;
    if (!this.client.changeVersions || !this.versions || !this.rows || !this.userId) return this.load();
    this.loading = this.refreshChangedOnce(this.userId).finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async refreshChangedOnce(userId: string): Promise<void> {
    try {
      const wasOffline = this.status.offline;
      const result = await this.reloadChanged(userId);
      // The usual answer of the regular check is "nothing changed": the screen is not told.
      if (result !== 'unchanged' || wasOffline) {
        if (result === 'unchanged') this.setStatus({ offline: false });
        this.notify();
      }
    } catch (error) {
      if (error instanceof OfflineError) this.goOffline();
      else this.setStatus({ phase: 'error', error: error instanceof Error ? error.message : String(error) });
      this.notify();
    }
  }

  /** Whether the last load can be updated table by table (else everything reloads). */
  private canReloadPart(): boolean {
    return Boolean(this.client.changeVersions && this.versions && this.rows);
  }

  /**
   * Reloads the tables whose version moved since the last load, and `also`
   * (the tables just written, so a change the server silently refused is
   * found too). 'stale' when a newer change or load made the answer useless.
   */
  private async reloadChanged(userId: string, also: Iterable<TableName> = []): Promise<'reloaded' | 'unchanged' | 'stale'> {
    const generation = ++this.fetchGeneration;
    const versions = versionMap(await this.client.changeVersions!());
    const tables = versions && this.versions ? tablesToReload(this.versions, versions, also) : 'all';
    if (tables === 'all') return (await this.fetchAll(userId)) ? 'reloaded' : 'stale';
    if (tables.length === 0) {
      if (versions) this.versions = versions;
      return 'unchanged';
    }
    const loaded = await Promise.all(tables.map((table) => this.client.selectAll(table)));
    if (this.outbox.length > 0 || generation !== this.fetchGeneration || this.userId !== userId || !this.rows) return 'stale';
    const rows = { ...this.rows, ...Object.fromEntries(tables.map((table, index) => [table, loaded[index]])) } as ServerRows;
    const document = fromServerRows(rows, { userId, version: this.version, previous: this.document });
    this.document = document;
    this.rows = rows;
    this.versions = versions;
    this.setStatus({ phase: document?.activeIdentity ? 'ready' : 'unlinked', error: null, offline: false, savedAt: new Date().toISOString() });
    this.persist();
    return 'reloaded';
  }

  /** Reloads, or sends what is waiting first (then that reloads). */
  refresh(): Promise<void> {
    if (this.outbox.length > 0) {
      this.queue = this.queue.then(() => this.drain());
      return this.queue;
    }
    return this.load();
  }

  /**
   * Shows `after` at once and sends the difference to `before`. The returned
   * promise settles when the server has answered and the document is the
   * server's again; the app does not need to wait for it. Offline, the change
   * waits on the device.
   */
  write(before: LocalDatabase, after: LocalDatabase): Promise<void> {
    this.document = after;
    const operations = diffRows(toServerRows(before), toServerRows(after));
    if (operations.length === 0) {
      this.notify();
      return this.queue;
    }
    this.outbox.push(operations);
    this.setStatus({ pending: this.outbox.length });
    this.persist();
    this.notify();
    this.queue = this.queue.then(() => this.drain());
    return this.queue;
  }

  /** Resolves once everything sent so far has been answered (or found no network). */
  flush(): Promise<void> {
    return this.queue;
  }

  /**
   * Calls a database function after everything queued has been sent, then
   * reloads: joining a team or accepting an invitation changes what this
   * user may read.
   */
  async call(name: string, args: Row): Promise<unknown> {
    await this.queue;
    // Changes still waiting for the network go first, so this waits too.
    if (this.outbox.length > 0) throw new OfflineError("You're offline. Try again when you have a connection.", 'data.offlineTryAgain');
    let result: unknown;
    try {
      result = await this.client.rpc(name, args);
    } catch (error) {
      // Database functions raise texts meant for the person; known ones get their text key.
      if (error instanceof OfflineError || !(error instanceof Error) || 'messageKey' in error) throw error;
      throw serverError(error.message, error);
    }
    await this.load();
    return result;
  }

  /** Sends the waiting changes in order, then reloads and checks what the server kept. */
  private async drain() {
    if (this.outbox.length === 0) return;
    this.draining = true;
    try {
      await this.drainOnce();
    } finally {
      this.draining = false;
    }
  }

  private async drainOnce() {
    const touched = new Set<TableName>();
    while (this.outbox.length > 0) {
      const operations = this.outbox[0];
      for (const operation of operations) touched.add(operation.table);
      try {
        await this.send(operations);
        this.unchecked.push(...operations);
      } catch (error) {
        if (error instanceof OfflineError) {
          // Stays first in line; the next refresh (back online, focus, timer) tries again.
          this.setStatus({ offline: true });
          this.persist();
          this.notify();
          return;
        }
        this.uncheckedFailure ??= error instanceof Error ? error.message : String(error);
      }
      this.outbox.shift();
      this.setStatus({ pending: this.outbox.length, offline: false });
      this.persist();
    }

    let reloaded = false;
    try {
      // Only what this device wrote and what others changed meanwhile.
      if (this.userId) reloaded = this.canReloadPart() ? (await this.reloadChanged(this.userId, touched)) !== 'stale' : await this.fetchAll(this.userId);
    } catch (error) {
      if (error instanceof OfflineError) this.goOffline();
      else this.setStatus({ phase: 'error', error: error instanceof Error ? error.message : String(error) });
    }
    if (reloaded) {
      const failure = this.uncheckedFailure;
      const mismatch = failure ? null : this.firstMismatch(netOperations(this.unchecked));
      this.unchecked = [];
      this.uncheckedFailure = null;
      if (failure || mismatch) {
        // Kept as a text key for the banner (app language) and in English for error reports.
        const notice: RejectedNotice = failure
          ? { messageKey: 'sync.notSaved', messageParams: { reason: serverMessageKey(failure)?.key ?? failure } }
          : { messageKey: 'sync.notSavedTable', messageParams: { table: TABLE_KEY[mismatch!] ?? mismatch! } };
        const english = Object.fromEntries(Object.entries(notice.messageParams).map(([name, value]) => [name, isMessageKey(value) ? translate('en', value) : value]));
        this.setStatus({
          rejected: failure ? `Not saved: ${failure}` : translate('en', notice.messageKey, english),
          rejectedNotice: notice,
        });
      }
    }
    this.notify();
  }

  private async send(operations: Operation[]) {
    for (let index = 0; index < operations.length; index += 1) {
      const operation = operations[index];
      if (operation.kind === 'insert') {
        // Consecutive inserts into one table go in one request.
        const batch = [operation.row];
        while (operations[index + 1]?.kind === 'insert' && operations[index + 1].table === operation.table) {
          index += 1;
          batch.push((operations[index] as Extract<Operation, { kind: 'insert' }>).row);
        }
        try {
          await this.client.insert(operation.table, batch);
        } catch (error) {
          // Already there: a change sent again after the network dropped
          // before the answer came. The check after the reload compares
          // the values, so a genuine clash is still reported.
          if ((error as { code?: string } | null)?.code !== '23505') throw error;
        }
      } else if (operation.kind === 'update') {
        await this.client.update(operation.table, operation.key, operation.changes);
      } else {
        await this.client.delete(operation.table, operation.key);
      }
    }
  }

  /** The first table where the server does not hold what was sent. */
  private firstMismatch(operations: Operation[]): TableName | null {
    if (!this.document) return operations[0]?.table ?? null;
    const server = toServerRows(this.document);
    const index = new Map(
      TABLES.map((spec) => [spec.name, new Map(server[spec.name].map((row) => [rowKey(spec.name, row), row]))]),
    );
    for (const operation of operations) {
      const found = index.get(operation.table)?.get(rowKey(operation.table, operation.key));
      if (operation.kind === 'delete') {
        if (found) return operation.table;
        continue;
      }
      // An insert or update of a row this user cannot read afterwards (e.g.
      // a hall unshared from their department) is not a refusal; only rows
      // that are visible can be compared.
      if (!found) {
        // Offering or joining atomically clears a queued seat request.
        if (operation.table === 'carpool_requests' && operation.kind === 'insert') {
          const { session_id, person_id } = operation.row;
          const cars = [...server.carpools, ...this.unchecked.flatMap((op) => op.kind === 'insert' && op.table === 'carpools' ? [op.row] : [])].filter((car) => car.session_id === session_id);
          if (cars.some((car) => car.driver_id === person_id) || [...server.carpool_riders, ...this.unchecked.flatMap((op) => op.kind === 'insert' && op.table === 'carpool_riders' ? [op.row] : [])].some((rider) => rider.person_id === person_id && cars.some((car) => car.id === rider.carpool_id))) continue;
        }
        if (operation.kind === 'insert') return operation.table;
        continue;
      }
      // "Read" and "seen" marks only say that it happened. When the row is
      // there, its time does not matter: read on another device first, or
      // sent twice (found in the walkthrough, 2026-09-26).
      if (operation.kind === 'insert' && MARK_TABLES.has(operation.table)) continue;
      const sent = normalizeRow(operation.table, operation.kind === 'update' ? operation.changes : operation.row);
      for (const [column, value] of Object.entries(sent)) {
        if (!sameValue(value, found[column])) return operation.table;
      }
    }
    return null;
  }
}
