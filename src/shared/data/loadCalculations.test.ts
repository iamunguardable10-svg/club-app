/**
 * Checks for the load maths (piece 9). Run: npm run test:load
 *
 * Each case states what the numbers must be by definition, e.g. an athlete
 * with the same week every week has a ratio of exactly 1.0.
 */

import assert from 'node:assert/strict';

import { BASELINE_DAYS, calculateACWR, getLatestACWR, loadRoom, loadZone, projectFutureACWR, summarizeLoadEntries, todayISO } from './loadCalculations';
import type { AthleteLoadEntry, AthletePendingSession, LoadTrainingType } from './loadTypes';

let failures = 0;
function check(label: string, run: () => void) {
  try {
    run();
    console.log(`ok  ${label}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const today = new Date(`${todayISO()}T00:00:00`);
function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function day(offset: number) {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return date;
}
let nextId = 0;
function entry(offset: number, load: number, type: LoadTrainingType = 'team_training', sessionId: string | null = null): AthleteLoadEntry {
  nextId += 1;
  return {
    id: `e${nextId}`, sessionId, teamId: sessionId ? 't' : null, date: iso(day(offset)), title: type, trainingType: type,
    rpe: type === 'game' ? 10 : 5, durationMinutes: Math.round(load / (type === 'game' ? 10 : 5)), load,
    source: sessionId ? 'planned_session' : 'manual',
  };
}
function session(offset: number, type: LoadTrainingType = 'team_training', minutes = 90, source: AthletePendingSession['source'] = 'team_session'): AthletePendingSession {
  const date = iso(day(offset));
  const start = new Date(`${date}T18:00:00`);
  return {
    id: `s${offset}-${type}`, title: type, teamId: 't', teamName: 'U', date, startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + minutes * 60_000).toISOString(), trainingType: type, source,
  };
}
/** Three sessions a week (same weekdays), `weeks` weeks back, ending yesterday or earlier. */
function steadyWeeks(weeks: number, load = 500, until = -1) {
  const out: AthleteLoadEntry[] = [];
  for (let offset = -weeks * 7; offset <= until; offset += 1) {
    if ([1, 3, 5].includes(day(offset).getDay())) out.push(entry(offset, load, 'team_training', `team-${offset}`));
  }
  return out;
}

check('steady weekly rhythm: over each week the ratio averages 1.0 (EWMA swings within the week)', () => {
  const series = calculateACWR(steadyWeeks(10, 500, 0));
  const full = series.filter((point) => point.chronicFull).slice(-28);
  const mean = full.reduce((sum, point) => sum + (point.acwr ?? 0), 0) / full.length;
  assert.ok(mean > 0.97 && mean < 1.03, `mean ${mean.toFixed(3)}`);
});

check(`the baseline is full after ${BASELINE_DAYS} days, not before`, () => {
  const series = calculateACWR([entry(-60, 300), entry(0, 300)]);
  assert.equal(series[BASELINE_DAYS - 2].chronicFull, false);
  assert.equal(series[BASELINE_DAYS - 1].chronicFull, true);
});

check('EWMA starts from the mean, not the first day: day 28 already matches the settled weeks', () => {
  // Same weekday eight weeks later, when the start no longer matters. (The
  // ratio moves within the week – lowest after the two rest days – so the
  // comparison is with the same weekday, whatever weekday today is.)
  const series = calculateACWR(steadyWeeks(13));
  const day28 = series[BASELINE_DAYS - 1];
  const settled = series[BASELINE_DAYS - 1 + 56];
  assert.ok(Math.abs((day28.acwr ?? 0) - (settled.acwr ?? 0)) < 0.05, `day 28: ${day28.acwr}, same weekday settled: ${settled.acwr}`);
  const firstWeeks = series.slice(BASELINE_DAYS - 1, BASELINE_DAYS + 13).map((point) => point.acwr ?? 0);
  const mean = firstWeeks.reduce((a, b) => a + b, 0) / firstWeeks.length;
  assert.ok(mean > 0.95 && mean < 1.05, `mean over days 28–41: ${mean.toFixed(3)}`);
});

check('doubling the load for 9 days is flagged "High"', () => {
  const base = steadyWeeks(6, 500, -10);
  const hard = [-9, -8, -7, -6, -5, -4, -3, -2, -1, 0].filter((offset) => [1, 3, 5].includes(day(offset).getDay())).map((offset) => entry(offset, 1000));
  const series = calculateACWR([...base, ...hard]).slice(-7);
  assert.ok(series.some((point) => loadZone(point.acwr, point.chronicFull).label === 'High'), series.map((p) => p.acwr).join(' '));
});

check('a week off ends up "Low"', () => {
  const latest = getLatestACWR(steadyWeeks(8, 500, -8))!;
  assert.ok((latest.acwr ?? 1) < 0.8, `ratio ${latest.acwr}`);
  assert.equal(loadZone(latest.acwr, latest.chronicFull).label, 'Low');
});

check('load room: adding exactly "room to high" today lands on 1.30', () => {
  const entries = steadyWeeks(8, 500, -1);
  const room = loadRoom(entries)!;
  assert.ok(room.toHigh > 0);
  const after = getLatestACWR([...entries, entry(0, room.toHigh, 'strength')])!;
  assert.ok(Math.abs((after.acwr ?? 0) - 1.3) <= 0.01, `after: ${after.acwr}`);
});

check('load room counts what is already logged today', () => {
  const entries = steadyWeeks(8, 500, -1);
  const before = loadRoom(entries)!;
  const after = loadRoom([...entries, entry(0, 100, 'strength')])!;
  assert.equal(after.toHigh, before.toHigh - 100);
});

check('summary for coaches = the athlete\'s own traffic light', () => {
  const entries = steadyWeeks(8, 500, 0);
  assert.deepEqual(summarizeLoadEntries(entries), { acwr: getLatestACWR(entries)!.acwr, chronicFull: true });
});

check('forecast: a game is estimated from past games (minutes played), not RPE 10 × the whole slot', () => {
  const games = [-21, -14, -7].flatMap((offset) => [entry(offset, 400, 'game', `game${offset}`), { ...entry(offset, 60, 'warmup', `game${offset}`), rpe: 3, durationMinutes: 20 }]);
  const planned = [session(2, 'game', 120)];
  const point = projectFutureACWR([...steadyWeeks(6), ...games], planned, 3).find((p) => p.date === iso(day(2)))!;
  assert.equal(point.plannedLoads?.game, 460);
});

check('forecast: within the planned calendar a day without a session has no team load', () => {
  const entries = steadyWeeks(8);
  const planned = [session(10)]; // calendar known for 10 days, only one session
  const points = projectFutureACWR(entries, planned, 10);
  const invented = points.filter((p) => p.date > todayISO() && p.date < iso(day(10)) && p.totalLoad > 0);
  assert.equal(invented.length, 0, `invented load on ${invented.map((p) => p.date).join(', ')}`);
});

check('forecast: beyond the planned calendar the usual weekday rhythm continues', () => {
  const entries = steadyWeeks(8);
  const points = projectFutureACWR(entries, [], 14);
  const trainingDays = points.filter((p) => p.date > todayISO() && [1, 3, 5].includes(new Date(`${p.date}T00:00:00`).getDay()));
  assert.ok(trainingDays.every((p) => p.totalLoad > 0), 'rhythm days empty');
  assert.ok(points.filter((p) => ![1, 3, 5].includes(new Date(`${p.date}T00:00:00`).getDay())).every((p) => p.totalLoad === 0), 'rest days filled');
});

check('forecast today: what is logged plus what is still planned', () => {
  const entries = [...steadyWeeks(6), entry(0, 200, 'strength')];
  const point = projectFutureACWR(entries, [session(0, 'team_training', 90)], 1).find((p) => p.date === todayISO())!;
  assert.equal(point.totalLoad, 200 + 5 * 90);
});

check('forecast: a session from yesterday that is not rated yet still counts', () => {
  const entries = steadyWeeks(6, 500, -2);
  const without = projectFutureACWR(entries, [], 1)[0];
  const withUnrated = projectFutureACWR(entries, [session(-1, 'team_training', 100)], 1)[0];
  assert.ok((withUnrated.acuteLoad ?? 0) > (without.acuteLoad ?? 0), `${withUnrated.acuteLoad} vs ${without.acuteLoad}`);
});

console.log(failures === 0 ? 'all load maths checks passed' : `${failures} load maths check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
