import { tr, type MessageKey } from '@/shared/i18n';
import { STORED_TITLES } from './storedTitles';

/**
 * Session types. `label` is English and stored as the session title
 * (`labelForCoachSessionType`); the interface shows `coachSessionTypeLabel`
 * and `displayTitle`, in the app language.
 */
export const coachSessionTypes: { value: string; label: string; key: MessageKey }[] = [
  { value: 'training', label: 'Team training', key: 'sessionType.training' },
  { value: 'game', label: 'Game', key: 'sessionType.game' },
  { value: 's_and_c', label: 'Strength', key: 'sessionType.strength' },
  { value: 'other', label: 'Individual', key: 'sessionType.individual' },
  { value: 'recovery', label: 'Recovery', key: 'sessionType.recovery' },
];

export function normalizeCoachSessionType(value?: string | null) {
  if (value === 'strength') return 's_and_c';
  if (value === 'individual') return 'other';
  return value ?? 'training';
}

/** The English title a new session of this type is stored with. */
export function labelForCoachSessionType(value: string) {
  return coachSessionTypes.find((type) => type.value === normalizeCoachSessionType(value))?.label ?? 'Training';
}

/** The type's name in the app language (pickers, lists). */
export function coachSessionTypeLabel(value: string) {
  const type = coachSessionTypes.find((candidate) => candidate.value === normalizeCoachSessionType(value));
  return type ? tr(type.key) : tr('sessionType.trainingShort');
}

/** A stored title in the app language (see `STORED_TITLES`). */
export function displayTitle(title: string): string {
  const key = STORED_TITLES[title];
  return key ? tr(key) : title;
}
