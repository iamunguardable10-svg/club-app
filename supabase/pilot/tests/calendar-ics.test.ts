/**
 * The iCalendar file of a calendar link (piece 19): escaping, folding long
 * lines, timed and all-day events, and what calendar apps need to show them.
 *
 *   npm run test:calendar
 */

import { escapeText, foldLine, toIcs, utcStamp } from '../../functions/calendar-feed/ics';

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`ok  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL ${label}`, detail ?? '');
  }
}

check('text: comma, semicolon, backslash and line breaks escaped', escapeText('Bring, both; kits\\\nMeet 17:15') === 'Bring\\, both\\; kits\\\\\\nMeet 17:15', escapeText('Bring, both; kits\\\nMeet 17:15'));
check('timestamps from Postgres (microseconds, offset) in UTC', utcStamp('2026-09-26T18:00:00.123456+02:00') === '20260926T160000Z', utcStamp('2026-09-26T18:00:00.123456+02:00'));

const long = `DESCRIPTION:${'Ä'.repeat(60)}`;
const folded = foldLine(long);
const bytes = (value: string) => new TextEncoder().encode(value).length;
check('long lines folded at 75 bytes, never inside a character',
  folded.split('\r\n').every((line) => bytes(line) <= 75) && folded.replace(/\r\n /g, '') === long, folded.split('\r\n').map(bytes));
check('short lines untouched', foldLine('SUMMARY:U20') === 'SUMMARY:U20');

const ics = toIcs({
  name: 'Club OS',
  events: [
    {
      uid: 'session-1@club-os',
      start: '2026-09-26T16:00:00+00:00',
      end: '2026-09-26T17:30:00+00:00',
      summary: 'U20 · Game vs TSV Nord (away)',
      location: 'Sportpark Nord, Essen',
      description: "You're a reserve\nMeet 17:00 at Car park",
      updated: '2026-09-20T10:00:00.5+00:00',
    },
    { uid: 'plan-2@club-os', start: null, end: null, date: '2026-09-30', summary: 'Easy run' },
    { uid: 'broken@club-os', start: null, end: null, date: null, summary: 'No time at all' },
  ],
}, new Date('2026-09-25T12:00:00Z'));
const lines = ics.split('\r\n');

check('a calendar with CRLF line endings, ending in one', ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n') && ics.endsWith('END:VCALENDAR\r\n') && !/[^\r]\n/.test(ics));
check('named "Club OS", asks to be refreshed hourly', lines.includes('X-WR-CALNAME:Club OS') && lines.includes('REFRESH-INTERVAL;VALUE=DURATION:PT1H'));
check('the game: UTC times, escaped location and description',
  lines.includes('DTSTART:20260926T160000Z') && lines.includes('DTEND:20260926T173000Z')
    && lines.includes('LOCATION:Sportpark Nord\\, Essen') && lines.includes("DESCRIPTION:You're a reserve\\nMeet 17:00 at Car park")
    && lines.includes('DTSTAMP:20260925T120000Z') && lines.includes('LAST-MODIFIED:20260920T100000Z'), lines);
check('own training without a time: a whole day', lines.includes('DTSTART;VALUE=DATE:20260930') && lines.includes('DTEND;VALUE=DATE:20261001'));
check('an event without any time is left out', !ics.includes('broken@club-os'));
check('every event closed', lines.filter((line) => line === 'BEGIN:VEVENT').length === 2 && lines.filter((line) => line === 'END:VEVENT').length === 2);

console.log(failures === 0 ? 'all calendar file checks passed' : `${failures} calendar file check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
