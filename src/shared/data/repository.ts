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
 * With `NEXT_PUBLIC_DATA_BACKEND=supabase` the same document is backed by the
 * pilot database instead (`./remote`, docs/simplify-decisions.md point 8).
 * Every function below works unchanged in both modes: reads come from the
 * document, writes go through `mutate`, and only `readDatabase`/`mutate`
 * know where the document lives.
 */

import { calculateEWMA, getLatestACWR, loadZone, sevenDayLoad, summarizeLoadEntries } from './loadCalculations';
import { DATABASE_KEY, LEGACY_KEY_PREFIXES, SCHEMA_VERSION, isCurrent } from './migrations';
import { createSeedDatabase } from './seed';
import type { RemoteStore } from './remote/remoteStore';
import {
  COACH_PERMISSIONS,
  COACH_PERMISSION_REQUIRES,
  LocalDataError,
  type ActiveIdentity,
  type CoachPermission,
  type CoachRole,
  type Membership,
  type Availability,
  type AvailabilityStatus,
  type Facility,
  type Id,
  type LoadEntry,
  type LocalDatabase,
  type MembershipRole,
  type Person,
  type Session,
  type SessionSeries,
  type SessionType,
  type Team,
} from './schema';

type Listener = () => void;

/** The server store once connected; null in the local test mode. */
let remote: RemoteStore | null = null;
let remoteStarting = false;

/** Whether this build talks to the pilot database instead of localStorage. */
export function isRemoteMode(): boolean {
  return process.env.NEXT_PUBLIC_DATA_BACKEND === 'supabase';
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
      const store = createSupabaseStore(SCHEMA_VERSION, authStorage(window.localStorage));
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
  pending: number;
};

/** Where the data comes from and whether it is there yet. */
export function getBackendStatus(): BackendStatus {
  if (!isRemoteMode() && !remote) return { mode: 'local', phase: 'ready', error: null, rejected: null, pending: 0 };
  if (remoteLoadError) return { mode: 'remote', phase: 'error', error: remoteLoadError, rejected: null, pending: 0 };
  if (!remote) return { mode: 'remote', phase: 'loading', error: null, rejected: null, pending: 0 };
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
  if (!database || identity?.role !== 'athlete') return;
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
  if (remote || isRemoteMode()) throw new LocalDataError('Mit dem Server gibt es keine Testdaten zum Zurücksetzen.');
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
// Identity
// ---------------------------------------------------------------------------

export function getActiveIdentity(): ActiveIdentity | null {
  return readDatabase()?.activeIdentity ?? null;
}

export function setActiveIdentity(identity: ActiveIdentity | null): void {
  mutate((database) => {
    // With the server you are always yourself: only a switch between your
    // own roles (coach and athlete) is possible.
    if (remote && identity) {
      const current = database.people.find((person) => person.id === database.activeIdentity?.personId);
      const target = database.people.find((person) => person.id === identity.personId);
      if (!current?.userId || target?.userId !== current.userId) {
        throw new LocalDataError('Mit dem Server kannst du nur zwischen deinen eigenen Rollen wechseln.');
      }
    }
    database.activeIdentity = identity;
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

export function peopleWithRole(database: LocalDatabase, role: MembershipRole): Person[] {
  const ids = new Set(
    database.memberships.filter((membership) => membership.role === role).map((membership) => membership.personId),
  );
  return database.people.filter((person) => ids.has(person.id));
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
  return membership ? permissionsOfRole(roleById(database, membership.coachRoleId)) : NO_PERMISSIONS;
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
  if (!stillManaged) {
    throw new LocalDataError('Das Team braucht mindestens eine Person, die Trainerrollen verwalten darf.');
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
  if (taken) throw new LocalDataError(`Die Rolle „${name}" gibt es in diesem Team schon.`);
}

export function createCoachRole(teamId: Id, name: string, permissions: readonly string[]): Id {
  const trimmed = name.trim();
  if (!trimmed) throw new LocalDataError('Die Rolle braucht einen Namen.');
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
    if (role.locked) throw new LocalDataError('Die Rolle Head Coach hat immer alle Rechte und lässt sich nicht ändern.');
    if (changes.name !== undefined) {
      const trimmed = changes.name.trim();
      if (!trimmed) throw new LocalDataError('Die Rolle braucht einen Namen.');
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
    if (role.locked) throw new LocalDataError('Die Rolle Head Coach lässt sich nicht löschen.');
    if (database.memberships.some((membership) => membership.coachRoleId === roleId)) {
      throw new LocalDataError(`„${role.name}" ist noch vergeben. Weise den Personen zuerst eine andere Rolle zu.`);
    }
    database.coachRoles = database.coachRoles.filter((candidate) => candidate.id !== roleId);
  });
}

export function assignCoachRole(membershipId: Id, roleId: Id): void {
  mutate((database) => {
    const membership = database.memberships.find((candidate) => candidate.id === membershipId);
    const role = database.coachRoles.find((candidate) => candidate.id === roleId);
    if (!membership || membership.role !== 'coach') throw new LocalDataError(`Unknown staff membership: ${membershipId}`);
    if (!role || role.teamId !== membership.teamId) throw new LocalDataError('Diese Rolle gehört zu einem anderen Team.');
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
  if (!first || !last) throw new LocalDataError('Vor- und Nachname werden gebraucht.');
  const personId = newId();
  mutate((database) => {
    const team = database.teams.find((candidate) => candidate.id === teamId);
    const role = database.coachRoles.find((candidate) => candidate.id === roleId);
    if (!team) throw new LocalDataError(`Unknown team: ${teamId}`);
    if (!role || role.teamId !== teamId) throw new LocalDataError('Diese Rolle gehört zu einem anderen Team.');
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
  const departmentIds = new Set<Id>();
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
  if (!name) throw new LocalDataError('Die Halle braucht einen Namen.');
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
      if (!name) throw new LocalDataError('Die Halle braucht einen Namen.');
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
      if (!bookable) throw new LocalDataError('Diese Halle ist für die Abteilung des Teams nicht freigegeben.');
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
};

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
    });
  });
  return id;
}

export function updateSession(sessionId: Id, changes: Partial<SessionInput>): void {
  mutate((database) => {
    const session = database.sessions.find((candidate) => candidate.id === sessionId);
    if (!session) throw new LocalDataError(`Unknown session: ${sessionId}`);
    Object.assign(session, changes);
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
    const previous = database.availability.find(
      (entry) => entry.sessionId === input.sessionId && entry.personId === input.personId,
    );
    database.availability = database.availability.filter((entry) => entry !== previous);
    if (input.status === 'in') return;
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
  });
}

/**
 * Load summary for one athlete.
 *
 * The maths lives in `loadCalculations.ts` and is not reimplemented here; this
 * only selects the right entries and hands them over. Views must not compute
 * ACWR themselves.
 *
 * Uses EWMA, like the athlete cockpit and the coach roster. An earlier version
 * used the rolling average, so the same athlete would have shown two different
 * ratios depending on which screen read the number.
 */
export function loadSummaryForPerson(database: LocalDatabase, personId: Id) {
  const entries = loadEntriesForPerson(database, personId);
  const latest = getLatestACWR(entries, 'ewma');
  return {
    entries,
    series: calculateEWMA(entries),
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
