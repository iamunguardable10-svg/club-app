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

export type Operation =
  | { kind: 'insert'; table: TableName; key: Row; row: Row }
  | { kind: 'update'; table: TableName; key: Row; changes: Row; row: Row }
  | { kind: 'delete'; table: TableName; key: Row };

export type RemotePhase = 'loading' | 'ready' | 'signedOut' | 'unlinked' | 'error';

export type RemoteStatus = {
  phase: RemotePhase;
  /** Loading failed. */
  error: string | null;
  /** The last change the server did not (fully) accept. */
  rejected: string | null;
  /** Changes still on their way. */
  pending: number;
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
};

export class RemoteStore {
  private document: LocalDatabase | null = null;
  private status: RemoteStatus = { phase: 'loading', error: null, rejected: null, pending: 0 };
  private queue: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  private userId: string | null = null;

  constructor(
    private readonly client: RemoteClient,
    private readonly version: string,
    /** The role this device last acted as, kept across reloads (people with two roles). */
    private readonly rememberedIdentity: LocalDatabase['activeIdentity'] = null,
  ) {}

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

  /** Loads everything the signed-in user may read. */
  async load(): Promise<void> {
    try {
      const userId = await this.client.userId();
      this.userId = userId;
      if (!userId) {
        this.document = null;
        this.setStatus({ phase: 'signedOut', error: null });
        return;
      }
      const tables = await Promise.all(TABLES.map((table) => this.client.selectAll(table.name)));
      const rows = Object.fromEntries(TABLES.map((table, index) => [table.name, tables[index]])) as ServerRows;
      const previous = this.document ?? (this.rememberedIdentity ? ({ activeIdentity: this.rememberedIdentity } as LocalDatabase) : null);
      const document = fromServerRows(rows, { userId, version: this.version, previous });
      this.document = document;
      // Signed in, but not (or no longer) anyone in a team: the account needs
      // a join code or an invitation first.
      this.setStatus({ phase: document?.activeIdentity ? 'ready' : 'unlinked', error: null });
    } catch (error) {
      this.setStatus({ phase: 'error', error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.notify();
    }
  }

  /** Reloads unless changes are still on their way (then the last one reloads). */
  refresh(): Promise<void> {
    if (this.status.pending > 0) return this.queue;
    return this.load();
  }

  /**
   * Shows `after` at once and sends the difference to `before`. The returned
   * promise settles when the server has answered and the document is the
   * server's again; the app does not need to wait for it.
   */
  write(before: LocalDatabase, after: LocalDatabase): Promise<void> {
    this.document = after;
    const operations = diffRows(toServerRows(before), toServerRows(after));
    if (operations.length === 0) {
      this.notify();
      return this.queue;
    }
    this.setStatus({ pending: this.status.pending + 1 });
    this.notify();
    this.queue = this.queue.then(() => this.push(operations));
    return this.queue;
  }

  /** Resolves once everything sent so far has been answered. */
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
    const result = await this.client.rpc(name, args);
    await this.load();
    return result;
  }

  private async push(operations: Operation[]) {
    let failure: string | null = null;
    try {
      for (let index = 0; index < operations.length; index += 1) {
        const operation = operations[index];
        if (operation.kind === 'insert') {
          // Consecutive inserts into one table go in one request.
          const batch = [operation.row];
          while (operations[index + 1]?.kind === 'insert' && operations[index + 1].table === operation.table) {
            index += 1;
            batch.push((operations[index] as Extract<Operation, { kind: 'insert' }>).row);
          }
          await this.client.insert(operation.table, batch);
        } else if (operation.kind === 'update') {
          await this.client.update(operation.table, operation.key, operation.changes);
        } else {
          await this.client.delete(operation.table, operation.key);
        }
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }

    this.setStatus({ pending: this.status.pending - 1 });
    if (this.status.pending > 0) {
      // A later change is queued; it reloads and checks after itself. Keep a
      // refusal from this one so it is not lost.
      if (failure) this.setStatus({ rejected: failure });
      return;
    }

    const intended = operations;
    await this.load();
    const mismatch = failure ? null : this.firstMismatch(intended);
    if (failure || mismatch) {
      this.setStatus({
        rejected: failure
          ? `Not saved: ${failure}`
          : `Not saved (${TABLE_LABEL[mismatch!] ?? mismatch}): your role may not change this, or someone else just changed it.`,
      });
      this.notify();
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
