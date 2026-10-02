/** Small helpers for messages (pieces 17, B, C). */

import { displayName, type LocalDatabase, type Message } from '@/shared/data';
import { formatShortDate } from '@/shared/format';
import { tr } from '@/shared/i18n';

export function authorName(database: LocalDatabase, message: Message): string {
  const author = message.authorId ? database.people.find((person) => person.id === message.authorId) : null;
  return author ? displayName(author) : tr('messages.coach');
}

export function teamName(database: LocalDatabase, teamId: string): string {
  return database.teams.find((team) => team.id === teamId)?.name ?? tr('messages.team');
}

/** Sent to a department or the whole club (rather than to teams). */
export function isClubMessage(message: Message): boolean {
  return message.wholeClub || message.departmentIds.length > 0;
}

/**
 * Where a message went, as the push title says it: "SV Ruhrtal",
 * "Basketball", "U16 Boys · U19", "U20 (Backs)".
 */
export function messageLabel(database: LocalDatabase, message: Message): string {
  const byName = (a: string, b: string) => a.localeCompare(b);
  const departments = message.departmentIds
    .map((id) => database.departments.find((department) => department.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .sort(byName);
  const teams = message.teamIds.map((id) => teamName(database, id)).sort(byName);
  const groups = message.groupIds
    .map((id) => {
      const group = database.playerGroups.find((candidate) => candidate.id === id);
      return group ? `${teamName(database, group.teamId)} (${group.name})` : null;
    })
    .filter((name): name is string => Boolean(name))
    .sort(byName);
  return [...(message.wholeClub ? [database.club.name] : []), ...departments, ...teams, ...groups].join(' · ');
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
