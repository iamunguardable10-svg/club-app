/**
 * End-to-end test of the server store: the app's real data-layer functions
 * (createSession, reportAvailability, addStaffMember, …) running against a
 * local Postgres with the pilot migrations and their row-level security,
 * acting as a Head Coach, a Betreuer and an athlete.
 *
 * The only stand-in is the connection: instead of supabase-js over HTTP, a
 * `RemoteClient` that runs each request as its own transaction with the
 * signed-in user's id set, the way PostgREST does.
 *
 *   PGHOST=/tmp/pgclub PGPORT=54329 PGUSER=postgres npm run test:pilot
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import * as data from '../../../src/shared/data';
import { RemoteStore, type RemoteClient } from '../../../src/shared/data/remote/remoteStore';
import type { Row, TableName } from '../../../src/shared/data/remote/tables';

const DB = process.env.PILOT_TEST_DB ?? 'pilot_app_test';

// Keep Postgres values as text, as they arrive over PostgREST.
for (const oid of [1082, 1083, 1114, 1184, 1700]) pg.types.setTypeParser(oid, (value: string) => value);

execFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'run-local.sh'), { env: { ...process.env, PILOT_TEST_DB: DB, SKIP_RLS_TESTS: '1' }, stdio: 'inherit' });
const pool = new pg.Pool({ database: DB, max: 4 });

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`ok  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL ${label}`, detail ?? '');
  }
}

function pgClient(userId: string): RemoteClient {
  async function asUser<T>(run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated' })]);
      const result = await run(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  const where = (key: Row, offset: number) =>
    Object.keys(key).map((column, index) => `${column} = $${offset + index + 1}`).join(' and ');
  return {
    userId: async () => userId,
    selectAll: (table: TableName) => asUser(async (client) => (await client.query(`select * from public.${table}`)).rows),
    insert: (table, rows) =>
      asUser(async (client) => {
        for (const row of rows) {
          const columns = Object.keys(row);
          await client.query(
            `insert into public.${table} (${columns.join(', ')}) values (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
            columns.map((column) => row[column]),
          );
        }
      }),
    update: (table, key, changes) =>
      asUser(async (client) => {
        const columns = Object.keys(changes);
        const result = await client.query(
          `update public.${table} set ${columns.map((column, index) => `${column} = $${index + 1}`).join(', ')} where ${where(key, columns.length)}`,
          [...columns.map((column) => changes[column]), ...Object.values(key)],
        );
        return result.rowCount ?? 0;
      }),
    delete: (table, key) =>
      asUser(async (client) => (await client.query(`delete from public.${table} where ${where(key, 0)}`, Object.values(key))).rowCount ?? 0),
  };
}

const U = {
  martin: '10000000-0000-0000-0000-000000000001',
  uwe: '10000000-0000-0000-0000-000000000005',
  jonas: '10000000-0000-0000-0000-000000000011',
  ben: '10000000-0000-0000-0000-000000000012',
};
const P = {
  martin: 'a0000000-0000-0000-0000-000000000001',
  uwe: 'a0000000-0000-0000-0000-000000000005',
  jonas: 'a0000000-0000-0000-0000-000000000011',
  ben: 'a0000000-0000-0000-0000-000000000012',
};
const CLUB = 'c0000000-0000-0000-0000-000000000001';
const DEP = 'd0000000-0000-0000-0000-000000000001';
const TEAM = '70000000-0000-0000-0000-000000000016';
const HALL = 'f0000000-0000-0000-0000-000000000001';
const FUTURE = '50000000-0000-0000-0000-000000000001';
const PAST = '50000000-0000-0000-0000-000000000002';

async function fixture() {
  await pool.query(`
    insert into auth.users (id, email) values
      ('${U.martin}', 'martin@example.test'), ('${U.uwe}', 'uwe@example.test'),
      ('${U.jonas}', 'jonas@example.test'), ('${U.ben}', 'ben@example.test');
    insert into public.clubs (id, name, city) values ('${CLUB}', 'TV Test', 'Essen');
    insert into public.departments (id, club_id, name) values ('${DEP}', '${CLUB}', 'Basketball');
    insert into public.facilities (id, club_id, name, address) values ('${HALL}', '${CLUB}', 'Sporthalle Nord', 'Nordring 12');
    insert into public.department_facilities values ('${DEP}', '${HALL}');
    insert into public.teams (id, club_id, department_id, name, default_facility_id) values ('${TEAM}', '${CLUB}', '${DEP}', 'U16', '${HALL}');
    insert into public.people (id, club_id, user_id, first_name, last_name) values
      ('${P.martin}', '${CLUB}', '${U.martin}', 'Martin', 'Weber'), ('${P.uwe}', '${CLUB}', '${U.uwe}', 'Uwe', 'Heller'),
      ('${P.jonas}', '${CLUB}', '${U.jonas}', 'Jonas', 'Kern'), ('${P.ben}', '${CLUB}', '${U.ben}', 'Ben', 'Albrecht');
    insert into public.memberships (person_id, team_id, role, coach_role_id)
      select '${P.martin}', '${TEAM}', 'coach', id from public.coach_roles where team_id = '${TEAM}' and locked;
    insert into public.memberships (person_id, team_id, role, coach_role_id)
      select '${P.uwe}', '${TEAM}', 'coach', id from public.coach_roles where team_id = '${TEAM}' and name = 'Betreuer';
    insert into public.memberships (person_id, team_id, role) values ('${P.jonas}', '${TEAM}', 'athlete'), ('${P.ben}', '${TEAM}', 'athlete');
    insert into public.sessions (id, club_id, department_id, team_id, title, session_type, starts_at, ends_at, facility_id) values
      ('${FUTURE}', '${CLUB}', '${DEP}', '${TEAM}', 'Training', 'training', now() + interval '1 day', now() + interval '1 day 90 minutes', '${HALL}'),
      ('${PAST}', '${CLUB}', '${DEP}', '${TEAM}', 'Training', 'training', now() - interval '1 day', now() - interval '1 day' + interval '90 minutes', '${HALL}');
    insert into public.load_entries (person_id, session_id, team_id, date, title, training_type, rpe, duration_minutes, load, source)
      select '${P.ben}', null, '${TEAM}', current_date - d, 'Training', 'team_training', 6, 90, 540, 'solo' from generate_series(1, 30, 2) d;
    insert into public.load_summaries (person_id, acwr, chronic_full) values ('${P.ben}', 0.95, true);
  `);
}

async function count(sql: string, params: unknown[] = []) {
  return Number((await pool.query(`select count(*) from (${sql}) q`, params)).rows[0].count);
}

async function actAs(userId: string) {
  const store = new RemoteStore(pgClient(userId), data.SCHEMA_VERSION);
  data.connectRemoteStore(store);
  await store.load();
  return store;
}

const db = () => {
  const database = data.readDatabase();
  assert.ok(database, 'document loaded');
  return database;
};

async function main() {
  await fixture();

  // --- Martin, Head Coach -------------------------------------------------
  let store = await actAs(U.martin);
  check('Martin: loaded as coach', store.getStatus().phase === 'ready' && db().activeIdentity?.personId === P.martin, store.getStatus());
  check('Martin: sees both athletes', data.athletesForTeam(db(), TEAM).length === 2);
  check('Martin: sees the four roles', data.coachRolesForTeam(db(), TEAM).length === 4);

  const newSession = data.createSession({
    teamId: TEAM, title: 'Athletik', sessionType: 's_and_c',
    startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), endsAt: new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString(),
    facilityId: HALL,
  });
  await data.flushRemote();
  check('Martin: new session is on the server', (await count('select 1 from sessions where id = $1', [newSession])) === 1);
  check('… and nothing was refused', store.getStatus().rejected === null, store.getStatus().rejected);

  const moved = new Date(Date.now() + 3 * 86_400_000).toISOString();
  data.updateSession(newSession, { startsAt: moved, endsAt: new Date(Date.parse(moved) + 3_600_000).toISOString() });
  await data.flushRemote();
  check('Martin: moved session', (await count('select 1 from sessions where id = $1 and starts_at = $2', [newSession, moved])) === 1);

  const hall = data.createFacility({ name: 'Sporthalle Süd', address: 'Südstraße 3', departmentIds: [DEP] });
  await data.flushRemote();
  check('Martin: new hall and its sharing', (await count('select 1 from department_facilities where facility_id = $1', [hall])) === 1);
  data.setTeamDefaultFacility(TEAM, hall);
  await data.flushRemote();
  check('Martin: default hall set', (await count('select 1 from teams where default_facility_id = $1', [hall])) === 1);
  data.updateSession(newSession, { facilityId: hall });
  await data.flushRemote();
  check('Martin: session moved into the new hall', (await count('select 1 from sessions where id = $1 and facility_id = $2', [newSession, hall])) === 1);

  const betreuer = data.coachRolesForTeam(db(), TEAM).find((role) => role.name === 'Betreuer')!;
  const lea = data.addStaffMember(TEAM, 'Lea', 'Sommer', betreuer.id);
  await data.flushRemote();
  check('Martin: added Lea as Betreuer', (await count("select 1 from memberships where person_id = $1 and role = 'coach'", [lea])) === 1, store.getStatus().rejected);

  data.createCoachRole(TEAM, 'Physio', ['viewRoster', 'viewAbsenceReasons']);
  await data.flushRemote();
  check('Martin: Physio role, attendance completed', (await count("select 1 from coach_roles where name = 'Physio' and 'viewAttendance' = any (permissions)")) === 1);

  data.mutate((draft) => {
    draft.playerGroups.push({ id: data.newId(), teamId: TEAM, name: 'Starting Five' });
  });
  await data.flushRemote();
  const group = db().playerGroups.find((candidate) => candidate.name === 'Starting Five')!;
  data.mutate((draft) => {
    draft.playerGroupMembers.push({ groupId: group.id, personId: P.jonas });
  });
  await data.flushRemote();
  check('Martin: group with Jonas', (await count('select 1 from player_group_members where group_id = $1', [group.id])) === 1);
  check('… no refusals so far', store.getStatus().rejected === null, store.getStatus().rejected);

  // --- Jonas, athlete ---------------------------------------------------
  store = await actAs(U.jonas);
  check('Jonas: loaded as athlete', db().activeIdentity?.role === 'athlete' && db().activeIdentity?.personId === P.jonas);
  check('Jonas: sees no teammates', data.athletesForTeam(db(), TEAM).length === 1);
  data.reportAvailability({ sessionId: FUTURE, personId: P.jonas, status: 'out', reason: 'Knöchel verdreht' });
  await data.flushRemote();
  check('Jonas: report and reason on the server',
    (await count("select 1 from availability a join availability_reasons r on r.availability_id = a.id where a.person_id = $1 and a.status = 'out'", [P.jonas])) === 1,
    store.getStatus().rejected);
  data.reportAvailability({ sessionId: FUTURE, personId: P.jonas, status: 'late', reason: null, lateMinutes: 10 });
  await data.flushRemote();
  check('Jonas: changed to late, same row, reason gone',
    (await count("select 1 from availability where person_id = $1 and status = 'late' and late_minutes = 10", [P.jonas])) === 1
    && (await count('select 1 from availability_reasons')) === 0, store.getStatus().rejected);
  data.reportAvailability({ sessionId: FUTURE, personId: P.jonas, status: 'out', reason: 'Knöchel verdreht' });
  data.recordLoadEntry({ personId: P.jonas, sessionId: PAST, teamId: TEAM, date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), title: 'Training', trainingType: 'team_training', rpe: 8, durationMinutes: 75 });
  await data.flushRemote();
  check('Jonas: load entry 600 AU on the server', (await count('select 1 from load_entries where person_id = $1 and load = 600', [P.jonas])) === 1, store.getStatus().rejected);
  check('Jonas: his traffic light was written too', (await count('select 1 from load_summaries where person_id = $1', [P.jonas])) === 1);
  check('… no refusals', store.getStatus().rejected === null, store.getStatus().rejected);
  let refused = false;
  try {
    data.setActiveIdentity({ role: 'coach', personId: P.martin });
  } catch {
    refused = true;
  }
  check('Jonas: cannot act as Martin', refused && db().activeIdentity?.personId === P.jonas);

  // --- Uwe, Betreuer (roster and attendance) ------------------------------
  store = await actAs(U.uwe);
  const out = db().availability.find((entry) => entry.personId === P.jonas);
  check('Uwe: sees that Jonas is out', out?.status === 'out');
  check('Uwe: does not see why', out?.reason === null, out);
  check('Uwe: no load entries', db().loadEntries.length === 0);
  check('Uwe: no traffic light yet', db().loadSummaries.length === 0);
  data.updateSession(FUTURE, { title: 'Umbenannt von Uwe' });
  await data.flushRemote();
  check('Uwe: renaming a session is refused with a message', store.getStatus().rejected?.includes('Einheiten') === true, store.getStatus().rejected);
  check('… and the app shows the server state again', db().sessions.find((session) => session.id === FUTURE)?.title === 'Training');
  check('… and the server is unchanged', (await count("select 1 from sessions where title = 'Umbenannt von Uwe'")) === 0);

  // --- Martin gives Betreuer the traffic light ----------------------------
  store = await actAs(U.martin);
  check('Martin: sees Jonas’ reason', db().availability.find((entry) => entry.personId === P.jonas)?.reason === 'Knöchel verdreht');
  data.updateCoachRole(betreuer.id, { permissions: ['viewRoster', 'viewAttendance', 'viewLoadSummary'] });
  await data.flushRemote();
  store = await actAs(U.uwe);
  check('Uwe: now sees traffic lights', db().loadSummaries.length === 2, db().loadSummaries);
  check('… but still no entries', db().loadEntries.length === 0);

  // --- Martin deletes things that others' rows point to -------------------
  store = await actAs(U.martin);
  data.deleteSession(PAST);
  await data.flushRemote();
  check('Martin: session deleted', (await count('select 1 from sessions where id = $1', [PAST])) === 0);
  check('… Jonas’ load stays, no longer tied to it', (await count('select 1 from load_entries where person_id = $1 and session_id is null', [P.jonas])) === 1);
  check('… and that is not reported as refused', store.getStatus().rejected === null, store.getStatus().rejected);
  data.deleteFacility(hall);
  await data.flushRemote();
  check('Martin: hall deleted, default cleared', (await count('select 1 from teams where default_facility_id is null')) === 1);
  check('… session kept without hall', (await count('select 1 from sessions where id = $1 and facility_id is null', [newSession])) === 1);
  check('… not reported as refused', store.getStatus().rejected === null, store.getStatus().rejected);

  // --- Not signed in ------------------------------------------------------
  const anonymous = new RemoteStore({ ...pgClient(U.martin), userId: async () => null }, data.SCHEMA_VERSION);
  await anonymous.load();
  check('nobody signed in: signedOut, no document', anonymous.getStatus().phase === 'signedOut' && anonymous.read() === null);

  await pool.end();
  console.log(failures === 0 ? 'all server-store checks passed' : `${failures} server-store check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
