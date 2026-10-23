'use client';

/**
 * Suggestions to tap while setting up a club: sports for departments, age
 * classes and adult teams for teams, kinds of halls. Only suggestions; any
 * other name can be typed. Kept general, so they fit any club.
 */

import { AGE_GROUPS, type AgeGroup } from '@/shared/data';
import type { MessageKey } from '@/shared/i18n';

export const SPORTS: MessageKey[] = [
  'sport.football', 'sport.basketball', 'sport.handball', 'sport.volleyball', 'sport.hockey',
  'sport.tennis', 'sport.tableTennis', 'sport.athletics', 'sport.swimming', 'sport.gymnastics',
];

/** Age classes by name ("U14"), adult teams by their (translated) name. */
export const TEAM_SUGGESTIONS: { name: string; label?: MessageKey; ageGroup: AgeGroup }[] = [
  ...(['U10', 'U12', 'U14', 'U16', 'U18'] as const).map((age) => ({ name: age, ageGroup: age })),
  { name: 'men1', label: 'onboarding.found.team.men', ageGroup: 'adults' },
  { name: 'women1', label: 'onboarding.found.team.women', ageGroup: 'adults' },
];

export const HALL_SUGGESTIONS: MessageKey[] = ['onboarding.setup.hall.sportsHall', 'onboarding.setup.hall.gym', 'onboarding.setup.hall.field'];

/** "U14", "U14 Girls", "u16-2": the age class in the name, if any. */
export function ageGroupOf(name: string): AgeGroup | null {
  const match = /\bU\s?(\d{1,2})\b/i.exec(name);
  const age = match ? (`U${Number(match[1])}` as AgeGroup) : null;
  return age && (AGE_GROUPS as readonly string[]).includes(age) ? age : null;
}

export function Choice({ label, selected = false, onSelect, disabled = false }: { label: string; selected?: boolean; onSelect: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`rounded-full border px-3 py-1.5 text-sm font-black transition active:scale-95 disabled:opacity-50 ${selected ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500'}`}
    >
      {selected ? '✓ ' : ''}{label}
    </button>
  );
}
