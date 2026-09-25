// iCalendar for the Apple connection (piece 20): one event per file for the
// "Club OS" calendar, and reading events back from the person's calendars.
// Same text rules as the calendar link (calendar-feed/ics.ts); kept here so
// the function stays one folder. No Deno or Node APIs (tested with tsx).

export type OutgoingEvent = {
  uid: string;
  start: string | null;
  end: string | null;
  /** All-day: YYYY-MM-DD, no start. */
  date?: string | null;
  summary: string;
  location?: string | null;
  description?: string | null;
};

export type IncomingEvent = {
  /** Stable per occurrence: the event's UID, plus the occurrence for repeating ones. */
  key: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
};

export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

const encoder = new TextEncoder();

export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > (parts.length === 0 ? 75 : 74)) {
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

export function utcStamp(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value.replace(/(\.\d{3})\d+/, '$1')) : value;
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function nextDay(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10).replace(/-/g, '');
}

/** A calendar file with one event, for the "Club OS" calendar. */
export function eventIcs(event: OutgoingEvent, now: Date = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Club OS//Calendar//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${event.uid}`, `DTSTAMP:${utcStamp(now)}`];
  if (event.start && event.end) {
    lines.push(`DTSTART:${utcStamp(event.start)}`, `DTEND:${utcStamp(event.end)}`);
  } else if (event.date) {
    lines.push(`DTSTART;VALUE=DATE:${event.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${nextDay(event.date)}`);
  }
  lines.push(`SUMMARY:${escapeText(event.summary)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** A fingerprint of what an event says, to send only changed ones. */
export function eventHash(event: OutgoingEvent): string {
  return JSON.stringify([event.start, event.end, event.date ?? null, event.summary, event.location ?? null, event.description ?? null]);
}

// --- Reading ------------------------------------------------------------------

type Property = { name: string; params: Record<string, string>; value: string };

function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

function parseLine(line: string): Property | null {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const [key, value = ''] = param.split('=');
    params[key.toUpperCase()] = value.replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

/** The UTC time of a wall-clock time in a time zone. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = 0;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    offset = asUtc - guess;
  } catch {
    offset = 0; // unknown zone: treat as UTC
  }
  return new Date(guess - offset);
}

function parseTime(property: Property, defaultZone: string): { at: Date; allDay: boolean } | null {
  const value = property.value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (property.params.VALUE === 'DATE' || date) {
    if (!date) return null;
    return { at: new Date(Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]))), allDay: true };
  }
  const time = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!time) return null;
  const [, y, mo, d, h, mi, s, z] = time;
  if (z) return { at: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
  return { at: zonedToUtc(+y, +mo, +d, +h, +mi, +s, property.params.TZID ?? defaultZone), allDay: false };
}

function durationMs(value: string): number {
  const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!match) return 0;
  const [, sign, w, d, h, m, s] = match;
  const ms = (((+(w ?? 0) * 7 + +(d ?? 0)) * 24 + +(h ?? 0)) * 60 + +(m ?? 0)) * 60_000 + +(s ?? 0) * 1000;
  return sign === '-' ? -ms : ms;
}

/**
 * The events in a calendar file. Repeating events are expected expanded by
 * the server; one that is not counts with its first occurrence only.
 * Cancelled ones and free/transparent ones ("Show as: free") are left out.
 */
export function parseEvents(text: string, defaultZone = 'Europe/Berlin'): IncomingEvent[] {
  const events: IncomingEvent[] = [];
  let current: Property[] | null = null;
  let depth = 0;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      current = [];
      depth = 0;
      continue;
    }
    if (!current) continue;
    if (line.startsWith('BEGIN:')) depth += 1;
    else if (line === 'END:VEVENT' && depth === 0) {
      const get = (name: string) => current!.find((property) => property.name === name) ?? null;
      const start = get('DTSTART') ? parseTime(get('DTSTART')!, defaultZone) : null;
      const status = get('STATUS')?.value.trim().toUpperCase();
      const transparent = get('TRANSP')?.value.trim().toUpperCase() === 'TRANSPARENT';
      if (start && status !== 'CANCELLED' && !transparent) {
        const endProperty = get('DTEND');
        const end = endProperty ? parseTime(endProperty, defaultZone) : null;
        const endsAt = end
          ? end.at
          : new Date(start.at.getTime() + (get('DURATION') ? durationMs(get('DURATION')!.value) : start.allDay ? 86_400_000 : 0));
        const uid = get('UID')?.value.trim() ?? `${start.at.toISOString()}-${get('SUMMARY')?.value ?? ''}`;
        const recurrence = get('RECURRENCE-ID');
        events.push({
          key: recurrence ? `${uid}#${recurrence.value.trim()}` : uid,
          title: unescapeText(get('SUMMARY')?.value ?? '').trim() || 'Busy',
          startsAt: start.at.toISOString(),
          endsAt: (endsAt > start.at ? endsAt : new Date(start.at.getTime() + 30 * 60_000)).toISOString(),
          allDay: start.allDay,
        });
      }
      current = null;
    } else if (line.startsWith('END:')) depth -= 1;
    else if (depth === 0) {
      const property = parseLine(line);
      if (property) current.push(property);
    }
  }
  return events;
}
