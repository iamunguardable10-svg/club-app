// One sync of an Apple Calendar connection (piece 20), without the database
// and without Deno, so the tests run it against a local CalDAV server:
// - "Club OS" in iCloud gets exactly the account's Club OS events (only
//   what changed is sent; events that are gone are deleted there);
// - the calendar list is read again (new calendars show up in the app);
// - calendars the person chose to import are read, 7 days back to 60 ahead.
// Nothing else in the person's iCloud is touched.

import {
  DavError,
  deleteEvent,
  discoverCalendarHome,
  listCalendars,
  makeCalendar,
  putEvent,
  queryEvents,
  type DavAccount,
} from './caldav.ts';
import { eventHash, eventIcs, parseEvents, type IncomingEvent, type OutgoingEvent } from './ical.ts';

export const CLUB_OS_NAME = 'Club OS';

export type SyncInput = {
  account: DavAccount;
  homeUrl: string;
  clubOsUrl: string | null;
  events: OutgoingEvent[];
  /** uid → fingerprint of what "Club OS" holds. */
  pushed: Record<string, string>;
  /** URLs of the calendars to read. */
  imports: string[];
};

export type SyncResult =
  | {
      club_os_url: string;
      calendars: { url: string; name: string; color: string | null }[];
      pushed: Record<string, string>;
      imported: { url: string; events: IncomingEvent[] }[];
      written: number;
      deleted: number;
    }
  | { error: string };

/** First connection: where the calendars are, and "Club OS" (found or made). */
export async function connect(account: DavAccount): Promise<{ homeUrl: string; clubOsUrl: string }> {
  const homeUrl = await discoverCalendarHome(account);
  const calendars = await listCalendars(account, homeUrl);
  const existing = calendars.find((calendar) => calendar.name === CLUB_OS_NAME && calendar.events);
  return { homeUrl, clubOsUrl: existing?.url ?? (await makeCalendar(account, homeUrl, CLUB_OS_NAME)) };
}

/** Runs `work` over `items`, a few at a time. */
async function inBatches<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(work));
  }
}

export async function sync(input: SyncInput, now: Date = new Date()): Promise<SyncResult> {
  const { account } = input;
  try {
    const calendars = await listCalendars(account, input.homeUrl);
    // "Club OS" deleted in iCloud: made again, and filled from scratch.
    let clubOsUrl = input.clubOsUrl && calendars.some((calendar) => calendar.url === input.clubOsUrl) ? input.clubOsUrl : null;
    clubOsUrl ??= calendars.find((calendar) => calendar.name === CLUB_OS_NAME && calendar.events)?.url
      ?? (await makeCalendar(account, input.homeUrl, CLUB_OS_NAME));
    const pushed: Record<string, string> = clubOsUrl === input.clubOsUrl ? { ...input.pushed } : {};

    const wanted = new Map(input.events.map((event) => [event.uid, event]));
    const toWrite = [...wanted.values()].filter((event) => pushed[event.uid] !== eventHash(event));
    const toDelete = Object.keys(pushed).filter((uid) => !wanted.has(uid));
    await inBatches(toWrite, 4, async (event) => {
      await putEvent(account, clubOsUrl!, event.uid, eventIcs(event, now));
      pushed[event.uid] = eventHash(event);
    });
    await inBatches(toDelete, 4, async (uid) => {
      await deleteEvent(account, clubOsUrl!, uid);
      delete pushed[uid];
    });

    const own = calendars.filter((calendar) => calendar.url !== clubOsUrl && calendar.events);
    const from = new Date(now.getTime() - 7 * 86_400_000);
    const to = new Date(now.getTime() + 60 * 86_400_000);
    const imported: { url: string; events: IncomingEvent[] }[] = [];
    for (const url of input.imports) {
      if (!own.some((calendar) => calendar.url === url)) continue;
      const texts = await queryEvents(account, url, from, to);
      imported.push({ url, events: texts.flatMap((text) => parseEvents(text)) });
    }

    return {
      club_os_url: clubOsUrl,
      calendars: own.map(({ url, name, color }) => ({ url, name, color })),
      pushed,
      imported,
      written: toWrite.length,
      deleted: toDelete.length,
    };
  } catch (error) {
    if (error instanceof DavError) return { error: error.message };
    return { error: `Could not reach Apple Calendar: ${error instanceof Error ? error.message : String(error)}` };
  }
}
