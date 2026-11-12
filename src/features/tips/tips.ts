/**
 * Which first-use tips each role sees on which page, in order (`TipLayer`).
 * `page` points at the page's title; `nav-<item>` at that tab (phone tab bar
 * or side bar). A tip whose tab the person does not have is left out.
 */

import type { MessageKey } from '@/shared/i18n';
import type { Tip } from '@/features/tips/TipLayer';

type Role = 'coach' | 'athlete' | 'club';

const TIPS: Record<Role, Record<string, [string, MessageKey][]>> = {
  coach: {
    today: [['page', 'tips.coach.today'], ['nav-calendar', 'tips.coach.calendar'], ['nav-team', 'tips.coach.team'], ['nav-messages', 'tips.coach.messages']],
    calendar: [['page', 'tips.coach.plan']],
    team: [['page', 'tips.coach.squad']],
  },
  athlete: {
    today: [['page', 'tips.player.today'], ['nav-calendar', 'tips.player.calendar'], ['nav-load', 'tips.player.load'], ['nav-messages', 'tips.player.messages']],
    load: [['page', 'tips.player.rate']],
  },
  club: {
    club: [['page', 'tips.club.overview'], ['nav-halls', 'tips.club.halls'], ['nav-messages', 'tips.club.messages']],
  },
};

export function tipsFor(role: Role | undefined, page: string | null, navItems: string[]): Tip[] {
  if (!role || !page) return [];
  return (TIPS[role][page] ?? [])
    .filter(([target]) => !target.startsWith('nav-') || navItems.includes(target.slice(4)) || (role === 'coach' && target === 'nav-messages'))
    .map(([target, text]) => ({ id: `${role}.${page}.${target}`, target, text }));
}
