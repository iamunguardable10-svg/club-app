/**
 * Dates, times and counts as the interface shows them.
 *
 * In the app language (docs/i18n.md); English keeps day before month and a
 * 24-hour clock ("Fri 25 Sep · 16:30–17:30"), as the clubs are European.
 * Before, every screen passed `undefined` as locale and got whatever the
 * browser preferred, which mixed "04:30 PM" and "Sep 25" into one page.
 *
 * The language is read when formatting; changing it reloads the page. Dates
 * only render after mounting (the data lives in the browser), so the English
 * server render never has to match them.
 */

import { currentLocale, intlLocale } from '@/shared/i18n';

type DateInput = string | Date;

function toDate(value: DateInput) {
  return typeof value === 'string' ? new Date(value) : value;
}

const FORMATS = {
  day: { weekday: 'short', day: 'numeric', month: 'short' },
  longDay: { weekday: 'long', day: 'numeric', month: 'long' },
  shortDate: { day: 'numeric', month: 'short' },
  time: { hour: '2-digit', minute: '2-digit', hour12: false },
  weekday: { weekday: 'short' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(kind: keyof typeof FORMATS) {
  const tag = intlLocale(currentLocale());
  const key = `${tag}:${kind}`;
  let result = formatters.get(key);
  if (!result) {
    result = new Intl.DateTimeFormat(tag, FORMATS[kind]);
    formatters.set(key, result);
  }
  return result;
}

/** "Fri 25 Sep" */
export function formatDay(value: DateInput) {
  return formatter('day').format(toDate(value)).replace(',', '');
}

/** "Friday 25 September" */
export function formatLongDay(value: DateInput) {
  return formatter('longDay').format(toDate(value)).replace(',', '');
}

/** "Fri" */
export function formatWeekday(value: DateInput) {
  return formatter('weekday').format(toDate(value));
}

/** "25 Sep" */
export function formatShortDate(value: DateInput) {
  return formatter('shortDate').format(toDate(value));
}

/** "16:30" */
export function formatTime(value: DateInput) {
  return formatter('time').format(toDate(value));
}

/** "16:30–17:30"; a missing end counts as one hour, as everywhere else. */
export function formatTimeRange(startsAt: DateInput, endsAt: DateInput | null) {
  const start = toDate(startsAt);
  const end = endsAt ? toDate(endsAt) : new Date(start.getTime() + 60 * 60_000);
  return `${formatTime(start)}–${formatTime(end)}`;
}

/** "Fri 25 Sep · 16:30–17:30" */
export function formatSessionTime(startsAt: DateInput, endsAt: DateInput | null) {
  return `${formatDay(startsAt)} · ${formatTimeRange(startsAt, endsAt)}`;
}

/** "21–27 Sep", or "29 Sep – 5 Oct" across a month. */
export function formatDateRange(first: DateInput, last: DateInput) {
  const a = toDate(first);
  const b = toDate(last);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}–${formatShortDate(b)}`;
  }
  return `${formatShortDate(a)} – ${formatShortDate(b)}`;
}

/** "1 player", "3 players", "No players" with `zero`. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`, zero?: string) {
  if (count === 0 && zero) return zero;
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

const numberFormatters = new Map<string, Intl.NumberFormat>();

/** "1.31" (English) or "1,31" (German): a ratio or score with fixed decimals. */
export function formatDecimal(value: number, digits = 2) {
  const tag = intlLocale(currentLocale());
  const key = `${tag}:${digits}`;
  let result = numberFormatters.get(key);
  if (!result) {
    result = new Intl.NumberFormat(tag, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numberFormatters.set(key, result);
  }
  return result.format(value);
}
