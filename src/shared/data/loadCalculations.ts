/**
 * Training load maths: acute:chronic workload ratio (ACWR), monotony and
 * strain, the 14-day forecast and how much load is left today.
 *
 * One ratio everywhere: the **EWMA ACWR** (Williams et al. 2017, λ = 2/(N+1),
 * N = 7 and 28). Checked against the literature on 2026-09-25 (piece 9):
 * EWMA is the more sensitive indicator of injury likelihood than rolling
 * averages (Murray et al. 2017; meta-analysis 2025), and whether acute and
 * chronic share days makes little practical difference. Coaches see one
 * number, not two.
 *
 * Fixed in piece 9: the EWMA started from the first training day's load,
 * which kept the chronic value weeks too high (a steady athlete showed 0.78
 * "Low" on the day the light switched on). It now starts from the mean daily
 * load of the first 7 and 28 days.
 *
 * Session load is RPE × minutes (Foster's session-RPE). Every view reads the
 * numbers from here; nothing else computes a ratio.
 */

import type { ACWRDataPoint, AthleteLoadEntry, AthletePendingSession, DayLoad, LoadTrainingType } from './loadTypes';
import { ACWR_ZONES } from './loadTypes';

const ACUTE_DAYS = 7;
const CHRONIC_DAYS = 28;
const LAMBDA_ACUTE = 2 / (ACUTE_DAYS + 1);
const LAMBDA_CHRONIC = 2 / (CHRONIC_DAYS + 1);
/** Days of history before the chronic value is trusted (the light shows "Baseline" until then). */
export const BASELINE_DAYS = CHRONIC_DAYS;

