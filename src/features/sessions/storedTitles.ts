import type { MessageKey } from '@/shared/i18n/translate';

/**
 * Titles the app stored itself (the English name of a session or training
 * type) and their text keys; any other title is shown as it was typed. The
 * push dispatcher uses the same list (`npm run push-texts`).
 */
export const STORED_TITLES: Record<string, MessageKey> = {
  'Team training': 'sessionType.training',
  Training: 'sessionType.trainingShort',
  Game: 'loadType.game',
  Strength: 'loadType.strength',
  Individual: 'loadType.individual',
  Recovery: 'loadType.recovery',
  Team: 'loadType.team',
  Warmup: 'loadType.warmup',
  School: 'loadType.school',
  Prehab: 'loadType.prehab',
  // The hall calendar's type names.
  'S&C': 'sessionType.sAndC',
  Session: 'sessionType.session',
  Video: 'sessionType.video',
  Meeting: 'sessionType.meeting',
};
