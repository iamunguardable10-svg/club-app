/**
 * End-to-end test of the server store: the app's real data-layer functions
 * (createSession, reportAvailability, addStaffMember, …) running against a
 * local Postgres with the pilot migrations and their row-level security,
 * acting as a Head Coach, a Team Manager and an athlete.
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
import * as rateStore from '../../../src/features/load/athleteLocalStore';
import { buildCoachData } from '../../../src/features/role-workspaces/coachData';
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
    rpc: (name, args) =>
      asUser(async (client) => {
        const names = Object.keys(args);
        const result = await client.query(
          `select * from public.${name}(${names.map((arg, index) => `${arg} => $${index + 1}`).join(', ')})`,
          Object.values(args),
        );
        return result.rows.length === 1 && Object.keys(result.rows[0]).length === 1 ? Object.values(result.rows[0])[0] : result.rows;
      }),
  };
}

const U = {
  martin: '10000000-0000-0000-0000-000000000001',
  uwe: '10000000-0000-0000-0000-000000000005',
  jonas: '10000000-0000-0000-0000-000000000011',
  ben: '10000000-0000-0000-0000-000000000012',
  mia: '10000000-0000-0000-0000-000000000031',
  newCoach: '10000000-0000-0000-0000-000000000032',
  founder: '10000000-0000-0000-0000-000000000041',
  lead: '10000000-0000-0000-0000-000000000042',
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
      ('${U.jonas}', 'jonas@example.test'), ('${U.ben}', 'ben@example.test'),
      ('${U.mia}', 'mia@example.test'), ('${U.newCoach}', 'lea@example.test'),
      ('${U.founder}', 'frida@example.test'), ('${U.lead}', 'lars@example.test');
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
      select '${P.uwe}', '${TEAM}', 'coach', id from public.coach_roles where team_id = '${TEAM}' and name = 'Team Manager';
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

  const betreuer = data.coachRolesForTeam(db(), TEAM).find((role) => role.name === 'Team Manager')!;
  const lea = data.addStaffMember(TEAM, 'Lea', 'Sommer', betreuer.id);
  await data.flushRemote();
  check('Martin: added Lea as Team Manager', (await count("select 1 from memberships where person_id = $1 and role = 'coach'", [lea])) === 1, store.getStatus().rejected);

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
  // Piece 9: the nightly server job computes the same traffic light as the app.
  {
    const jonasEntries = db().loadEntries.filter((entry) => entry.personId === P.jonas);
    const client = data.summarizeLoadEntries(jonasEntries);
    const server = (await pool.query('select acwr, chronic_full from app.load_summary($1, $2::date)', [P.jonas, data.todayISO()])).rows[0];
    check('nightly job: the server computes the same traffic light as the app',
      server.chronic_full === client.chronicFull && (server.acwr === null ? client.acwr === null : Math.abs(Number(server.acwr) - (client.acwr ?? -1)) < 0.005),
      { server, client });
    const refreshed = (await pool.query('select app.refresh_load_summaries($1::date) as n', [data.todayISO()])).rows[0].n;
    check('… and writes it for every athlete with load', Number(refreshed) >= 1, refreshed);
  }
  // … also over a long, uneven history (60 days, fixed pseudo-random loads).
  {
    let seed = 7;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    await pool.query('delete from load_entries where person_id = $1', [P.ben]);
    for (let offset = -60; offset <= 0; offset += 1) {
      if (rand() < 0.45) continue;
      const load = Math.round(100 + rand() * 900);
      await pool.query(
        `insert into load_entries (person_id, date, title, training_type, rpe, duration_minutes, load, source)
         values ($1, current_date + $2::int, 'Synthetic', 'team_training', 5, 60, $3, 'manual')`,
        [P.ben, offset, load],
      );
    }
    const rows = (await pool.query("select id, to_char(date, 'YYYY-MM-DD') as date, load from load_entries where person_id = $1", [P.ben])).rows;
    const synthetic = rows.map((row) => ({
      id: String(row.id), sessionId: null, teamId: null, date: String(row.date), title: 'Synthetic',
      trainingType: 'team_training' as const, rpe: 5, durationMinutes: 60, load: Number(row.load), source: 'manual' as const,
    }));
    const today = (await pool.query("select to_char(current_date, 'YYYY-MM-DD') as d")).rows[0].d as string;
    const client = data.summarizeLoadEntries(synthetic);
    const server = (await pool.query('select acwr, chronic_full from app.load_summary($1, $2::date)', [P.ben, today])).rows[0];
    check('nightly job: same traffic light as the app over 60 uneven days',
      today === data.todayISO() && server.chronic_full === client.chronicFull && Number(server.acwr) === client.acwr,
      { server, client, today });
  }
  check('… no refusals', store.getStatus().rejected === null, store.getStatus().rejected);

  // --- "How hard was it?" (piece 4) ---------------------------------------
  const GAME = '50000000-0000-0000-0000-000000000003';
  const BEFORE_JOIN = '50000000-0000-0000-0000-000000000004';
  const GROUP_ONLY = '50000000-0000-0000-0000-000000000005';
  const MISSED = '50000000-0000-0000-0000-000000000006';
  await pool.query(`update public.memberships set created_at = now() - interval '10 days' where person_id = $1`, [P.jonas]);
  await pool.query(`
    insert into public.player_groups (id, team_id, name) values ('9b000000-0000-0000-0000-000000000001', '${TEAM}', 'Rehab');
    insert into public.sessions (id, club_id, department_id, team_id, title, session_type, starts_at, ends_at, facility_id, group_ids) values
      ('${GAME}', '${CLUB}', '${DEP}', '${TEAM}', 'Spiel', 'game', now() - interval '3 days', now() - interval '3 days' + interval '2 hours', '${HALL}', '{}'),
      ('${BEFORE_JOIN}', '${CLUB}', '${DEP}', '${TEAM}', 'Training', 'training', now() - interval '20 days', now() - interval '20 days' + interval '90 minutes', '${HALL}', '{}'),
      ('${GROUP_ONLY}', '${CLUB}', '${DEP}', '${TEAM}', 'Reha', 'training', now() - interval '2 days', now() - interval '2 days' + interval '60 minutes', '${HALL}', array['9b000000-0000-0000-0000-000000000001']::uuid[]),
      ('${MISSED}', '${CLUB}', '${DEP}', '${TEAM}', 'Training', 'training', now() - interval '4 days', now() - interval '4 days' + interval '90 minutes', '${HALL}', '{}');
  `);
  store = await actAs(U.jonas);
  const queue = rateStore.readSessionsToRate(db(), P.jonas).map((session) => session.id);
  check('rate: asks for the game and the other training, oldest first', queue.join() === [MISSED, GAME].join(), queue);
  check('… not for sessions before joining, of another group, or already rated',
    !queue.includes(BEFORE_JOIN) && !queue.includes(GROUP_ONLY) && !queue.includes(PAST));
  const game = rateStore.readSessionsToRate(db(), P.jonas).find((session) => session.id === GAME)!;
  const entryOf = (sessionId: string, trainingType: data.LoadTrainingType, rpe: number, minutes: number) => ({
    id: data.newId(), sessionId, teamId: TEAM, teamName: 'U16', date: game.date, startsAt: game.startsAt, title: game.title,
    trainingType, rpe, durationMinutes: minutes, load: rpe * minutes, note: null, source: 'planned_session' as const,
  });
  rateStore.saveSessionRating(P.jonas, [entryOf(GAME, 'game', 10, 55), entryOf(`${GAME}-warmup`, 'warmup', 3, 20)]);
  await data.flushRemote();
  check('rate: game and warmup saved on the server, both on the game session',
    (await count('select 1 from load_entries where person_id = $1 and session_id = $2', [P.jonas, GAME])) === 2, store.getStatus().rejected);
  check('… the app still tells the warmup apart', rateStore.readEntries(db(), P.jonas).some((entry) => entry.sessionId === `${GAME}-warmup`));
  rateStore.saveMissedSession(P.jonas, MISSED);
  await data.flushRemote();
  check('rate: "I didn\'t take part" saved as missed', (await count("select 1 from availability where person_id = $1 and session_id = $2 and status = 'missed'", [P.jonas, MISSED])) === 1, store.getStatus().rejected);
  check('… and nothing is left to rate', rateStore.readSessionsToRate(db(), P.jonas).length === 0);
  let earlyMissed = '';
  try {
    rateStore.saveMissedSession(P.jonas, FUTURE);
  } catch (error) {
    earlyMissed = error instanceof Error ? error.message : String(error);
  }
  check('rate: a session that has not started cannot be missed', earlyMissed.includes('once the session has started'), earlyMissed);
  check('… no refusals', store.getStatus().rejected === null, store.getStatus().rejected);
  store = await actAs(U.uwe);
  const missedForCoach = buildCoachData(db(), P.uwe).sessions.find((session) => session.id === MISSED)?.availability.find((entry) => entry.userId === P.jonas);
  check('coach: sees Jonas as absent, labelled "did not take part"', missedForCoach?.status === 'out' && missedForCoach.missed === true && missedForCoach.reason === 'did not take part', missedForCoach);
  store = await actAs(U.jonas);
  data.renameOwnPerson(P.jonas, 'Jonas', 'Kern-Neu');
  await data.flushRemote();
  check('Jonas: renamed himself on the server', (await count("select 1 from people where id = $1 and last_name = 'Kern-Neu'", [P.jonas])) === 1, store.getStatus().rejected);
  let renamedOther = false;
  try {
    data.renameOwnPerson(P.ben, 'Ben', 'Hacked');
  } catch {
    renamedOther = true;
  }
  check('Jonas: cannot rename Ben', renamedOther && (await count("select 1 from people where last_name = 'Hacked'")) === 0);
  let refused = false;
  try {
    data.setActiveIdentity({ role: 'coach', personId: P.martin });
  } catch {
    refused = true;
  }
  check('Jonas: cannot act as Martin', refused && db().activeIdentity?.personId === P.jonas);

  // --- Uwe, Team Manager (roster and attendance) ------------------------------
  store = await actAs(U.uwe);
  const out = db().availability.find((entry) => entry.personId === P.jonas);
  check('Uwe: sees that Jonas is out', out?.status === 'out');
  check('Uwe: does not see why', out?.reason === null, out);
  check('Uwe: no load entries', db().loadEntries.length === 0);
  check('Uwe: no traffic light yet', db().loadSummaries.length === 0);
  data.updateSession(FUTURE, { title: 'Umbenannt von Uwe' });
  await data.flushRemote();
  check('Uwe: renaming a session is refused with a message', store.getStatus().rejected?.includes('sessions') === true, store.getStatus().rejected);
  check('… and the app shows the server state again', db().sessions.find((session) => session.id === FUTURE)?.title === 'Training');
  check('… and the server is unchanged', (await count("select 1 from sessions where title = 'Umbenannt von Uwe'")) === 0);

  // --- Martin gives Team Manager the traffic light ----------------------------
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

  // --- Team without load (piece 3.5) ---------------------------------------
  await pool.query(`update public.teams set features = '{}' where id = $1`, [TEAM]);
  store = await actAs(U.martin);
  check('no load: the app knows the team has no load', !data.teamHasFeature(db(), TEAM, 'load'));
  check('… Martin keeps his other rights but no load rights',
    data.coachPermissions(db(), P.martin, TEAM).has('manageStaff') && !data.coachPermissions(db(), P.martin, TEAM).has('viewLoadSummary'));
  check('… and receives no traffic lights or entries', db().loadSummaries.length === 0 && db().loadEntries.length === 0, db().loadSummaries);
  store = await actAs(U.jonas);
  check('no load: Jonas does not track load', !data.athleteHasLoad(db(), P.jonas));
  let loadRefused = '';
  try {
    data.recordLoadEntry({ personId: P.jonas, sessionId: null, teamId: null, date: new Date().toISOString().slice(0, 10), title: 'Laufen', trainingType: 'team_training', rpe: 5, durationMinutes: 30 });
  } catch (error) {
    loadRefused = error instanceof Error ? error.message : String(error);
  }
  check('… recording load is refused in the app', loadRefused.includes('does not track'), loadRefused);
  const entriesBefore = await count('select 1 from load_entries where person_id = $1', [P.jonas]);
  data.mutate((draft) => {
    draft.loadEntries.push({ ...draft.loadEntries.find((entry) => entry.personId === P.jonas)!, id: data.newId(), date: new Date().toISOString().slice(0, 10) });
  });
  await data.flushRemote();
  check('… and by the server, with a message', (await count('select 1 from load_entries where person_id = $1', [P.jonas])) === entriesBefore && store.getStatus().rejected !== null, store.getStatus());
  await pool.query(`update public.teams set features = array['load'] where id = $1`, [TEAM]);
  store = await actAs(U.martin);
  check('load back on: Martin sees the traffic lights again', db().loadSummaries.length > 0);

  // --- Access: join code and invitation -----------------------------------
  store = await actAs(U.martin);
  const code = data.rotateJoinCode(TEAM);
  await data.flushRemote();
  check('Martin: new join code on the server', (await count('select 1 from team_join_codes where code = $1', [code])) === 1, store.getStatus().rejected);
  const token = data.createStaffInvite(lea, TEAM);
  await data.flushRemote();
  check('Martin: invitation for Lea on the server', (await count('select 1 from staff_invites where token = $1', [token])) === 1, store.getStatus().rejected);
  check('… and listed as open', data.openInviteFor(db(), lea, TEAM)?.token === token);
  let refusedInvite = false;
  try {
    data.createStaffInvite(P.uwe, TEAM);
  } catch {
    refusedInvite = true;
  }
  check('Martin: no invitation for Uwe, who has an account', refusedInvite);

  store = await actAs(U.mia);
  check('Mia (new account): not linked yet', store.getStatus().phase === 'unlinked', store.getStatus());
  let wrongCode = '';
  try {
    await data.joinTeamWithCode('WRONG234', 'Mia', 'Neu');
  } catch (error) {
    wrongCode = error instanceof Error ? error.message : String(error);
  }
  check('Mia: a wrong code is refused with a clear message', wrongCode.includes('does not exist'), wrongCode);
  await data.joinTeamWithCode(code.toLowerCase(), 'Mia', 'Neu');
  check('Mia: joined, now an athlete of U16', store.getStatus().phase === 'ready' && db().activeIdentity?.role === 'athlete', store.getStatus());
  check('Mia: sees the team sessions', data.sessionsForTeam(db(), TEAM).length > 0);
  const mia = data.getActivePerson(db())!.id;

  // --- Mia joined the wrong team: removing a player (Run 11d) -------------
  store = await actAs(U.martin);
  data.mutate((draft) => { draft.playerGroupMembers.push({ groupId: group.id, personId: mia }); });
  await data.flushRemote();
  check('Martin: Mia is in the group', (await count('select 1 from player_group_members where person_id = $1', [mia])) === 1, store.getStatus().rejected);

  store = await actAs(U.uwe);
  data.removeAthleteFromTeam(TEAM, mia);
  await data.flushRemote();
  check('Uwe (no manageStaff): removing Mia is refused with a message', store.getStatus().rejected !== null, store.getStatus());
  check('… and Mia is still in the team', (await count("select 1 from memberships where person_id = $1 and role = 'athlete'", [mia])) === 1);

  store = await actAs(U.martin);
  data.removeAthleteFromTeam(TEAM, mia);
  await data.flushRemote();
  check('Martin: Mia removed from U16', (await count("select 1 from memberships where person_id = $1", [mia])) === 0, store.getStatus().rejected);
  check('… and from its group', (await count('select 1 from player_group_members where person_id = $1', [mia])) === 0);
  check('… Mia herself stays', (await count('select 1 from people where id = $1', [mia])) === 1);
  check('… not reported as refused', store.getStatus().rejected === null, store.getStatus().rejected);
  check('… and the roster no longer shows her', !data.athletesForTeam(db(), TEAM).some((person) => person.id === mia));

  store = await actAs(U.mia);
  check('Mia: signed in, but not in a team any more', store.getStatus().phase === 'unlinked', store.getStatus());

  store = await actAs(U.newCoach);
  check('new coach account: not linked yet', store.getStatus().phase === 'unlinked');
  await data.acceptStaffInvite(token);
  const me = data.getActivePerson(db());
  check('new coach: is Lea Sommer now, as coach', me?.id === lea && db().activeIdentity?.role === 'coach', me);
  check('… with Team Manager rights (roster, attendance, traffic light)', [...data.coachPermissions(db(), lea, TEAM)].sort().join() === 'viewAttendance,viewLoadSummary,viewRoster');
  let reused = '';
  try {
    await data.acceptStaffInvite(token);
  } catch (error) {
    reused = error instanceof Error ? error.message : String(error);
  }
  check('the invitation works only once', reused.includes('no longer valid'), reused);

  // --- Founding a club and running it (piece 8a) ---------------------------
  const foundingCode = (await pool.query(`select app.create_founding_code('e2e') as code`)).rows[0].code as string;
  store = await actAs(U.founder);
  check('founder: signed in, no club yet', store.getStatus().phase === 'unlinked');
  await data.foundClub({ code: foundingCode, clubName: 'SV Neu', city: 'Köln', firstName: 'Frida', lastName: 'Founder', departmentName: 'Handball', teamName: 'A-Jugend', coachTeam: true });
  const frida = data.getActivePerson(db());
  check('founder: club founded, she is its admin and Head Coach of the first team',
    db().club.name === 'SV Neu' && data.isClubAdmin(db(), frida?.id ?? null) && db().activeIdentity?.role === 'coach', { club: db().club, identity: db().activeIdentity });
  check('… the first team has its roles and join code', db().coachRoles.length === 4 && db().joinCodes.length === 1);
  const handball = db().departments[0].id;
  const tennis = data.createDepartment('Tennis');
  await data.flushRemote();
  check('admin: department created on the server', (await count('select 1 from departments where id = $1', [tennis])) === 1, store.getStatus().rejected);
  const damen = data.createTeam(tennis, 'Damen 1');
  await data.flushRemote();
  check('admin: team created, the server added roles and a join code',
    db().coachRoles.filter((role) => role.teamId === damen).length === 4 && data.joinCodeFor(db(), damen) !== null, store.getStatus().rejected);
  check('admin: management rights in Damen 1, no player data',
    data.coachPermissions(db(), frida!.id, damen).has('manageStaff') && !data.coachPermissions(db(), frida!.id, damen).has('viewRoster'));
  data.renameTeam(damen, 'Damen I');
  data.setTeamArchived(damen, true);
  await data.flushRemote();
  check('admin: renamed and archived on the server', (await count("select 1 from teams where id = $1 and name = 'Damen I' and archived_at is not null", [damen])) === 1, store.getStatus().rejected);
  check('… and archived teams leave the lists', !data.activeTeams(db()).some((team) => team.id === damen));
  const leadRole = data.addClubRolePerson({ firstName: 'Lars', lastName: 'Lead', role: 'department_lead', departmentId: handball });
  await data.flushRemote();
  const leadToken = data.createClubRoleInvite(leadRole);
  await data.flushRemote();
  check('admin: Lars added as Handball lead and invited', (await count('select 1 from club_role_invites where token = $1', [leadToken])) === 1, store.getStatus().rejected);
  const preview = (await pool.query('select * from public.invite_preview($1)', [leadToken])).rows[0];
  check('… the link says what it is for', preview?.role_name === 'Department lead' && preview?.team_name === 'Handball', preview);
  check('… no refusals', store.getStatus().rejected === null, store.getStatus().rejected);
  store = await actAs(U.lead);
  await data.acceptStaffInvite(leadToken);
  check('lead: accepted, his account now holds the Handball lead role',
    (await count("select 1 from club_roles cr join people p on p.id = cr.person_id where p.user_id = $1 and cr.role = 'department_lead'", [U.lead])) === 1);
  // Piece 8b: a club role without a team is an identity of its own.
  check('lead: loaded as "club" (no team), not as unlinked',
    store.getStatus().phase === 'ready' && db().activeIdentity?.role === 'club' && data.clubRoleLabel(db(), db().activeIdentity!.personId) === 'Department lead · Handball',
    { status: store.getStatus(), identity: db().activeIdentity });
  check('… he sees the Handball teams, not the others', data.managedDepartmentIds(db(), db().activeIdentity!.personId).length === 1);
  // Piece 8c: the lead runs his department from the club area.
  const u14 = data.createTeam(handball, 'U14');
  await data.flushRemote();
  check('lead: created U14 in Handball, with roles and join code',
    (await count('select 1 from teams where id = $1', [u14])) === 1 && data.joinCodeFor(db(), u14) !== null, store.getStatus().rejected);
  const headCoachRole = db().coachRoles.find((role) => role.teamId === u14 && role.locked)!;
  const hanna = data.addStaffMember(u14, 'Hanna', 'Head', headCoachRole.id);
  await data.flushRemote();
  const hannaToken = data.createStaffInvite(hanna, u14);
  await data.flushRemote();
  check('lead: added Hanna as Head Coach of U14 and invited her',
    (await count("select 1 from memberships where person_id = $1 and team_id = $2 and role = 'coach'", [hanna, u14])) === 1
      && (await count('select 1 from staff_invites where token = $1', [hannaToken])) === 1, store.getStatus().rejected);
  const nordHall = data.createFacility({ name: 'Sporthalle Nord', address: 'Nordstr. 1, Köln', departmentIds: [handball] });
  await data.flushRemote();
  check('lead: created a hall for Handball', (await count('select 1 from department_facilities where facility_id = $1', [nordHall])) === 1, store.getStatus().rejected);
  check('… no refusals', store.getStatus().rejected === null, store.getStatus().rejected);
  const teamsBefore = await count('select 1 from teams');
  try {
    data.createTeam(tennis, 'Herren 1');
  } catch {
    // Refused locally is fine too; the server must refuse it in any case.
  }
  await data.flushRemote();
  check('lead: cannot create a team in Tennis', (await count('select 1 from teams')) === teamsBefore && store.getStatus().rejected !== null, store.getStatus());
  data.dismissRejectedChange();
  store = await actAs(U.founder);
  check('founder: can switch to her club role', data.hasIdentityRole(db(), frida!.id, 'club') && data.hasIdentityRole(db(), frida!.id, 'coach'));
  data.setActiveIdentity({ role: 'club', personId: frida!.id });
  check('… and acts as club admin', db().activeIdentity?.role === 'club');

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
