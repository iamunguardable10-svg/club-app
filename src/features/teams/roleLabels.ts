/**
 * The staff roles every team starts with are stored under their English
 * names (`COACH_ROLE_TEMPLATES`, and the same on the server). Shown in the
 * app language; renamed or new roles as they were typed.
 */

import { tr, type MessageKey } from '@/shared/i18n';

const DEFAULT_ROLE_KEYS: Record<string, MessageKey> = {
  'Head Coach': 'role.default.head',
  'Assistant Coach': 'role.default.assistant',
  'Athletic Coach': 'role.default.athletic',
  'Team Manager': 'role.default.manager',
};

export function displayRoleName(name: string): string {
  const key = DEFAULT_ROLE_KEYS[name];
  return key ? tr(key) : name;
}
