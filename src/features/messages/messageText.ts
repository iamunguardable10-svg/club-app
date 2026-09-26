/** Small helpers for team messages (piece 17). */

import { displayName, type LocalDatabase, type TeamMessage } from '@/shared/data';
import { formatShortDate } from '@/shared/format';
import { tr } from '@/shared/i18n';

export function authorName(database: LocalDatabase, message: TeamMessage): string {
  const author = message.authorId ? database.people.find((person) => person.id === message.authorId) : null;
  return author ? displayName(author) : tr('messages.coach');
}

export function teamName(database: LocalDatabase, teamId: string): string {
  return database.teams.find((team) => team.id === teamId)?.name ?? tr('messages.team');
}

/** "just now", "3 h ago", "yesterday", "12 Sep". */
export function whenPosted(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return tr('messages.justNow');
  if (minutes < 60) return tr('messages.minutesAgo', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return tr('messages.hoursAgo', { count: hours });
  if (hours < 48) return tr('messages.yesterday');
  return formatShortDate(iso);
}
