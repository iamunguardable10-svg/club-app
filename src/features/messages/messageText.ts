/** Small helpers for team messages (piece 17). */

import { displayName, type LocalDatabase, type TeamMessage } from '@/shared/data';

export function authorName(database: LocalDatabase, message: TeamMessage): string {
  const author = message.authorId ? database.people.find((person) => person.id === message.authorId) : null;
  return author ? displayName(author) : 'Coach';
}

export function teamName(database: LocalDatabase, teamId: string): string {
  return database.teams.find((team) => team.id === teamId)?.name ?? 'Team';
}

/** "just now", "3 h ago", "yesterday", "12 Sep". */
export function whenPosted(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return 'yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
