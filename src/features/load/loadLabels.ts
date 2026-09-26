/**
 * Training types in the app language. The data layer keeps its English
 * labels (`LOAD_TYPE_LABELS`) because they are stored as titles; these are
 * for showing.
 */

import type { LoadTrainingType } from '@/shared/data/loadTypes';
import { tr, type MessageKey } from '@/shared/i18n';

export const LOAD_TYPE_KEYS: Record<LoadTrainingType, MessageKey> = {
  team_training: 'loadType.team',
  strength: 'loadType.strength',
  game: 'loadType.game',
  warmup: 'loadType.warmup',
  individual: 'loadType.individual',
  recovery: 'loadType.recovery',
  school_sport: 'loadType.school',
  prehab: 'loadType.prehab',
};

export function loadTypeLabel(type: LoadTrainingType): string {
  return tr(LOAD_TYPE_KEYS[type]);
}

const ZONE_KEYS: Record<'neutral' | 'low' | 'ready' | 'high', MessageKey> = {
  neutral: 'load.zone.baseline',
  low: 'load.zone.low',
  ready: 'load.zone.ready',
  high: 'load.zone.high',
};

/** `loadZone(...).label` in the app language, by its tone. */
export function zoneLabel(tone: 'neutral' | 'low' | 'ready' | 'high'): string {
  return tr(ZONE_KEYS[tone]);
}