function localISO(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function todayISO() {
  return localISO(new Date());
}

export function aggregateDailyLoads(entries: AthleteLoadEntry[]): DayLoad[] {
  const map = new Map<string, DayLoad>();

  for (const entry of entries) {
    if (!map.has(entry.date)) {
      map.set(entry.date, { date: entry.date, loads: {}, totalLoad: 0 });
    }
    const day = map.get(entry.date)!;
    day.loads[entry.trainingType] = (day.loads[entry.trainingType] ?? 0) + entry.load;
    day.totalLoad += entry.load;
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Every day from the first entry to today (or the last entry, if later), days without load as 0. */
export function fillMissingDays(days: DayLoad[], trailingDays = 42): DayLoad[] {
  const today = new Date(`${todayISO()}T00:00:00`);
  const start = days[0]?.date ? new Date(`${days[0].date}T00:00:00`) : addDays(today, -trailingDays + 1);
  const lastLoadDate = days[days.length - 1]?.date;
  const last = lastLoadDate && lastLoadDate > todayISO() ? new Date(`${lastLoadDate}T00:00:00`) : today;
  const byDate = new Map(days.map((day) => [day.date, day]));
  const result: DayLoad[] = [];

  for (let cursor = new Date(start); cursor <= last; cursor = addDays(cursor, 1)) {
    const key = localISO(cursor);
    result.push(byDate.get(key) ?? { date: key, loads: {}, totalLoad: 0 });
  }

  return result;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function roundRatio(value: number | null) {
  return value === null ? null : Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// The ratio, over a series of daily loads (index 0 = first day)
// ---------------------------------------------------------------------------

type Trend = { acute: number; chronic: number; ratio: number | null; full: boolean };

/** EWMA, started from the mean daily load of the first 7 / 28 days. */
function ewmaSeries(loads: number[]): Trend[] {
  if (loads.length === 0) return [];
  let acute = mean(loads.slice(0, ACUTE_DAYS));
  let chronic = mean(loads.slice(0, CHRONIC_DAYS));
  return loads.map((load, index) => {
    acute = LAMBDA_ACUTE * load + (1 - LAMBDA_ACUTE) * acute;
    chronic = LAMBDA_CHRONIC * load + (1 - LAMBDA_CHRONIC) * chronic;
    return { acute, chronic, ratio: index >= ACUTE_DAYS && chronic > 0 ? acute / chronic : null, full: index >= BASELINE_DAYS - 1 };
  });
}

/** Monotony (mean / SD of the last 7 days) and strain (weekly load × monotony), Foster 1998. */
function weeklyLoadStability(loads: number[], index: number) {
  if (index < 6) return { monotony: null, strain: null };
  const slice = loads.slice(index - 6, index + 1);
  const total = sum(slice);
  const average = total / slice.length;
  const standardDeviation = Math.sqrt(slice.reduce((acc, value) => acc + (value - average) ** 2, 0) / slice.length);
  if (total <= 0 || standardDeviation <= 0) return { monotony: null, strain: null };
  const monotony = average / standardDeviation;
  return { monotony: roundRatio(monotony), strain: Math.round(total * monotony) };
}

function buildSeries(days: DayLoad[]): ACWRDataPoint[] {
  const loads = days.map((day) => day.totalLoad);
  const trends = ewmaSeries(loads);
  return days.map((day, index) => {
    const trend = trends[index];
    const stability = weeklyLoadStability(loads, index);
    return {
      date: day.date,
      totalLoad: day.totalLoad,
      acuteLoad: Math.round(trend.acute),
      chronicLoad: Math.round(trend.chronic),
      acwr: roundRatio(trend.ratio),
      monotony: stability.monotony,
      strain: stability.strain,
      chronicFull: trend.full,
    };
  });
}

export function baselineAgeDays(entries: AthleteLoadEntry[]) {
  return fillMissingDays(aggregateDailyLoads(entries)).length;
}

/** The ratio series, one point per day from the first entry to today. */
export function calculateACWR(entries: AthleteLoadEntry[]): ACWRDataPoint[] {
  if (entries.length === 0) return [];
  return buildSeries(fillMissingDays(aggregateDailyLoads(entries)));
}

/** Same as `calculateACWR` (kept for older imports). */
export const calculateEWMA = calculateACWR;

/** Today's point (not a later day with a future entry), or null without entries. */
export function getLatestACWR(entries: AthleteLoadEntry[]) {
  const today = todayISO();
  const upToToday = calculateACWR(entries).filter((point) => point.date <= today);
  return upToToday[upToToday.length - 1] ?? null;
}

export function loadZone(acwr: number | null, chronicFull = false) {
  if (acwr === null || !chronicFull) return { label: 'Baseline', tone: 'neutral' as const };
  if (acwr < ACWR_ZONES.low) return { label: 'Low', tone: 'low' as const };
  if (acwr <= ACWR_ZONES.high) return { label: 'Ready', tone: 'ready' as const };
  return { label: 'High', tone: 'high' as const };
}

/**
 * How much load is left today: the AU that would lift the ratio to the lower
 * edge (`toLow`) and that fit below the upper edge (`toHigh`), counting what
 * is already logged today; above the upper edge, how far the acute load is
 * over it (`overBy`, AU per day, as before). Solved exactly from yesterday's
 * EWMA values: today's load moves acute and chronic together.
 */
export function loadRoom(entries: AthleteLoadEntry[]) {
  const days = fillMissingDays(aggregateDailyLoads(entries));
  const index = days.findIndex((day) => day.date === todayISO());
  if (index < 1) return null;
  const trends = ewmaSeries(days.map((day) => day.totalLoad));
  const today = trends[index];
  const yesterday = trends[index - 1];
  if (today.ratio === null) return null;
  const loggedToday = days[index].totalLoad;
  const todayTotalFor = (ratio: number) =>
    (ratio * (1 - LAMBDA_CHRONIC) * yesterday.chronic - (1 - LAMBDA_ACUTE) * yesterday.acute) / (LAMBDA_ACUTE - ratio * LAMBDA_CHRONIC);
  return {
    toLow: Math.max(0, Math.round(todayTotalFor(ACWR_ZONES.low) - loggedToday)),
    toHigh: Math.max(0, Math.round(todayTotalFor(ACWR_ZONES.high) - loggedToday)),
    overBy: Math.max(0, Math.round(today.acute - ACWR_ZONES.high * today.chronic)),
  };
}

export function sevenDayLoad(entries: AthleteLoadEntry[]) {
  const today = new Date(`${todayISO()}T00:00:00`);
  const start = addDays(today, -6);
  return entries.reduce((total, entry) => {
    const date = new Date(`${entry.date}T00:00:00`);
    return date >= start && date <= today ? total + entry.load : total;
  }, 0);
}

export function formatLoadDate(date: string) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(`${date}T00:00:00`));
}

/**
 * The traffic-light inputs for one athlete: today's ratio and whether the
 * chronic window is full. What a summary-only coach role gets; the server
 * computes the same numbers every night (app.refresh_load_summaries).
 */
export function summarizeLoadEntries(entries: AthleteLoadEntry[]): { acwr: number | null; chronicFull: boolean } {
  const latest = getLatestACWR(entries);
  return { acwr: latest?.acwr ?? null, chronicFull: latest?.chronicFull ?? false };
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

function sessionDurationMinutes(session: AthletePendingSession) {
  if (session.expectedDurationMinutes) return session.expectedDurationMinutes;
  if (!session.endsAt) return 90;
  return Math.max(30, Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60_000));
}

/** Team sessions are logged against the session; own training is not. */
function isTeamEntry(entry: AthleteLoadEntry) {
  return entry.source === 'planned_session' && Boolean(entry.sessionId);
}

/**
 * Expected load of one planned session:
 * 1. an explicit plan (expected RPE and minutes) as given;
 * 2. a game: the athlete's typical game load (warmup included), because only
 *    the minutes played count and a game slot is much longer;
 * 3. otherwise the athlete's typical RPE for the type × the session's length;
 * 4. without history RPE 6 × length.
 */
function sessionEstimator(entries: AthleteLoadEntry[]) {
  const rpeByType = new Map<LoadTrainingType, number[]>();
  const perSession = new Map<string, { type: LoadTrainingType; load: number }>();
  for (const entry of entries) {
    if (entry.trainingType !== 'warmup') rpeByType.set(entry.trainingType, [...(rpeByType.get(entry.trainingType) ?? []), entry.rpe]);
    const key = entry.sessionId ?? entry.id;
    const current = perSession.get(key) ?? { type: entry.trainingType, load: 0 };
    perSession.set(key, { type: entry.trainingType === 'warmup' ? current.type : entry.trainingType, load: current.load + entry.load });
  }
  const gameLoads = Array.from(perSession.values()).filter((item) => item.type === 'game').map((item) => item.load);

  return (session: AthletePendingSession) => {
    if (session.expectedRpe && session.expectedDurationMinutes) return Math.round(session.expectedRpe * session.expectedDurationMinutes);
    if (session.trainingType === 'game' && !session.expectedRpe && gameLoads.length >= 2) return Math.round(median(gameLoads));
    const rpe = session.expectedRpe ?? (median(rpeByType.get(session.trainingType) ?? []) || 6);
    return Math.round(rpe * sessionDurationMinutes(session));
  };
}

/** A weekday's usual load from the last 84 days (0 if the athlete is usually off that day). */
function weekdayPattern(history: { date: string; load: number }[]) {
  const recent = history.slice(-84);
  const byWeekday: number[][] = [[], [], [], [], [], [], []];
  for (const day of recent) byWeekday[new Date(`${day.date}T00:00:00`).getDay()].push(day.load);
  const recent7Mean = mean(recent.slice(-7).map((day) => day.load));
  return (weekday: number) => {
    const loads = byWeekday[weekday];
    if (loads.length === 0) return 0;
    if (loads.filter((load) => load === 0).length / loads.length >= 0.75) return 0;
    return Math.round(0.5 * median(loads) + 0.3 * median(loads.slice(-4)) + 0.2 * recent7Mean);
  };
}

/**
 * The next `daysAhead` days: expected daily load and the ratio it leads to.
 *
 * - Team sessions come from the calendar up to the last day that has one;
 *   within that horizon a day without a session has no team load (a
 *   cancelled or free day). Beyond it, the athlete's usual weekday rhythm.
 * - Own training: planned own sessions, otherwise the usual weekday rhythm
 *   of own training.
 * - Today: what is logged plus what is still planned (not the larger of the two).
 * - Past sessions of the last 7 days that are not rated yet count with their
 *   expected load, so a missing rating does not drag the forecast down.
 */
export function projectFutureACWR(entries: AthleteLoadEntry[], plannedSessions: AthletePendingSession[], daysAhead = 14): ACWRDataPoint[] {
  const today = todayISO();
  const historicalDays = fillMissingDays(aggregateDailyLoads(entries), 84);
  if (entries.length === 0 && plannedSessions.length === 0) return [];

  const endISO = localISO(addDays(new Date(`${today}T00:00:00`), daysAhead));
  const recentStartISO = localISO(addDays(new Date(`${today}T00:00:00`), -7));
  const estimate = sessionEstimator(entries);

  const teamByDate = new Map<string, number>();
  const ownByDate = new Map<string, number>();
  for (const entry of entries) {
    const target = isTeamEntry(entry) ? teamByDate : ownByDate;
    target.set(entry.date, (target.get(entry.date) ?? 0) + entry.load);
  }
  const teamPattern = weekdayPattern(historicalDays.map((day) => ({ date: day.date, load: teamByDate.get(day.date) ?? 0 })));
  const ownPattern = weekdayPattern(historicalDays.map((day) => ({ date: day.date, load: ownByDate.get(day.date) ?? 0 })));

  const plannedByDate = new Map<string, AthletePendingSession[]>();
  let teamHorizon = '';
  for (const session of plannedSessions) {
    if (session.date < recentStartISO || session.date > endISO) continue;
    plannedByDate.set(session.date, [...(plannedByDate.get(session.date) ?? []), session]);
    if (session.source !== 'athlete_plan' && session.date > teamHorizon) teamHorizon = session.date;
  }

  // History with unrated recent sessions filled in, then the days ahead.
  const extended = historicalDays.map((day) => ({ ...day, totalLoad: day.totalLoad }));
  const indexOf = new Map(extended.map((day, index) => [day.date, index]));
  for (const [date, sessions] of plannedByDate) {
    if (date >= today) continue;
    const index = indexOf.get(date);
    if (index === undefined) continue;
    // Own plans that were never logged are not assumed done; team sessions are.
    extended[index].totalLoad += sum(sessions.filter((session) => session.source !== 'athlete_plan').map(estimate));
  }

  const projectedMeta = new Map<string, { load: number; basis: string; planned: Partial<Record<LoadTrainingType, number>> }>();
  for (let cursor = new Date(`${today}T00:00:00`); localISO(cursor) <= endISO; cursor = addDays(cursor, 1)) {
    const date = localISO(cursor);
    const weekday = cursor.getDay();
    const planned = plannedByDate.get(date) ?? [];
    const plannedLoads: Partial<Record<LoadTrainingType, number>> = {};
    let teamPlanned = 0;
    let ownPlanned = 0;
    for (const session of planned) {
      const load = estimate(session);
      plannedLoads[session.trainingType] = (plannedLoads[session.trainingType] ?? 0) + load;
      if (session.source === 'athlete_plan') ownPlanned += load;
      else teamPlanned += load;
    }
    const hasOwnPlan = planned.some((session) => session.source === 'athlete_plan');
    const teamPart = date <= teamHorizon ? teamPlanned : Math.max(teamPlanned, teamPattern(weekday));
    const ownPart = hasOwnPlan ? ownPlanned : ownPattern(weekday);

    let load = teamPart + ownPart;
    if (date === today) {
      // Already logged today plus what is still to come (planned sessions
      // are the unrated ones); the rhythm only tops up to its usual level.
      const teamLogged = teamByDate.get(date) ?? 0;
      const ownLogged = ownByDate.get(date) ?? 0;
      const ownTopUp = hasOwnPlan ? 0 : Math.max(0, ownPattern(weekday) - ownLogged);
      const teamTopUp = date <= teamHorizon ? 0 : Math.max(0, teamPattern(weekday) - teamPlanned - teamLogged);
      load = teamLogged + ownLogged + teamPlanned + ownPlanned + ownTopUp + teamTopUp;
    }
    const basis = planned.length > 0 ? 'Planned sessions' : load > 0 ? 'Weekday pattern' : 'Rest pattern';
    projectedMeta.set(date, { load, basis, planned: plannedLoads });

    const index = indexOf.get(date);
    if (index !== undefined) extended[index].totalLoad = load;
    else {
      indexOf.set(date, extended.length);
      extended.push({ date, loads: {}, totalLoad: load });
    }
  }

  const series = buildSeries(extended);
  return series
    .filter((point) => point.date >= today && point.date <= endISO)
    .map((point) => {
      const meta = projectedMeta.get(point.date)!;
      return {
        ...point,
        totalLoad: meta.load,
        monotony: null,
        strain: null,
        isProjected: true,
        forecastBasis: meta.basis,
        plannedLoads: meta.planned,
      };
    });
}

// ---------------------------------------------------------------------------
// Load hints (2026-09-26): only what is worth saying, shown as numbers.
// ---------------------------------------------------------------------------

/**
 * From here the app shows a warning: injury risk rises clearly above an
 * ACWR of 1.5 (Gabbett 2016). 1.3–1.5 is "High" but gets no warning.
 */
export const HIGH_RISK_ACWR = 1.5;

function daysBetweenISO(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000);
}

/**
 * The ratio now and at the end of the day of the last planned session, with
 * those sessions done as estimated (same forecast as the chart). Null while
 * the baseline is still building or without planned sessions.
 */
export function acwrAfter(entries: AthleteLoadEntry[], planned: AthletePendingSession[]): { before: number; after: number; date: string } | null {
  if (planned.length === 0) return null;
  const latest = getLatestACWR(entries);
  if (!latest?.chronicFull || latest.acwr === null) return null;
  const date = planned.map((session) => session.date).sort().at(-1)!;
  const days = Math.max(0, daysBetweenISO(todayISO(), date));
  const point = projectFutureACWR(entries, planned, days).find((candidate) => candidate.date === date);
  return point?.acwr != null ? { before: latest.acwr, after: point.acwr, date } : null;
}

/** The first day in the forecast above `HIGH_RISK_ACWR`, if any. */
export function firstHighRiskDay(entries: AthleteLoadEntry[], planned: AthletePendingSession[], daysAhead = 7): { date: string; acwr: number } | null {
  const latest = getLatestACWR(entries);
  if (!latest?.chronicFull) return null;
  const today = todayISO();
  const point = projectFutureACWR(entries, planned, daysAhead).find((candidate) => candidate.date >= today && (candidate.acwr ?? 0) > HIGH_RISK_ACWR);
  return point?.acwr != null ? { date: point.date, acwr: point.acwr } : null;
}

/**
 * Load of the last 7 days (today included) against the 7 days before, in
 * percent. Null without load in the week before.
 */
export function weekChangePercent(entries: AthleteLoadEntry[]): number | null {
  const today = todayISO();
  let current = 0;
  let previous = 0;
  for (const entry of entries) {
    const age = daysBetweenISO(entry.date, today);
    if (age >= 0 && age <= 6) current += entry.load;
    else if (age >= 7 && age <= 13) previous += entry.load;
  }
  return previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
}

/**
 * Back after a break: a gap of at least `gapDays` days without load that
 * ended within the last `withinDays` days (and load before it).
 */
export function backFromBreak(entries: AthleteLoadEntry[], gapDays = 10, withinDays = 14): boolean {
  const today = todayISO();
  const dates = [...new Set(entries.map((entry) => entry.date).filter((date) => date <= today))].sort();
  for (let index = dates.length - 1; index > 0; index -= 1) {
    if (daysBetweenISO(dates[index], today) > withinDays) return false;
    if (daysBetweenISO(dates[index - 1], dates[index]) - 1 >= gapDays) return true;
  }
  return false;
}
