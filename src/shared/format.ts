/**
 * Dates, times and counts as the interface shows them.
 *
 * The interface is English, the clubs are European: day before month and a
 * 24-hour clock ("Fri 25 Sep · 16:30–17:30"). Before, every screen passed
 * `undefined` as locale and got whatever the browser preferred, which mixed
 * "04:30 PM" and "Sep 25" into an otherwise consistent page.
 */

const LOCALE = 'en-GB';

type DateInput = string | Date;

function toDate(value: DateInput) {
  return typeof value === 'string' ? new Date(value) : value;
}

const dayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
const longDayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDateFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });

/** "Fri 25 Sep" */
export function formatDay(value: DateInput) {
  return dayFormat.format(toDate(value)).replace(',', '');
}

/** "Friday 25 September" */
export function formatLongDay(value: DateInput) {
  return longDayFormat.format(toDate(value)).replace(',', '');
}

/** "25 Sep" */
export function formatShortDate(value: DateInput) {
  return shortDateFormat.format(toDate(value));
}

/** "16:30" */
export function formatTime(value: DateInput) {
  return timeFormat.format(toDate(value));
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
