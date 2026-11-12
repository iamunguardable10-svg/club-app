/**
 * Which first-use tips each role sees on which page, in order (`TipLayer`).
 * A page's tips show when that page is opened, not before (Ben, 2026-11-12).
 * `page` points at the page's title; the calendar's tips are steps to do:
 * start planning, tap a free time, drag the new session, make it longer,
 * open it.
 */

import type { MessageKey } from '@/shared/i18n';
import type { Tip } from '@/features/tips/TipLayer';
import type { TipEvent } from '@/features/tips/tipEvents';

type Role = 'coach' | 'athlete' | 'club';
type Entry = [target: string, text: MessageKey, until?: TipEvent];

const calendar = (open: MessageKey): Entry[] => [
  ['calendar-edit', 'tips.cal.edit', 'calendar.edit'],
  ['calendar-day', 'tips.cal.tap', 'calendar.draft'],
  ['calendar-draft', 'tips.cal.move', 'calendar.move'],
  ['calendar-grip', 'tips.cal.resize', 'calendar.resize'],
  ['calendar-draft', open, 'calendar.open'],
];

const TIPS: Record<Role, Record<string, Entry[]>> = {
  coach: {
    today: [['page', 'tips.coach.today']],
    calendar: calendar('tips.cal.open'),
    team: [['page', 'tips.coach.squad']],
    halls: [['page', 'tips.coach.halls']],
  },
  athlete: {
    today: [['page', 'tips.player.today']],
    // Players plan their own training here (no team or hall to pick).
    calendar: calendar('tips.cal.openOwn'),
    load: [['page', 'tips.player.rate']],
    messages: [['page', 'tips.player.messages']],
  },
  club: {
    club: [['page', 'tips.club.overview']],
    halls: [['page', 'tips.club.halls']],
    messages: [['page', 'tips.club.messages']],
  },
};

export function tipsFor(role: Role | undefined, page: string | null): Tip[] {
  if (!role || !page) return [];
  return (TIPS[role][page] ?? []).map(([target, text, until], index) => ({ id: `${role}.${page}.${index}.${target}`, target, text, until }));
}
