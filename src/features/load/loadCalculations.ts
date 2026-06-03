import type { ACWRDataPoint, AthleteLoadEntry, AthletePendingSession, DayLoad, LoadTrainingType } from './loadTypes';

type ACWRMethod = 'rolling' | 'ewma';

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

function rollingAverage(loads: number[], index: number, window: number) {
  const start = Math.max(0, index - window + 1);
  const slice = loads.slice(start, index + 1);
  return slice.length ? slice.reduce((sum, value) => sum + value, 0) / slice.length : 0;
}

function ewmaAt(loads: number[], index: number) {
  const lambdaAcute = 2 / (7 + 1);
  const lambdaChronic = 2 / (28 + 1);
  let acute = loads[0] ?? 0;
  let chronic = loads[0] ?? 0;

  for (let cursor = 1; cursor <= index; cursor += 1) {
    acute = lambdaAcute * loads[cursor] + (1 - lambdaAcute) * acute;
    chronic = lambdaChronic * loads[cursor] + (1 - lambdaChronic) * chronic;
  }

  return { acute, chronic };
}

function trendAt(loads: number[], index: number, method: ACWRMethod) {
  if (method === 'ewma') return ewmaAt(loads, index);
  return {
    acute: rollingAverage(loads, index, 7),
    chronic: rollingAverage(loads, index, 28),
  };
}

function acwrRatio(index: number, acute: number, chronic: number) {
  return index >= 7 && acute > 0 && chronic > 0 ? acute / chronic : null;
}

function roundNullableRatio(value: number | null) {
  return value === null ? null : Math.round(value * 100) / 100;
}

function weeklyLoadStability(loads: number[], index: number) {
  if (index < 6) return { monotony: null, strain: null };
  const slice = loads.slice(index - 6, index + 1);
  const total = slice.reduce((sum, value) => sum + value, 0);
  const mean = total / slice.length;
  const variance = slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / slice.length;
  const standardDeviation = Math.sqrt(variance);
  if (total <= 0 || standardDeviation <= 0) return { monotony: null, strain: null };
  const monotony = mean / standardDeviation;
  return {
    monotony: roundNullableRatio(monotony),
    strain: Math.round(total * monotony),
  };
}

export function baselineAgeDays(entries: AthleteLoadEntry[]) {
  const days = fillMissingDays(aggregateDailyLoads(entries));
  return days.length;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sessionDurationMinutes(session: AthletePendingSession) {
  if (session.expectedDurationMinutes) return session.expectedDurationMinutes;
  if (!session.endsAt) return 90;
  return Math.max(30, Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60_000));
}

export function calculateACWR(entries: AthleteLoadEntry[]): ACWRDataPoint[] {
  const days = fillMissingDays(aggregateDailyLoads(entries));
  const loads = days.map((day) => day.totalLoad);

  return days.map((day, index) => {
    const { acute, chronic } = trendAt(loads, index, 'rolling');
    const acwr = acwrRatio(index, acute, chronic);
    const stability = weeklyLoadStability(loads, index);

    return {
      date: day.date,
      totalLoad: day.totalLoad,
      acuteLoad: Math.round(acute),
      chronicLoad: Math.round(chronic),
      acwr: roundNullableRatio(acwr),
      monotony: stability.monotony,
      strain: stability.strain,
      chronicFull: index >= 27,
    };
  });
}

export function calculateEWMA(entries: AthleteLoadEntry[]): ACWRDataPoint[] {
  const days = fillMissingDays(aggregateDailyLoads(entries));
  if (days.length === 0) return [];

  const loads = days.map((day) => day.totalLoad);

  return days.map((day, index) => {
    const { acute, chronic } = trendAt(loads, index, 'ewma');
    const acwr = acwrRatio(index, acute, chronic);
    const stability = weeklyLoadStability(loads, index);
    return {
      date: day.date,
      totalLoad: day.totalLoad,
      acuteLoad: Math.round(acute),
      chronicLoad: Math.round(chronic),
      acwr: roundNullableRatio(acwr),
      monotony: stability.monotony,
      strain: stability.strain,
      chronicFull: index >= 27,
    };
  });
}

