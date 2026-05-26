import type { ACWRDataPoint, AthleteLoadEntry, DayLoad } from './loadTypes';

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
  const defaultStart = addDays(today, -trailingDays + 1);
  const first = days[0]?.date ? new Date(`${days[0].date}T00:00:00`) : defaultStart;
  const start = first < defaultStart ? first : defaultStart;
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

export function calculateACWR(entries: AthleteLoadEntry[]): ACWRDataPoint[] {
  const days = fillMissingDays(aggregateDailyLoads(entries));
  const loads = days.map((day) => day.totalLoad);

  return days.map((day, index) => {
    const acute = rollingAverage(loads, index, 7);
    const chronic = rollingAverage(loads, index, 28);
    const acwr = index >= 7 && acute > 0 && chronic > 0 ? acute / chronic : null;

    return {
      date: day.date,
      totalLoad: day.totalLoad,
      acuteLoad: Math.round(acute),
      chronicLoad: Math.round(chronic),
      acwr: acwr === null ? null : Math.round(acwr * 100) / 100,
      chronicFull: index >= 27,
    };
  });
}

export function getLatestACWR(entries: AthleteLoadEntry[]) {
  const points = calculateACWR(entries).filter((point) => point.acwr !== null);
  return points[points.length - 1] ?? null;
}

export function loadZone(acwr: number | null) {
  if (acwr === null) return { label: 'Learning', tone: 'neutral' as const };
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
