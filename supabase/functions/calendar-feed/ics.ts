// Turns the events of a calendar link (piece 19) into an iCalendar file.
// No Deno or Node APIs, so the formatting is tested with the pilot tests
// (supabase/pilot/tests/calendar-ics.test.ts).

export type FeedEvent = {
  uid: string;
  /** Timed events: start and end (timestamps). All-day events: `date` (YYYY-MM-DD) and no start. */
  start?: string | null;
  end?: string | null;
  date?: string | null;
  summary: string;
  location?: string | null;
  description?: string | null;
  updated?: string | null;
};

export type Feed = { name: string; events: FeedEvent[] };

/** Text as iCalendar wants it: backslash, semicolon, comma and line breaks escaped. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const encoder = new TextEncoder();

/** Lines longer than 75 bytes continue on the next line after a space (never inside a character). */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** 20260926T160000Z */
export function utcStamp(value: string | Date): string {
  // Postgres sends microseconds; Date wants at most milliseconds.
  const date = typeof value === 'string' ? new Date(value.replace(/(\.\d{3})\d+/, '$1')) : value;
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function dayStamp(date: string): string {
  return date.replace(/-/g, '');
}

function nextDay(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10).replace(/-/g, '');
}

export function toIcs(feed: Feed, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Club OS//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(feed.name)}`,
    // Calendar apps ask again about every hour (Apple decides for itself).
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  const stamp = utcStamp(now);
  for (const event of feed.events) {
    const timed = Boolean(event.start && event.end);
    if (!timed && !event.date) continue;
    lines.push('BEGIN:VEVENT', `UID:${event.uid}`, `DTSTAMP:${stamp}`);
    if (timed) {
      lines.push(`DTSTART:${utcStamp(event.start!)}`, `DTEND:${utcStamp(event.end!)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dayStamp(event.date!)}`, `DTEND;VALUE=DATE:${nextDay(event.date!)}`);
    }
    lines.push(`SUMMARY:${escapeText(event.summary)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.updated) lines.push(`LAST-MODIFIED:${utcStamp(event.updated)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
