/**
 * The Apple calendar connection's CalDAV client and calendar files (piece
 * 20), against a local CalDAV server (Radicale) standing in for iCloud:
 *
 *   python3 -m radicale --config /tmp/radicale/config   # user ben / secretpw
 *   npm run test:caldav
 */

import {
  DavError,
  davRequest,
  deleteEvent,
  discoverCalendarHome,
  listCalendars,
  makeCalendar,
  putEvent,
  queryEvents,
  type DavAccount,
} from '../../functions/apple-calendar/caldav';
import { eventIcs, parseEvents, zonedToUtc } from '../../functions/apple-calendar/ical';
import { connect, sync, type SyncResult } from '../../functions/apple-calendar/sync';

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) console.log(`ok  ${label}`);
  else {
    failures += 1;
    console.log(`FAIL ${label}`, detail ?? '');
  }
}

const base = process.env.CALDAV_URL ?? 'http://127.0.0.1:5232/';
const account: DavAccount = { baseUrl: base, username: 'ben', password: 'secretpw' };

/** Removes every calendar of the account, so earlier runs leave nothing behind. */
async function wipe(who: DavAccount) {
  const home = await discoverCalendarHome(who);
  for (const calendar of await listCalendars(who, home)) await davRequest(who, 'DELETE', calendar.url);
}