export function projectFutureACWR(entries: AthleteLoadEntry[], plannedSessions: AthletePendingSession[], daysAhead = 14, method: ACWRMethod = 'rolling'): ACWRDataPoint[] {
  const today = todayISO();
  const historicalDays = fillMissingDays(aggregateDailyLoads(entries), 84);
  if (historicalDays.length === 0) return [];

  const end = addDays(new Date(`${today}T00:00:00`), daysAhead);
  const endISO = localISO(end);
  const plannedByDate = new Map<string, AthletePendingSession[]>();
  for (const session of plannedSessions) {
    if (session.date < today || session.date > endISO) continue;
    plannedByDate.set(session.date, [...(plannedByDate.get(session.date) ?? []), session]);
  }

  const rpeByType = new Map<LoadTrainingType, number[]>();
  const durationByType = new Map<LoadTrainingType, number[]>();
  for (const entry of entries) {
    rpeByType.set(entry.trainingType, [...(rpeByType.get(entry.trainingType) ?? []), entry.rpe]);
    durationByType.set(entry.trainingType, [...(durationByType.get(entry.trainingType) ?? []), entry.durationMinutes]);
  }

  const recentHistory = historicalDays.slice(-84);
  const loadsByWeekday: number[][] = [[], [], [], [], [], [], []];
  for (const day of recentHistory) {
    const weekday = new Date(`${day.date}T00:00:00`).getDay();
    loadsByWeekday[weekday].push(day.totalLoad);
  }

  const extLoads = historicalDays.map((day) => day.totalLoad);
  const recent7 = extLoads.slice(-7);
  const recent7Mean = recent7.length ? recent7.reduce((sum, load) => sum + load, 0) / recent7.length : 0;
  const activeDays = historicalDays.filter((day) => day.totalLoad > 0);
  const meanActiveLoad = activeDays.length ? activeDays.reduce((sum, day) => sum + day.totalLoad, 0) / activeDays.length : 0;
  const firstActive = activeDays[0]?.date ?? today;
  const lastActive = activeDays[activeDays.length - 1]?.date ?? today;
  const activeSpanDays = Math.max(1, (new Date(`${lastActive}T00:00:00`).getTime() - new Date(`${firstActive}T00:00:00`).getTime()) / 86_400_000 + 1);
  const frequencyBasedDailyLoad = meanActiveLoad * (activeDays.length / activeSpanDays);
  const projected: ACWRDataPoint[] = [];
  const cursor = new Date(`${today}T00:00:00`);

  while (localISO(cursor) <= endISO) {
    const date = localISO(cursor);
    const weekday = cursor.getDay();
    const weekdayLoads = loadsByWeekday[weekday];
    const planned = plannedByDate.get(date) ?? [];
    const plannedLoads: Partial<Record<LoadTrainingType, number>> = {};
    let predictedLoad = 0;
    let forecastBasis = 'Rest pattern';

    if (planned.length > 0) {
      for (const session of planned) {
        const rpe = session.expectedRpe ?? (median(rpeByType.get(session.trainingType) ?? []) || 6);
        const duration = sessionDurationMinutes(session) || median(durationByType.get(session.trainingType) ?? []) || 90;
        const load = Math.round(rpe * duration);
        predictedLoad += load;
        plannedLoads[session.trainingType] = (plannedLoads[session.trainingType] ?? 0) + load;
      }
      forecastBasis = 'Planned sessions';
    } else {
      const offDayFraction = weekdayLoads.length ? weekdayLoads.filter((load) => load === 0).length / weekdayLoads.length : 0;
      if (offDayFraction >= 0.75) {
        predictedLoad = 0;
        forecastBasis = 'Rest pattern';
      } else {
        const weekdayMedian = median(weekdayLoads);
        const recentSameWeekdayMedian = median(weekdayLoads.slice(-4));
        const patternLoad = Math.round(0.5 * weekdayMedian + 0.3 * recentSameWeekdayMedian + 0.2 * recent7Mean);
        predictedLoad = patternLoad > 0 ? patternLoad : Math.round(frequencyBasedDailyLoad * 0.6);
        forecastBasis = patternLoad > 0 ? 'Weekday pattern' : predictedLoad > 0 ? 'Training frequency' : 'Rest pattern';
      }
    }

    const historicalIndex = historicalDays.findIndex((day) => day.date === date);
    if (historicalIndex >= 0) {
      extLoads[historicalIndex] = Math.max(extLoads[historicalIndex], predictedLoad);
    } else {
      extLoads.push(predictedLoad);
    }
    const index = historicalIndex >= 0 ? historicalIndex : extLoads.length - 1;
    const { acute, chronic } = trendAt(extLoads, index, method);
    const acwr = acwrRatio(index, acute, chronic);

    projected.push({
      date,
      totalLoad: predictedLoad,
      acuteLoad: Math.round(acute),
      chronicLoad: Math.round(chronic),
      acwr: roundNullableRatio(acwr),
      monotony: null,
      strain: null,
      chronicFull: index >= 27,
      isProjected: true,
      forecastBasis,
      plannedLoads,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return projected;
}

export function getLatestACWR(entries: AthleteLoadEntry[], method: ACWRMethod = 'rolling') {
  const series = method === 'ewma' ? calculateEWMA(entries) : calculateACWR(entries);
  const points = series.filter((point) => point.acwr !== null);
  return points[points.length - 1] ?? null;
}

export function loadZone(acwr: number | null, chronicFull = false) {
  if (acwr === null || !chronicFull) return { label: 'Baseline', tone: 'neutral' as const };
  if (acwr < 0.8) return { label: 'Low', tone: 'low' as const };
  if (acwr <= 1.3) return { label: 'Ready', tone: 'ready' as const };
  return { label: 'High', tone: 'high' as const };
}

export function sevenDayLoad(entries: AthleteLoadEntry[]) {
  const today = new Date(`${todayISO()}T00:00:00`);
  const start = addDays(today, -6);
  return entries.reduce((sum, entry) => {
    const date = new Date(`${entry.date}T00:00:00`);
    return date >= start && date <= today ? sum + entry.load : sum;
  }, 0);
}

export function formatLoadDate(date: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(`${date}T00:00:00`));
}
