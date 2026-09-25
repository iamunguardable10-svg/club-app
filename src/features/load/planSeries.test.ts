/**
 * Own training as a weekly series (piece 22).
 *
 *   npm run test:series
 */

import { addDays, latestSeriesEnd, seriesDates, seriesEnd, thisAndFollowing, weekdayOf } from './planSeries';

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`ok  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL ${label}`, detail ?? '');
  }
}

check('weekdays: Monday is 0, Sunday is 6', weekdayOf('2026-09-28') === 0 && weekdayOf('2026-10-04') === 6);
check('adding days across the change to winter time', addDays('2026-10-24', 2) === '2026-10-26' && addDays('2026-10-25', 1) === '2026-10-26');
check('8 weeks from a Monday end on the Sunday of week 8', seriesEnd('2026-09-28') === '2026-11-22');

const monThu = seriesDates('2026-09-28', [0, 3], seriesEnd('2026-09-28'));
check('Mon + Thu for 8 weeks: 16 days, all Mondays and Thursdays', monThu.length === 16 && monThu.every((date) => [0, 3].includes(weekdayOf(date))), monThu);
check('… starting on the first day', monThu[0] === '2026-09-28' && monThu[1] === '2026-10-01');
check('starting on a Wednesday, a Monday series begins the next Monday', seriesDates('2026-09-30', [0], '2026-10-12')[0] === '2026-10-05');
check('the end day is included', seriesDates('2026-09-28', [0], '2026-10-05').join() === '2026-09-28,2026-10-05');
check('never longer than 26 weeks', seriesDates('2026-09-28', [0, 1, 2, 3, 4, 5, 6], '2028-01-01').length === 26 * 7 && latestSeriesEnd('2026-09-28') === '2027-03-28');
check('no days chosen: nothing', seriesDates('2026-09-28', [], '2026-12-01').length === 0);

const plans = [
  { id: 'a', date: '2026-09-28', startsAt: '2026-09-28T16:00:00.000Z', seriesId: 's' },
  { id: 'b', date: '2026-10-01', startsAt: '2026-10-01T16:00:00.000Z', seriesId: 's' },
  { id: 'c', date: '2026-10-05', startsAt: '2026-10-05T16:00:00.000Z', seriesId: 's' },
  { id: 'x', date: '2026-10-06', startsAt: null, seriesId: 'other' },
  { id: 'y', date: '2026-10-07', startsAt: null, seriesId: null },
];
check('this and following: from the second on', thisAndFollowing(plans, plans[1]).map((plan) => plan.id).join() === 'b,c');
check('… not other series', !thisAndFollowing(plans, plans[0]).some((plan) => plan.id === 'x'));
check('a single plan: only itself', thisAndFollowing(plans, plans[4]).map((plan) => plan.id).join() === 'y');

console.log(failures === 0 ? 'all series checks passed' : `${failures} series check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