async function main() {
  await wipe(account);
  await wipe({ baseUrl: base, username: 'mia', password: 'otherpw' });
  // --- Calendar files -------------------------------------------------------
  check('Berlin summer time: 18:00 is 16:00 UTC', zonedToUtc(2026, 9, 26, 18, 0, 0, 'Europe/Berlin').toISOString() === '2026-09-26T16:00:00.000Z');
  check('Berlin winter time: 18:00 is 17:00 UTC', zonedToUtc(2026, 12, 1, 18, 0, 0, 'Europe/Berlin').toISOString() === '2026-12-01T17:00:00.000Z');
  const parsed = parseEvents([
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:a', 'DTSTART;TZID=Europe/Berlin:20260926T180000', 'DTEND;TZID=Europe/Berlin:20260926T193000', 'SUMMARY:Dinner\\, family', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b', 'DTSTART;VALUE=DATE:20260927', 'SUMMARY:Trip', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:c', 'DTSTART:20260928T100000Z', 'DURATION:PT45M', 'SUMMARY:Dentist', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'END:VALARM', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:d', 'DTSTART:20260928T120000Z', 'DTEND:20260928T130000Z', 'SUMMARY:Free', 'TRANSP:TRANSPARENT', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:e', 'RECURRENCE-ID:20261005T100000Z', 'DTSTART:20261005T100000Z', 'DTEND:20261005T110000Z', 'SUMMARY:Weekly', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'));
  const byKey = new Map(parsed.map((event) => [event.key, event]));
  check('reads a timed event in a time zone', byKey.get('a')?.startsAt === '2026-09-26T16:00:00.000Z' && byKey.get('a')?.endsAt === '2026-09-26T17:30:00.000Z' && byKey.get('a')?.title === 'Dinner, family', byKey.get('a'));
  check('… an all-day event (one day)', byKey.get('b')?.allDay === true && byKey.get('b')?.endsAt === '2026-09-28T00:00:00.000Z', byKey.get('b'));
  check('… a duration, ignoring the alarm inside', byKey.get('c')?.endsAt === '2026-09-28T10:45:00.000Z', byKey.get('c'));
  check('… leaves out "free" events', !byKey.has('d'));
  check('… one occurrence of a repeating event has its own key', byKey.has('e#20261005T100000Z'));
  const ics = eventIcs({ uid: 'session-1@club-os', start: '2026-09-26T16:00:00Z', end: '2026-09-26T17:30:00Z', summary: 'U16 · Game vs TSV (away)', location: 'Sportpark, Essen' });
  check('writes one event with escaped text', ics.includes('UID:session-1@club-os') && ics.includes('LOCATION:Sportpark\\, Essen') && ics.endsWith('END:VCALENDAR\r\n'));

  // --- Against the CalDAV server --------------------------------------------
  let wrong = '';
  try {
    await discoverCalendarHome({ ...account, password: 'wrong' });
  } catch (error) {
    wrong = error instanceof DavError ? `${error.status} ${error.message}` : String(error);
  }
  check('a wrong password: a clear message', wrong.startsWith('401 Apple did not accept'), wrong);

  const home = await discoverCalendarHome(account);
  check('finds the calendar home', home.startsWith(base) && home.endsWith('/'), home);
  const clubOs = await makeCalendar(account, home, 'Club OS');
  const privateCal = await makeCalendar(account, home, 'Private', '#FF2968');
  const calendars = await listCalendars(account, home);
  check('lists the calendars with name and color', calendars.some((c) => c.url === clubOs && c.name === 'Club OS' && c.events)
    && calendars.some((c) => c.url === privateCal && c.name === 'Private' && c.color === '#FF2968'), calendars);

  await putEvent(account, clubOs, 'session-1@club-os', ics);
  await putEvent(account, clubOs, 'session-1@club-os', ics.replace('Game vs TSV', 'Game vs TSV Nord'));
  await putEvent(account, privateCal, 'dinner@phone', eventIcs({ uid: 'dinner@phone', start: '2026-09-26T17:00:00Z', end: '2026-09-26T18:00:00Z', summary: 'Dinner' }));
  const from = new Date('2026-09-20T00:00:00Z');
  const to = new Date('2026-10-20T00:00:00Z');
  const written = (await queryEvents(account, clubOs, from, to)).flatMap((text) => parseEvents(text));
  check('writes into "Club OS" and changes in place', written.length === 1 && written[0].title === 'U16 · Game vs TSV Nord (away)', written);
  const privateEvents = (await queryEvents(account, privateCal, from, to)).flatMap((text) => parseEvents(text));
  check('reads a private calendar', privateEvents.length === 1 && privateEvents[0].title === 'Dinner' && privateEvents[0].startsAt === '2026-09-26T17:00:00.000Z', privateEvents);

  // A weekly event, expanded by the server
  await putEvent(account, privateCal, 'gym@phone', [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', 'BEGIN:VEVENT', 'UID:gym@phone', 'DTSTAMP:20260901T000000Z',
    'DTSTART:20260928T070000Z', 'DTEND:20260928T080000Z', 'RRULE:FREQ=WEEKLY;COUNT=3', 'SUMMARY:Gym', 'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n'));
  const gym = (await queryEvents(account, privateCal, from, to)).flatMap((text) => parseEvents(text)).filter((event) => event.title === 'Gym');
  check('a weekly event comes as three occurrences', gym.length === 3 && new Set(gym.map((event) => event.key)).size === 3, gym);

  await deleteEvent(account, clubOs, 'session-1@club-os');
  await deleteEvent(account, clubOs, 'not-there@club-os');
  check('deletes (and a missing one is fine)', (await queryEvents(account, clubOs, from, to)).length === 0);

  // --- A whole sync, as the Edge Function runs it ---------------------------
  const other: DavAccount = { baseUrl: base, username: 'mia', password: 'otherpw' };
  const first = await connect(other);
  const again = await connect(other);
  check('connecting finds or makes "Club OS" once', first.clubOsUrl === again.clubOsUrl, [first, again]);
  const homeOfMia = first.homeUrl;
  const miaPrivate = await makeCalendar(other, homeOfMia, 'Home');
  await putEvent(other, miaPrivate, 'doc@phone', eventIcs({ uid: 'doc@phone', start: new Date(Date.now() + 86_400_000).toISOString(), end: new Date(Date.now() + 90_000_000).toISOString(), summary: 'Doctor' }));
  const events = [
    { uid: 'session-a@club-os', start: new Date(Date.now() + 2 * 86_400_000).toISOString(), end: new Date(Date.now() + 2 * 86_400_000 + 5_400_000).toISOString(), summary: 'U16 · Team training', location: 'North Hall' },
    { uid: 'plan-b@club-os', start: null, end: null, date: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10), summary: 'Easy run' },
  ];
  const ok = (result: SyncResult) => ('error' in result ? null : result);
  const run1 = ok(await sync({ account: other, homeUrl: homeOfMia, clubOsUrl: first.clubOsUrl, events, pushed: {}, imports: [] }));
  check('first sync writes both events, lists "Home" (not "Club OS")', run1?.written === 2 && run1.calendars.map((c) => c.name).join() === 'Home' && run1.imported.length === 0, run1);
  const run2 = ok(await sync({ account: other, homeUrl: homeOfMia, clubOsUrl: first.clubOsUrl, events, pushed: run1!.pushed, imports: [miaPrivate] }));
  check('second sync writes nothing new, imports "Home" only when chosen', run2?.written === 0 && run2.deleted === 0 && run2.imported[0]?.events[0]?.title === 'Doctor', run2);
  const run3 = ok(await sync({ account: other, homeUrl: homeOfMia, clubOsUrl: first.clubOsUrl, events: [{ ...events[0], summary: 'U16 · Team training (moved)' }], pushed: run2!.pushed, imports: [] }));
  const clubOsNow = (await queryEvents(other, first.clubOsUrl, new Date(Date.now() - 86_400_000), new Date(Date.now() + 10 * 86_400_000))).flatMap((text) => parseEvents(text));
  check('a changed session is rewritten, a cancelled one deleted', run3?.written === 1 && run3.deleted === 1 && clubOsNow.length === 1 && clubOsNow[0].title === 'U16 · Team training (moved)', [run3, clubOsNow]);
  const doctor = (await queryEvents(other, miaPrivate, new Date(Date.now() - 86_400_000), new Date(Date.now() + 10 * 86_400_000))).length;
  check('… and her own calendar is untouched', doctor === 1);
  const failed = await sync({ account: { ...other, password: 'wrong' }, homeUrl: homeOfMia, clubOsUrl: first.clubOsUrl, events, pushed: {}, imports: [] });
  check('a revoked password: the sync reports it', 'error' in failed && failed.error.startsWith('Apple did not accept'), failed);

  console.log(failures === 0 ? 'all CalDAV checks passed' : `${failures} CalDAV check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
