export type SeriesTemplate = {
  id: string;
  department: string;
  teamId?: string;
  teamName?: string;
  team: string;
  sessionType: string;
  weekday: number;
  startTime: string;
  endTime: string;
  facilityId?: string | null;
  facilityName?: string | null;
  facility?: string | null;
  groupIds?: string[];
  activeFrom?: string | null;
  activeUntil?: string | null;
};

export type SeriesWeekState = {
  seriesId: string;
  weekStart: string;
  checked?: boolean;
  committedSessionId?: string | null;
};

export type SeriesWeekItem = SeriesTemplate & {
  weekStart: string;
  date: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  checked: boolean;
  committedSessionId: string | null;
};

export type WeeklySeriesTemplate = {
  id?: string;
  sessionType?: string;
  weekday?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  [key: string]: unknown;
};
export type WeeklySeriesWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type WeeklySeriesCreatedSession = {
  id: string;
  templateId?: string;
  seriesTemplateId?: string;
  startsAt?: string;
  endsAt?: string;
};

const MIN_DURATION_MINUTES = 30;
function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function formatDateUTC(date: Date) {
  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(date.getUTCDate())}`;
}

function parseDateOnlyUTC(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  return new Date(Date.UTC(year, month - 1, day));
}

function parseDateInput(date?: Date | string) {
  if (!date) return new Date();
  if (date instanceof Date) return new Date(date.getTime());
  return parseDateOnlyUTC(date) ?? new Date(date);
}

function parseTimeToMinutes(timeHHMM: string) {
  const match = timeHHMM.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function normalizeWeekday(weekday: number) {
  if (!Number.isFinite(weekday)) return 1;
  return ((Math.trunc(weekday) % 7) + 7) % 7;
}

function stateKey(seriesId: string, weekStart: string) {
  return `${seriesId}:${weekStart}`;
}

export function getIsoWeekStart(date?: Date | string): string {
  const value = parseDateInput(date);
  if (Number.isNaN(value.getTime())) return getIsoWeekStart();

  const utc = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = utc.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + mondayOffset);

  return formatDateUTC(utc);
}

export function addWeeks(weekStart: string, delta: number): string {
  const date = parseDateOnlyUTC(getIsoWeekStart(weekStart));
  if (!date) return getIsoWeekStart();

  date.setUTCDate(date.getUTCDate() + Math.trunc(delta) * 7);
  return formatDateUTC(date);
}

export function dateForWeekday(weekStart: string, weekday: number): string {
  const monday = parseDateOnlyUTC(getIsoWeekStart(weekStart));
  if (!monday) return getIsoWeekStart();

  const normalizedWeekday = normalizeWeekday(weekday);
  const mondayBasedOffset = normalizedWeekday === 0 ? 6 : normalizedWeekday - 1;
  monday.setUTCDate(monday.getUTCDate() + mondayBasedOffset);

  return formatDateUTC(monday);
}

export function combineDateTimeToIso(dateYYYYMMDD: string, timeHHMM: string): string {
  // Coaches enter series templates in browser-local time, which V1 assumes matches the club timezone; store the resulting instant as ISO for calendar display/conflict checks.
  const dateMatch = dateYYYYMMDD.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const minutes = parseTimeToMinutes(timeHHMM);
  if (!dateMatch || minutes === null) return new Date(0).toISOString();

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return new Date(0).toISOString();

  return new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, 0, 0).toISOString();
}

export function durationMinutesFromTimes(startTime: string, endTime: string): number {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) return MIN_DURATION_MINUTES;

  const sameDayDuration = endMinutes - startMinutes;
  if (sameDayDuration >= MIN_DURATION_MINUTES) return sameDayDuration;
  return MIN_DURATION_MINUTES;
}

export function buildSeriesWeekItems(
  templates: SeriesTemplate[],
  states: SeriesWeekState[],
  weekStart: string,
): SeriesWeekItem[] {
  const normalizedWeekStart = getIsoWeekStart(weekStart);
  const stateBySeriesId = new Map(states.map((state) => [stateKey(state.seriesId, getIsoWeekStart(state.weekStart)), state]));

  const items: SeriesWeekItem[] = [];

  for (const template of templates) {
    const date = dateForWeekday(normalizedWeekStart, template.weekday);
    if (template.activeFrom && date < template.activeFrom.slice(0, 10)) continue;
    if (template.activeUntil && date > template.activeUntil.slice(0, 10)) continue;

    const state = stateBySeriesId.get(stateKey(template.id, normalizedWeekStart));
    const durationMinutes = durationMinutesFromTimes(template.startTime, template.endTime);
    const startsAt = combineDateTimeToIso(date, template.startTime);
    const endsAt = new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString();

    items.push({
      ...template,
      weekStart: normalizedWeekStart,
      date,
      startsAt,
      endsAt,
      durationMinutes,
      checked: state?.checked ?? true,
      committedSessionId: state?.committedSessionId ?? null,
    });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.team.localeCompare(b.team));
}

