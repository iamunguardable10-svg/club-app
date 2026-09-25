/**
 * Own training as a weekly series (piece 22): which days a series has, and
 * which plans "this and following" means. Pure date arithmetic on YYYY-MM-DD
 * strings (in UTC, so a change to summer time never skips a day).
 */

/** Monday first, as the calendar shows the week. */
export const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
export const DEFAULT_SERIES_WEEKS = 8;
export const MAX_SERIES_WEEKS = 26;

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  const day = toUtc(date);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(date: string): number {
  return (toUtc(date).getUTCDay() + 6) % 7;
}

/** The last day of a series that runs `weeks` weeks from `start`. */
export function seriesEnd(start: string, weeks = DEFAULT_SERIES_WEEKS): string {
  return addDays(start, weeks * 7 - 1);
}

/** The latest end a series may have (26 weeks). */
export function latestSeriesEnd(start: string): string {
  return seriesEnd(start, MAX_SERIES_WEEKS);
}

/** The days from `start` to `until` (both included, at most 26 weeks) that fall on one of `weekdays`. */
export function seriesDates(start: string, weekdays: readonly number[], until: string): string[] {
  const days = new Set(weekdays);
  const last = until < latestSeriesEnd(start) ? until : latestSeriesEnd(start);
  const dates: string[] = [];
  for (let date = start; date <= last; date = addDays(date, 1)) {
    if (days.has(weekdayOf(date))) dates.push(date);
  }
  return dates;
}

type SeriesPlan = { id: string; date: string; startsAt: string | null; seriesId?: string | null };

/** The plan and the later plans of its series ("this and following"); only the plan itself when it is not in one. */
export function thisAndFollowing<T extends SeriesPlan>(plans: readonly T[], target: T): T[] {
  if (!target.seriesId) return plans.filter((plan) => plan.id === target.id);
  const at = (plan: T) => `${plan.date}|${plan.startsAt ?? ''}`;
  return plans.filter((plan) => plan.id === target.id || (plan.seriesId === target.seriesId && at(plan) >= at(target)));
}
