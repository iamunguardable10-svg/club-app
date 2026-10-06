/**
 * Every guided tour of the app: one per page (shown the first time the page
 * opens) and the moment tips (shown the first time a feature appears, e.g. the
 * first "How hard was it?"). A step points at an element marked
 * `data-tour="<target>"` and is left out when that element is not on the page
 * (other role, no load tracking, no data yet). Texts: `tour.<key>.title` and
 * `tour.<key>.text` in the four catalogs. See docs/onboarding-concept.md.
 */

import type { MessageKey } from '@/shared/i18n';

export type Gesture = 'tap' | 'swipe-left' | 'swipe-right' | 'drag' | 'resize' | 'none';

export type TourStep = {
  /** `data-tour` of the element; none for a card in the middle of the screen. */
  target?: string;
  title: MessageKey;
  text: MessageKey;
  /** Shown as an animation; doing it on the element moves on. */
  gesture?: Gesture;
  /** Only on touch screens or only with a mouse. */
  device?: 'touch' | 'mouse';
  /** Shown once the gesture is done: what just happened (`tour.<key>.result`). */
  result?: MessageKey;
};

export type PageTourId =
  | 'athlete.today' | 'athlete.calendar' | 'athlete.load' | 'athlete.messages'
  | 'coach.today' | 'coach.calendar' | 'coach.team' | 'coach.halls' | 'coach.history'
  | 'club.club' | 'club.halls' | 'hallCalendar' | 'messages';

export type MomentTipId = 'moment.rate' | 'moment.check' | 'moment.squad' | 'moment.attendance' | 'moment.series';

export type TourId = PageTourId | MomentTipId;

function step(key: string, target?: string, gesture: Gesture = 'none', device?: 'touch' | 'mouse'): TourStep {
  return {
    target,
    title: `tour.${key}.title` as MessageKey,
    text: `tour.${key}.text` as MessageKey,
    gesture,
    device,
    result: gesture === 'none' ? undefined : (`tour.${key}.result` as MessageKey),
  };
}

const help = step('help', 'help');

export const TOURS: Record<TourId, TourStep[]> = {
  'athlete.today': [
    step('athleteToday.nav', 'nav'),
    step('athleteToday.next', 'athlete-next', 'tap'),
    step('athleteToday.rsvp', 'athlete-rsvp', 'tap'),
    step('athleteToday.messages', 'messages-card', 'tap'),
    step('athleteToday.away', 'athlete-away', 'tap'),
    step('athleteToday.share', 'athlete-share', 'tap'),
    help,
  ],
  'athlete.calendar': [
    step('athleteCalendar.week', 'calendar-weeknav', 'tap'),
    step('athleteCalendar.view', 'calendar-view', 'tap', 'touch'),
    step('athleteCalendar.swipe', 'calendar-swipe', 'swipe-left', 'touch'),
    step('athleteCalendar.item', 'calendar-item', 'tap'),
    step('athleteCalendar.own', 'athlete-add-own', 'tap'),
  ],
  'athlete.load': [
    step('athleteLoad.metrics', 'load-metrics'),
    step('athleteLoad.trend', 'load-trend'),
  ],
  'athlete.messages': [
    step('athleteMessages.chips', 'messages-chips', 'tap'),
    step('athleteMessages.pinned', 'messages-pinned'),
    step('athleteMessages.poll', 'messages-poll', 'tap'),
  ],
  'coach.today': [
    step('coachToday.session', 'coach-session', 'tap'),
    step('coachToday.open', 'coach-open', 'tap'),
    step('coachToday.upcoming', 'coach-upcoming', 'tap'),
    step('coachToday.messages', 'messages-icon', 'tap'),
    step('coachToday.nav', 'nav'),
    help,
  ],
  'coach.calendar': [
    step('coachCalendar.edit', 'calendar-edit', 'tap'),
    step('coachCalendar.slot', 'calendar-slot', 'tap'),
    step('coachCalendar.move', 'calendar-session', 'drag'),
    step('coachCalendar.resize', 'calendar-session', 'resize'),
    step('coachCalendar.swipe', 'calendar-swipe', 'swipe-left', 'touch'),
    step('coachCalendar.week', 'calendar-weeknav', 'tap'),
    step('coachCalendar.plan', 'calendar-plan', 'tap'),
  ],
  'coach.team': [
    step('coachTeam.overview', 'team-tab-dashboard', 'tap'),
    step('coachTeam.setup', 'team-setup'),
    step('coachTeam.players', 'team-tab-players', 'tap'),
    step('coachTeam.groups', 'team-tab-groups', 'tap'),
    step('coachTeam.messages', 'team-tab-messages', 'tap'),
    step('coachTeam.settings', 'team-tab-settings', 'tap'),
  ],
  'coach.halls': [
    step('halls.open', 'halls-open', 'tap'),
    step('halls.edit', 'halls-edit', 'tap'),
  ],
  'coach.history': [
    step('coachHistory.chart', 'history-chart', 'tap'),
    step('coachHistory.metrics', 'history-metrics', 'tap'),
  ],
  hallCalendar: [
    step('hallCalendar.edit', 'calendar-edit', 'tap'),
    step('hallCalendar.sessions', 'calendar-session', 'tap'),
    step('hallCalendar.swipe', 'calendar-swipe', 'swipe-left', 'touch'),
  ],
  'club.club': [
    step('club.tiles', 'club-tiles'),
    step('club.team', 'club-team', 'tap'),
    step('club.addTeam', 'club-add-team', 'tap'),
    step('club.writers', 'club-writers', 'tap'),
    step('club.department', 'club-new-department', 'tap'),
    step('club.nav', 'nav'),
    help,
  ],
  'club.halls': [
    step('clubHalls.add', 'halls-add', 'tap'),
    step('halls.open', 'halls-open', 'tap'),
    step('halls.edit', 'halls-edit', 'tap'),
  ],
  messages: [
    step('messages.to', 'compose-to', 'tap'),
    step('messages.who', 'compose-who', 'tap'),
    step('messages.important', 'compose-important', 'tap'),
    step('messages.poll', 'compose-poll', 'tap'),
    step('messages.stats', 'message-stats', 'tap'),
  ],
  'moment.rate': [
    step('momentRate.scale', 'rate-scale', 'tap'),
    step('momentRate.minutes', 'rate-minutes', 'swipe-right'),
    step('momentRate.later', 'rate-later'),
  ],
  'moment.check': [step('momentCheck', 'athlete-check')],
  'moment.squad': [step('momentSquad', 'squad-panel')],
  'moment.attendance': [step('momentAttendance', 'attendance-panel', 'tap')],
  'moment.series': [
    step('momentSeries.board', 'series-board'),
    step('momentSeries.add', 'series-add', 'tap'),
    step('momentSeries.confirm', 'series-confirm', 'tap'),
  ],
};
