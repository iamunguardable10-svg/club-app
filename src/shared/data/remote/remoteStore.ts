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
  selectAll(table: TableName): Promise<Row[]>;
  insert(table: TableName, rows: Row[]): Promise<void>;
  /** Returns how many rows changed; 0 when row-level security hid the row. */
  update(table: TableName, key: Row, changes: Row): Promise<number>;
  delete(table: TableName, key: Row): Promise<number>;
  /** Calls one of the database functions the app may call (join_team, accept_staff_invite, invite_preview). */
  rpc(name: string, args: Row): Promise<unknown>;
}

/** No network: nothing reached the server. The change waits; reading shows the saved state. */
export class OfflineError extends Error {
  constructor(message = "You're offline.") {
    super(message);
    this.name = 'OfflineError';
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

export type RemotePhase = 'loading' | 'ready' | 'signedOut' | 'unlinked' | 'error';

export type RemoteStatus = {
  phase: RemotePhase;
  /** Loading failed. */
  error: string | null;
  /** The last change the server did not (fully) accept. */
  rejected: string | null;
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
const TABLE_LABEL: Partial<Record<TableName, string>> = {
  facilities: 'halls',
  teams: 'team settings',
  department_facilities: 'hall sharing',
  people: 'people',
  coach_roles: 'coach roles',
  memberships: 'staff',
  player_groups: 'groups',
  player_group_members: 'groups',
  session_series: 'weekly series',
  sessions: 'sessions',
  session_series_week_states: 'weekly series',
  availability: 'availability',
  availability_reasons: 'absence reasons',
  load_entries: 'load',
  load_summaries: 'load traffic light',
  athlete_plans: 'training plans',
  acknowledged_sessions: 'dismissed sessions',
  load_entry_reviews: 'check requests',
  attendance_confirmations: 'attendance',
  absences: 'absences',
  absence_reasons: 'absence reasons',
  squad_entries: 'squad',
  team_messages: 'messages',
  message_reads: 'read receipts',
};

export class RemoteStore {
  private document: LocalDatabase | null = null;
  private status: RemoteStatus = { phase: 'loading', error: null, rejected: null, pending: 0, offline: false, savedAt: null };
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
    this.setStatus({ rejected: null });
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
  async load(): Promise<void> {
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
    const tables = await Promise.all(TABLES.map((table) => this.client.selectAll(table.name)));
    // A change made while this was loading goes first; its own reload follows.
    if (this.outbox.length > 0) return false;
    const rows = Object.fromEntries(TABLES.map((table, index) => [table.name, tables[index]])) as ServerRows;
    const previous = this.document ?? (this.rememberedIdentity ? ({ activeIdentity: this.rememberedIdentity } as LocalDatabase) : null);
    const document = fromServerRows(rows, { userId, version: this.version, previous });
    this.document = document;
    // Signed in, but not (or no longer) anyone in a team: the account needs
    // a join code or an invitation first.
    this.setStatus({ phase: document?.activeIdentity ? 'ready' : 'unlinked', error: null, offline: false, savedAt: new Date().toISOString() });
    this.persist();
    return true;
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
    if (this.outbox.length > 0) throw new OfflineError("You're offline. Try again when you have a connection.");
    const result = await this.client.rpc(name, args);
    await this.load();
    return result;
  }

  /** Sends the waiting changes in order, then reloads and checks what the server kept. */
  private async drain() {
    if (this.outbox.length === 0) return;
    while (this.outbox.length > 0) {
      const operations = this.outbox[0];
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
      if (this.userId) reloaded = await this.fetchAll(this.userId);
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
        this.setStatus({
          rejected: failure
            ? `Not saved: ${failure}`
            : `Not saved (${TABLE_LABEL[mismatch!] ?? mismatch}): your role may not change this, or someone else just changed it.`,
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
        if (operation.kind === 'insert') return operation.table;
        continue;
      }
      const sent = normalizeRow(operation.table, operation.kind === 'update' ? operation.changes : operation.row);
      for (const [column, value] of Object.entries(sent)) {
        if (!sameValue(value, found[column])) return operation.table;
      }
    }
    return null;
  }
}
